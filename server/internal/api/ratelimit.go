package api

import (
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"
)

// maxLimiterEntries bounds the memory used by one RateLimiter. When the table
// is full of live entries, new clients are refused (fail closed) so that the
// quota stays protected; expired entries are swept first.
const maxLimiterEntries = 100_000

// RateLimiter is a fixed-window per-key request counter held in memory.
// It is safe for concurrent use. With several instances each one counts on
// its own, so the effective limit is multiplied by the instance count.
type RateLimiter struct {
	limit  int
	window time.Duration
	now    func() time.Time
	max    int

	mu        sync.Mutex
	entries   map[string]*window
	lastSweep time.Time
}

type window struct {
	start time.Time
	count int
}

// NewRateLimiter allows limit requests per key in each window. now is the
// clock (time.Now in production).
func NewRateLimiter(limit int, win time.Duration, now func() time.Time) *RateLimiter {
	return &RateLimiter{
		limit:   limit,
		window:  win,
		now:     now,
		max:     maxLimiterEntries,
		entries: make(map[string]*window),
	}
}

// Allow counts one request for key. When the request is over the limit it
// returns false and how long until the key's window ends.
func (l *RateLimiter) Allow(key string) (ok bool, retryAfter time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if now.Sub(l.lastSweep) >= l.window {
		l.sweep(now)
	}
	w, found := l.entries[key]
	if found && now.Sub(w.start) >= l.window {
		found = false
	}
	if !found {
		if _, exists := l.entries[key]; !exists && len(l.entries) >= l.max {
			l.sweep(now)
			if len(l.entries) >= l.max {
				return false, l.window
			}
		}
		l.entries[key] = &window{start: now, count: 1}
		return true, 0
	}
	if w.count >= l.limit {
		return false, w.start.Add(l.window).Sub(now)
	}
	w.count++
	return true, 0
}

// sweep drops expired entries. The caller holds l.mu.
func (l *RateLimiter) sweep(now time.Time) {
	for k, w := range l.entries {
		if now.Sub(w.start) >= l.window {
			delete(l.entries, k)
		}
	}
	l.lastSweep = now
}

// size reports the number of tracked keys (for tests).
func (l *RateLimiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.entries)
}

// ClientIP returns the key to rate-limit r by. Behind Cloud Run the front end
// appends the real peer address to X-Forwarded-For, so everything to its left
// is client-supplied and spoofable. trustedHops is how many entries from the
// right were added by trusted proxies; the entry at that position is used
// (1 = the last entry). A missing, short or unparsable header falls back to
// RemoteAddr. IPv6 addresses are grouped by /64.
func ClientIP(r *http.Request, trustedHops int) string {
	if trustedHops >= 1 {
		var parts []string
		for _, h := range r.Header.Values("X-Forwarded-For") {
			for _, p := range strings.Split(h, ",") {
				parts = append(parts, strings.TrimSpace(p))
			}
		}
		if len(parts) >= trustedHops {
			if a, err := netip.ParseAddr(parts[len(parts)-trustedHops]); err == nil {
				return limiterKey(a)
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if a, err := netip.ParseAddr(host); err == nil {
		return limiterKey(a)
	}
	return host
}

func limiterKey(a netip.Addr) string {
	a = a.Unmap()
	if a.Is6() {
		p, _ := a.Prefix(64)
		return p.String()
	}
	return a.String()
}

// rateLimit applies l to requests under /api/ only; everything else (static
// files) passes through uncounted.
func rateLimit(next http.Handler, l *RateLimiter, hops int, log *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		ip := ClientIP(r, hops)
		ok, retry := l.Allow(ip)
		if !ok {
			secs := int((retry + time.Second - 1) / time.Second)
			if secs < 1 {
				secs = 1
			}
			log.Warn("rate limited", "client", ip, "retryAfterSeconds", secs)
			w.Header().Set("Retry-After", strconv.Itoa(secs))
			writeError(w, http.StatusTooManyRequests, "too_many_requests", "リクエストが多すぎます。しばらく待ってからもう一度お試しください。")
			return
		}
		next.ServeHTTP(w, r)
	})
}
