// Command server serves the view-counter-game API.
//
// Environment variables:
//
//	YOUTUBE_API_KEY  required unless USE_MOCK=1; YouTube Data API v3 key
//	USE_MOCK         optional; "1" uses a mock client (no API key, no real API calls)
//	CACHE_TTL        optional; cache lifetime in time.ParseDuration format (default 1h)
//	PORT             optional; listen port (default 8080)
package main

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/api"
	"github.com/kalKun24/view-counter-game/server/internal/cache"
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

const (
	defaultCacheTTL = time.Hour
	cacheMaxEntries = 1000
)

// cacheTTL reads CACHE_TTL (time.ParseDuration format, e.g. "2s", "1h").
// Unset or empty means one hour. An unparsable or non-positive value is an
// error so that a typo does not silently disable or change the cache.
func cacheTTL(getenv func(string) string) (time.Duration, error) {
	s := getenv("CACHE_TTL")
	if s == "" {
		return defaultCacheTTL, nil
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return 0, fmt.Errorf("CACHE_TTL %q is invalid (use e.g. 2s, 30m, 1h): %w", s, err)
	}
	if d <= 0 {
		return 0, fmt.Errorf("CACHE_TTL %q must be greater than zero", s)
	}
	return d, nil
}

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	client, err := newClient(os.Getenv, log)
	if err != nil {
		log.Error("cannot start", "err", err.Error())
		os.Exit(1)
	}
	ttl, err := cacheTTL(os.Getenv)
	if err != nil {
		log.Error("cannot start", "err", err.Error())
		os.Exit(1)
	}
	log.Info("cache", "ttl", ttl.String(), "maxEntries", cacheMaxEntries)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           api.NewHandler(client, log, api.WithCache(cache.New[api.Result](ttl, cacheMaxEntries, time.Now))),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Info("listening", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Error("server stopped", "err", err.Error())
		os.Exit(1)
	}
}
