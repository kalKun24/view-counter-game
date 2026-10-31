# 検証環境。ホストに cgo・gcc・govulncheck が無くても、Docker で同じ結果を得る。
# イメージと govulncheck のバージョンは固定する（latest を使わない）。
# イメージはタグとダイジェストの両方で固定する。タグの版は go.mod の toolchain 行と一致させる。
GO_IMAGE := golang:1.26.10-bookworm@sha256:386f0cbb8fb3402ff5a15048c96731e6ff37142d31182f3b72306359a1f5e9b7
GOVULNCHECK_VERSION := v1.9.0

DOCKER_RUN := docker run --rm -v "$(CURDIR)":/src:ro -w /src

.PHONY: test-race vuln

# 全パッケージを -race で実行する。-race には cgo と gcc が要るので、gcc を含むイメージで動かす。
test-race:
	$(DOCKER_RUN) -e CGO_ENABLED=1 $(GO_IMAGE) go test -race -count=1 ./...

# 既知の脆弱性を調べる。検出があれば非 0 で終了する。
vuln:
	$(DOCKER_RUN) $(GO_IMAGE) go run golang.org/x/vuln/cmd/govulncheck@$(GOVULNCHECK_VERSION) ./...
