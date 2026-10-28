// Package words provides normalization of search words and titles.
// The same functions are meant to be reused for cache keys.
package words

import (
	"sort"
	"strings"

	"golang.org/x/text/unicode/norm"
)

// Normalize applies NFKC normalization and lowercasing.
func Normalize(s string) string {
	return strings.ToLower(norm.NFKC.String(s))
}

// Split normalizes q and splits it on half-width and full-width spaces.
// Empty words are dropped, so a blank q yields an empty slice.
func Split(q string) []string {
	return strings.FieldsFunc(Normalize(q), func(r rune) bool {
		return r == ' ' || r == 0x3000
	})
}

// NormalizedSet returns the normalized words of q, sorted and deduplicated.
// Queries that differ only in word order, case, or width yield the same set.
func NormalizedSet(q string) []string {
	ws := Split(q)
	sort.Strings(ws)
	out := ws[:0]
	for i, w := range ws {
		if i == 0 || w != ws[i-1] {
			out = append(out, w)
		}
	}
	return out
}

// Key returns a canonical string for NormalizedSet, usable as a cache key.
func Key(q string) string {
	return strings.Join(NormalizedSet(q), " ")
}

// ContainsAll reports whether every word is a substring of the normalized title.
// words must already be normalized (see Split).
func ContainsAll(title string, words []string) bool {
	t := Normalize(title)
	for _, w := range words {
		if !strings.Contains(t, w) {
			return false
		}
	}
	return true
}
