// Package api implements the HTTP handlers.
package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

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

// NewHandler returns the router for the API.
func NewHandler(c youtube.Client, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/views", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		if len(words.Split(q)) == 0 {
			writeError(w, http.StatusBadRequest, "invalid_query", "q は必須です。検索ワードを指定してください。")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		res, err := MaxViews(ctx, c, q)
		if err != nil {
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
