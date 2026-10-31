package main

import (
	"fmt"
	"strconv"
	"time"
)

// limitConfig is the rate-limit setting read from the environment.
type limitConfig struct {
	Limit  int
	Window time.Duration
	Hops   int
}

const (
	defaultRateLimit  = 10
	maxRateLimit      = 100000
	defaultRateWindow = time.Minute
	minRateWindow     = time.Second
	maxRateWindow     = 24 * time.Hour
	defaultHops       = 1
	maxHops           = 10
)

// lookupFunc is os.LookupEnv-shaped, so that "unset" and "set but empty" can
// be told apart: only unset means the default.
type lookupFunc func(string) (string, bool)

// rateLimitConfig reads RATE_LIMIT, RATE_LIMIT_WINDOW and TRUSTED_PROXY_HOPS.
// Unset means the default. A set value that is empty, unparsable or out of
// range is an error, so a typo never silently disables or changes the limit.
func rateLimitConfig(lookup lookupFunc) (limitConfig, error) {
	cfg := limitConfig{Limit: defaultRateLimit, Window: defaultRateWindow, Hops: defaultHops}
	var err error
	if cfg.Limit, err = envInt(lookup, "RATE_LIMIT", defaultRateLimit, 1, maxRateLimit); err != nil {
		return limitConfig{}, err
	}
	if cfg.Hops, err = envInt(lookup, "TRUSTED_PROXY_HOPS", defaultHops, 1, maxHops); err != nil {
		return limitConfig{}, err
	}
	if s, ok := lookup("RATE_LIMIT_WINDOW"); ok {
		d, perr := time.ParseDuration(s)
		if perr != nil {
			return limitConfig{}, fmt.Errorf("RATE_LIMIT_WINDOW %q is invalid (use e.g. 30s, 1m): %w", s, perr)
		}
		if d < minRateWindow || d > maxRateWindow {
			return limitConfig{}, fmt.Errorf("RATE_LIMIT_WINDOW %q must be between %s and %s", s, minRateWindow, maxRateWindow)
		}
		cfg.Window = d
	}
	return cfg, nil
}

func envInt(lookup lookupFunc, name string, def, lo, hi int) (int, error) {
	s, ok := lookup(name)
	if !ok {
		return def, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, fmt.Errorf("%s %q is not an integer (use a whole number from %d to %d)", name, s, lo, hi)
	}
	if n < lo || n > hi {
		return 0, fmt.Errorf("%s %q is out of range (use %d to %d)", name, s, lo, hi)
	}
	return n, nil
}
