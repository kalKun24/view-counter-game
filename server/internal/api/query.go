package api

import (
	"strconv"
	"unicode/utf8"

	"github.com/kalKun24/view-counter-game/server/internal/words"
)

// Limits on a search query. Word length is counted in characters (runes)
// after normalization.
const (
	MaxWordLen = 50
	MaxWords   = 5
)

// validateQuery returns an error message for the client, or "" if q is valid.
func validateQuery(q string) string {
	ws := words.Split(q)
	if len(ws) == 0 {
		return "q は必須です。検索ワードを指定してください。"
	}
	if len(ws) > MaxWords {
		return "検索ワードは" + strconv.Itoa(MaxWords) + "語以内にしてください。"
	}
	for _, w := range ws {
		if utf8.RuneCountInString(w) > MaxWordLen {
			return "検索ワードは1語" + strconv.Itoa(MaxWordLen) + "文字以内にしてください。"
		}
	}
	return ""
}
