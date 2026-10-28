package youtube

import (
	"context"
	"hash/fnv"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/words"
)

// DefaultMockSlowDelay is how long a "slow" query is delayed by the mock.
const DefaultMockSlowDelay = 3 * time.Second

const mockIDPrefix = "mock:"

// MockClient is a Client for development that never calls the real API.
//
// The behavior is decided by the words of the query (after normalization):
// "error" (upstream 500), "quota" (403 quotaExceeded), "nomatch" (no result),
// "slow" (delayed result); in this order of precedence. Any other query gets
// a deterministic result whose title contains every word of the query.
//
// A word of the form "n<digits>" (e.g. "n5000") fixes the view count to that
// number. It is applied after the special words above, so "n5000 slow" is
// delayed and then reports 5000. With several such words, the first one in
// the sorted normalized word set (string order) that fits in int64 is used.
type MockClient struct {
	// SlowDelay is the delay for "slow" queries. Tests may shorten it.
	SlowDelay time.Duration
}

// NewMockClient returns a MockClient with the default delay.
func NewMockClient() *MockClient {
	return &MockClient{SlowDelay: DefaultMockSlowDelay}
}

// SearchVideoIDs implements Client.
func (m *MockClient) SearchVideoIDs(ctx context.Context, query string) ([]string, error) {
	ws := words.NormalizedSet(query)
	switch {
	case slices.Contains(ws, "error"):
		return nil, &UpstreamError{Status: 500}
	case slices.Contains(ws, "quota"):
		return nil, &UpstreamError{Status: 403, Reason: "quotaExceeded"}
	case slices.Contains(ws, "nomatch"):
		return nil, nil
	case slices.Contains(ws, "slow"):
		t := time.NewTimer(m.SlowDelay)
		defer t.Stop()
		select {
		case <-t.C:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	// The ID carries the normalized words so GetVideos can stay stateless.
	return []string{mockIDPrefix + strings.Join(ws, " ")}, nil
}

// GetVideos implements Client.
func (m *MockClient) GetVideos(_ context.Context, ids []string) ([]Video, error) {
	out := make([]Video, 0, len(ids))
	for _, id := range ids {
		key, ok := strings.CutPrefix(id, mockIDPrefix)
		if !ok {
			continue
		}
		h := fnv.New64a()
		_, _ = h.Write([]byte(key))
		views := 1000 + h.Sum64()%100_000_000
		if n, ok := fixedViews(strings.Fields(key)); ok {
			views = n
		}
		out = append(out, Video{ID: id, Title: "Mock video: " + key, ViewCount: &views})
	}
	return out, nil
}

// fixedViews returns the view count given by the first "n<digits>" word of
// ws. ws must be the sorted normalized word set. Words whose digits are not
// ASCII or overflow int64 are ignored.
func fixedViews(ws []string) (uint64, bool) {
	for _, w := range ws {
		d, ok := strings.CutPrefix(w, "n")
		if !ok || d == "" || strings.Trim(d, "0123456789") != "" {
			continue
		}
		if n, err := strconv.ParseInt(d, 10, 64); err == nil {
			return uint64(n), true
		}
	}
	return 0, false
}
