package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

func TestHandlerWithMock(t *testing.T) {
	h := NewHandler(&youtube.MockClient{SlowDelay: time.Millisecond}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	get := func(q string) (int, string) {
		r := httptest.NewRequest("GET", "/api/views?q="+url.QueryEscape(q), nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code, w.Body.String()
	}
	for _, q := range []string{"hello", "slow hello", "ＨＥＬＬＯ　World"} {
		code, body := get(q)
		if code != http.StatusOK || !strings.Contains(body, `"found":true`) {
			t.Errorf("%q: %d %s", q, code, body)
		}
	}
	c1, b1 := get("hello world")
	c2, b2 := get("World　HELLO")
	if c1 != c2 || b1 != b2 {
		t.Errorf("not identical: %s / %s", b1, b2)
	}
	if code, body := get("nomatch"); code != 200 || !strings.Contains(body, `"found":false`) {
		t.Errorf("nomatch: %d %s", code, body)
	}
	if code, body := get("error"); code != http.StatusBadGateway || !strings.Contains(body, "upstream_error") {
		t.Errorf("error: %d %s", code, body)
	}
	// Twice: the second answer must be the same (nothing cached here either).
	for i := 0; i < 2; i++ {
		if code, body := get("quota"); code != http.StatusServiceUnavailable || !strings.Contains(body, `"code":"quota_exceeded"`) {
			t.Errorf("quota: %d %s", code, body)
		}
	}
}

func TestHandlerWithMockFixedViews(t *testing.T) {
	h := NewHandler(&youtube.MockClient{SlowDelay: time.Millisecond}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	for q, want := range map[string]string{
		"n5000":           `"viewCount":5000`,
		"Ｎ０ foo":          `"viewCount":0`,
		"slow n123456789": `"viewCount":123456789`,
	} {
		r := httptest.NewRequest("GET", "/api/views?q="+url.QueryEscape(q), nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		body := w.Body.String()
		if w.Code != http.StatusOK || !strings.Contains(body, `"found":true`) || !strings.Contains(body, want) {
			t.Errorf("%q: %d %s (want %s)", q, w.Code, body, want)
		}
	}
}
