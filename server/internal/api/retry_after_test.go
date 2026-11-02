package api

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

// The body of every quota_exceeded answer; criterion 5 says it does not change.
const quotaBody = `{"error":{"code":"quota_exceeded","message":"YouTube API の利用上限に達しました。しばらくしてからもう一度お試しください。"}}` + "\n"

func getRec(h http.Handler, q string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", "/api/views?q="+url.QueryEscape(q), nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

type testClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *testClock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *testClock) Add(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// assertQuota503 checks the status, the unchanged body and that the only
// headers are Content-Type and Retry-After (no figures about units or limits).
// It returns the Retry-After seconds.
func assertQuota503(t *testing.T, rec *httptest.ResponseRecorder) int {
	t.Helper()
	if rec.Code != 503 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if rec.Body.String() != quotaBody {
		t.Errorf("body changed: %q", rec.Body.String())
	}
	for k := range rec.Header() {
		if k != "Content-Type" && k != "Retry-After" {
			t.Errorf("unexpected header %q = %q", k, rec.Header().Get(k))
		}
	}
	raw := rec.Header().Get("Retry-After")
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 || strconv.Itoa(n) != raw {
		t.Fatalf("Retry-After = %q, want an integer >= 1", raw)
	}
	return n
}

// Criteria 1 and 5, demo (1): limit 202, the third different word.
func TestLimitRetryAfterThroughHandler(t *testing.T) {
	clock := &testClock{t: time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)} // 19h to Pacific midnight
	h, _ := quotaHandler(t, 202, clock.Now)
	for _, q := range []string{"alpha", "beta"} {
		if rec := getRec(h, q); rec.Code != 200 || rec.Header().Get("Retry-After") != "" {
			t.Fatalf("%s: %d %v", q, rec.Code, rec.Header())
		}
	}
	if got := assertQuota503(t, getRec(h, "gamma")); got != 19*3600 {
		t.Errorf("Retry-After = %d, want %d", got, 19*3600)
	}
}

// Criterion 1 on the days the clocks change, through the handler.
func TestLimitRetryAfterOnDSTDays(t *testing.T) {
	for name, tt := range map[string]struct {
		now  time.Time
		want int
	}{
		"fall back, 25h day":      {time.Date(2026, 11, 1, 7, 0, 0, 0, time.UTC), 25 * 3600},
		"spring forward, 23h day": {time.Date(2026, 3, 8, 8, 0, 0, 0, time.UTC), 23 * 3600},
	} {
		t.Run(name, func(t *testing.T) {
			clock := &testClock{t: tt.now}
			h, _ := quotaHandler(t, 50, clock.Now)
			if got := assertQuota503(t, getRec(h, "x")); got != tt.want {
				t.Errorf("Retry-After = %d, want %d", got, tt.want)
			}
		})
	}
}

// Criterion 4 through the handler: 0.2 s left gives 1.
func TestLimitRetryAfterRoundsUp(t *testing.T) {
	clock := &testClock{t: time.Date(2026, 11, 1, 6, 59, 59, 800_000_000, time.UTC)}
	h, _ := quotaHandler(t, 50, clock.Now)
	if got := assertQuota503(t, getRec(h, "x")); got != 1 {
		t.Errorf("Retry-After = %d, want 1", got)
	}
}

// Criterion 2, demo (2): the first answer carries 3600, then what is left.
func TestSuppressionRetryAfterThroughHandler(t *testing.T) {
	clock := &testClock{t: time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)}
	h, _ := quotaHandler(t, 1000, clock.Now)
	if got := assertQuota503(t, getRec(h, "quota")); got != 3600 {
		t.Errorf("first answer: Retry-After = %d, want 3600", got)
	}
	if got := assertQuota503(t, getRec(h, "delta")); got != 3600 {
		t.Errorf("right after: Retry-After = %d, want 3600", got)
	}
	clock.Add(10*time.Minute + 500*time.Millisecond) // 2999.5 s left, rounds up to 3000
	if got := assertQuota503(t, getRec(h, "epsilon")); got != 3000 {
		t.Errorf("after 10m0.5s: Retry-After = %d, want 3000", got)
	}
}

// Criterion 2 through a fake YouTube server: the upstream's own quotaExceeded
// answer also carries 3600.
func TestUpstreamQuotaAnswerHasRetryAfter3600(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(403)
		fmt.Fprint(w, `{"error":{"code":403,"message":"x","errors":[{"reason":"quotaExceeded"}]}}`)
	}))
	defer ts.Close()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := NewHandler(youtube.NewHTTPClient(secretKey, ts.URL, ts.Client()), log)
	if got := assertQuota503(t, getRec(h, "cat")); got != 3600 {
		t.Errorf("Retry-After = %d, want 3600", got)
	}
}

// Criterion 3 through the handler: after the quota word the limit is also
// reached; the limit's seconds win over the hour of suppression.
func TestLimitWinsOverSuppressionThroughHandler(t *testing.T) {
	clock := &testClock{t: time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)}
	h, _ := quotaHandler(t, 150, clock.Now)
	if got := assertQuota503(t, getRec(h, "quota")); got != 3600 {
		t.Fatalf("quota word: %d, want 3600", got)
	}
	if got := assertQuota503(t, getRec(h, "delta")); got != 19*3600 {
		t.Errorf("overlap: Retry-After = %d, want %d (limit)", got, 19*3600)
	}
}

// Criterion 5: no figure about units reaches the log lines of a refused
// request (the one-time start line of the limit is the existing one).
func TestRefusalLogsNoNewFigures(t *testing.T) {
	clock := &testClock{t: time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)}
	h, logs := quotaHandler(t, 202, clock.Now)
	getRec(h, "alpha")
	getRec(h, "beta")
	getRec(h, "gamma")
	before := logs.String()
	getRec(h, "delta")
	added := strings.TrimPrefix(logs.String(), before)
	for _, bad := range []string{"used", "limit", "units"} {
		if strings.Contains(added, bad) {
			t.Errorf("log of a refused request contains %q: %s", bad, added)
		}
	}
}

// Answers that are not quota refusals carry no Retry-After.
func TestNoRetryAfterOnSuccess(t *testing.T) {
	h, _ := quotaHandler(t, 10000, time.Now)
	if rec := getRec(h, "alpha"); rec.Header().Get("Retry-After") != "" {
		t.Errorf("200 has Retry-After: %v", rec.Header())
	}
}
