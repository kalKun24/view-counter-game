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
	for _, q := range []string{"quota", "error"} {
		if code, body := get(q); code != http.StatusBadGateway || !strings.Contains(body, "upstream_error") {
			t.Errorf("%s: %d %s", q, code, body)
		}
	}
}
