package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

// statusClientClosedRequest is the (nginx) status for a caller that gave up.
const statusClientClosedRequest = 499

// writeLookupError tells apart, in both the log and the status: quota
// exhaustion (503 quota_exceeded), timeouts (504 timeout), a canceled caller
// (499 canceled) and any other upstream failure (502 upstream_error).
// youtube errors are sanitized and never contain the API key.
func writeLookupError(w http.ResponseWriter, log *slog.Logger, err error) {
	switch {
	case youtube.IsQuotaExceeded(err):
		log.Error("youtube quota exceeded", "err", err.Error())
		writeError(w, http.StatusServiceUnavailable, "quota_exceeded", "YouTube API の利用上限に達しました。しばらくしてからもう一度お試しください。")
	case errors.Is(err, context.Canceled):
		log.Warn("request canceled by caller")
		writeError(w, statusClientClosedRequest, "canceled", "リクエストが取り消されました。")
	case errors.Is(err, context.DeadlineExceeded) || youtube.IsTimeout(err):
		log.Error("youtube request timed out", "err", err.Error())
		writeError(w, http.StatusGatewayTimeout, "timeout", "動画情報の取得がタイムアウトしました。")
	default:
		log.Error("youtube request failed", "err", err.Error())
		writeError(w, http.StatusBadGateway, "upstream_error", "動画情報の取得に失敗しました。")
	}
}
