package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

type fakeClient struct {
	ids       []string
	videos    []youtube.Video
	searchErr error
	getErr    error
	gotQuery  string
	getCalled bool
}

func (f *fakeClient) SearchVideoIDs(_ context.Context, q string) ([]string, error) {
	f.gotQuery = q
	return f.ids, f.searchErr
}

func (f *fakeClient) GetVideos(_ context.Context, ids []string) ([]youtube.Video, error) {
	f.getCalled = true
	return f.videos, f.getErr
}

func vc(n uint64) *uint64 { return &n }

func do(t *testing.T, c youtube.Client, rawQuery string) (*httptest.ResponseRecorder, *bytes.Buffer) {
	t.Helper()
	var logs bytes.Buffer
	h := NewHandler(c, slog.New(slog.NewTextHandler(&logs, nil)))
	req := httptest.NewRequest(http.MethodGet, "/api/views?"+rawQuery, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec, &logs
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("invalid json %q: %v", rec.Body.String(), err)
	}
	return m
}

func sample() *fakeClient {
	return &fakeClient{
		ids: []string{"a", "b", "c", "d", "e"},
		videos: []youtube.Video{
			{ID: "a", Title: "猫だけの動画", ViewCount: vc(9_000_000_000)},    // missing word
			{ID: "b", Title: "猫とPIANO", ViewCount: vc(1_234_567)},       // match
			{ID: "c", Title: "ＰＩＡＮＯを弾く猫", ViewCount: vc(5_678_901)},     // match, largest
			{ID: "d", Title: "猫 piano 非公開統計", ViewCount: nil},           // no viewCount
			{ID: "e", Title: "piano cat", ViewCount: vc(8_000_000_000)}, // missing word
		},
	}
}

func TestFoundReturnsMaxViewsUnprocessed(t *testing.T) {
	c := sample()
	rec, _ := do(t, c, "q="+url.QueryEscape("猫 piano"))
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	m := decode(t, rec)
	if m["found"] != true || m["viewCount"] != float64(5678901) {
		t.Fatalf("unexpected: %v", m)
	}
	v := m["video"].(map[string]any)
	if v["id"] != "c" || v["title"] != "ＰＩＡＮＯを弾く猫" || len(v) != 2 {
		t.Fatalf("unexpected video: %v", v)
	}
	if len(m) != 3 {
		t.Fatalf("unexpected extra fields: %v", m)
	}
}

func TestMultipleWordsSeparators(t *testing.T) {
	fw := string(rune(0x3000))
	for _, q := range []string{"猫 piano", "猫" + fw + "piano", "PIANO  猫", "ＰＩＡＮＯ" + fw + "猫"} {
		rec, _ := do(t, sample(), "q="+url.QueryEscape(q))
		m := decode(t, rec)
		if m["found"] != true || m["viewCount"] != float64(5678901) {
			t.Errorf("q=%q: %v", q, m)
		}
	}
}

func TestSearchUsesNormalizedWords(t *testing.T) {
	c := sample()
	do(t, c, "q="+url.QueryEscape("猫"+string(rune(0x3000))+"PIANO"))
	if c.gotQuery != "猫 piano" {
		t.Fatalf("query %q", c.gotQuery)
	}
}

func TestNotFound(t *testing.T) {
	c := sample()
	rec, _ := do(t, c, "q=nomatch")
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != `{"found":false}` {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestNotFoundWhenNoSearchResults(t *testing.T) {
	c := &fakeClient{}
	rec, _ := do(t, c, "q=x")
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != `{"found":false}` || c.getCalled {
		t.Fatalf("%d %s called=%v", rec.Code, rec.Body.String(), c.getCalled)
	}
}

func TestViewCountMissingExcluded(t *testing.T) {
	c := &fakeClient{ids: []string{"d"}, videos: []youtube.Video{{ID: "d", Title: "cat", ViewCount: nil}}}
	rec, _ := do(t, c, "q=cat")
	if strings.TrimSpace(rec.Body.String()) != `{"found":false}` {
		t.Fatal(rec.Body.String())
	}
}

func TestInvalidQuery(t *testing.T) {
	fw := string(rune(0x3000))
	for _, raw := range []string{"", "q=", "q=" + url.QueryEscape("   "), "q=" + url.QueryEscape(fw+" "+fw)} {
		c := sample()
		rec, _ := do(t, c, raw)
		if rec.Code != 400 {
			t.Fatalf("%q: status %d", raw, rec.Code)
		}
		m := decode(t, rec)
		e := m["error"].(map[string]any)
		if e["code"] != "invalid_query" || e["message"] == "" {
			t.Fatalf("%q: %v", raw, m)
		}
		if c.gotQuery != "" {
			t.Fatalf("%q: upstream must not be called", raw)
		}
	}
}

func TestUpstreamErrorIs502WithoutLeak(t *testing.T) {
	secret := "SECRET-KEY-123"
	for name, c := range map[string]*fakeClient{
		"search": {searchErr: errors.New("boom " + secret)},
		"videos": {ids: []string{"a"}, getErr: &youtube.UpstreamError{Status: 500}},
	} {
		t.Run(name, func(t *testing.T) {
			rec, _ := do(t, c, "q=cat")
			if rec.Code != 502 {
				t.Fatalf("status %d", rec.Code)
			}
			if strings.Contains(rec.Body.String(), secret) || strings.Contains(rec.Body.String(), "boom") {
				t.Fatalf("leak: %s", rec.Body.String())
			}
			if decode(t, rec)["error"] == nil {
				t.Fatal("no error body")
			}
		})
	}
}
