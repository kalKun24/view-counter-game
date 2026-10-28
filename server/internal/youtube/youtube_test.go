package youtube

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

const key = "TEST-API-KEY-should-never-leak"

func newServer(t *testing.T, h http.HandlerFunc) *HTTPClient {
	t.Helper()
	ts := httptest.NewServer(h)
	t.Cleanup(ts.Close)
	return NewHTTPClient(key, ts.URL, ts.Client())
}

func TestSearchRequestAndParse(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if r.URL.Path != "/search" || q.Get("type") != "video" || q.Get("order") != "viewCount" ||
			q.Get("maxResults") != "50" || q.Get("q") != "猫 piano" {
			t.Errorf("bad request: %s", r.URL.String())
		}
		if r.Header.Get("x-goog-api-key") != key || strings.Contains(r.URL.String(), key) {
			t.Errorf("key must be sent in header only")
		}
		_, _ = w.Write([]byte(`{"items":[{"id":{"videoId":"a"}},{"id":{"videoId":"b"}},{"id":{}}]}`))
	})
	ids, err := c.SearchVideoIDs(context.Background(), "猫 piano")
	if err != nil || len(ids) != 2 || ids[0] != "a" || ids[1] != "b" {
		t.Fatalf("%v %v", ids, err)
	}
}

func TestGetVideosParse(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/videos" || r.URL.Query().Get("id") != "a,b" ||
			r.URL.Query().Get("part") != "snippet,statistics" {
			t.Errorf("bad request: %s", r.URL.String())
		}
		_, _ = w.Write([]byte(`{"items":[
			{"id":"a","snippet":{"title":"T1"},"statistics":{"viewCount":"1234567"}},
			{"id":"b","snippet":{"title":"T2"},"statistics":{}}]}`))
	})
	vs, err := c.GetVideos(context.Background(), []string{"a", "b"})
	if err != nil || len(vs) != 2 {
		t.Fatalf("%v %v", vs, err)
	}
	if vs[0].ViewCount == nil || *vs[0].ViewCount != 1234567 || vs[0].Title != "T1" {
		t.Errorf("%+v", vs[0])
	}
	if vs[1].ViewCount != nil {
		t.Errorf("viewCount should be nil: %+v", vs[1])
	}
}

func TestUpstreamErrorsAreSanitized(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"message":"bad key ` + key + `","errors":[{"reason":"quotaExceeded"}]}}`))
	})
	_, err := c.SearchVideoIDs(context.Background(), "x")
	var ue *UpstreamError
	if !errors.As(err, &ue) || ue.Status != 403 || ue.Reason != "quotaExceeded" {
		t.Fatalf("%v", err)
	}
	if strings.Contains(err.Error(), key) {
		t.Fatalf("leak: %v", err)
	}
}

func TestIsQuotaExceeded(t *testing.T) {
	tests := []struct {
		err  error
		want bool
	}{
		{&UpstreamError{Status: 403, Reason: "quotaExceeded"}, true},
		{&UpstreamError{Status: 403, Reason: "dailyLimitExceeded"}, false},
		{fmt.Errorf("wrapped: %w", &UpstreamError{Status: 403, Reason: "quotaExceeded"}), true},
		{&UpstreamError{Status: 403, Reason: "rateLimitExceeded"}, false},
		{&UpstreamError{Status: 403}, false},
		{&UpstreamError{Status: 400, Reason: "quotaExceeded"}, false},
		{errors.New("other"), false},
		{nil, false},
	}
	for _, tt := range tests {
		if got := IsQuotaExceeded(tt.err); got != tt.want {
			t.Errorf("%v: got %v", tt.err, got)
		}
	}
}

func TestNilHTTPClientHasTimeout(t *testing.T) {
	c := NewHTTPClient(key, "http://example.invalid", nil)
	if c.http == http.DefaultClient || c.http.Timeout != DefaultHTTPTimeout {
		t.Fatalf("%+v", c.http)
	}
}

func TestDefaultHTTPTimeoutIsTenSeconds(t *testing.T) {
	if DefaultHTTPTimeout != 10*time.Second || defaultHTTPTimeout != DefaultHTTPTimeout {
		t.Fatalf("%v %v", DefaultHTTPTimeout, defaultHTTPTimeout)
	}
}

// TestNilHTTPClientTimeoutOnHangingServer shortens the default timeout so the
// test does not wait the real 10 seconds.
func TestNilHTTPClientTimeoutOnHangingServer(t *testing.T) {
	old := defaultHTTPTimeout
	defaultHTTPTimeout = 50 * time.Millisecond
	t.Cleanup(func() { defaultHTTPTimeout = old })

	release := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { <-release }))
	t.Cleanup(ts.Close)
	t.Cleanup(func() { close(release) }) // runs before ts.Close

	c := NewHTTPClient(key, ts.URL, nil)
	start := time.Now()
	_, err := c.SearchVideoIDs(context.Background(), "q")
	if err == nil {
		t.Fatal("expected a timeout error")
	}
	if !IsTimeout(err) || !IsUpstream(err) {
		t.Fatalf("not an upstream timeout: %v", err)
	}
	if strings.Contains(err.Error(), key) {
		t.Fatalf("key leaked: %v", err)
	}
	if d := time.Since(start); d > 5*time.Second {
		t.Fatalf("took %v", d)
	}
}

func TestTransportErrorDoesNotLeakKeyOrURL(t *testing.T) {
	ts := httptest.NewServer(http.NotFoundHandler())
	url := ts.URL
	ts.Close() // connection refused
	c := NewHTTPClient(key, url, nil)
	_, err := c.GetVideos(context.Background(), []string{"a"})
	if err == nil || strings.Contains(err.Error(), key) || strings.Contains(err.Error(), url) {
		t.Fatalf("%v", err)
	}
}

// Whole-stack check: the key must not appear in logs or the response.
func TestKeyNotInLogs(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = w.Write([]byte("raw upstream " + key))
	})
	var logs bytes.Buffer
	log := slog.New(slog.NewTextHandler(&logs, nil))
	_, err := c.SearchVideoIDs(context.Background(), "x")
	log.Error("youtube request failed", "err", err.Error())
	if strings.Contains(logs.String(), key) || strings.Contains(logs.String(), "raw upstream") {
		t.Fatalf("log leaks: %s", logs.String())
	}
}

// strictAPI is a fake server that rejects requests the real API rejects,
// according to the official docs (see README "YouTube Data API との突合").
// It records every request so tests can inspect the parameters.
type strictAPI struct {
	reqs []string
}

func (s *strictAPI) handler(w http.ResponseWriter, r *http.Request) {
	s.reqs = append(s.reqs, r.URL.String())
	q := r.URL.Query()
	bad := func(msg string) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"errors":[{"reason":"` + msg + `"}]}}`))
	}
	switch r.URL.Path {
	case "/videos":
		if q.Get("part") == "" {
			bad("missingRequiredParameter")
			return
		}
		// id cannot be combined with maxResults or pageToken
		// (docs: "not supported in conjunction with the id parameter").
		if q.Get("id") != "" && (q.Has("maxResults") || q.Has("pageToken")) {
			bad("incompatibleParameters")
			return
		}
		_, _ = w.Write([]byte(`{"items":[]}`))
	case "/search":
		if q.Get("part") != "snippet" {
			bad("badPart")
			return
		}
		if mr := q.Get("maxResults"); mr != "" {
			if n, err := strconv.Atoi(mr); err != nil || n < 0 || n > 50 {
				bad("badMaxResults")
				return
			}
		}
		_, _ = w.Write([]byte(`{"items":[]}`))
	default:
		http.NotFound(w, r)
	}
}

func TestVideosListSendsNoIncompatibleParams(t *testing.T) {
	api := &strictAPI{}
	c := newServer(t, api.handler)
	ids := make([]string, MaxResults)
	for i := range ids {
		ids[i] = "v" + strconv.Itoa(i)
	}
	if _, err := c.GetVideos(context.Background(), ids); err != nil {
		t.Fatalf("videos.list rejected by strict fake: %v", err)
	}
	if len(api.reqs) != 1 || strings.Contains(api.reqs[0], "maxResults") || strings.Contains(api.reqs[0], "pageToken") {
		t.Fatalf("requests: %v", api.reqs)
	}
}

func TestSearchListSatisfiesDocumentedConstraints(t *testing.T) {
	api := &strictAPI{}
	c := newServer(t, api.handler)
	if _, err := c.SearchVideoIDs(context.Background(), "x"); err != nil {
		t.Fatalf("search.list rejected by strict fake: %v", err)
	}
}

// The strict fake itself must reproduce the old failure (maxResults with id).
func TestStrictFakeRejectsIdWithMaxResults(t *testing.T) {
	api := &strictAPI{}
	ts := httptest.NewServer(http.HandlerFunc(api.handler))
	t.Cleanup(ts.Close)
	resp, err := http.Get(ts.URL + "/videos?part=snippet&id=a&maxResults=50")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status %d", resp.StatusCode)
	}
}
