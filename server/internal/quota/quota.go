// Package quota limits how many YouTube Data API units this instance spends
// per day and stops calling upstream for a while after upstream says the
// quota is exhausted.
//
// The counters live in the memory of the process: with several instances the
// effective limit is multiplied by the instance count, and a restart resets
// them to zero.
package quota

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"
	_ "time/tzdata" // the Pacific time zone must be available without host tzdata

	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

// Unit costs of the upstream calls, per the YouTube Data API quota table.
const (
	SearchCost = 100 // search.list
	VideosCost = 1   // videos.list
)

// SuppressFor is how long upstream is left alone after a quotaExceeded answer.
const SuppressFor = time.Hour

// PacificZone is the zone whose midnight starts a new quota day.
const PacificZone = "America/Los_Angeles"

var (
	// ErrLimitReached means the own daily limit leaves no room for the call.
	ErrLimitReached = errors.New("quota: daily unit limit reached")
	// ErrSuppressed means upstream recently said quotaExceeded and is not
	// being called.
	ErrSuppressed = errors.New("quota: upstream calls suppressed after quotaExceeded")
)

// Guard counts units per Pacific-time day and tracks the suppression state.
type Guard struct {
	limit int
	loc   *time.Location
	now   func() time.Time
	log   *slog.Logger

	mu          sync.Mutex
	day         string
	used        int
	limitLogged bool
	suppressed  bool
	until       time.Time
	probing     bool
}

// New creates a Guard with a daily limit in units. now is the clock and loc
// the zone used to decide the day (use LoadPacific).
func New(limit int, loc *time.Location, now func() time.Time, log *slog.Logger) *Guard {
	return &Guard{limit: limit, loc: loc, now: now, log: log}
}

// LoadPacific loads the Pacific time zone.
func LoadPacific() (*time.Location, error) { return time.LoadLocation(PacificZone) }

// Used returns the units counted today.
func (g *Guard) Used() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.rollover(g.now())
	return g.used
}

// rollover resets the counter when the Pacific date changed. mu must be held.
func (g *Guard) rollover(now time.Time) {
	day := now.In(g.loc).Format(time.DateOnly)
	if day != g.day {
		g.day, g.used, g.limitLogged = day, 0, false
	}
}

// acquire reserves cost units (counted even if the call later fails). need is
// the headroom required: a search also needs room for the videos.list that
// follows, so that units are not spent on a search whose follow-up is refused.
// probe is true when this call is the single trial after the suppression time.
func (g *Guard) acquire(cost, need int) (probe bool, err error) {
	now := g.now()
	g.mu.Lock()
	g.rollover(now)
	if g.used+need > g.limit {
		first := !g.limitLogged
		g.limitLogged = true
		used, day := g.used, g.day
		g.mu.Unlock()
		if first {
			g.log.Warn("daily unit limit reached; upstream calls stopped until the next Pacific day",
				"used", used, "limit", g.limit, "day", day)
		}
		return false, ErrLimitReached
	}
	if g.suppressed {
		if now.Before(g.until) || g.probing {
			g.mu.Unlock()
			return false, ErrSuppressed
		}
		g.probing = true
		probe = true
	}
	g.used += cost
	g.mu.Unlock()
	return probe, nil
}

// finish records the outcome of a call that acquire let through.
func (g *Guard) finish(probe bool, err error) {
	isQuota := youtube.IsQuotaExceeded(err)
	now := g.now()
	g.mu.Lock()
	var msg string
	switch {
	case isQuota && !g.suppressed:
		g.suppressed, g.until = true, now.Add(SuppressFor)
		msg = "upstream calls suppressed after quotaExceeded"
	case isQuota && probe:
		g.until, g.probing = now.Add(SuppressFor), false
		msg = "upstream still reports quotaExceeded; suppression extended"
	case probe && err == nil:
		g.suppressed, g.probing = false, false
		msg = "upstream calls resumed"
	case probe:
		// Neither success nor quotaExceeded (timeout, cancel, other error):
		// free the slot so the next request tries again.
		g.probing = false
	}
	until := g.until
	g.mu.Unlock()
	switch msg {
	case "":
	case "upstream calls resumed":
		g.log.Info(msg)
	default:
		g.log.Warn(msg, "suppressedFor", SuppressFor.String(), "until", until.Format(time.RFC3339))
	}
}

// abort frees the probe slot when the call panicked.
func (g *Guard) abort(probe bool) {
	if !probe {
		return
	}
	g.mu.Lock()
	g.probing = false
	g.mu.Unlock()
}

// Client wraps a youtube.Client with a Guard.
type Client struct {
	inner youtube.Client
	g     *Guard
}

// Wrap returns inner guarded by g. Place it below the cache, so that cache
// hits are not counted.
func Wrap(inner youtube.Client, g *Guard) *Client { return &Client{inner: inner, g: g} }

// SearchVideoIDs implements youtube.Client.
func (c *Client) SearchVideoIDs(ctx context.Context, query string) (ids []string, err error) {
	probe, err := c.g.acquire(SearchCost, SearchCost+VideosCost)
	if err != nil {
		return nil, err
	}
	finished := false
	defer func() {
		if !finished {
			c.g.abort(probe)
		}
	}()
	ids, err = c.inner.SearchVideoIDs(ctx, query)
	finished = true
	c.g.finish(probe, err)
	return ids, err
}

// GetVideos implements youtube.Client.
func (c *Client) GetVideos(ctx context.Context, ids []string) (vs []youtube.Video, err error) {
	if len(ids) == 0 {
		// The real client makes no call for no IDs, so nothing is spent.
		return c.inner.GetVideos(ctx, ids)
	}
	probe, err := c.g.acquire(VideosCost, VideosCost)
	if err != nil {
		return nil, err
	}
	finished := false
	defer func() {
		if !finished {
			c.g.abort(probe)
		}
	}()
	vs, err = c.inner.GetVideos(ctx, ids)
	finished = true
	c.g.finish(probe, err)
	return vs, err
}
