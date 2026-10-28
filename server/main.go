// Command server serves the view-counter-game API.
//
// Environment variables:
//
//	YOUTUBE_API_KEY  required; YouTube Data API v3 key
//	PORT             optional; listen port (default 8080)
package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/api"
	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	key := os.Getenv("YOUTUBE_API_KEY")
	if key == "" {
		log.Error("YOUTUBE_API_KEY is not set")
		os.Exit(1)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	client := youtube.NewHTTPClient(key, youtube.DefaultBaseURL, &http.Client{Timeout: 10 * time.Second})
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           api.NewHandler(client, log),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Info("listening", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Error("server stopped", "err", err.Error())
		os.Exit(1)
	}
}
