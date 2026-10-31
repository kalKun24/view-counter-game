package main

import (
	"os"
	"regexp"
	"testing"
)

func readFile(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// 基準1：golang.org/x/text を v0.41.0 以降にする。
func TestXTextVersionIsAtLeast041(t *testing.T) {
	m := regexp.MustCompile(`golang\.org/x/text v0\.(\d+)\.(\d+)`).FindStringSubmatch(readFile(t, "go.mod"))
	if m == nil {
		t.Fatal("go.mod に golang.org/x/text の require が無い")
	}
	var minor int
	for _, c := range m[1] {
		minor = minor*10 + int(c-'0')
	}
	if minor < 41 {
		t.Errorf("x/text の版が v0.41.0 未満: v0.%s.%s", m[1], m[2])
	}
}

// 基準2：イメージをタグとダイジェストで固定し、タグの版を go.mod の toolchain 行と一致させる。
func TestMakefileImagePinnedAndMatchesToolchain(t *testing.T) {
	mk := regexp.MustCompile(`(?m)^GO_IMAGE := golang:(\d+\.\d+\.\d+)-bookworm@sha256:[0-9a-f]{64}$`).FindStringSubmatch(readFile(t, "Makefile"))
	if mk == nil {
		t.Fatal("Makefile の GO_IMAGE が golang:<版>-bookworm@sha256:<64桁> の形ではない")
	}
	tc := regexp.MustCompile(`(?m)^toolchain go(\d+\.\d+\.\d+)$`).FindStringSubmatch(readFile(t, "go.mod"))
	if tc == nil {
		t.Fatal("go.mod に toolchain 行が無い")
	}
	if mk[1] != tc[1] {
		t.Errorf("イメージの版 %s と toolchain の版 %s が一致しない", mk[1], tc[1])
	}
}
