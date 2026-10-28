package api

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/cache"
	"github.com/kalKun24/view-counter-game/server/internal/words"
	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

// countingClient counts upstream calls and can fail or block.
type countingClient struct {
	searches atomic.Int32
	err      atomic.Pointer[error]
	gate     chan struct{} // if non-nil, SearchVideoIDs blocks until closed
	videos   []youtube.Video
	ids      []string
}

func (c *countingClient) SearchVideoIDs(_ context.Context, _ string) ([]string, error) {
	c.searches.Add(1)
	if c.gate != nil {
		<-c.gate
	}
	if e := c.err.Load(); e != nil {
		return nil, *e
	}
	return c.ids, nil
}

func (c *countingClient) GetVideos(context.Context, []string) ([]youtube.Video, error) {
	return c.videos, nil
}

func newCachedHandler(c youtube.Client, now func() time.Time, ttl time.Duration, max int) (http.Handler, *bytes.Buffer, *cache.Cache[Result]) {
	logs := &bytes.Buffer{}
	ca := cache.New[Result](ttl, max, now)
	h := NewHandler(c, slog.New(slog.NewTextHandler(&syncWriter{w: logs}, nil)), WithCache(ca))
	return h, logs, ca
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

func get(h http.Handler, q string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/views?q="+url.QueryEscape(q), nil))
	return rec
}

func foundClient() *countingClient {
	return &countingClient{
		ids:    []string{"a"},
		videos: []youtube.Video{{ID: "a", Title: "cat piano", ViewCount: vc(1_234_567)}},
	}
}

// panicClient panics on the first search, then behaves like foundClient.
type panicClient struct {
	*countingClient
	panicked atomic.Bool
}

func (p *panicClient) SearchVideoIDs(ctx context.Context, q string) ([]string, error) {
	if p.panicked.CompareAndSwap(false, true) {
		panic("loader exploded")
	}
	return p.countingClient.SearchVideoIDs(ctx, q)
}

func TestPanicInLoadReturns500DistinctFromUpstreamAndRecovers(t *testing.T) {
	c := &panicClient{countingClient: foundClient()}
	h, logs, _ := newCachedHandler(c, time.Now, time.Hour, 10)

	rec := get(h, "cat piano")
	if rec.Code != http.StatusInternalServerError || !strings.Contains(rec.Body.String(), `"internal_error"`) {
		t.Fatalf("got %d %s, want 500 internal_error", rec.Code, rec.Body.String())
	}
	out := logs.String()
	if !strings.Contains(out, "cache load panicked") || !strings.Contains(out, "loader exploded") || strings.Contains(out, "youtube request failed") {
		t.Fatalf("log not distinguishable: %s", out)
	}

	// Same key again: reloaded, not served from a cached failure.
	rec = get(h, "cat piano")
	if rec.Code != http.StatusOK {
		t.Fatalf("retry got %d %s, want 200", rec.Code, rec.Body.String())
	}
}

func TestCacheHitSkipsUpstreamAndLogs(t *testing.T) {
	c := foundClient()
	now := time.Now()
	h, logs, _ := newCachedHandler(c, func() time.Time { return now }, time.Hour, 10)

	r1 := get(h, "cat piano")
	// Different order, case and full-width: same key.
	r2 := get(h, "ＰＩＡＮＯ　Cat")
	if r1.Code != 200 || r1.Body.String() != r2.Body.String() {
		t.Fatalf("bodies differ: %s / %s", r1.Body, r2.Body)
	}
	if c.searches.Load() != 1 {
		t.Fatalf("upstream calls = %d, want 1", c.searches.Load())
	}
	if strings.Count(logs.String(), "cache miss") != 1 || strings.Count(logs.String(), "cache hit") != 1 {
		t.Fatalf("logs: %s", logs)
	}
	if strings.Index(logs.String(), "cache miss") > strings.Index(logs.String(), "cache hit") {
		t.Fatalf("miss must precede hit: %s", logs)
	}
}

func TestCacheExpiresAfterTTL(t *testing.T) {
	c := foundClient()
	now := time.Now()
	h, logs, _ := newCachedHandler(c, func() time.Time { return now }, 2*time.Second, 10)
	get(h, "cat")
	now = now.Add(time.Second)
	get(h, "cat")
	if c.searches.Load() != 1 {
		t.Fatalf("calls = %d", c.searches.Load())
	}
	now = now.Add(time.Second)
	get(h, "cat")
	if c.searches.Load() != 2 || strings.Count(logs.String(), "cache miss") != 2 {
		t.Fatalf("calls = %d logs: %s", c.searches.Load(), logs)
	}
}

func TestNotFoundIsCached(t *testing.T) {
	c := &countingClient{} // no search results: found=false
	h, _, _ := newCachedHandler(c, time.Now, time.Hour, 10)
	for i := 0; i < 3; i++ {
		rec := get(h, "nomatch")
		if strings.TrimSpace(rec.Body.String()) != `{"found":false}` {
			t.Fatal(rec.Body.String())
		}
	}
	if c.searches.Load() != 1 {
		t.Fatalf("calls = %d, want 1", c.searches.Load())
	}
}

func TestUpstreamErrorsAreNotCached(t *testing.T) {
	for name, e := range map[string]error{
		"quotaExceeded": &youtube.UpstreamError{Status: 403, Reason: "quotaExceeded"},
		"generic":       &youtube.UpstreamError{Status: 500},
	} {
		t.Run(name, func(t *testing.T) {
			c := foundClient()
			c.err.Store(&e)
			h, logs, _ := newCachedHandler(c, time.Now, time.Hour, 10)
			for i := 0; i < 2; i++ {
				if rec := get(h, "cat"); rec.Code != 502 {
					t.Fatalf("status %d", rec.Code)
				}
			}
			if c.searches.Load() != 2 {
				t.Fatalf("calls = %d, errors must not be cached", c.searches.Load())
			}
			if strings.Contains(logs.String(), "cache hit") {
				t.Fatalf("logs: %s", logs)
			}
			// Recovery: next success is fetched and then cached.
			c.err.Store(nil)
			if rec := get(h, "cat"); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"found":true`) {
				t.Fatalf("%d %s", rec.Code, rec.Body)
			}
			get(h, "cat")
			if c.searches.Load() != 3 {
				t.Fatalf("calls = %d", c.searches.Load())
			}
		})
	}
}

func TestEntryLimitEvictsOldest(t *testing.T) {
	c := foundClient()
	h, _, ca := newCachedHandler(c, time.Now, time.Hour, 2)
	get(h, "a")
	get(h, "b")
	get(h, "c") // evicts "a"
	if ca.Len() != 2 {
		t.Fatalf("len = %d", ca.Len())
	}
	get(h, "b")
	get(h, "c")
	if c.searches.Load() != 3 {
		t.Fatalf("calls = %d", c.searches.Load())
	}
	get(h, "a")
	if c.searches.Load() != 4 {
		t.Fatalf("a should be refetched, calls = %d", c.searches.Load())
	}
}

func TestConcurrentSameKeyCallsUpstreamOnce(t *testing.T) {
	c := foundClient()
	c.gate = make(chan struct{})
	h, _, ca := newCachedHandler(c, time.Now, time.Hour, 10)
	const n = 10
	var wg sync.WaitGroup
	codes := make([]int, n)
	qs := []string{"cat piano", "PIANO cat", "ｃａｔ　ｐｉａｎｏ"}
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes[i] = get(h, qs[i%len(qs)]).Code
		}()
	}
	deadline := time.Now().Add(5 * time.Second)
	for c.searches.Load() < 1 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	// Wait until the other n-1 requests joined the in-flight call.
	for !joined(ca, n-1) && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	close(c.gate)
	wg.Wait()
	if c.searches.Load() != 1 {
		t.Fatalf("upstream calls = %d, want 1", c.searches.Load())
	}
	for _, code := range codes {
		if code != 200 {
			t.Fatalf("codes: %v", codes)
		}
	}
}

func joined(ca *cache.Cache[Result], want int) bool {
	return ca.Waiters(words.Key("cat piano")) >= want
}
