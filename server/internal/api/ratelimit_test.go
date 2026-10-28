package api

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/cache"
)

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func newClock() *fakeClock { return &fakeClock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)} }

func discardLog() *slog.Logger { return slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)) }

func limitedHandler(limit int, clk *fakeClock, hops int) http.Handler {
	l := NewRateLimiter(limit, time.Minute, clk.Now)
	return NewHandler(foundClient(), discardLog(), WithRateLimit(l, hops))
}

func doReq(h http.Handler, target, remote string, xff ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, target, nil)
	req.RemoteAddr = remote
	for _, v := range xff {
		req.Header.Add("X-Forwarded-For", v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestRateLimitReturns429WithRetryAfterAfterLimit(t *testing.T) {
	clk := newClock()
	h := limitedHandler(3, clk, 1)
	for i := 1; i <= 3; i++ {
		if rec := doReq(h, "/api/views?q=cat", "192.0.2.1:1000"); rec.Code != http.StatusOK {
			t.Fatalf("request %d: status %d", i, rec.Code)
		}
	}
	clk.Advance(10 * time.Second)
	rec := doReq(h, "/api/views?q=cat", "192.0.2.1:1000")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d", rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "50" {
		t.Errorf("Retry-After = %q, want 50", got)
	}
	var body errorBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != "too_many_requests" || body.Error.Message == "" {
		t.Errorf("body = %s", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q", ct)
	}
}

func TestRateLimitRecoversAfterWindow(t *testing.T) {
	clk := newClock()
	h := limitedHandler(1, clk, 1)
	doReq(h, "/api/views?q=cat", "192.0.2.1:1")
	if rec := doReq(h, "/api/views?q=cat", "192.0.2.1:1"); rec.Code != 429 {
		t.Fatalf("status = %d", rec.Code)
	}
	clk.Advance(time.Minute)
	if rec := doReq(h, "/api/views?q=cat", "192.0.2.1:1"); rec.Code != 200 {
		t.Fatalf("after window: status = %d", rec.Code)
	}
}

func TestRateLimitIsPerIP(t *testing.T) {
	h := limitedHandler(1, newClock(), 1)
	doReq(h, "/api/views?q=cat", "192.0.2.1:1")
	if rec := doReq(h, "/api/views?q=cat", "192.0.2.1:1"); rec.Code != 429 {
		t.Fatalf("same ip: %d", rec.Code)
	}
	if rec := doReq(h, "/api/views?q=cat", "192.0.2.2:1"); rec.Code != 200 {
		t.Fatalf("other ip: %d", rec.Code)
	}
}

func TestRateLimitCountsCacheHitsAndInvalidRequests(t *testing.T) {
	clk := newClock()
	l := NewRateLimiter(3, time.Minute, clk.Now)
	cl := foundClient()
	h := NewHandler(cl, discardLog(), WithCache(cache.New[Result](time.Hour, 10, clk.Now)), WithRateLimit(l, 1))
	doReq(h, "/api/views?q=cat", "192.0.2.1:1") // miss
	doReq(h, "/api/views?q=cat", "192.0.2.1:1") // hit
	if cl.searches.Load() != 1 {
		t.Fatalf("searches = %d, want 1 (second was a cache hit)", cl.searches.Load())
	}
	if rec := doReq(h, "/api/views?q=", "192.0.2.1:1"); rec.Code != 400 { // invalid, still counted
		t.Fatalf("invalid status = %d", rec.Code)
	}
	if rec := doReq(h, "/api/views?q=cat", "192.0.2.1:1"); rec.Code != 429 {
		t.Fatalf("4th request (cache hit) status = %d, want 429", rec.Code)
	}
}

func TestRateLimitSkipsNonAPIPaths(t *testing.T) {
	clk := newClock()
	l := NewRateLimiter(1, time.Minute, clk.Now)
	static := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	h := rateLimit(static, l, 1, discardLog())
	for i := 0; i < 50; i++ {
		for _, p := range []string{"/", "/index.html", "/assets/app.js", "/apix"} {
			if rec := doReq(h, p, "192.0.2.1:1"); rec.Code != 200 {
				t.Fatalf("%s #%d: status %d", p, i, rec.Code)
			}
		}
	}
	if l.size() != 0 {
		t.Errorf("static requests were tracked: %d", l.size())
	}
	doReq(h, "/api/views?q=a", "192.0.2.1:1")
	if rec := doReq(h, "/api/views?q=a", "192.0.2.1:1"); rec.Code != 429 {
		t.Errorf("/api/ not limited: %d", rec.Code)
	}
}

func TestClientIP(t *testing.T) {
	tests := []struct {
		name   string
		remote string
		xff    []string
		hops   int
		want   string
	}{
		{"no header uses RemoteAddr", "192.0.2.9:5555", nil, 1, "192.0.2.9"},
		{"single entry", "10.0.0.1:1", []string{"203.0.113.7"}, 1, "203.0.113.7"},
		{"spoofed left entries ignored (hops 1 takes rightmost)", "10.0.0.1:1", []string{"1.2.3.4, 5.6.7.8, 203.0.113.7"}, 1, "203.0.113.7"},
		{"spoof varies, key stays", "10.0.0.1:1", []string{"9.9.9.9, 203.0.113.7"}, 1, "203.0.113.7"},
		{"hops 2 (LB in front)", "10.0.0.1:1", []string{"6.6.6.6, 203.0.113.7, 130.211.0.1"}, 2, "203.0.113.7"},
		{"multiple header lines are joined", "10.0.0.1:1", []string{"6.6.6.6", "203.0.113.7"}, 1, "203.0.113.7"},
		{"fewer entries than hops falls back", "192.0.2.9:1", []string{"203.0.113.7"}, 2, "192.0.2.9"},
		{"unparsable entry falls back", "192.0.2.9:1", []string{"1.2.3.4, not-an-ip"}, 1, "192.0.2.9"},
		{"empty header falls back", "192.0.2.9:1", []string{""}, 1, "192.0.2.9"},
		{"entries with spaces", "10.0.0.1:1", []string{" 1.1.1.1 ,  203.0.113.7 "}, 1, "203.0.113.7"},
		{"ipv6 grouped by /64", "10.0.0.1:1", []string{"2001:db8:1:2:aaaa:bbbb:cccc:dddd"}, 1, "2001:db8:1:2::/64"},
		{"ipv4-mapped ipv6 unmapped", "[::ffff:192.0.2.9]:1", nil, 1, "192.0.2.9"},
		{"RemoteAddr without port", "192.0.2.9", nil, 1, "192.0.2.9"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/views", nil)
			req.RemoteAddr = tt.remote
			for _, v := range tt.xff {
				req.Header.Add("X-Forwarded-For", v)
			}
			if got := ClientIP(req, tt.hops); got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSpoofedXFFDoesNotBypassLimit(t *testing.T) {
	h := limitedHandler(2, newClock(), 1)
	for i := 0; i < 2; i++ {
		doReq(h, "/api/views?q=cat", "10.0.0.1:1", "198.51.100."+strconv.Itoa(i)+", 203.0.113.7")
	}
	rec := doReq(h, "/api/views?q=cat", "10.0.0.1:1", "198.51.100.200, 203.0.113.7")
	if rec.Code != 429 {
		t.Fatalf("status = %d, want 429 (forged left entries must not change the key)", rec.Code)
	}
}

func TestLimiterEvictsExpiredEntries(t *testing.T) {
	clk := newClock()
	l := NewRateLimiter(5, time.Minute, clk.Now)
	for i := 0; i < 1000; i++ {
		l.Allow("ip" + strconv.Itoa(i))
	}
	if l.size() != 1000 {
		t.Fatalf("size = %d", l.size())
	}
	clk.Advance(2 * time.Minute)
	l.Allow("fresh")
	if l.size() != 1 {
		t.Errorf("size after sweep = %d, want 1", l.size())
	}
}

func TestLimiterIsBounded(t *testing.T) {
	clk := newClock()
	l := NewRateLimiter(5, time.Minute, clk.Now)
	l.max = 10
	for i := 0; i < 10; i++ {
		if ok, _ := l.Allow("ip" + strconv.Itoa(i)); !ok {
			t.Fatalf("ip%d refused", i)
		}
	}
	if ok, _ := l.Allow("overflow"); ok {
		t.Error("new key admitted beyond max")
	}
	if l.size() > 10 {
		t.Errorf("size = %d", l.size())
	}
	if ok, _ := l.Allow("ip3"); !ok {
		t.Error("existing key refused")
	}
	clk.Advance(time.Minute)
	if ok, _ := l.Allow("overflow"); !ok {
		t.Error("new key refused after entries expired")
	}
}

func TestLimiterConcurrent(t *testing.T) {
	clk := newClock()
	l := NewRateLimiter(100, time.Minute, clk.Now)
	var wg sync.WaitGroup
	var mu sync.Mutex
	allowed := 0
	for g := 0; g < 20; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				ok, _ := l.Allow("shared")
				l.Allow("k" + strconv.Itoa(g))
				if ok {
					mu.Lock()
					allowed++
					mu.Unlock()
				}
			}
		}(g)
	}
	wg.Wait()
	if allowed != 100 {
		t.Errorf("allowed = %d, want exactly 100", allowed)
	}
}

func TestQueryValidation(t *testing.T) {
	tests := []struct {
		name string
		q    string
		want int
	}{
		{"50 chars ok", strings.Repeat("a", 50), 200},
		{"51 chars", strings.Repeat("a", 51), 400},
		{"50 japanese chars ok", strings.Repeat("あ", 50), 200},
		{"51 japanese chars", strings.Repeat("あ", 51), 400},
		{"5 words ok", "a b c d e", 200},
		{"6 words", "a b c d e f", 400},
		{"6 words full-width spaces", "a　b　c　d　e　f", 400},
		{"5 words with extra spaces ok", "  a   b c d  e ", 200},
		{"one long word among many", "a " + strings.Repeat("b", 51), 400},
		{"empty", "", 400},
	}
	h := NewHandler(foundClient(), discardLog())
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := doReq(h, "/api/views?q="+url.QueryEscape(tt.q), "192.0.2.1:1")
			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d (%s)", rec.Code, tt.want, rec.Body.String())
			}
			if tt.want == 400 {
				var body errorBody
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Error.Code != "invalid_query" || body.Error.Message == "" {
					t.Errorf("body = %s", rec.Body.String())
				}
			}
		})
	}
}

func TestInvalidQueryDoesNotCallUpstream(t *testing.T) {
	cl := foundClient()
	h := NewHandler(cl, discardLog())
	doReq(h, "/api/views?q="+strings.Repeat("a", 51), "192.0.2.1:1")
	doReq(h, "/api/views?q=a+b+c+d+e+f", "192.0.2.1:1")
	if cl.searches.Load() != 0 {
		t.Errorf("upstream called %d times", cl.searches.Load())
	}
}
