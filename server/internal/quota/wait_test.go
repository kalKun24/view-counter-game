package quota

import (
	"context"
	"errors"
	"testing"
	"time"
)

func waitOf(t *testing.T, err error, kind error) time.Duration {
	t.Helper()
	if !errors.Is(err, kind) {
		t.Fatalf("err = %v, want %v", err, kind)
	}
	var we *WaitError
	if !errors.As(err, &we) {
		t.Fatalf("err %v carries no WaitError", err)
	}
	return we.Wait
}

// Criterion 1: the wait to the next Pacific midnight, also on the days the
// clocks change (23 and 25 hours long).
func TestLimitWaitIsUntilNextPacificMidnight(t *testing.T) {
	tests := []struct {
		name string
		now  time.Time
		want time.Duration
	}{
		{"ordinary day 05:00 PDT", time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC), 19 * time.Hour},
		{"fall back day, from 00:00 PDT (25h day)", time.Date(2026, 11, 1, 7, 0, 0, 0, time.UTC), 25 * time.Hour},
		{"fall back day, after the change (04:00 PST)", time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC), 20 * time.Hour},
		{"spring forward day, from 00:00 PST (23h day)", time.Date(2026, 3, 8, 8, 0, 0, 0, time.UTC), 23 * time.Hour},
		{"spring forward day, after the change (04:00 PDT)", time.Date(2026, 3, 8, 11, 0, 0, 0, time.UTC), 20 * time.Hour},
		{"just after midnight", time.Date(2026, 10, 31, 7, 0, 1, 0, time.UTC), 24*time.Hour - time.Second},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(t, 50, tt.now)
			got := waitOf(t, e.miss(), ErrLimitReached)
			if got != tt.want {
				t.Errorf("wait = %v, want %v", got, tt.want)
			}
		})
	}
}

// Criterion 4: fractions are rounded up and the value is at least 1.
func TestRetryAfterSeconds(t *testing.T) {
	tests := []struct {
		d    time.Duration
		want int
	}{
		{200 * time.Millisecond, 1},
		{time.Nanosecond, 1},
		{0, 1},
		{-time.Second, 1},
		{time.Second, 1},
		{time.Second + time.Nanosecond, 2},
		{1500 * time.Millisecond, 2},
		{time.Hour, 3600},
		{25 * time.Hour, 90000},
	}
	for _, tt := range tests {
		if got := RetryAfterSeconds(tt.d); got != tt.want {
			t.Errorf("RetryAfterSeconds(%v) = %d, want %d", tt.d, got, tt.want)
		}
	}
}

// Criterion 1 + 4: 0.2 s before midnight gives a wait that rounds up to 1.
func TestLimitWaitFractionRoundsUp(t *testing.T) {
	now := time.Date(2026, 11, 1, 6, 59, 59, 800_000_000, time.UTC) // 23:59:59.8 PDT
	e := newEnv(t, 50, now)
	got := waitOf(t, e.miss(), ErrLimitReached)
	if got != 200*time.Millisecond {
		t.Fatalf("wait = %v, want 200ms", got)
	}
	if s := RetryAfterSeconds(got); s != 1 {
		t.Errorf("seconds = %d, want 1", s)
	}
}

// Criterion 2: the suppressed wait is what is left of the hour; the trial in
// flight gives 60 seconds.
func TestSuppressedWait(t *testing.T) {
	e := newEnv(t, 10000, noon)
	e.up.searchErr = errQuota
	_ = e.miss()
	e.up.searchErr = nil

	if got := waitOf(t, e.miss(), ErrSuppressed); got != time.Hour {
		t.Errorf("right after the start: %v, want 1h", got)
	}
	e.clock.Add(30*time.Minute + 500*time.Millisecond)
	if got := waitOf(t, e.miss(), ErrSuppressed); got != 29*time.Minute+59*time.Second+500*time.Millisecond {
		t.Errorf("after 30m0.5s: %v", got)
	}

	e.clock.Add(30 * time.Minute) // past the hour: the next call is the trial
	e.up.block = make(chan struct{})
	e.up.searchEnter = make(chan struct{}, 10)
	done := make(chan error, 1)
	go func() { done <- e.miss() }()
	<-e.up.searchEnter
	_, err := e.c.SearchVideoIDs(context.Background(), "x")
	if got := waitOf(t, err, ErrSuppressed); got != 60*time.Second {
		t.Errorf("during the trial: %v, want 60s", got)
	}
	close(e.up.block)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

// Criterion 3: limit and suppression together give the limit's wait.
func TestLimitWinsOverSuppression(t *testing.T) {
	e := newEnv(t, 150, noon)
	e.up.searchErr = errQuota
	_ = e.miss() // 100 units used, suppressed for 1h
	e.up.searchErr = nil
	err := e.miss()
	got := waitOf(t, err, ErrLimitReached)
	if got != 19*time.Hour {
		t.Errorf("wait = %v, want 19h (the limit), not the 1h suppression", got)
	}
	if errors.Is(err, ErrSuppressed) {
		t.Error("overlap must report the limit, not the suppression")
	}
}

// Criterion 5: the error text is that of the refusal, with no figures.
func TestWaitErrorTextHasNoFigures(t *testing.T) {
	e := newEnv(t, 50, noon)
	err := e.miss()
	if err.Error() != ErrLimitReached.Error() {
		t.Errorf("error text = %q, want %q", err.Error(), ErrLimitReached.Error())
	}
}
