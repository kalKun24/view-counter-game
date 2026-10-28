package main

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/kalKun24/view-counter-game/server/internal/youtube"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestCacheTTL(t *testing.T) {
	tests := []struct {
		in      string
		want    time.Duration
		wantErr bool
	}{
		{"", time.Hour, false},
		{"2s", 2 * time.Second, false},
		{"1h", time.Hour, false},
		{"90m", 90 * time.Minute, false},
		{"abc", 0, true},
		{"10", 0, true},
		{"0s", 0, true},
		{"-5m", 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			got, err := cacheTTL(env(map[string]string{"CACHE_TTL": tt.in}))
			if (err != nil) != tt.wantErr || got != tt.want {
				t.Fatalf("got %v, %v", got, err)
			}
		})
	}
}

func TestNewClient(t *testing.T) {
	tests := []struct {
		name     string
		env      map[string]string
		wantMock bool
		wantErr  bool
	}{
		{"mock without key", map[string]string{"USE_MOCK": "1"}, true, false},
		{"mock wins over key", map[string]string{"USE_MOCK": "1", "YOUTUBE_API_KEY": "k"}, true, false},
		{"key only", map[string]string{"YOUTUBE_API_KEY": "k"}, false, false},
		{"neither", map[string]string{}, false, true},
		{"USE_MOCK other value", map[string]string{"USE_MOCK": "0"}, false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			c, err := newClient(env(tt.env), slog.New(slog.NewTextHandler(&buf, nil)))
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v", err)
			}
			if err != nil {
				return
			}
			_, isMock := c.(*youtube.MockClient)
			if isMock != tt.wantMock {
				t.Errorf("isMock = %v", isMock)
			}
			if got := strings.Count(buf.String(), "youtube client: mock"); (got == 1) != tt.wantMock || got > 1 {
				t.Errorf("log lines with marker = %d: %q", got, buf.String())
			}
		})
	}
}
