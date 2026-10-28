package youtube

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
