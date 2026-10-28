package api

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

const secretKey = "TEST-API-KEY-should-never-leak"

// Through the real HTTP client and a fake YouTube server: only a 403 whose
// reason says "quota" becomes 503; other 403s stay 502.
func TestQuotaVersusOtherUpstreamErrors(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		reason     string
		wantStatus int
		wantCode   string
		wantLog    string
	}{
		{"quotaExceeded", 403, "quotaExceeded", 503, "quota_exceeded", "youtube quota exceeded"},
		{"dailyLimitExceeded", 403, "dailyLimitExceeded", 503, "quota_exceeded", "youtube quota exceeded"},
		{"rateLimitExceeded", 403, "rateLimitExceeded", 502, "upstream_error", "youtube request failed"},
		{"userRateLimitExceeded", 403, "userRateLimitExceeded", 502, "upstream_error", "youtube request failed"},
		{"forbidden", 403, "forbidden", 502, "upstream_error", "youtube request failed"},
		{"accessNotConfigured", 403, "accessNotConfigured", 502, "upstream_error", "youtube request failed"},
		{"403 without reason", 403, "", 502, "upstream_error", "youtube request failed"},
		{"quota reason but 400", 400, "quotaExceeded", 502, "upstream_error", "youtube request failed"},
		{"500", 500, "backendError", 502, "upstream_error", "youtube request failed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var calls atomic.Int32
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.WriteHeader(tt.status)
				fmt.Fprintf(w, `{"error":{"code":%d,"message":"secret %s","errors":[{"reason":%q,"domain":"youtube.quota"}]}}`,
					tt.status, secretKey, tt.reason)
			}))
			defer ts.Close()
			c := youtube.NewHTTPClient(secretKey, ts.URL, ts.Client())
			var logs bytes.Buffer
			h := NewHandler(c, slog.New(slog.NewTextHandler(&logs, nil)))
			rec := get(h, "cat")
			if rec.Code != tt.wantStatus || !strings.Contains(rec.Body.String(), `"code":"`+tt.wantCode+`"`) {
				t.Fatalf("%d %s", rec.Code, rec.Body)
			}
			if !strings.Contains(logs.String(), tt.wantLog) {
				t.Errorf("log lacks %q: %s", tt.wantLog, logs.String())
			}
			// T1-1 item 6: through the real handler, nothing secret leaks.
			if strings.Contains(logs.String(), secretKey) || strings.Contains(rec.Body.String(), secretKey) {
				t.Errorf("secret leaked: %s / %s", logs.String(), rec.Body)
			}
			// Not cached: the second request reaches upstream again.
			ca := newCachedHandlerFor(c)
			get(ca, "cat")
			get(ca, "cat")
			if got := calls.Load(); got != 3 {
				t.Errorf("upstream calls = %d, want 3 (1 + 2 uncached)", got)
			}
		})
	}
}

func newCachedHandlerFor(c youtube.Client) http.Handler {
	h, _, _ := newCachedHandler(c, time.Now, time.Hour, 10)
	return h
}

func TestCanceledAndTimeoutAreDistinguished(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
		wantLog    string
	}{
		{"canceled", context.Canceled, 499, "canceled", "request canceled by caller"},
		{"deadline", context.DeadlineExceeded, 504, "timeout", "youtube request timed out"},
		{"client timeout", &youtube.UpstreamError{Timeout: true}, 504, "timeout", "youtube request timed out"},
		{"transport error", &youtube.UpstreamError{}, 502, "upstream_error", "youtube request failed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec, logs := do(t, &fakeClient{searchErr: tt.err}, "q=cat")
			if rec.Code != tt.wantStatus || !strings.Contains(rec.Body.String(), `"code":"`+tt.wantCode+`"`) {
				t.Fatalf("%d %s", rec.Code, rec.Body)
			}
			if !strings.Contains(logs.String(), tt.wantLog) {
				t.Errorf("log lacks %q: %s", tt.wantLog, logs)
			}
		})
	}
}

// A real client-side timeout of the HTTP client is reported as a timeout.
func TestHTTPClientTimeoutIs504(t *testing.T) {
	release := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}))
	defer ts.Close()
	defer close(release)
	c := youtube.NewHTTPClient(secretKey, ts.URL, &http.Client{Timeout: 50 * time.Millisecond})
	rec, logs := do(t, c, "q=cat")
	if rec.Code != 504 || !strings.Contains(rec.Body.String(), `"code":"timeout"`) {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if strings.Contains(logs.String(), secretKey) || strings.Contains(logs.String(), ts.URL) {
		t.Errorf("leak: %s", logs)
	}
}
