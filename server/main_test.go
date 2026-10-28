package main

import (
	"bytes"
	"log/slog"
	"os"
	"os/exec"
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
		{"mock with empty key", map[string]string{"USE_MOCK": "1", "YOUTUBE_API_KEY": ""}, true, false},
		{"mock and key conflict", map[string]string{"USE_MOCK": "1", "YOUTUBE_API_KEY": "k"}, false, true},
		{"key only", map[string]string{"YOUTUBE_API_KEY": "k"}, false, false},
		{"neither", map[string]string{}, false, true},
		{"USE_MOCK true with key", map[string]string{"USE_MOCK": "true", "YOUTUBE_API_KEY": "k"}, false, true},
		{"USE_MOCK true only", map[string]string{"USE_MOCK": "true"}, false, true},
		{"USE_MOCK yes with key", map[string]string{"USE_MOCK": "yes", "YOUTUBE_API_KEY": "k"}, false, true},
		{"USE_MOCK 0 with key", map[string]string{"USE_MOCK": "0", "YOUTUBE_API_KEY": "k"}, false, false},
		{"USE_MOCK empty with key", map[string]string{"USE_MOCK": "", "YOUTUBE_API_KEY": "k"}, false, false},
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

func TestNewClientConflictError(t *testing.T) {
	const secret = "dummy-secret-value"
	var buf bytes.Buffer
	_, err := newClient(env(map[string]string{"USE_MOCK": "1", "YOUTUBE_API_KEY": secret}), slog.New(slog.NewTextHandler(&buf, nil)))
	if err == nil {
		t.Fatal("want error")
	}
	for _, s := range []string{err.Error(), buf.String()} {
		if strings.Contains(s, secret) {
			t.Errorf("secret leaked: %q", s)
		}
	}
	for _, name := range []string{"USE_MOCK", "YOUTUBE_API_KEY"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("error lacks %s: %q", name, err)
		}
	}
}

// TestMainStartup runs the real main() in a subprocess and checks the exit
// status and the output that an operator would see.
func TestMainStartup(t *testing.T) {
	if os.Getenv("RUN_REAL_MAIN") == "1" {
		main()
		return
	}
	const secret = "dummy-secret-value"
	cmd := exec.Command(os.Args[0], "-test.run=^TestMainStartup$")
	cmd.Env = append(os.Environ(), "RUN_REAL_MAIN=1", "USE_MOCK=1", "YOUTUBE_API_KEY="+secret, "PORT=0")
	out, err := cmd.CombinedOutput()
	ee, ok := err.(*exec.ExitError)
	if !ok || ee.ExitCode() != 1 {
		t.Fatalf("want exit 1, got %v\n%s", err, out)
	}
	s := string(out)
	if strings.Contains(s, secret) {
		t.Errorf("secret leaked: %s", s)
	}
	if !strings.Contains(s, "USE_MOCK") || !strings.Contains(s, "YOUTUBE_API_KEY") {
		t.Errorf("output lacks variable names: %s", s)
	}
}

func TestNewClientInvalidMockNoKeyLeak(t *testing.T) {
	const secret = "dummy-secret-value"
	_, err := newClient(env(map[string]string{"USE_MOCK": "true", "YOUTUBE_API_KEY": secret}), slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
	if err == nil || !strings.Contains(err.Error(), "USE_MOCK") || !strings.Contains(err.Error(), "true") || strings.Contains(err.Error(), secret) {
		t.Fatalf("unexpected: %v", err)
	}
}
