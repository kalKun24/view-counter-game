package api

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/cache"
	"github.com/kalKun24/view-counter-game/server/internal/quota"
	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

type lockedBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuf) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}
func (l *lockedBuf) String() string { l.mu.Lock(); defer l.mu.Unlock(); return l.b.String() }

// quotaHandler builds the same stack as main: cache above the quota guard
// above the mock. The limit is in units (202 = two cache misses).
func quotaHandler(t *testing.T, limit int, now func() time.Time) (http.Handler, *lockedBuf) {
	t.Helper()
	loc, err := quota.LoadPacific()
	if err != nil {
		t.Fatal(err)
	}
	logs := &lockedBuf{}
	log := slog.New(slog.NewTextHandler(logs, nil))
	g := quota.New(limit, loc, now, log)
	c := quota.Wrap(&youtube.MockClient{SlowDelay: time.Millisecond}, g)
	return NewHandler(c, log, WithCache(cache.New[Result](time.Hour, 100, now))), logs
}

func getView(h http.Handler, q string) (int, string) {
	r := httptest.NewRequest("GET", "/api/views?q="+url.QueryEscape(q), nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Code, w.Body.String()
}

// The demo of PBI #26: limit 202, three different words, then a cached one.
func TestQuotaLimitDemo(t *testing.T) {
	h, logs := quotaHandler(t, 202, time.Now)
	for _, q := range []string{"alpha", "beta"} {
		if code, body := getView(h, q); code != 200 {
			t.Fatalf("%s: %d %s", q, code, body)
		}
	}
	code, body := getView(h, "gamma")
	if code != http.StatusServiceUnavailable || !strings.Contains(body, `"code":"quota_exceeded"`) {
		t.Fatalf("3rd miss: %d %s", code, body)
	}
	// Cache hits are neither counted nor refused.
	if code, _ := getView(h, "alpha"); code != 200 {
		t.Errorf("cached word after the limit: %d", code)
	}
	if n := strings.Count(logs.String(), "daily unit limit reached"); n != 1 {
		t.Errorf("limit logged %d times, want 1:\n%s", n, logs.String())
	}
}

// Criterion 1: a cache hit does not add units.
func TestCacheHitIsNotCounted(t *testing.T) {
	loc, _ := quota.LoadPacific()
	g := quota.New(10000, loc, time.Now, slog.New(slog.NewTextHandler(&lockedBuf{}, nil)))
	c := quota.Wrap(&youtube.MockClient{SlowDelay: time.Millisecond}, g)
	h := NewHandler(c, slog.New(slog.NewTextHandler(&lockedBuf{}, nil)), WithCache(cache.New[Result](time.Hour, 100, time.Now)))
	for i := 0; i < 5; i++ {
		getView(h, "same word")
	}
	if got := g.Used(); got != 101 {
		t.Errorf("used = %d, want 101 (one miss)", got)
	}
}

// Criterion 4 through the handler: quota -> 503, then no upstream call and a
// single start-of-suppression log line.
func TestQuotaWordSuppressesUpstream(t *testing.T) {
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	var mu sync.Mutex
	clock := func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	h, logs := quotaHandler(t, 8000, clock)

	if code, body := getView(h, "quota"); code != 503 || !strings.Contains(body, `"code":"quota_exceeded"`) {
		t.Fatalf("quota: %d %s", code, body)
	}
	for _, q := range []string{"delta", "epsilon", "quota again"} {
		if code, body := getView(h, q); code != 503 || !strings.Contains(body, `"code":"quota_exceeded"`) {
			t.Fatalf("%s while suppressed: %d %s", q, code, body)
		}
	}
	if n := strings.Count(logs.String(), "suppressed after quotaExceeded"); n != 1 {
		t.Errorf("start logged %d times, want 1:\n%s", n, logs.String())
	}
	// After an hour the first request is tried and a normal word resumes.
	mu.Lock()
	now = now.Add(time.Hour)
	mu.Unlock()
	if code, body := getView(h, "delta"); code != 200 {
		t.Fatalf("after 1h: %d %s", code, body)
	}
	if n := strings.Count(logs.String(), "upstream calls resumed"); n != 1 {
		t.Errorf("resume logged %d times, want 1:\n%s", n, logs.String())
	}
}
