# Sprint 3
- phase: closed
- closed: 2026-10-28T20:19:48+09:00
- goal: PO が1コマンドで、競合検出（`-race`）と脆弱性の検査が動くこと、キャッシュの読み込みの panic や設定の矛盾でサーバが落ちず自分で止まること、`videos.list` に併用できないパラメータを送らないことを確かめられる。
- started: 2026-10-28T19:25:07+09:00
- base_branch: main

## 対象 PBI
| PBI | points | ui | 担当構成 | 状態 | 差し戻し | ブランチ | 作業ディレクトリ |
|---|---|---|---|---|---|---|---|
| #15 | 3 | no | golang-pro | accepted | 0 | scrum/15 | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-a07d6fbbdcbed3644 |
| #16 | 2 | no | golang-pro | accepted | 0 | scrum/16 | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-a92c4662cf8ecbbcd |
| #18 | 1 | no | golang-pro | accepted | 1 | scrum/18 | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-ad80f79ac6d00ff20 |
| #17 | 3 | no | golang-pro | accepted | 0 | scrum/17（分岐元 scrum/15） | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-ad114720f784bf6cd |

## デモ台本
| # | PO の操作 | 期待する結果 | PBI |
|---|---|---|---|
| 1 | `server/` で `make test-race` を実行する。 | Docker の中で `go test -race ./...` が動き、全パッケージが通る。 | #15 |
| 2 | `make vuln` を実行する。 | `govulncheck` の結果（No vulnerabilities found か、検出の一覧）が出る。 | #15 |
| 3 | 偽サーバのテストを実行する。 | `videos.list` に併用できないパラメータを送っていないことが、pass で示される。README に公式ドキュメントとの突合表がある。 | #16 |
| 4 | `go test ./internal/cache -run Panic -v` を実行する。 | プロセスが落ちず、待っている呼び出し全員にエラーが返る。同じキーの次の呼び出しで、もう一度読み込む。ハンドラ経由で、500 と区別できるログが出る。 | #17 |
| 5 | `USE_MOCK=1 YOUTUBE_API_KEY=dummy` でサーバを起動する。続けて `USE_MOCK=1` だけで起動する。 | 1つ目は起動に失敗し、両方の変数名を含むエラーが出る（`dummy` は出ない）。2つ目は起動する。 | #18 |

## 実行計画
- 4件ともサーバ側で UI を含まないため、design は起動しない。implement はすべて golang-pro とする。
- 1段目：#15・#16・#18 を並列に起動する（分岐元は `main`）。
- 2段目：#17 は、#15 の実装の完了後に `scrum/15` から分岐する。並行処理のコードを `make test-race` で確かめるためである。積み重ねの順序：`main` ← `scrum/15` ← `scrum/17`。#15 を却下すると、#17 もそのままではマージできない。
- 自動テストは本物の YouTube Data API を呼ばない。`make vuln` だけは、脆弱性データベースの取得にネットワークを使う。
- チーム合意 T1-1、T1-2、T2-2（依頼と報告の雛形）を使う。T2-1・T2-3 は、画面の数字と UI 仕様を変えないため対象外とする。
- 使用中のポート：8080（無関係なサービス）。依頼に書く。
- 飛ばした PBI：#7（3pt）と #10（2pt）は容量を超える。#11（1pt）は未マージの #10 に依存する。

## Agent 実行ログ
| PBI | Agent | 目的 | tokens | tool_uses | 所要時間 |
|---|---|---|---|---|---|
| #18 | golang-pro | implement | 26808 | 21 | 84s |
| #15 | golang-pro | implement | 30776 | 19 | 143s |
| #16 | golang-pro | implement | 37638 | 36 | 152s |
| #18 | code-reviewer | review | 21821 | 6 | 33s |
| #18 | security-auditor | review | 23970 | 12 | 61s |
| #18 | golang-pro | rework | 30765 | 4 | 22s |
| #15 | code-reviewer | review | 18307 | 6 | 73s |
| #15 | security-auditor | review | 18802 | 8 | 39s |
| #16 | code-reviewer | review | 21752 | 8 | 40s |
| #16 | security-auditor | review | 20924 | 6 | 45s |
| #18 | code-reviewer | review（再） | 17222 | 6 | 24s |
| #18 | security-auditor | review（再） | 17768 | 9 | 26s |
| #17 | golang-pro | implement | 34133 | 29 | 148s |
| #17 | code-reviewer | review | 22278 | 6 | 66s |
| #17 | security-auditor | review | 21822 | 7 | 38s |
| - | golang-pro | demo | 37200 | 14 | 64s |
| - | golang-pro | retro | 31425 | 4 | 38s |
| - | code-reviewer | retro | 22320 | 6 | 49s |
| - | security-auditor | retro | 19507 | 4 | 23s |

## 記録
### planning
- PO が計画を承認した。
- T2-2 に従い、Sprint 2 の #5 の security-review の should 2件（bidi 制御文字・ゼロ幅文字、サロゲートペアでの切り詰め）を PO に示した。PO は PBI にすることを承認し、#20「表示する文字列を安全にする」を `new` で登録した。
- DoD 変更案（`-race` と `govulncheck` の結果をレビューの報告に載せる）は、#15 の完了後のスプリント計画で採否を決める（Sprint 2 の決定のまま）。

### #18 implement（golang-pro）
- 結果：done。`scrum/18`（コミット abcff6c）。`USE_MOCK=1` かつ `YOUTUBE_API_KEY` が空でないとき、`newClient` がエラーを返し、起動に失敗する（エラー文にキーの値を含まない）。実際の `main()` を子プロセスで起動するテストを追加した。`go test ./...` ok。
- assumptions：空文字列のキーは未設定とみなす。`USE_MOCK` が `1` 以外の値はモック無効とする。
- T1-1：6項目すべてに回答あり（4・6 は対応、他は該当なし）。
- 後始末：残っているプロセス無し（`ss -ltnp` で確認）。
- unresolved：なし。`-race` はホストで実行不可。

### #15 implement（golang-pro）
- 結果：done。`scrum/15`（コミット 230ad5e）。`server/Makefile` に `make test-race`（`golang:1.26.9-bookworm` の Docker 内で `go test -race -count=1 ./...`、ソースは読み取り専用でマウント）と `make vuln`（`govulncheck@v1.9.0`）を追加した。README に手順を追加した。
- 実行結果：`make test-race` は5パッケージ ok。`make vuln` は検出2件で失敗（exit 3）。
  - GO-2026-6809：標準ライブラリ `crypto/x509`（go1.26.10 で修正）。`http.Server.ListenAndServe` から届く。
  - GO-2026-5970：`golang.org/x/text` v0.38.0（v0.39.0 で修正）。`words.Normalize` 経由で、外部入力の検索ワードから無限ループになりうる。
- 対応：検出の修正は #15 の受け入れ基準の外であるため、スクラムマスターが #21「検出した脆弱性を修正する（x/text と Go のツールチェーン）」を `new` で登録した。**スプリントレビューで PO に示す**（公開 M3 より前に必要）。
- T1-1：6項目とも該当なし。後始末：残っているプロセス無し（実行中のコンテナ3つは無関係）。

### #16 implement（golang-pro）
- 結果：done。`scrum/16`。videos.list から `maxResults` を外した。search.list の `part` を `id` から `snippet` に変えた（ドキュメントに従う。受け入れ基準に無い追加）。偽サーバ `strictAPI` と3テストを追加し、修正前のコードで2テストが 400 で失敗することを確かめた。README に公式ドキュメントとの突合表を追加した。
- T1-1：項目1は対応（突合表あり、2026-10-28 に取得）。他は該当なし。
- assumptions：`part=snippet` でもクォータは同じ。videos.list の `id` の件数上限はドキュメントに無い。
- unresolved：本物の API での確認は PO が1回行う。既存の `NewHTTPClient` が nil のとき `http.DefaultClient` を使う（T1-1 項目3に反する、範囲外）。
- 出来事：コミットの Co-Authored-By を `Claude Sonnet 5.5` にした（依頼と異なる）。
- 後始末：残っているプロセス無し。

### #18 review
- code-review（code-reviewer）：request-changes。must 1 / should 1。
  - [must] `USE_MOCK` が `0`・`1` 以外の値（`true` など）のとき、黙ってモック無効になる。T1-1 の項目4に反し、`USE_MOCK=true`＋キーでは本物の API を呼んでクォータを使う。
  - [should]（解消先：不要）`TestMainStartup` が成功経路を見ていない。
- security-review（security-auditor）：approve。must 0 / should 0。キーの値がエラー・ログに出ないことを確認した。
- 判定：差し戻し（1回目）。起動失敗にする方針で、同じ developer に SendMessage で送った。

### #17 implement
- `scrum/15` から `scrum/17` を分岐させて、golang-pro に依頼した。

### #18 rework（golang-pro）
- 結果：done。`USE_MOCK` が空・`0`・`1` 以外のとき起動失敗にした（エラー文に値を出し、キーの値は出さない）。`TestNewClient` にサブテスト5件、`TestNewClientInvalidMockNoKeyLeak` を追加した。README に1文追加した。`go test ./...` ok。
- should（`TestMainStartup` の成功経路）は見送った。
- T1-1：4・6 は対応、他は該当なし。後始末：残っているプロセス無し。

### 運用上の出来事（スクラムマスター）
- 記録の追記に `python3 -c "..."` を使い、二重引用符の中のバッククォートがシェルに展開された。`make test-race`・`make vuln`（リポジトリ直下で、ターゲットが無く失敗）、`go test -race`（cgo 無効で失敗）、`id` などが実行された。ファイルの変更や削除は無かった。記録の文字が欠けたので、ファイル経由で書き直した。以後、記録の追記はファイルか単一引用符のヒアドキュメントで行う。

### #16 review
- code-review（code-reviewer）：approve。must 0 / should 2。
  - search.list の `part=snippet` への変更は、公式仕様への是正として妥当（クォータは同じ、解析は `id.videoId` だけを読む）。
  - [should] `youtube.go:64-66` で nil のとき `http.DefaultClient`（タイムアウト無し）を使う。解消先：新規 → #22 を `new` で登録した。
  - [should] テストの偽サーバ `strictAPI.reqs` が、ハンドラとテストの goroutine から保護なしで読み書きされる。`-race` で警告の余地がある。解消先：統合ブランチで `make test-race` を実行して確かめる。
- security-review（security-auditor）：approve。must 0 / should 1（`http.DefaultClient` の既定、上と同じ。#22）。キーの扱いは変わらず、偽サーバもキーを記録しない。
  - checks：不可視文字の Grep は未実行と報告した。
- 判定：approved（差し戻し 0）。

### #15 review
- code-review（code-reviewer）：approve。must 0 / should 2。
  - `make test-race` を実行し、5パッケージ ok を確かめた。イメージに gcc があり cgo が有効で、`-race` は効いている。
  - [should] `make vuln` は検出があると exit 3 で、デモで失敗に見える。解消先：不要（デモで補足する）。
  - [should] README に govulncheck の上げ方と、検出時の扱いが無い。解消先：#21（コメントで記録）。
  - 所見：#21 が `new` の間は、govulncheck を DoD に入れると常に失敗する。DoD 変更案の採否で PO に示す。
- security-review（security-auditor）：approve。must 0 / should 3。
  - マウントは `server/` だけを読み取り専用で、環境変数は `CGO_ENABLED=1` だけを渡す。`YOUTUBE_API_KEY` はコンテナに渡らない。
  - 検出2件の評価：GO-2026-5970（x/text）は外部入力からの DoS で重大度が高い。GO-2026-6809 は Cloud Run が TLS を終端するため悪用の余地は小さいが、解消は必須。
  - [should] #13 の公開の前提に #21 が無く、#21 に節目が無い。解消先：新規（PO に示す）。
  - [should] イメージをダイジェストでも固定する。解消先：#21。
  - [should] README に、版を上げるときダイジェストも更新する手順を書く。解消先：#21。
- 判定：approved（差し戻し 0）。#21 に、解消先とされた should をコメントで記録した。

### スプリントレビューで PO に示す事項（ここまで）
1. #21（検出した脆弱性の修正）の優先度。#13（公開）の前提に #21 を加え、#21 を M3 に置くか。
2. #22（YouTube クライアントの既定のタイムアウト）を `new` で登録した。
3. #16 で、受け入れ基準に無い search.list の `part=snippet` への変更が入った。本物の API での確認（PO が1回）の際に、検索側も見る。
4. DoD 変更案（`-race` と `govulncheck` の結果をレビューの報告に載せる）の採否。#21 が済むまでは `make vuln` が常に失敗する。

### #18 再レビュー（差し戻し1回目の後）
- code-review（code-reviewer）：approve。must 0 / should 2（いずれも解消先：不要）。前回の must は解消された。
  - [should] `main.go:36` で `getenv("USE_MOCK")` を2回読んでいる。1回に統一すると読みやすい。
  - [should] `TestNewClient` の行名 "USE_MOCK other value" が実態とずれている。
- security-review（security-auditor）：approve。must 0 / should 0。`%q` と slog で値がエスケープされ、ログ注入の経路にならない。キーの漏洩の経路は増えていない。
- 判定：approved（差し戻し 1）。

### #17 implement（golang-pro）
- 結果：done。`scrum/17`（`scrum/15` の 230ad5e から分岐、コミット f9a5d60）。読み込み goroutine の panic を `safeLoad` で recover して `*PanicError`（Value、Stack）にし、待機者全員に返す。失敗はキャッシュしない。api は `PanicError` を 500 `internal_error` と専用ログ "cache load panicked" で返す（上流エラーの 502 と区別）。
- テスト3件追加。`make test-race` は全パッケージ ok。
- T1-1：2・5 は対応、他は該当なし。
- assumptions：panic 値をログにそのまま出す。`runtime.Goexit` と `panic(nil)` の個別対応はしていない。
- 後始末：残っているプロセス無し。

### #17 review
- code-review（code-reviewer）：approve。must 0 / should 2。`make test-race` を Docker で実行し、全パッケージ ok を確かめた。
  - [should] `cache.go:120-135`：`runtime.Goexit` で読み込み goroutine が終わると、`done` が閉じられず `inflight` が残る。そのキーは再起動まで毎回タイムアウトする（プロセスは落ちない。今の `load` から至る経路は無い）。解消先：新規 → #23。
  - [should] `api.go:122-129`：panic 値をログに出す点は、今は問題無い。解消先：不要。
- security-review（security-auditor）：approve。must 0 / should 2。レスポンスは固定文で、panic 値とスタックはログだけに出る。キーはヘッダにだけ置かれ、スタックにも載らない。
  - [should] 500 のレスポンスとログに panic 値・秘密が出ないことを、ハンドラ経由で確かめるテストが無い（T1-1 項目6）。解消先：新規 → #23。
  - [should] panic 値を無加工でログに出し、長さの上限も無い。解消先：新規 → #23。
- 判定：approved（差し戻し 0）。#23「キャッシュ読み込みの異常終了を堅牢にする（Goexit とログ）」を `new` で登録した。

### execution のまとめ
- 4件すべて approved。差し戻し 1（#18）、blocked 0。
- 指摘件数：must 1 / should 13。
  - must の内訳：#18 で1件（`USE_MOCK` の不正な値）。T1-1 の項目4に当たる。
  - should の内訳：#18 で3件（1回目1件、再レビュー2件）、#16 で3件、#15 で5件、#17 で4件。
- T1-1 に当たる観点の should は2件である。項目3（`http.DefaultClient` の既定、#16 の既存コード）と、項目6（#17 の漏れないことのテスト）である。T1-1 に当たる must は1件で、項目4（#18）である。
- T2-2 の効果：
  - T1-1 の回答は、全レビュー依頼に入れた。
  - 残ったプロセスは0件だった。
  - should には全件、解消先が書かれた。「新規」のものは #21・#22・#23 に登録した。
- 新しく登録した PBI：#21（脆弱性の修正）、#22（クライアントの既定のタイムアウト）、#23（キャッシュの異常終了）。
- 運用上の出来事：
  - スクラムマスターの記録の追記で、シェルがバッククォートを展開した（上記）。
  - #16 のコミットの Co-Authored-By が、`Claude Sonnet 5.5` になった。

### スプリントレビューで PO に示す事項（追加）
5. #23（キャッシュ読み込みの異常終了）を `new` で登録した。

### demo（1回目）
- 統合ブランチ：`scrum/sprint-3`（`main` に #15 → #17 → #16 → #18 の順で `--no-ff` マージ。競合なし）。統合後、`go test ./...` と `make test-race` が全パッケージ ok（#16 の `strictAPI` の競合の懸念も、`-race` で検出されなかった）。
- 作業ディレクトリ：/home/kal24hi/Projects/view-counter-game/.claude/worktrees/sprint-3
- デモの場所：/home/kal24hi/Projects/view-counter-game/.scrum/demos/sprint-3/（README.md、demo.sh、rehearsal.md）。golang-pro が作り、スクラムマスターが実行前に demo.sh を読んで確かめた。
- リハーサル：1回目で5場面すべて一致。場面2の `make vuln` は、#21 の検出2件が出る（想定どおり）。

### review
- PO がデモ1回目を受け入れた。PR #24 を `--merge` でマージした（マージコミット 49439e2）。#15〜#18 は `Closes` で閉じ、`status:sprint` を外した。
- main でのテスト：Go 5パッケージ 46件 pass、web 9ファイル 124件 pass（合計170件）。
- PO に示した事項（#21 の優先度と #13 の前提、#22・#23 の登録、#16 の `part=snippet`、DoD 変更案）は、PO から個別の返答が無かった。#21 の優先度と DoD 変更案は、次のスプリント計画で聞く。
- 後片付け：統合ブランチと #15〜#18 の worktree・ブランチ、`worktree-agent-*` のブランチを削除した。

## デモの判定
| 回 | 日時 | 判定 | PO の指摘 | 原因の PBI | 対応 |
|---|---|---|---|---|---|
| 1 | 2026-10-28T20:17:39+09:00 | 受け入れ | — | — | マージした |

## レトロスペクティブ
### 指標
| 計画pt | 実績pt | 受け入れ率 | デモ | 差し戻し | must | should | blocked | 却下 | 仮定の食い違い | Agent起動 | tokens | tokens/pt | tool_uses | 所要時間 | テスト数 | テスト増分 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 9 | 9 | 100%（4/4） | 受け入れ（1回目） 5/5 | 1 | 1 | 13 | 0 | 0 | 0 | 19 | 475238 | 52804 | 211 | 1168s | 170 | +9 |

前のスプリントから大きく変わった指標は、次のとおりである。
- デモ：1回目で受け入れた（Sprint 2 は2回目）。リハーサルは5場面すべて一致した。
- tokens：1,294,639 から 475,238 に減った（約37%）。tokens/pt も 129,464 から 52,804 に減った。UI の工程（設計・画面のデモ）が無く、デモの差し戻しも無かったためである。
- must：0 から 1 になった（#18、T1-1 の項目4）。
- 新規の PBI：レビューの should から3件（#21・#22・#23）が生まれた。

### 前回の Try の効果
| Try | 判定 | 根拠 | 対応 |
|---|---|---|---|
| T1-1 実装前チェックリスト | 効果あり | 6項目に当たる should は2件（基準は6件以下）。ただし項目4に当たる must が1件出た。 | 続ける。回答の書式は T3-1 で直す |
| T1-2 既知リスクの表と must の基準 | 効果あり | 表のリスクが個別の should になった件数は 0。(a)(b) が should のまま approve された件数も 0。 | 続ける。表に「PO の判断」の列を足す（T3-2） |
| T2-1 数字の表示規則 | 判定不能 | 画面の数字を変える PBI が無かった。 | 続ける |
| T2-2 依頼と報告の雛形 | 効果あり | T1-1 の回答が抜けた依頼は 0。残ったプロセスは 0。解消先の無い should のうち、PO に示されなかったものは 0。 | 続ける |
| T2-3 共通の UI 仕様を先に | 判定不能 | UI の PBI が無かった。 | 続ける |

### メンバーの KPT
#### golang-pro（implement）
- Keep：
  - 受け入れ基準の外の検出は実装に混ぜず、事実を報告して別 PBI に分ける（#15 → #21）。
  - 並行処理の PBI は、`make test-race` を持つブランチから積み重ねる（#17）。
  - 基準外の変更は、理由つきで報告する（#16 の `part=snippet`）。
- Problem：T1-1 の項目4に「対応」と答えたが、不正な値の扱いが抜けていた（#18 の must）。
  - 根本原因：複合した項目に一語で答える書式のため、回答の根拠が残らない。assumptions と回答の食い違いを、レビューの前に確かめる手順も無い。
- Try：項目4を 4a・4b に分ける。「対応」の回答に「値｜扱い｜テスト名」の表を付ける。

#### code-reviewer（code-review）
- Keep：
  - レビュアーが Docker で `make test-race` を自分で実行し、判定の根拠にする。
  - T2-2 の雛形で、判定が速く、根拠のある形になった（レビュー1回の tool_uses は6〜8）。
- Problem：
  - #18 の「対応」が、自己申告だけに依存していた。
  - 解消先「不要」の should に理由が無く、見送りが再レビューにつながらなかった。
  - 実害のある should（#21）が、PO の未回答のまま持ち越された。
- Try：「対応」に入力の一覧とテスト名を添える（plugin への提案）。「不要」に理由を書き、再レビューで前回の指摘の扱いを書く。実害のある指摘の判断を、計画の最初の議題にする。

#### security-auditor（security-review）
- Keep：
  - キー・ログ・panic の応答の経路を、毎回具体的に確かめる。
  - should に解消先を必ず付け、新規のものは PBI にしてから PO に示す。
- Problem：
  - 実在の脆弱性（#21）が、PO の返答の無いまま残り、公開（#13）の前提にも入っていない。根本原因は、「検出済みの脆弱性を残したまま公開しない」という条件が、M3・#13・DoD のどこにも無いことである。
  - 不可視文字の Grep を実行しないレビューがあった（#16）。陽性対照の手順も、まだ無い。
- Try：M3 の公開条件と #13 の前提に「`make vuln` の検出 0 件」を加える提案を、PO にする。Grep を全 PBI で必須にし、陽性対照を手順にする（plugin への提案）。

#### スクラムマスター
- Keep：
  - T2-2 の雛形を、ファイル（scratchpad の共通項目）にして全依頼で参照させた。依頼文が短くなり、抜けも0件だった。
  - 統合の前に、`make test-race` を統合ブランチで実行した。レビューで出た懸念（`strictAPI` の競合）を、実際に確かめられた。
  - デモのスクリプトを、実行前に読んで確かめた。
- Problem：
  - 記録の追記に `python3 -c "..."` を使い、バッククォートがシェルに展開されて、意図しないコマンドが実行された（無害だった）。根本原因は、記録の書き方の決まりが「Bash は1回に1コマンド」だけで、引用の扱いを決めていなかったことである。以後は、ファイルか単一引用符のヒアドキュメントで書いている（plugin への提案）。
  - スプリントレビューで、#21 の優先度などの判断点を示したが、PO の返答を取らずに受け入れの判断だけで進めた（T3-2）。

### 統合した KPT
#### Keep
- T1-2 と T2-2 の雛形を続ける。解消先の付いた指摘が全件追跡され、PO に示されなかった指摘は0件だったからである。
- 並行処理の PBI は、検証環境を持つブランチから積み重ね、レビュアーも `make test-race` を実行する。`-race` の結果で、判定と懸念の確認ができたからである。
- 受け入れ基準の外の検出や変更は、実装に混ぜず、事実と理由を報告して別 PBI にする。#15 は差し戻し0で承認され、検出は #21 で追跡できているからである。

#### Problem と根本原因
| Problem | 根本原因 | 対応 |
|---|---|---|
| #18 で、T1-1 の項目4に「対応」と答えたのに、不正な値の扱いが抜けていた（must 1、差し戻し 1） | T1-1 の回答が一語で、入力ごとの扱いとテストの根拠が残らない。複合した項目を片方だけで「対応」にできる。assumptions と回答の食い違いを、レビュー前に確かめる手順が無い | T3-1 |
| 実在の脆弱性（#21）の優先度が、PO の返答の無いまま残った。公開の前提にも入っていない | 実害のある指摘について、PO の判断を取るまで手順が終わらない、という規則が無い。公開の条件に、脆弱性 0 件が無い | T3-2 |
| 解消先「不要」の should の見送りが、再レビューにつながらなかった | 「不要」の理由を書く規則と、再レビューに前回の指摘を渡す規則が無い | T3-3 |
| 不可視文字の Grep を実行しないレビューがあった | Grep が必須でなく、陽性対照の手順も無い | 未対応（下記） |
| スクラムマスターの記録の追記で、シェルの展開が起きた | 記録の書き方の決まりに、引用の扱いが無い | 未対応（下記） |

#### Try
T3-1〜T3-3 の全文は `.scrum/agreements.md` に書いた。
- T3-1：T1-1 の「対応」には根拠の表を付ける（チーム合意）。
- T3-2：実害のある指摘は、次のスプリント計画で必ず PO の判断を取る（チーム合意）。
- T3-3：「不要」とした指摘には理由を書き、再レビューで前回の指摘の行方を書く（チーム合意）。

### 未対応の Problem
| 事象 | 根本原因 | 見送った理由 |
|---|---|---|
| 不可視文字の Grep を実行しないレビューがあった | Grep が必須でなく、陽性対照の手順も無い | Try は3件までとした。plugin への改善提案に再掲した。#20（表示する文字列の安全化）を扱うスプリントで、依頼の雛形に入れる |
| スクラムマスターの記録の追記で、シェルの展開が起きた | 記録の書き方に、引用の扱いの決まりが無い | スクラムマスターの手順を、その場で改めた（ファイル経由で書く）。plugin への改善提案に送った |
| #16 のコミットの Co-Authored-By が、依頼と異なった | 実行環境の指定と依頼の値の、どちらを優先するかが決まっていない | Agent の実行環境の指定が優先される。成果物への影響は無い |

### 反映したもの
- チーム合意：T3-1、T3-2、T3-3 を追記した。T1-1・T1-2・T2-1〜T2-3 は続ける。
- plugin への改善提案：`scrum-protocol` の報告書式、`security-reviewing`・`invisible-characters`（再掲）、`run-sprint` の記録の書き方、の3件を追記した。
- DoD 変更案：Sprint 1 からの案（`-race` と `govulncheck` の結果をレビューの報告に載せる）を、次の計画で PO に諮る。#21 が済むまでは `make vuln` が必ず失敗する点も示す（T3-2）。
- チーム編成の変更案：無し。
- 改善 PBI：今回の振り返りでは無し（execution で #21・#22・#23 を登録済み）。
- 容量：10 のまま変えない。計画の 9pt を全件受け入れ、tokens/pt も Sprint 1 に近い水準に戻った。
