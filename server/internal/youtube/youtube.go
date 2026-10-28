// Package youtube defines the YouTube client interface and a real
// implementation backed by the YouTube Data API v3.
package youtube

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// MaxResults is the number of search results requested.
const MaxResults = 50

// Video is a video with its title and view count.
// ViewCount is nil when the API did not return one.
type Video struct {
	ID        string
	Title     string
	ViewCount *uint64
}

// Client abstracts the YouTube Data API so that it can be replaced in tests.
type Client interface {
	// SearchVideoIDs runs search.list (type=video, order=viewCount) and
	// returns up to MaxResults video IDs in result order.
	SearchVideoIDs(ctx context.Context, query string) ([]string, error)
	// GetVideos runs videos.list for the given IDs.
	GetVideos(ctx context.Context, ids []string) ([]Video, error)
}

// UpstreamError is a sanitized error from the API. It never contains the API
// key or the raw upstream response body.
type UpstreamError struct {
	Status int    // HTTP status, 0 for transport errors
	Reason string // e.g. "quotaExceeded"; empty when unknown
	// Timeout is true for a transport error caused by a timeout of the HTTP
	// client (not by the caller's context).
	Timeout bool
}

func (e *UpstreamError) Error() string {
	if e.Status == 0 {
		return "youtube: request failed"
	}
	if e.Reason != "" {
		return fmt.Sprintf("youtube: upstream status %d (%s)", e.Status, e.Reason)
	}
	return fmt.Sprintf("youtube: upstream status %d", e.Status)
}

// HTTPClient is the real implementation.
type HTTPClient struct {
	apiKey  string
	baseURL string
	http    *http.Client
}

// NewHTTPClient creates a client. baseURL is normally
// "https://www.googleapis.com/youtube/v3"; tests pass a local server URL.
func NewHTTPClient(apiKey, baseURL string, hc *http.Client) *HTTPClient {
	if hc == nil {
		hc = &http.Client{Timeout: defaultHTTPTimeout}
	}
	return &HTTPClient{apiKey: apiKey, baseURL: strings.TrimRight(baseURL, "/"), http: hc}
}

// DefaultHTTPTimeout is the timeout of the client used when none is given.
const DefaultHTTPTimeout = 10 * time.Second

// defaultHTTPTimeout is the value NewHTTPClient uses for a nil client. It is a
// variable only so that tests can shorten it; production code never changes it.
var defaultHTTPTimeout = DefaultHTTPTimeout

// DefaultBaseURL is the production endpoint.
const DefaultBaseURL = "https://www.googleapis.com/youtube/v3"

func (c *HTTPClient) get(ctx context.Context, path string, params url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path+"?"+params.Encode(), nil)
	if err != nil {
		return &UpstreamError{}
	}
	// The key is sent as a header so it never appears in URLs or url.Error.
	req.Header.Set("x-goog-api-key", c.apiKey)
	resp, err := c.http.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		var ne net.Error
		return &UpstreamError{Timeout: errors.As(err, &ne) && ne.Timeout()}
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return &UpstreamError{Status: resp.StatusCode}
	}
	if resp.StatusCode != http.StatusOK {
		var e struct {
			Error struct {
				Errors []struct {
					Reason string `json:"reason"`
				} `json:"errors"`
			} `json:"error"`
		}
		ue := &UpstreamError{Status: resp.StatusCode}
		if json.Unmarshal(body, &e) == nil && len(e.Error.Errors) > 0 {
			ue.Reason = sanitizeReason(e.Error.Errors[0].Reason)
		}
		return ue
	}
	if err := json.Unmarshal(body, out); err != nil {
		return &UpstreamError{Status: resp.StatusCode, Reason: "invalidResponse"}
	}
	return nil
}

// sanitizeReason keeps only short alphanumeric reasons such as "quotaExceeded".
func sanitizeReason(s string) string {
	if len(s) > 40 {
		return ""
	}
	for _, r := range s {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9') {
			return ""
		}
	}
	return s
}

// SearchVideoIDs implements Client.
func (c *HTTPClient) SearchVideoIDs(ctx context.Context, query string) ([]string, error) {
	p := url.Values{}
	p.Set("part", "snippet")
	p.Set("type", "video")
	p.Set("order", "viewCount")
	p.Set("maxResults", strconv.Itoa(MaxResults))
	p.Set("q", query)
	var res struct {
		Items []struct {
			ID struct {
				VideoID string `json:"videoId"`
			} `json:"id"`
		} `json:"items"`
	}
	if err := c.get(ctx, "/search", p, &res); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(res.Items))
	for _, it := range res.Items {
		if it.ID.VideoID != "" {
			ids = append(ids, it.ID.VideoID)
		}
	}
	return ids, nil
}

// GetVideos implements Client.
func (c *HTTPClient) GetVideos(ctx context.Context, ids []string) ([]Video, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	p := url.Values{}
	p.Set("part", "snippet,statistics")
	p.Set("id", strings.Join(ids, ","))
	var res struct {
		Items []struct {
			ID      string `json:"id"`
			Snippet struct {
				Title string `json:"title"`
			} `json:"snippet"`
			Statistics struct {
				ViewCount *string `json:"viewCount"`
			} `json:"statistics"`
		} `json:"items"`
	}
	if err := c.get(ctx, "/videos", p, &res); err != nil {
		return nil, err
	}
	out := make([]Video, 0, len(res.Items))
	for _, it := range res.Items {
		v := Video{ID: it.ID, Title: it.Snippet.Title}
		if it.Statistics.ViewCount != nil {
			if n, err := strconv.ParseUint(*it.Statistics.ViewCount, 10, 64); err == nil {
				v.ViewCount = &n
			}
		}
		out = append(out, v)
	}
	return out, nil
}

// quotaReasons are the 403 reasons meaning the API quota is used up, per the
// YouTube Data API error documentation: only quotaExceeded ("exceeded your
// quota"), per the acceptance criteria. Every other 403 (dailyLimitExceeded,
// rateLimitExceeded, userRateLimitExceeded, forbidden, ...) is a plain
// upstream error.
var quotaReasons = map[string]bool{"quotaExceeded": true}

// IsQuotaExceeded reports whether err is an upstream 403 saying the quota is
// exhausted.
func IsQuotaExceeded(err error) bool {
	var ue *UpstreamError
	return errors.As(err, &ue) && ue.Status == http.StatusForbidden && quotaReasons[ue.Reason]
}

// IsTimeout reports whether err is a transport timeout of the HTTP client.
func IsTimeout(err error) bool {
	var ue *UpstreamError
	return errors.As(err, &ue) && ue.Timeout
}

// IsUpstream reports whether err is an UpstreamError.
func IsUpstream(err error) bool {
	var ue *UpstreamError
	return errors.As(err, &ue)
}
