package main

import (
	"bytes"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func lookup(m map[string]string) lookupFunc {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

func TestRateLimitConfigDefaults(t *testing.T) {
	cfg, err := rateLimitConfig(lookup(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Limit != 10 || cfg.Window != time.Minute || cfg.Hops != 1 {
		t.Errorf("cfg = %+v", cfg)
	}
}

func TestRateLimitConfigValid(t *testing.T) {
	cfg, err := rateLimitConfig(lookup(map[string]string{"RATE_LIMIT": "3", "RATE_LIMIT_WINDOW": "30s", "TRUSTED_PROXY_HOPS": "2"}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Limit != 3 || cfg.Window != 30*time.Second || cfg.Hops != 2 {
		t.Errorf("cfg = %+v", cfg)
	}
}

// The 4b table: every invalid value is a startup error naming the variable.
func TestRateLimitConfigInvalid(t *testing.T) {
	tests := []struct{ name, key, val string }{
		{"limit empty", "RATE_LIMIT", ""},
		{"limit zero", "RATE_LIMIT", "0"},
		{"limit negative", "RATE_LIMIT", "-1"},
		{"limit not a number", "RATE_LIMIT", "abc"},
		{"limit float", "RATE_LIMIT", "2.5"},
		{"limit with unit", "RATE_LIMIT", "20/m"},
		{"limit too large", "RATE_LIMIT", "100001"},
		{"limit overflow", "RATE_LIMIT", "99999999999999999999"},
		{"window empty", "RATE_LIMIT_WINDOW", ""},
		{"window no unit", "RATE_LIMIT_WINDOW", "60"},
		{"window zero", "RATE_LIMIT_WINDOW", "0s"},
		{"window negative", "RATE_LIMIT_WINDOW", "-1m"},
		{"window too short", "RATE_LIMIT_WINDOW", "500ms"},
		{"window too long", "RATE_LIMIT_WINDOW", "25h"},
		{"window garbage", "RATE_LIMIT_WINDOW", "abc"},
		{"hops empty", "TRUSTED_PROXY_HOPS", ""},
		{"hops zero", "TRUSTED_PROXY_HOPS", "0"},
		{"hops negative", "TRUSTED_PROXY_HOPS", "-1"},
		{"hops too large", "TRUSTED_PROXY_HOPS", "11"},
		{"hops not a number", "TRUSTED_PROXY_HOPS", "one"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := rateLimitConfig(lookup(map[string]string{tt.key: tt.val}))
			if err == nil {
				t.Fatal("want error")
			}
			if !strings.Contains(err.Error(), tt.key) {
				t.Errorf("error lacks variable name: %v", err)
			}
		})
	}
}

// TestMainInvalidRateLimitExits runs the real main() and checks that a bad
// RATE_LIMIT stops startup with exit 1 and names the variable.
func TestMainInvalidRateLimitExits(t *testing.T) {
	if os.Getenv("RUN_REAL_MAIN_RL") == "1" {
		main()
		return
	}
	cmd := exec.Command(os.Args[0], "-test.run=^TestMainInvalidRateLimitExits$")
	cmd.Env = append(os.Environ(), "RUN_REAL_MAIN_RL=1", "USE_MOCK=1", "YOUTUBE_API_KEY=", "PORT=0", "RATE_LIMIT=abc")
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	err := cmd.Run()
	ee, ok := err.(*exec.ExitError)
	if !ok || ee.ExitCode() != 1 {
		t.Fatalf("want exit 1, got %v\n%s", err, out.String())
	}
	if !strings.Contains(out.String(), "RATE_LIMIT") {
		t.Errorf("output lacks variable name: %s", out.String())
	}
}
