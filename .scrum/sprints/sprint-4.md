# Sprint 4
- phase: retrospective
- goal: PO が、脆弱性の検出が0件になったこと、連打が 429 で止まること、クォータ切れで 503 と「今日は遊べない」の画面が出ること、YouTube の呼び出しが必ず打ち切られることを、本物の API を呼ばずに確かめられる。
- started: 2026-10-28T21:38:32+09:00
- base_branch: main

## 対象 PBI
| PBI | points | ui | 担当構成 | 状態 | 差し戻し | ブランチ | 作業ディレクトリ |
|---|---|---|---|---|---|---|---|
| #21 | 2 | no | golang-pro | accepted | 0 | scrum/21 | .claude/worktrees/agent-a77896d198c863cb5 |
| #7 | 3 | no | golang-pro | accepted | 0 | scrum/7 | .claude/worktrees/agent-afafbe5742da2f1f1 |
| #10 | 2 | no | golang-pro | accepted | 1 | scrum/10 | .claude/worktrees/agent-a238b19a7710ab7d1 |
| #11 | 1 | yes | ui-designer → react-specialist | accepted | 0 | scrum/11 | .claude/worktrees/agent-add14766c877d8a3e |
| #22 | 1 | no | golang-pro | accepted | 0 | scrum/22 | .claude/worktrees/agent-a2536131ea3eed748 |

## デモ台本
| # | PO の操作 | 期待する結果 | PBI |
|---|---|---|---|
| 1 | `make vuln` と `make test-race` を実行する | 検出0件で正常終了し、全パッケージが ok になる | #21 |
| 2 | モックで制限値3回にして起動し、`curl` を4回続ける | 4回目に 429 と `Retry-After` が返る。51文字のワードや6語の q は 400 になる。静的ファイルは制限されない | #7 |
| 3 | `q=quota` で `curl` を2回実行する | 2回とも 503 と `quota_exceeded` が返る（キャッシュされない） | #10 |
| 4 | カウントダウンの途中で `quota` を入れる | 「今日は遊べない」が出て、GAME OVER にならず、残りターンも変わらない。ホームへ戻れる | #11 |
| 5 | タイムアウトのテストを実行する | 応答しない偽サーバへの呼び出しが打ち切られ、PASS になる | #22 |

ポート 8080 は別のサービスが使っているため、使わない。

## 実行計画
- golang-pro が #21・#7・#10 を、`main` から並行して作る（同時の implement は3つまで）。#22 は空きが出たら `main` から着手する。
- #11 は、先に ui-designer が `.scrum/designs/11.md` を書く。そのあと react-specialist が `scrum/10` から積み重ねて作る（積み重ねの順序：#10 → #11）。#10 を却下すると、#11 もマージできない。
- #7 と #10 は、どちらも `server/internal/api/api.go` を触る見込みである。統合時の競合は golang-pro が解消する。
- 統合ブランチへの取り込みは #21 → #7 → #10 → #11 → #22 の順にする。

## Agent 実行ログ
| PBI | Agent | 目的 | tokens | tool_uses | 所要時間 |
|---|---|---|---|---|---|
| #21,#22,#23 | golang-pro | refinement | 33591 | 14 | 53s |
| #20 | react-specialist | refinement | 31181 | 9 | 45s |
| #11 | ui-designer | design | 76256 | 19 | 84s |
| #10 | golang-pro | implement | 49830 | 38 | 206s |
| #7 | golang-pro | implement | 60533 | 49 | 273s |
| #21 | golang-pro | implement | 24495 | 21 | 291s |
| #10 | security-auditor | review | 27913 | 10 | 116s |
| #10 | code-reviewer | review | 28522 | 10 | 129s |
| #7 | code-reviewer | review | 35595 | 9 | 218s |
| #7 | security-auditor | review | 41144 | 9 | 258s |
| #10 | golang-pro | rework | 54817 | 7 | 215s |
| #11 | security-auditor | review | 28196 | 9 | 116s |
| #11 | code-reviewer | review | 34902 | 12 | 133s |
| #10 | code-reviewer | review（再） | 32801 | 4 | 137s |
| #21 | code-reviewer | review | 23202 | 12 | 420s |
| #21 | security-auditor | review | 22579 | 10 | 421s |
| #22 | golang-pro | implement | 27978 | 28 | 458s |
| #22 | security-auditor | review | 21772 | 8 | 73s |
| #22 | code-reviewer | review | 24872 | 10 | 119s |
| - | golang-pro | demo | 67269 | 32 | 123s |
| - | golang-pro | demo（直し） | 68683 | 3 | 13s |
| #11 | react-specialist | implement | 61799 | 47 | 273s |

## 記録
### planning
- リファインメント：#20（3pt）、#21（2pt）、#22（1pt）、#23（3pt）を見積もった。受け入れ基準の不足は、推奨案のとおり PO が承認し、本文に追記した。分割は無し。
- T3-2 による PO の判断：
  - #21 を最優先にし、#13 の前提に加える（採用）。
  - M3 の公開条件に「`make vuln` の検出が 0 件」を加える（採用。`.scrum/inception-deck.md` に反映）。
  - DoD 変更案「`make test-race` と `make vuln` の結果をレビューの報告に載せる」（採用。`make vuln` は #21 のマージの後から適用する。`.scrum/config.md` に反映）。
- 優先度の並べ替え（PO 承認）：#21 → #7 → #10 → #11 → #22 → #23 → #20 → #12 → #13。
- 飛ばした PBI：#23・#20・#12・#13。容量（10）を超えるためである。

### execution
- #11 design（ui-designer）：`.scrum/designs/11.md`。T2-1 は該当なし（数字を増やさない）。依存元（3.md）との突合：済。
  - PO に示す事項：(1) クォータ切れの表示中も ScreenTop の「やめる」を残すか（ホームへ戻る操作が2つ見える）。(2) 文言「サーバーの1日の利用上限」「日をあらためて」でよいか。(3) ハイ＆ロー対戦で、クォータ切れのとき対戦全体を中断してホームへ戻す扱いでよいか。
- #10 implement（golang-pro）：7bd994d。503 `quota_exceeded`（`quotaExceeded`・`dailyLimitExceeded`）。T1-1 は 1・3・5・6 を表つきで「対応」。
  - assumptions：クォータ切れの reason は2つ。キャンセルは 499。`rateLimitExceeded` は 502。
  - unresolved：公式ドキュメントとの突合は知識に基づく。上流のタイムアウトを 502 から 504 `timeout` に変えた（基準の外）。
  - 基準の外の変更：`NewHTTPClient` の nil 時の既定を 10 秒のクライアントにした（#22 の基準 1 に当たる）。#22 は `scrum/10` から積み重ねて、残りの基準を扱う（積み重ねの順序：#10 → #22）。
- #11 implement（react-specialist）：`scrum/10` から `scrum/11` を作って着手した（積み重ねの順序：#10 → #11）。
- #7 implement（golang-pro）：d5f12ab。IP ごとの固定ウィンドウの回数制限（429 と `Retry-After`）、1語50文字・5語の上限。T1-1 は 4b・5 を表つきで「対応」。
  - assumptions：`TRUSTED_PROXY_HOPS`（既定 1）を追加した。記録の上限 100,000 件で fail closed。新しい環境変数は空を起動失敗にし、既存の `CACHE_TTL`（空は既定）と揃っていない。
  - unresolved：画面は 429 の表示を扱っていない。
- #21 implement（golang-pro）：2376efd。x/text v0.39.0、`toolchain go1.26.10`、イメージ `golang:1.26.10-bookworm`。`make vuln` は終了コード 0、`make test-race` は ok。T1-1 は全項目「該当なし」。
  - unresolved：module レベル（呼び出しなし）の GO-2026-6629（x/text/secure/precis、修正版 v0.41.0）が残る。
- #22 implement（golang-pro）：`scrum/10` から `scrum/22` を作って着手した（積み重ねの順序：#10 → #22）。
- #10 review：security-review approve（should 2）、code-review request-changes（must 1、should 3）。`make test-race` は両者とも ok。T3-1 の表の各テストは実在した。
  - must（T1-1 項目1・受け入れ基準2）：`dailyLimitExceeded` も 503 にしていた。基準は「`quotaExceeded` 以外の 403 は 502」。developer が assumptions で「4b の想定外の値に当たる扱い」と書いた判断が、基準の外に出ていた。
  - should：499 を契約表から外すか注記（解消先 #11）。nil 時の既定タイムアウトの混入（#22）。上流の reason をそのままログに出す（#23、既存）。クォータ切れの間も検索のたびに上流へ到達する（新規。サーキットブレーカーの検討。PO に示す）。
  - 差し戻し1回目を SendMessage で送った。積み重ねがあるため、rebase をせず、コミットを足させる。
- #7 code-review：approve（must 0、should 3）。`make test-race` ok。T3-1 の表の各テストは実在した。
  - should：`CACHE_TTL` の空の扱いが新しい変数と揃っていない（新規、小粒）。記録が満杯のときロック内で全走査する（不要：満杯の条件が厳しく、fail closed で安全側）。`api.go` の末尾が #10 と競合しやすい（不要：統合時に解く）。
  - レビュアーは PBI の本文を取得できず、コメントのデモ手順を基準にした。本文の受け入れ基準6項目（既定 1分20回、429 と `Retry-After`、XFF、1語50文字・5語、環境変数、README の制約）は、developer の報告と照らして、スクラムマスターがすべて対応を確かめた。依頼では、以後 `--json body,comments` で本文も読ませる。
- #7 security-review：approve（must 0、should 5、すべて解消先「新規」）。`make test-race` ok。XFF の右端判定は Cloud Run の前提で回避にならない。→ #7 を approved にした。
  - should：(1) 満杯時の全走査をロック内で毎回行う（CPU の DoS。IPv6 /48 で 65,536 キー）。(2) 上限を埋めると新しい正規利用者が窓の終わりまで 429（fail closed。気づける仕組みと、/64 の方針を PO と決める）。(3) 429 のたびに IP を Warn ログ（ログ課金と個人情報。窓ごとに間引く）。(4) 全体の上限が無い。1 IP・20回/分でも search.list（100 ユニット）で既定クォータ 10,000 に約5分で届く。ワードを変えればキャッシュを回避できる。夜も眠れない問題のクォータ切れを #7 だけでは防げない。(5) `TRUSTED_PROXY_HOPS` の既定 1 は Cloud Run 直結の構成でしか正しくない（`K_SERVICE` が無ければ警告、デプロイ手順で確認）。
  - code-review の「満杯時の全走査」（解消先：不要）と security-review の (1)（新規）が食い違う。セキュリティの観点を採り、新規として PO に示す。
- #10 rework（golang-pro）：`quotaReasons` を `quotaExceeded` のみにし、`dailyLimitExceeded` を 502 側のテストへ移した。499 は「クライアントに届かない」と契約表に注記した。他の should は解消先どおり見送り。`make test-race` ok。code-review に再レビューを依頼した（前回の指摘の一覧つき、T3-3）。
- #10 再レビュー（code-review）：approve（must 0、新規の should 0）。最新コミット 20c4f30。前回の指摘は、must 対応、499・504 対応、API 契約の文書 対応、#22 の混入 見送り（積み重ねで実害なし）、reason のログ 見送り（#23）、クォータ切れ中の上流到達 見送り（基準4どおり、新規）。security-review は初回で approve 済み。→ #10 を approved にした。
- #21 code-review：approve（must 0、should 3）。`make vuln` 終了コード 0、`make test-race` ok（golang:1.26.10-bookworm）。受け入れ基準7項目すべて充足。GO-2026-6629 は `x/text/secure/precis` を import していないため呼び出し経路が無く、v0.39.0 のままで妥当と判定。
  - should：README の版の上げ方に `toolchain` 行を揃える旨が無い（新規。#15 の README の should とまとめる）。x/text を v0.41.0 に上げて module レベルの検出を消す（新規）。Makefile のダイジェスト固定と README の更新手順（Sprint 3 の should、新規）。
- #21 security-review：approve（must 0、should 3）。`make vuln` 終了コード 0、`make test-race` ok を自分で確認した。→ #21 を approved にした。
  - should：GO-2026-6629（module レベル）は PO の判断に回す（T3-2）。推奨は v0.41.0 に上げること。上げるまで M3 の判定で module レベルの検出をどう扱うかを PO が明示する。Makefile のダイジェスト固定（新規）。govulncheck 自体の依存（不要：版の固定と sumdb で足りる）。
- #22 implement（golang-pro）：282b45c（`scrum/10` の 7bd994d から。差し戻し後の 20c4f30 より前に分岐）。`DefaultHTTPTimeout` を `main.go` でも使い、非公開変数 `defaultHTTPTimeout` を 50ms に差し替えて、応答しない偽サーバでの打ち切りをテストした。T1-1 は項目3を表つきで「対応」。`make vuln` は exit 3（#21 で解消済みの既知2件）。
  - developer も PBI の本文を読めず、依頼の説明から基準を読み取った（下の「依頼の不備」と同じ原因）。
- #22 security-review：approve（must 0、should 2）。本番の呼び出し経路はすべてタイムアウト付き。差し替え口は非公開変数で外部から変えられない。
  - should：`Timeout: 0` の非 nil クライアントはタイムアウト無しで通る（新規、低優先度）。`main.go` が同じクライアントを自前で作る（不要：動作は同じでリスクが無い）。
- #22 code-review：approve（must 0、should 0）。受け入れ基準5項目すべて充足。`t.Parallel` が無く、差し替えは競合しない。統合は `scrum/10` → `scrum/22` の順。→ #22 を approved にした。全 PBI が approved になった。
- 解消先「新規」の should から PBI を作った（T2-2、`status:new`）。スプリントレビューで PO に示す。
  - #25 連打の制限（429）の表示（画面）：#11 のレビュー。
  - #26 上流呼び出しの全体上限とクォータ切れ中の抑制：#7・#10 の security-review。
  - #27 回数制限の堅牢化（走査・ログ・プロキシの前提）：#7 の security-review。
  - #28 検証環境と依存の固定（x/text v0.41.0、ダイジェスト、手順）：#21 のレビュー。GO-2026-6629 は T3-2 により PO の判断に回す。
  - #29 設定の扱いとテストの確かさを揃える：#7・#11・#22 のレビュー。
### demo
- 統合ブランチ `scrum/sprint-4`（作業ディレクトリ `.claude/worktrees/sprint-4`）に #21 → #7 → #10 → #11 → #22 の順で取り込んだ。競合は無かった。
- 統合ブランチでのテスト：`make test-race` 5パッケージ ok、`make vuln` 終了コード 0（呼び出しのある検出 0、module レベル 1）、web は 10 ファイル 133 件 pass、`npm run build` 成功。
- デモの場所：`.scrum/demos/sprint-4/`（1回目）。`browser.mjs` はスクラムマスターがプラグインから写した。台本とスクリプトは golang-pro に依頼した。
- リハーサル：初回の実行で場面2が不一致（200・200・429・429）。原因はデモスクリプトの起動確認が `/api/` を叩き、制限の1回を使っていたこと。起動確認を `/` に向けて直し、2回目の実行で5場面すべて一致した（`rehearsal.md`）。画面3枚に崩れやエラーは無い。終了後に残ったプロセスは無い。
- 依頼の不備（スクラムマスター）：`gh issue view <番号> --comments` は本文を表示しない。#7 の code-review と #21 の security-review は PBI の本文を読まず、コメントのデモ手順で判定した。スクラムマスターが本文の受け入れ基準と報告を照合し、充足を確かめた（#21 は code-review が本文の7項目を判定済み）。共通項目を `--json body,comments` に直した。
- #11 implement（react-specialist）：`scrum/11`。503 + `quota_exceeded` だけを専用表示（QuotaNotice）。504 `timeout` は通信失敗（再試行あり）。T1-1 は 4b・5 を表つきで「対応」。UI 仕様の「PO に示す事項」は案のまま実装した。
  - コミットの Co-Authored-By は実行環境の指定（Sonnet 5.5）に従った（Sprint 3 の #16 と同じ事象）。
  - 最後の修正（未使用 import の削除）の後、`npm test` を再実行していない。レビュアーに実行させる。
- #11 security-review：approve（must 0、should 1）。`message` は表示もログもしない。`code` の厳密比較で、偽の応答で状態を壊せない。
  - `npm test` は 133 件中 132 pass、1 件（`quota.test.tsx` の「503 quota_exceeded：…」）が 5000ms のタイムアウトで fail。全体で 76 秒かかり、並行する Agent で高負荷だった可能性がある。code-review に引き継ぐ。`quota.test.tsx` は報告の 8 件ではなく 7 件だった。
  - should：quota の分岐の `console.warn`（解消先 #7 とされたが #7 は承認済み。悪用の経路は無いため、記録のみ）。
  - 既知の未対応：画面が 429（`too_many_requests`）を扱わない。#7 はサーバ側だけで、画面の PBI が無い。新規として PO に示す。
- #11 code-review：approve（must 0、should 3）。`npm test` は 133 件すべて pass（security-review での1件の fail は再現せず、高負荷によるタイムアウトと判断する）。`npm run build` 成功。受け入れ基準3項目、UI 仕様、T2-1（数字を増やさない）と一致。→ #11 を approved にした。
  - should：`.search-form` の流用（不要：仕様が新しい CSS を作らないと定め、コメントで意図を明示）。取得中に「やめる」のテストが `await Promise.resolve()` 1回の待機で、無意味に通る可能性がある（新規）。チャージの履歴の不変を行の内容まで見ていない（不要：合計と補足の不変は確かめている）。
### review
- PO がデモ全体を受け入れた。PR #30 を `main` にマージした（`Closes` で #21・#7・#10・#11・#22 を閉じ、`status:sprint` を外した）。
- マージ後の `main` でのテスト：`make test-race` 5パッケージ ok。`make vuln` 終了コード 0（呼び出しのある検出 0、module レベル 1）。`npm run build` 成功。
  - web の1回目は 133 件中 129 pass、4 件 fail。いずれも 5000ms のタイムアウトで、`npm ci` の直後だった（`quota.test.tsx` 1件、`App.test.tsx` 2件、`Versus.test.tsx` 1件。うち1件は前のテストの打ち切りに続く失敗）。
  - 同じコードで再実行し、10 ファイル 133 件すべて pass した（10.5 秒）。#11 の security-review と同じ、負荷でのタイムアウトと判断する。テストが負荷で揺らぐ事象として振り返りで扱う。
- PO に示した判断事項（#11 の UI 仕様の3点、GO-2026-6629、新しい PBI #25〜#29、504 の追加）は、受け入れとは別に次の計画で決める。
- 後片付け：PBI の worktree 5つと統合ブランチの worktree を削除し、`scrum/*` と `worktree-agent-*` のブランチを削除した。

## デモの判定
| 回 | 日時 | 判定 | PO の指摘 | 原因の PBI | 対応 |
|---|---|---|---|---|---|
| 1 | 2026-10-31T11:58:30+09:00 | 受け入れ | — | — | マージした |
