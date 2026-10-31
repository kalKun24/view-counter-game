package main

import (
	"bytes"
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestDailyUnitLimitDefault(t *testing.T) {
	n, err := dailyUnitLimit(lookup(nil))
	if err != nil || n != 8000 {
		t.Fatalf("n=%d err=%v", n, err)
	}
}

func TestDailyUnitLimitValid(t *testing.T) {
	for val, want := range map[string]int{"1": 1, "202": 202, "10000": 10000} {
		n, err := dailyUnitLimit(lookup(map[string]string{"DAILY_UNIT_LIMIT": val}))
		if err != nil || n != want {
			t.Errorf("%q: n=%d err=%v", val, n, err)
		}
	}
}

// Criterion 2: empty, invalid and above-10,000 values are startup errors.
func TestDailyUnitLimitInvalid(t *testing.T) {
	for _, val := range []string{"", "0", "-1", "abc", "2.5", "8000units", "10001", "99999999999999999999", " 100"} {
		t.Run(val, func(t *testing.T) {
			_, err := dailyUnitLimit(lookup(map[string]string{"DAILY_UNIT_LIMIT": val}))
			if err == nil {
				t.Fatal("want error")
			}
			if !strings.Contains(err.Error(), "DAILY_UNIT_LIMIT") {
				t.Errorf("error lacks variable name: %v", err)
			}
		})
	}
}

// The real main() must stop with exit 1 on a bad DAILY_UNIT_LIMIT.
func TestMainInvalidDailyUnitLimitExits(t *testing.T) {
	if os.Getenv("RUN_REAL_MAIN_DUL") == "1" {
		main()
		return
	}
	cmd := exec.Command(os.Args[0], "-test.run=^TestMainInvalidDailyUnitLimitExits$")
	cmd.Env = append(os.Environ(), "RUN_REAL_MAIN_DUL=1", "USE_MOCK=1", "YOUTUBE_API_KEY=", "PORT=0", "DAILY_UNIT_LIMIT=10001")
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	err := cmd.Run()
	ee, ok := err.(*exec.ExitError)
	if !ok || ee.ExitCode() != 1 {
		t.Fatalf("want exit 1, got %v\n%s", err, out.String())
	}
	if !strings.Contains(out.String(), "DAILY_UNIT_LIMIT") {
		t.Errorf("output lacks variable name: %s", out.String())
	}
}
