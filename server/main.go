// Command server serves the view-counter-game API.
//
// Environment variables:
//
//	YOUTUBE_API_KEY  required unless USE_MOCK=1; YouTube Data API v3 key
//	USE_MOCK         optional; "1" uses a mock client (no API key, no real API calls)
//	PORT             optional; listen port (default 8080)
package main

import (
	"errors"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/api"
	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

// newClient chooses the YouTube client from the environment. USE_MOCK=1 takes
// precedence over YOUTUBE_API_KEY, which is then ignored.
func newClient(getenv func(string) string, log *slog.Logger) (youtube.Client, error) {
	if getenv("USE_MOCK") == "1" {
		log.Info("youtube client: mock")
		return youtube.NewMockClient(), nil
	}
	key := getenv("YOUTUBE_API_KEY")
	if key == "" {
		return nil, errors.New("YOUTUBE_API_KEY is not set (set USE_MOCK=1 to use the mock)")
	}
	return youtube.NewHTTPClient(key, youtube.DefaultBaseURL, &http.Client{Timeout: 10 * time.Second}), nil
}

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	client, err := newClient(os.Getenv, log)
	if err != nil {
		log.Error("cannot start", "err", err.Error())
		os.Exit(1)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
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
