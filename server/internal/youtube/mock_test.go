package youtube

import (
	"context"
	"errors"
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
