package main

const (
	defaultDailyUnitLimit = 8000
	maxDailyUnitLimit     = 10000 // the YouTube Data API default quota per day
)

// dailyUnitLimit reads DAILY_UNIT_LIMIT, the own daily limit of YouTube Data
// API units. Unset means 8,000. A set value that is empty, not an integer, less
// than 1 or above 10,000 is an error, so a typo never silently changes the limit.
func dailyUnitLimit(lookup lookupFunc) (int, error) {
	return envInt(lookup, "DAILY_UNIT_LIMIT", defaultDailyUnitLimit, 1, maxDailyUnitLimit)
}
