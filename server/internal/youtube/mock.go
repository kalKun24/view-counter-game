package youtube

import (
	"context"
	"hash/fnv"
	"slices"
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
		out = append(out, Video{ID: id, Title: "Mock video: " + key, ViewCount: &views})
	}
	return out, nil
}
