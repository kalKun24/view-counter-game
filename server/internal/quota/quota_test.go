package quota

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *fakeClock) Add(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// fakeUpstream counts calls and returns what the test sets.
type fakeUpstream struct {
	mu          sync.Mutex
	searches    int
	videos      int
	searchErr   error
	videosErr   error
	block       chan struct{} // when set, SearchVideoIDs waits for it to close
	searchEnter chan struct{} // when set, signalled when a search starts
}

func (f *fakeUpstream) SearchVideoIDs(ctx context.Context, q string) ([]string, error) {
	f.mu.Lock()
	f.searches++
	err, block, enter := f.searchErr, f.block, f.searchEnter
	f.mu.Unlock()
	if enter != nil {
		enter <- struct{}{}
	}
	if block != nil {
		<-block
	}
	if err != nil {
		return nil, err
	}
	return []string{"a"}, nil
}

func (f *fakeUpstream) GetVideos(ctx context.Context, ids []string) ([]youtube.Video, error) {
	f.mu.Lock()
	f.videos++
	err := f.videosErr
	f.mu.Unlock()
	if err != nil {
		return nil, err
	}
	return []youtube.Video{{ID: "a"}}, nil
}

func (f *fakeUpstream) calls() (int, int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.searches, f.videos
}

var errQuota = &youtube.UpstreamError{Status: 403, Reason: "quotaExceeded"}

type env struct {
	clock *fakeClock
	up    *fakeUpstream
	g     *Guard
	c     *Client
	logs  *bytes.Buffer
}

func newEnv(t *testing.T, limit int, start time.Time) *env {
	t.Helper()
	loc, err := LoadPacific()
	if err != nil {
		t.Fatal(err)
	}
	e := &env{clock: &fakeClock{t: start}, up: &fakeUpstream{}, logs: &bytes.Buffer{}}
	log := slog.New(slog.NewTextHandler(&syncWriter{w: e.logs}, nil))
	e.g = New(limit, loc, e.clock.Now, log)
	e.c = Wrap(e.up, e.g)
	return e
}

type syncWriter struct {
	mu sync.Mutex
	w  *bytes.Buffer
}

func (s *syncWriter) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.w.Write(p)
}

// miss does what one cache miss does: search.list then videos.list.
func (e *env) miss() error {
	ids, err := e.c.SearchVideoIDs(context.Background(), "q")
	if err != nil {
		return err
	}
	_, err = e.c.GetVideos(context.Background(), ids)
	return err
}

var noon = time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)

func TestUnitsCountedPerCall(t *testing.T) {
	e := newEnv(t, 1000, noon)
	if err := e.miss(); err != nil {
		t.Fatal(err)
	}
	if got := e.g.Used(); got != 101 {
		t.Errorf("used = %d, want 101 (search 100 + videos 1)", got)
	}
}

func TestErrorCallsAreCounted(t *testing.T) {
	e := newEnv(t, 1000, noon)
	e.up.searchErr = &youtube.UpstreamError{Status: 500}
	if err := e.miss(); err == nil {
		t.Fatal("want error")
	}
	if got := e.g.Used(); got != 100 {
		t.Errorf("used = %d, want 100 (failed search still counts)", got)
	}
	e.up.searchErr = nil
	e.up.videosErr = &youtube.UpstreamError{Status: 500}
	_ = e.miss()
	if got := e.g.Used(); got != 201 {
		t.Errorf("used = %d, want 201 (failed videos still counts)", got)
	}
}

func TestEmptyIDsCostNothing(t *testing.T) {
	e := newEnv(t, 1000, noon)
	if _, err := e.c.GetVideos(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	if e.g.Used() != 0 {
		t.Errorf("used = %d, want 0", e.g.Used())
	}
}

// Just below the limit the call goes through; at the limit it is refused
// without calling upstream. Limit 202 = two misses.
func TestLimitBoundary(t *testing.T) {
	e := newEnv(t, 202, noon)
	for i := 0; i < 2; i++ {
		if err := e.miss(); err != nil {
			t.Fatalf("miss %d: %v", i+1, err)
		}
	}
	if got := e.g.Used(); got != 202 {
		t.Fatalf("used = %d, want 202", got)
	}
	s, v := e.up.calls()
	err := e.miss()
	if !errors.Is(err, ErrLimitReached) {
		t.Fatalf("err = %v, want ErrLimitReached", err)
	}
	if s2, v2 := e.up.calls(); s2 != s || v2 != v {
		t.Errorf("upstream was called at the limit: %d/%d -> %d/%d", s, v, s2, v2)
	}
	if e.g.Used() != 202 {
		t.Errorf("a refused call must not count; used = %d", e.g.Used())
	}
}

// One unit short of room for a whole miss: the search is refused instead of
// spending 100 units and then refusing the videos.list that follows.
func TestSearchNeedsRoomForVideos(t *testing.T) {
	e := newEnv(t, 100, noon)
	err := e.miss()
	if !errors.Is(err, ErrLimitReached) {
		t.Fatalf("err = %v", err)
	}
	if s, _ := e.up.calls(); s != 0 {
		t.Errorf("search was called with %d searches", s)
	}
	e2 := newEnv(t, 101, noon)
	if err := e2.miss(); err != nil {
		t.Errorf("101 units must fit one miss: %v", err)
	}
	if e2.g.Used() != 101 {
		t.Errorf("used = %d", e2.g.Used())
	}
}

func TestLimitReachedLoggedOncePerDay(t *testing.T) {
	e := newEnv(t, 101, noon)
	_ = e.miss()
	for i := 0; i < 5; i++ {
		if err := e.miss(); !errors.Is(err, ErrLimitReached) {
			t.Fatal(err)
		}
	}
	if n := strings.Count(e.logs.String(), "daily unit limit reached"); n != 1 {
		t.Errorf("logged %d times, want 1:\n%s", n, e.logs.String())
	}
}

// The day changes at 00:00 Pacific time (PDT, UTC-7 on 2026-10-31).
func TestPacificMidnightResets(t *testing.T) {
	// 2026-11-01 06:59:00 UTC = 2026-10-31 23:59:00 PDT.
	e := newEnv(t, 101, time.Date(2026, 11, 1, 6, 59, 0, 0, time.UTC))
	if err := e.miss(); err != nil {
		t.Fatal(err)
	}
	if err := e.miss(); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("before midnight: %v", err)
	}
	e.clock.Add(59 * time.Second) // 23:59:59 PDT: still the same day
	if err := e.miss(); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("one second before midnight: %v", err)
	}
	e.clock.Add(time.Second) // 00:00:00 PDT of 2026-11-01
	if got := e.g.Used(); got != 0 {
		t.Fatalf("used after midnight = %d, want 0", got)
	}
	if err := e.miss(); err != nil {
		t.Fatalf("after midnight: %v", err)
	}
	// The log fires again for the new day.
	_ = e.miss()
	if n := strings.Count(e.logs.String(), "daily unit limit reached"); n != 2 {
		t.Errorf("logged %d times, want 2 (once per day)", n)
	}
}

// Midnight is Pacific, not UTC: UTC midnight changes nothing.
func TestUTCMidnightDoesNotReset(t *testing.T) {
	// 2026-10-31 23:59:00 UTC = 16:59 PDT.
	e := newEnv(t, 101, time.Date(2026, 10, 31, 23, 59, 0, 0, time.UTC))
	_ = e.miss()
	e.clock.Add(2 * time.Minute) // 00:01 UTC on Nov 1 = 17:01 PDT
	if err := e.miss(); !errors.Is(err, ErrLimitReached) {
		t.Errorf("UTC midnight must not reset: %v", err)
	}
}

// The offset follows DST: on 2026-12-01 Pacific time is UTC-8.
func TestPacificMidnightInWinter(t *testing.T) {
	// 2026-12-01 07:59:59 UTC = 2026-11-30 23:59:59 PST.
	e := newEnv(t, 101, time.Date(2026, 12, 1, 7, 59, 59, 0, time.UTC))
	_ = e.miss()
	if err := e.miss(); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("%v", err)
	}
	e.clock.Add(time.Second)
	if err := e.miss(); err != nil {
		t.Errorf("after PST midnight: %v", err)
	}
}

func TestQuotaExceededStartsSuppression(t *testing.T) {
	e := newEnv(t, 10000, noon)
	e.up.searchErr = errQuota
	if err := e.miss(); !youtube.IsQuotaExceeded(err) {
		t.Fatalf("first call returns the upstream error: %v", err)
	}
	s, _ := e.up.calls()
	e.up.searchErr = nil
	for i := 0; i < 5; i++ {
		if err := e.miss(); !errors.Is(err, ErrSuppressed) {
			t.Fatalf("suppressed call %d: %v", i, err)
		}
	}
	if s2, _ := e.up.calls(); s2 != s {
		t.Errorf("upstream called while suppressed")
	}
	if n := strings.Count(e.logs.String(), "suppressed after quotaExceeded"); n != 1 {
		t.Errorf("start logged %d times, want 1:\n%s", n, e.logs.String())
	}
}

// Criterion 4: just before one hour it is still suppressed; after it, one
// trial request goes through and success resumes normal operation.
func TestSuppressionBoundaryAndResume(t *testing.T) {
	e := newEnv(t, 10000, noon)
	e.up.searchErr = errQuota
	_ = e.miss()
	e.up.searchErr = nil

	e.clock.Add(time.Hour - time.Second)
	if err := e.miss(); !errors.Is(err, ErrSuppressed) {
		t.Fatalf("59m59s: %v", err)
	}
	e.clock.Add(time.Second) // exactly one hour
	if err := e.miss(); err != nil {
		t.Fatalf("after 1h the trial must go through: %v", err)
	}
	if err := e.miss(); err != nil {
		t.Fatalf("after success calls are normal: %v", err)
	}
	if n := strings.Count(e.logs.String(), "upstream calls resumed"); n != 1 {
		t.Errorf("resume logged %d times, want 1:\n%s", n, e.logs.String())
	}
}

// A failed trial extends the suppression by another hour.
func TestFailedTrialExtendsSuppression(t *testing.T) {
	e := newEnv(t, 10000, noon)
	e.up.searchErr = errQuota
	_ = e.miss()
	e.clock.Add(time.Hour)
	if err := e.miss(); !youtube.IsQuotaExceeded(err) {
		t.Fatalf("trial: %v", err)
	}
	e.clock.Add(time.Hour - time.Second)
	if err := e.miss(); !errors.Is(err, ErrSuppressed) {
		t.Fatalf("within the second hour: %v", err)
	}
	e.up.searchErr = nil
	e.clock.Add(time.Second)
	if err := e.miss(); err != nil {
		t.Fatalf("second trial: %v", err)
	}
}

// A trial that fails for another reason frees the slot for the next request.
func TestInconclusiveTrialAllowsAnother(t *testing.T) {
	e := newEnv(t, 10000, noon)
	e.up.searchErr = errQuota
	_ = e.miss()
	e.clock.Add(time.Hour)
	e.up.searchErr = &youtube.UpstreamError{Status: 500}
	if err := e.miss(); err == nil || errors.Is(err, ErrSuppressed) {
		t.Fatalf("trial should reach upstream and fail: %v", err)
	}
	e.up.searchErr = nil
	if err := e.miss(); err != nil {
		t.Fatalf("next request should be the new trial: %v", err)
	}
}

// Only one trial at a time: while it is in flight, others are suppressed.
func TestOnlyOneTrialAtATime(t *testing.T) {
	e := newEnv(t, 10000, noon)
	e.up.searchErr = errQuota
	_ = e.miss()
	e.clock.Add(time.Hour)
	e.up.searchErr = nil
	e.up.block = make(chan struct{})
	e.up.searchEnter = make(chan struct{}, 10)

	done := make(chan error, 1)
	go func() { done <- e.miss() }()
	<-e.up.searchEnter // the trial is inside upstream

	before, _ := e.up.calls()
	for i := 0; i < 3; i++ {
		if _, err := e.c.SearchVideoIDs(context.Background(), "x"); !errors.Is(err, ErrSuppressed) {
			t.Fatalf("concurrent request %d: %v", i, err)
		}
	}
	if after, _ := e.up.calls(); after != before {
		t.Errorf("upstream called by a second request during the trial")
	}
	close(e.up.block)
	if err := <-done; err != nil {
		t.Fatalf("trial: %v", err)
	}
	if err := e.miss(); err != nil {
		t.Fatalf("after the trial succeeded: %v", err)
	}
}

type panicUpstream struct{ fakeUpstream }

func (p *panicUpstream) SearchVideoIDs(context.Context, string) ([]string, error) { panic("boom") }

// A panicking upstream must not leave the trial slot taken forever.
func TestPanicFreesTrialSlot(t *testing.T) {
	e := newEnv(t, 10000, noon)
	e.up.searchErr = errQuota
	_ = e.miss()
	e.clock.Add(time.Hour)
	pc := Wrap(&panicUpstream{}, e.g)
	func() {
		defer func() { _ = recover() }()
		_, _ = pc.SearchVideoIDs(context.Background(), "x")
	}()
	e.up.searchErr = nil
	if err := e.miss(); err != nil {
		t.Fatalf("slot stuck after panic: %v", err)
	}
}

func TestConcurrentCallsNeverExceedLimit(t *testing.T) {
	e := newEnv(t, 505, noon) // five misses
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if e.miss() == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if ok != 5 || e.g.Used() != 505 {
		t.Errorf("ok=%d used=%d, want 5 and 505", ok, e.g.Used())
	}
}
