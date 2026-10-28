# Sprint 3 のリハーサル
- 日時：2026-10-28T19:37:50+09:00
- 回：1
- 実行したコマンド：`bash .scrum/demos/sprint-3/demo.sh /home/kal24hi/Projects/view-counter-game/.claude/worktrees/sprint-3 --rehearse`（コード：/home/kal24hi/Projects/view-counter-game/.claude/worktrees/sprint-3）

| # | 期待する結果 | 実際の出力（要点） | 判定 |
|---|---|---|---|
| 1 | `make test-race` で Docker 内の `go test -race` が動き、全パッケージが通る。 | `golang:1.26.9-bookworm` で `go test -race -count=1 ./...`。5パッケージすべて `ok`、終了コード 0。 | 一致 |
| 2 | `make vuln` で govulncheck の結果が出る。 | 検出2件。GO-2026-6809（`crypto/x509@go1.26.9`、`main.go:96` の `ListenAndServe` から）、GO-2026-5970（`golang.org/x/text@v0.38.0`、`words.go:14` の `words.Normalize` から）。終了コードは非0（検出ありのため）。修正は #21。 | 一致 |
| 3 | `videos.list` に併用できないパラメータを送っていないことが pass で示される。README に突合表がある。 | 3テスト（`TestVideosListSendsNoIncompatibleParams` ほか）が PASS。README の59行目「YouTube Data API との突合」の表を表示した。 | 一致 |
| 4 | panic してもプロセスが落ちず、待機者全員にエラーが返り、次の呼び出しで再読み込みする。ハンドラ経由で 500 と区別できるログが出る。 | cache の2テスト、api の1テストが PASS（デモのプロセスは最後まで動いた）。 | 一致 |
| 5 | `USE_MOCK=1 YOUTUBE_API_KEY=dummy` で起動に失敗し、両方の変数名が出て、キーの値は出ない。`USE_MOCK=1` だけなら起動する。 | 5a：終了コード 1、`USE_MOCK=1 and YOUTUBE_API_KEY are both set (unset one of them)`、`dummy-demo-key` は出ない。5b：`USE_MOCK=true` で終了コード 1、`USE_MOCK="true" is invalid`。5c：`youtube client: mock` が出て、`/api/views?q=foo` が HTTP 200。 | 一致 |

## 気づいた点（判定は変えない）
- 場面2は、検出があると `make` が非0で終わるので、出力の末尾に `make: *** [Makefile:16: vuln] Error 1` が出る。デモのスクリプトは、検出の ID が出ていれば想定どおりとして扱う。
- 実行後、`ss -ltnp` でデモ由来のプロセスが残っていないことを確かめた（残りは 9099、631、53、8080 の既存のものだけ）。

## 出力の全文
場面ごとの「確認 OK」がすべて OK で、最後は「デモ終了（確認 NG: 0）」だった。全文はセッションの実行ログにある。
