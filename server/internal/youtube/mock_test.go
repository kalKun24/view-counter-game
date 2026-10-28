package youtube

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestMockClient_ErrorsAndNoMatch(t *testing.T) {
	m := &MockClient{SlowDelay: time.Millisecond}
	tests := []struct {
		q          string
		wantStatus int
		wantReason string
	}{
		{"foo error", 500, ""},
		{"QUOTA", 403, "quotaExceeded"},
		{"Ｑｕｏｔａ　x", 403, "quotaExceeded"},
	}
	for _, tt := range tests {
		_, err := m.SearchVideoIDs(context.Background(), tt.q)
		var ue *UpstreamError
		if !errors.As(err, &ue) || ue.Status != tt.wantStatus || ue.Reason != tt.wantReason {
			t.Errorf("%q: err = %v", tt.q, err)
		}
	}
	ids, err := m.SearchVideoIDs(context.Background(), "a nomatch")
	if err != nil || len(ids) != 0 {
		t.Errorf("nomatch: ids=%v err=%v", ids, err)
	}
}

func TestMockClient_Deterministic(t *testing.T) {
	m := &MockClient{}
	get := func(q string) Video {
		t.Helper()
		ids, err := m.SearchVideoIDs(context.Background(), q)
		if err != nil || len(ids) != 1 {
			t.Fatalf("%q: ids=%v err=%v", q, ids, err)
		}
		vs, err := m.GetVideos(context.Background(), ids)
		if err != nil || len(vs) != 1 || vs[0].ViewCount == nil {
			t.Fatalf("%q: vs=%v err=%v", q, vs, err)
		}
		return vs[0]
	}
	a, b := get("hello"), get("hello")
	if a.Title != b.Title || *a.ViewCount != *b.ViewCount {
		t.Errorf("not deterministic: %v %v", a, b)
	}
	c, d := get("Hello　World"), get("world hello")
	if c.Title != d.Title || *c.ViewCount != *d.ViewCount {
		t.Errorf("normalization differs: %v %v", c, d)
	}
	if *get("hello").ViewCount == *get("other").ViewCount {
		t.Error("different queries should (here) differ")
	}
}

func TestMockClient_Slow(t *testing.T) {
	m := &MockClient{SlowDelay: 30 * time.Millisecond}
	start := time.Now()
	ids, err := m.SearchVideoIDs(context.Background(), "slow x")
	if err != nil || len(ids) != 1 {
		t.Fatalf("ids=%v err=%v", ids, err)
	}
	if time.Since(start) < 30*time.Millisecond {
		t.Error("not delayed")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	m.SlowDelay = time.Hour
	if _, err := m.SearchVideoIDs(ctx, "slow"); !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v", err)
	}
}

func TestMockClient_FixedViews(t *testing.T) {
	m := &MockClient{SlowDelay: time.Millisecond}
	tests := []struct {
		q    string
		want uint64
		fix  bool // false: expect an ordinary (hash-based) result
	}{
		{"n5000", 5000, true},
		{"N0", 0, true},
		{"ｎ５０００ foo", 5000, true},
		{"foo n123456789", 123456789, true},
		{"n5000 slow", 5000, true},
		{"n9223372036854775807", 9223372036854775807, true},
		{"n007", 7, true},
		// First in sorted order wins: "n1" < "n2".
		{"n2 n1", 1, true},
		// Overflow is skipped and the next n word is used.
		{"n9223372036854775808 n3", 3, true},
		{"n99999999999999999999", 0, false},
		{"n", 0, false},
		{"n-5", 0, false},
		{"n12a", 0, false},
		{"xn5", 0, false},
	}
	for _, tt := range tests {
		ids, err := m.SearchVideoIDs(context.Background(), tt.q)
		if err != nil || len(ids) != 1 {
			t.Fatalf("%q: ids=%v err=%v", tt.q, ids, err)
		}
		vs, err := m.GetVideos(context.Background(), ids)
		if err != nil || len(vs) != 1 || vs[0].ViewCount == nil {
			t.Fatalf("%q: vs=%v err=%v", tt.q, vs, err)
		}
		if tt.fix && *vs[0].ViewCount != tt.want {
			t.Errorf("%q: views = %d, want %d", tt.q, *vs[0].ViewCount, tt.want)
		}
		if !tt.fix && *vs[0].ViewCount < 1000 {
			t.Errorf("%q: expected ordinary result, got %d", tt.q, *vs[0].ViewCount)
		}
		if !strings.HasPrefix(vs[0].Title, "Mock video: ") {
			t.Errorf("%q: title = %q", tt.q, vs[0].Title)
		}
	}
	// Special words keep precedence over n<digits>.
	if ids, _ := m.SearchVideoIDs(context.Background(), "n5000 nomatch"); len(ids) != 0 {
		t.Errorf("nomatch should win: %v", ids)
	}
	var ue *UpstreamError
	if _, err := m.SearchVideoIDs(context.Background(), "n5000 quota"); !errors.As(err, &ue) || ue.Status != 403 {
		t.Errorf("quota should win: %v", err)
	}
	if _, err := m.SearchVideoIDs(context.Background(), "n5000 error"); !errors.As(err, &ue) || ue.Status != 500 {
		t.Errorf("error should win: %v", err)
	}
}
