# Sprint 1
- phase: review
- goal: PO が API キー無しでサーバーを起動し、検索ワードを送ると、タイトルにすべてのワードを含む動画の最大再生回数と動画タイトルが返ること、該当なしの場合とキャッシュの効き目を、curl で確かめられる。
- started: 2026-10-28T14:48:20+09:00
- base_branch: main

## 対象 PBI
| PBI | points | ui | 担当構成 | 状態 | 差し戻し | ブランチ | 作業ディレクトリ |
|---|---|---|---|---|---|---|---|
| #1 | 5 | no | golang-pro | approved | 0 | scrum/1 | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-aea5cb77838bac46b |
| #2 | 2 | no | golang-pro | approved | 0 | scrum/2 | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-aad09736523666a2c |
| #6 | 3 | no | golang-pro | approved | 0 | scrum/6 | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-aefac24eabe2aab27 |

## デモ台本
| # | PO の操作 | 期待する結果 | PBI |
|---|---|---|---|
| 1 | API キー無し、`USE_MOCK=1` も無しでサーバーを起動する。 | 起動に失敗する。 | #2 |
| 2 | `USE_MOCK=1` でサーバーを起動する。 | 起動ログに `youtube client: mock` が出る。 | #2 |
| 3 | `curl 'localhost:8080/api/views?q=猫 ピアノ'` を実行する。 | `found:true`、再生回数、動画タイトルが返る。 | #1 |
| 4 | 3 のワードを、全角スペースや大文字に変えて送る。 | 3 と同じ結果が返る。 | #1 |
| 5 | `q` を空にして送る。 | 400 と `invalid_query` が返る。 | #1 |
| 6 | `q=nomatch` を送る。 | `found:false` が返る。 | #1, #2 |
| 7 | `q=error` を送る。 | 5xx のエラー JSON が返り、API キーや上流の生の応答は含まれない。 | #1, #2 |
| 8 | 同じ `q` を2回送る。 | ログに1回目は `cache miss`、2回目は `cache hit` が出る。 | #6 |
| 9 | `CACHE_TTL=2s` で起動し、送ってから3秒後にもう一度送る。 | 再び `cache miss` になる。 | #6 |

## 実行計画
- UI を含む PBI は無いため、design 枠は起動しない。
- 依存の順は #1 → #2 → #6 とし、ブランチを積み重ねる。#2 は #1 の YouTube クライアントのインタフェースを使い、#6 は #1 の正規化関数と #2 のモックを使う。
- 積み重ねの順序：`main` ← `scrum/1` ← `scrum/2` ← `scrum/6`
- 積み重ねたブランチの前の PBI を却下すると、後ろの PBI もそのままではマージできない。
- 自動テストは本物の YouTube Data API を呼ばない。
- 飛ばした PBI：#3（#1・#2 と合わせて12pt になり capacity 超過）、#4・#5・#11（#3 に依存）、#7・#10・#12・#13（capacity に空きが無い）。

## Agent 実行ログ
| PBI | Agent | 目的 | tokens | tool_uses | 所要時間 |
|---|---|---|---|---|---|
| #1 | golang-pro | implement | 41973 | 33 | 144s |
| #1 | code-reviewer | review | 33717 | 9 | 31s |
| #1 | security-auditor | review | 27472 | 11 | 31s |
| #2 | golang-pro | implement | 32033 | 25 | 66s |
| #2 | code-reviewer | review | 20323 | 6 | 22s |
| #2 | security-auditor | review | 24518 | 6 | 21s |
| #6 | golang-pro | implement | 51900 | 45 | 151s |
| #6 | code-reviewer | review | 29765 | 9 | 40s |
| #6 | security-auditor | review | 34424 | 11 | 36s |
| - | golang-pro | demo | 30713 | 10 | 53s |

## 記録
### #1 implement（golang-pro）
- 結果：done。コミット 4981274。Go のコードは `server/` 配下。外部依存は `golang.org/x/text v0.38.0` のみ（go.mod は `go 1.25.0`）。
- assumptions
  - quotaExceeded は 502 と同じ扱い。`youtube.UpstreamError` に `Status` と `Reason` を持たせ、#10 で分岐できるようにした。
  - API キーはクエリではなく `x-goog-api-key` ヘッダで送る。上流エラーは本文や URL を保持しない形に作り替える。
  - 検索語は正規化済みワードを半角スペースでつないで渡す。
  - 同じ最大再生回数の動画が複数あれば、`videos.list` の応答順で最初のものを返す。
  - API キー未設定なら起動失敗（`USE_MOCK` は #2）。
  - リクエスト 15 秒、HTTP クライアント 10 秒のタイムアウトを置いた。
- unresolved
  - この環境は cgo 無効のため `-race` を実行できていない。
  - #2 で `main.go` に `youtube.Client` の差し替え分岐が要る。
  - #6 で `words.Key` / `words.NormalizedSet` をキャッシュキーに使う。

### #1 review
- code-review（code-reviewer）：approve。must 0 / should 4。
  - [should] `videos.list` に `id` と `maxResults` を同時に渡している。YouTube の仕様では併用できず、本物の API で拒否される恐れがある。自動テストでは検出できない。**リハーサルで本物の API を使う前に PO に示す。**
  - [should] `TestKeyNotInLogs` がハンドラのログ出力を通していない（テストの検証範囲）。
  - [should] `IsUpstream` が未使用。
  - [should] `ctx` のキャンセルやタイムアウトも「youtube request failed」の 502 になる（ログの区別）。
- security-review（security-auditor）：approve。must 0 / should 4。
  - [should] `q` の長さ・個数の上限と回数制限が無い（#6・#7 の範囲）。公開前に #6・#7 を完了させること。
  - [should] `http.Server` に `IdleTimeout`・`WriteTimeout`・`MaxHeaderBytes` が無い。
  - [should] `UpstreamError` 以外のエラーがログに生で出うる（現状は秘密情報なし）。
  - [should] `NewHTTPClient` の nil 時の既定がタイムアウト無しの `http.DefaultClient`。
  - 参考：`govulncheck` は環境に無く未実行。クォータ切れは #10 まで 502。
- 判定：approved（差し戻し 0）。

### #2 implement（golang-pro）
- 結果：done。分岐元 `scrum/1`。`server/internal/youtube/mock.go` を追加し、`main.go` の `newClient` で切り替える。
- assumptions
  - 「error：500」はモックの上流が `UpstreamError{500}` を返す意味に解釈した。サーバー応答は 502 `upstream_error`。quota も 502（503 化は #10）。
  - 「含む」は正規化後のワード単位の一致とした（`nomatchx` は通常扱い）。重なったときの優先順は error > quota > nomatch > slow。
  - `USE_MOCK` は値が正確に `1` のときだけ有効。キーと両方あればモック優先。
  - 起動ログは slog のテキスト形式で `msg="youtube client: mock"` と出る。
- unresolved：特になし（#1 が変われば取り込み直しが要る）。
- #6 は `scrum/2` から分岐して実装を開始した（#2 のレビューと並行）。

### #2 review
- code-review（code-reviewer）：approve。must 0 / should 2。
  - [should] `main_test.go` のログ行数の判定式が冗長。
  - [should] 「異なる q で再生回数が違う」の検証が FNV の衝突が無いことに頼っている。
- security-review（security-auditor）：approve。must 0 / should 2。
  - [should] `USE_MOCK=1` と `YOUTUBE_API_KEY` が両方あると、キーを黙って無視してモックで動く。本番の設定に `USE_MOCK=1` が残ると全員にモック値が返る。警告ログか起動失敗を推奨。**起動失敗にするなら、PBI の「モック優先」との整合を PO に確認する。**
  - [should] `slow` の連打で接続が滞留しうる（モックが本番で有効になる経路は無い。回数制限は #7 の範囲）。
- 判定：approved（差し戻し 0）。

### #6 implement（golang-pro）
- 結果：done。分岐元 `scrum/2`。`server/internal/cache/cache.go`（汎用 `Cache[V]`、自前 singleflight）を追加し、`api.NewHandler` に `WithCache` で配線。README に「キャッシュ」節と制約を追加。依存の追加なし。
- assumptions
  - `CACHE_TTL` は `time.ParseDuration` 形式。未設定・空は1時間。不正値・`0s`・負値・単位なしは起動失敗にした（品質優先）。
  - 同時リクエストの2件目以降も `cache miss` とログに出す（上流は1回）。
  - 古いものから破棄する基準は挿入順（FIFO）。
  - 期限切れのエントリは、次に同じキーが来るか上限で押し出されるまで残る。
  - 共有 load は呼び出し元のキャンセルから切り離し、15秒のタイムアウトで実行する。
- unresolved
  - `-race` 未実行（cgo 無効）。
  - クォータ切れの短時間ネガティブキャッシュは入れていない（M3 で検討の余地）。

### #6 review
- code-review（code-reviewer）：approve。must 0 / should 3。並行処理（データ競合、二重 load、待機者のリーク、デッドロック）は目読みで問題なし。
  - [should] `load` が panic すると `inflight` が残り `done` も閉じられず、別 goroutine なのでプロセスごと落ちる（現状の `MaxViews` に panic の経路は無い）。
  - [should] テスト用の `waiters` が、ctx で抜けた待機者を減らさない。
  - [should] 呼び出し元が ctx で抜けても `cache miss` と出て、上流の呼び出し回数と区別できない。
- security-review（security-auditor）：approve。must 0 / should 4。キャッシュポイズニング、エラーの非保存、ログ偽造、goroutine の滞留は問題なし。
  - [should] code-review と同じ panic の指摘（2人が独立に挙げた）。
  - [should] キャッシュの上限が件数だけでバイト数の上限が無く、長い q でメモリとログが増える（入力上限は #7 の範囲）。
  - [should] 失敗時も `cache miss` と出るため、クォータ監視の数と一致しない。
  - [should] 同一キーの待機者は先頭リクエストの生の q で検索した結果を共有する。上流に渡す q を正規化済みの key にそろえるとよい。
- 判定：approved（差し戻し 0）。

### execution のまとめ
- 3件すべて approved、差し戻し 0、blocked 0。
- 指摘件数：must 0 / should 19（#1：8、#2：4、#6：7）。
- 観点の傾向：ログの区別とエラーの扱い、タイムアウトの既定、入力上限（#7 の範囲）、テストの検証範囲。
- 環境の制約：cgo 無効のため `-race` と `govulncheck` を3件とも実行できていない。
- PO に示す事項
  1. `videos.list` に `id` と `maxResults` を同時に渡しており、本物の API で拒否される恐れがある（#1）。
  2. `USE_MOCK=1` と `YOUTUBE_API_KEY` が両方あると黙ってモックで動く（#2）。
  3. キャッシュの load の panic 対策が無い（#6、レビュアー2人が独立に指摘）。

### demo（1回目）
- 統合ブランチ：`scrum/sprint-1`（`main` に #1 → #2 → #6 の順で `--no-ff` マージ。競合なし。統合後の `go test ./...` は全 pass）
- 作業ディレクトリ：/home/kal24hi/Projects/view-counter-game/.claude/worktrees/sprint-1
- デモの場所：/home/kal24hi/Projects/view-counter-game/.scrum/demos/sprint-1/（README.md、demo.sh、rehearsal.md）
- リハーサル：1回目で全場面一致（9場面＋補足）。
