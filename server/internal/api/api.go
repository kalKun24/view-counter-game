// Package api implements the HTTP handlers.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/cache"
	"github.com/kalKun24/view-counter-game/server/internal/words"
	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

const requestTimeout = 15 * time.Second

// Result is the outcome of a lookup.
type Result struct {
	Found     bool
	ViewCount uint64
	Video     youtube.Video
}

// MaxViews finds, among the top results for the words in q, the video whose
// title contains every word and whose view count is the largest.
func MaxViews(ctx context.Context, c youtube.Client, q string) (Result, error) {
	ws := words.Split(q)
	ids, err := c.SearchVideoIDs(ctx, strings.Join(ws, " "))
	if err != nil {
		return Result{}, err
	}
	if len(ids) == 0 {
		return Result{}, nil
	}
	videos, err := c.GetVideos(ctx, ids)
	if err != nil {
		return Result{}, err
	}
	var best Result
	for _, v := range videos {
		if v.ViewCount == nil || !words.ContainsAll(v.Title, ws) {
			continue
		}
		if !best.Found || *v.ViewCount > best.ViewCount {
			best = Result{Found: true, ViewCount: *v.ViewCount, Video: v}
		}
	}
	return best, nil
}

type videoJSON struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type foundResponse struct {
	Found     bool       `json:"found"`
	ViewCount uint64     `json:"viewCount"`
	Video     *videoJSON `json:"video"`
}

type errorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// Option configures NewHandler.
type Option func(*handlerConfig)

type handlerConfig struct {
	cache   *cache.Cache[Result]
	limiter *RateLimiter
	hops    int
}

// WithRateLimit limits /api/ requests per client IP with l. trustedHops is
// the number of trusted proxies in front (see ClientIP).
func WithRateLimit(l *RateLimiter, trustedHops int) Option {
	return func(h *handlerConfig) { h.limiter, h.hops = l, trustedHops }
}

// WithCache makes the handler cache successful lookups (including "not
// found") keyed by words.Key. Upstream errors are never cached.
func WithCache(c *cache.Cache[Result]) Option {
	return func(h *handlerConfig) { h.cache = c }
}

// NewHandler returns the router for the API.
func NewHandler(c youtube.Client, log *slog.Logger, opts ...Option) http.Handler {
	var cfg handlerConfig
	for _, o := range opts {
		o(&cfg)
	}
	lookup := func(ctx context.Context, q string) (Result, error) {
		if cfg.cache == nil {
			return MaxViews(ctx, c, q)
		}
		key := words.Key(q)
		res, hit, err := cfg.cache.Do(ctx, key, func(ctx context.Context) (Result, error) {
			// The load is shared by every request waiting on this key, so it
			// gets its own timeout rather than one request's deadline.
			ctx, cancel := context.WithTimeout(ctx, requestTimeout)
			defer cancel()
			return MaxViews(ctx, c, q)
		})
		if hit {
			log.Info("cache hit", "key", key)
		} else {
			log.Info("cache miss", "key", key)
		}
		return res, err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/views", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		if msg := validateQuery(q); msg != "" {
			writeError(w, http.StatusBadRequest, "invalid_query", msg)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		res, err := lookup(ctx, q)
		if err != nil {
			var pe *cache.PanicError
			if errors.As(err, &pe) {
				// A bug in the load, not an upstream failure: log it distinctly
				// (with the stack) and answer 500 instead of 502.
				log.Error("cache load panicked", "panic", fmt.Sprint(pe.Value), "stack", string(pe.Stack))
				writeError(w, http.StatusInternalServerError, "internal_error", "サーバ内部でエラーが発生しました。")
				return
			}
			// youtube errors are sanitized and never contain the API key.
			log.Error("youtube request failed", "err", err.Error())
			writeError(w, http.StatusBadGateway, "upstream_error", "動画情報の取得に失敗しました。")
			return
		}
		if !res.Found {
			writeJSON(w, http.StatusOK, map[string]bool{"found": false})
			return
		}
		writeJSON(w, http.StatusOK, foundResponse{
			Found:     true,
			ViewCount: res.ViewCount,
			Video:     &videoJSON{ID: res.Video.ID, Title: res.Video.Title},
		})
	})
	if cfg.limiter != nil {
		return rateLimit(mux, cfg.limiter, cfg.hops, log)
	}
	return mux
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	var b errorBody
	b.Error.Code = code
	b.Error.Message = msg
	writeJSON(w, status, b)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
