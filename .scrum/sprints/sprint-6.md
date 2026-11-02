# Sprint 6
- phase: retrospective
- goal: 本物の API を呼ばずに、PO が次の2点を確かめられる。上限に達したとき、画面とヘッダの両方で「あと何時間で遊べるか」が分かる。キャッシュの期限が既定で6時間になり、24時間を超える設定や空の設定では起動しない。
- started: 2026-11-02T15:12:46+09:00
- base_branch: main

## 対象 PBI
| PBI | points | ui | 担当構成 | 状態 | 差し戻し | ブランチ | 作業ディレクトリ |
|---|---|---|---|---|---|---|---|
| #32 | 5 | yes | ui-designer → golang-pro → react-specialist | accepted | 0 | scrum/32 | .claude/worktrees/agent-a2f8948c976a5cc16 |
| #36 | 2 | no | golang-pro | accepted | 0 | scrum/36 | .claude/worktrees/agent-aec044a23e65980f0 |
| #29 | 3 | no | golang-pro → react-specialist | accepted | 0 | scrum/29（scrum/36 から） | .claude/worktrees/agent-ac10522e97e65ff59 |

## デモ台本
| # | PO の操作 | 期待する結果 | PBI |
|---|---|---|---|
| 1 | 上限を 202 にしてモックで起動し、違うワードを3回 `curl -i` で送る | 3回目の 503 に `Retry-After` が付き、値が次の太平洋時間 0 時までの秒数になる | #32 |
| 2 | 上限を 1000 にして起動し直し、ワード `quota` を送った後、ブラウザで検索する | `Retry-After: 3600` が付く。画面に「いまは遊べません」と「あと約1時間で、もう一度遊べます。」が出る | #32 |
| 3 | `CACHE_TTL` を設定せずに起動する。続けて `CACHE_TTL=25h` で起動する | 既定の6時間で起動する。`25h` は起動に失敗し、エラーに上限と設定値が出る | #36 |
| 4 | `CACHE_TTL=` で起動する。置き換えたテストを20回実行する | 起動に失敗し、エラーに変数名が出る。テストは全件 pass し、壊すと fail する表を示す | #29 |

ポート 8080 は別のサービスが使っているため、使わない。

## 実行計画
- 最初に、ui-designer の #32 の UI 仕様と、golang-pro の #36 を並行で始める。
- #32 は、UI 仕様の後に golang-pro がサーバ側を作り、報告の API 契約（`Retry-After` の値）を添えて、react-specialist が同じ作業ディレクトリで画面側を続ける。
- #29 は `CACHE_TTL` の読み込みで #36 と同じ箇所を変えるため、`scrum/36` から分岐して積み重ねる（#36 → #29）。#36 を却下すると、#29 もそのままマージできない。#29 は golang-pro がサーバ側（基準1・2）を作り、react-specialist が同じ作業ディレクトリでテスト側（基準3〜6）を続ける。
- #32 と #29 はどちらも `web/src/quota.test.tsx` を変える。統合ブランチへの取り込みは #32 → #36 → #29 の順にし、競合は implement に解消させる。
- 依頼には、受け入れ基準を原文のまま、項目数とともに貼る（T4-1）。否定のテストは壊して fail することを確かめ、表で報告させる（T1-1 の項目7、T5-3）。
- 並行するレビューの前に、スクラムマスターが作業ディレクトリで `npm ci` を1回だけ実行する。レビュー枠は依存を入れない（T5-2）。

## Agent 実行ログ
| PBI | Agent | 目的 | tokens | tool_uses | 所要時間 |
|---|---|---|---|---|---|
| #32,#33,#35 | golang-pro | refinement | 不明 | 不明 | 不明 |
| #32 | react-specialist | refinement | 不明 | 不明 | 不明 |
| #32,#33,#35 | security-auditor | refinement | 不明 | 不明 | 不明 |
| #36 | golang-pro | refinement | 37086 | 2 | 15s |
| #32 | ui-designer | design | 62602 | 14 | 107s |
| #36 | golang-pro | implement | 34285 | 15 | 179s |
| #36 | code-reviewer | review | 24780 | 11 | 274s |
| #36 | security-auditor | review | 25245 | 9 | 287s |
| #32 | golang-pro | implement | 80637 | 56 | 489s |
| #29 | golang-pro | implement | 45761 | 33 | 458s |
| #32 | react-specialist | implement | 59635 | 17 | 381s |
| #32 | security-auditor | review | 31531 | 12 | 341s |
| #32 | code-reviewer | review | 51034 | 17 | 360s |
| #29 | react-specialist | implement | 44704 | 33 | 1119s |
| #29 | security-auditor | review | 34244 | 12 | 213s |
| #29 | code-reviewer | review | 42745 | 20 | 331s |
| #29 | react-specialist | rework（統合の競合） | 27047 | 17 | 208s |
| — | golang-pro | demo | 77958 | 24 | 212s |

## 記録
- 計画の承認：2026-11-02T15:12:46+09:00。PO の回答は「ok、推奨どおりで進めて」。
- 優先度：#32 p1、#36 p2、#29 p3、#31 p4、#27 p5、#33 p6。
- 飛ばした PBI：#31（#32 と合わせると容量を超える。タイムアウトは Sprint 4 の1回のみ）、#27（公開前は影響が無い）。
- リスクの表（T5-1）：人気のワードの取り直し→#36 で今回直す。キャッシュの追い出し→受け入れるリスク（#35 を閉じた）。予約の無駄→#33 を見送る（残余：1日の終盤に検索1件分）。回数制限の堅牢化→#27 を見送る（公開前）。実在の脆弱性→該当なし。「PO の判断」が空・未定の行は0件。
- リファインメントで PO が承認した事項：#29 を広げた（2→3pt）。#31 に `.gitignore` の基準を足した。連打の制限の画面は変えない。#29 の「未設定なら1時間」は #36 に合わせて「既定値（6時間）」に直した。
- DoD 変更案・チーム編成の変更案：無し。
- 実行ログの refinement の3行は、要約の前の記録で、値を取り出せなかったため `不明` とした。
- #32 design（ui-designer）：`.scrum/designs/32.md` を書いた。変換は切り上げ前の整数秒で判定する（3599 秒は「約60分」、3601 秒は「約2時間」）。「使える `Retry-After`」は既存の `parseRetryAfter` に揃え、HTTP 日付形式は使えない扱いにした。24 時間以上も「約N時間」で出す。PO に示す事項：(1) 3599 秒が「約60分」になる、(2) HTTP 日付形式を使えない扱いにした、(3) 24 時間以上を時間で出す。レビューで示す。
- #36 implement（golang-pro）：基準4件すべて対応。最終コミット 4c06f93。`make test-race` ok、`make vuln` は「No vulnerabilities found.」。項目7の表は2行（上限の判定を外す→3テスト fail、件数を50にする→1テスト fail）。assumptions：エラーの上限は `24h0m0s` の表記で出る（README は「24h」）。unresolved：実サーバでの起動は確かめていない（単体テストのみ）。作業中に未コミットの変更を一度戻し、やり直した。code-review と security-review を並行で起動した。
- #36 code-review：approve。must 0、should 2（`main.go:77-78` のコメントの折り返しと作業メモ→解消先：不要（#29 が書き直す）、基準4のテストが定数どうしの比較→解消先：不要（配線は1か所））。項目7の表は、壊し方が否定の対象に当たっていると確認した。`make test-race` ok、`make vuln` 0件。
- #36 security-review：approve。must 0、should 1（基準4のテストが定数どうしの比較→解消先：不要（基準4の文言どおり））。#35 の前提は、24時間超を起動失敗にしたことで崩れる経路が閉じていると確認した。新しいリスクは無い。`make test-race` ok、`make vuln` 0件。→ #36 を approved にした。
- #32 implement サーバ側（golang-pro）：第1〜5項を対応。最終コミット 6554ea8。`WaitError` で待ち時間を運び、ハンドラが `Retry-After` に変える。本文は不変、ヘッダは Content-Type と Retry-After のみ。夏時間の戻りの日は最大 90000 秒。項目7の表は4行。`make test-race` ok、`make vuln` 0件。assumptions：最初のクォータ切れは `quota.SuppressFor`（3600）を使う。待ちが0以下でも最小1に丸める。コミットの署名を Sonnet 5.5 にした（実行環境の指示。Sprint 3〜5 と同じ事象）。参考：既存の「daily unit limit reached」の初回ログは `used` と `limit` を出す（#26 の既存の挙動）。続けて react-specialist を同じ作業ディレクトリで起動した。
- #29 implement サーバ側（golang-pro）：第1・2項を対応。最終コミット 9ab89dd（scrum/36 の 4c06f93 を含む）。空の `CACHE_TTL` は os.LookupEnv で判定して起動失敗。#36 の表の「空 → 6h」の行は、起動失敗のテストに置き換えた。`NewHTTPClient` は Timeout 0 なら 10 秒の複製を使う。テストは内部関数で 50ms を注入する。項目7の表は3行。`make test-race` ok、`make vuln` 0件。unresolved は無し。続けて react-specialist を同じ作業ディレクトリで起動した。
- #32 implement 画面側（react-specialist）：第6〜10項を対応。最終コミット e87d8de。`npm test` 12ファイル 211件 pass、`npm run build` 成功。項目7の表は5行。unresolved：「取得中にやめる」のテストを `act` と 50ms の待ちに直したが、壊して fail させる方法が見つからず破壊確認ができていない（#29 の基準4・5と同じテストで、統合時に競合する）。実ブラウザでの目視は未実施。`npm ci` は implement が実行した（T5-2 のスクラムマスターの手順は、依存が用意済みと確かめて代えた）。code-review と security-review を並行で起動した。
- #32 security-review：approve。must 0、should 1（初回の「daily unit limit reached」ログが `used` と `limit` を出す→解消先：不要（#26 の既存の挙動で、第5項の範囲外））。第5項の評価：`Retry-After` から使用量・残り・上限値は逆算できない。分かるのは「自前の上限か、上流の停止か」の種類だけである。残余リスク：上限の残りが1時間以下の時間帯は種類も区別できない。区別できても量は得られず、影響は無視できる（PBI の案は無し）。`make test-race` ok、`make vuln` 0件、`npm test` 211件 pass、`npm run build` 成功。
- #32 code-review：approve。must 0、should 2（「取得中にやめる」のテストは破壊確認ができず、50ms の待ちを足しても確かめる内容が増えない→解消先：#29、`quota.test.tsx` の統合時の競合→解消先：#29）。項目7の表（サーバ側4行、画面側5行）は、壊し方が否定の対象に当たっていると確認した。→ #32 を approved にした。統合時は、「取得中にやめる」のテストを #29 の版（共通の待ちの関数、破壊確認つき）にそろえる。
- #29 implement テスト側（react-specialist）：第3〜6項を対応。最終コミット fc04666。共通の待ちの関数 `settleAfter` を `web/src/test/settle.ts` に作り、4か所を置き換えた。quota と throttle の「やめる」のテストに `console.warn` が呼ばれないことの検証を足した（壊しても画面が変わらないため）。項目7の表は4行。第6項：1回目の20回で2回 fail（原因未特定、並行するコマンドと重なった）、2回目の20回は全 pass。担当は待ちのループ（`while pgrep -f "vitest run"`）を3つ残した。条件が自分自身に一致して終わらないため、スクラムマスターが担当のタスクを止めて片付けた（`kill` は自動判定で拒否された）。code-review と security-review を並行で起動した。
- #29 security-review：approve。must 0、should 2（1回目の20回の2回の fail→既知（#31）、`quota.test.tsx` の統合時の競合→解消先：不要（統合の作業））。`http.Client` の複製は Transport などを共有するが、新しいリソースは増えず、無応答の上流は10秒で打ち切られる。子プロセスのテストは `USE_MOCK=1` で API キーを空にし、ポートを開かない。新しいリスクは無い。`make test-race` ok、`make vuln` 0件、`npm test` 165件 pass、`npm run build` 成功。
- #29 code-review：approve。must 0、should 3（`settleAfter` の5回は経験的な値→解消先：不要（壊し方の確認が守る。理由を JSDoc に1行足すとよい）、1回目の20回の2回の fail→既知（#31）、`quota.test.tsx` の統合→新規（統合作業で #29 の版を採り、#32 の `act` と 50ms の待ちは重ねない））。項目7の web の4行は一時コピーで再現し、壊し方が否定の対象に当たると確認した。4ファイルを5回実行して全 pass。残余リスク：`settleAfter` は固定回数の待ちなので、応答の処理が深くなると否定のテストが空振りしうる。→ #29 を approved にした。全 PBI が approved になったので、phase を demo にした。
- デモの準備：統合ブランチ `scrum/sprint-6`（作業ディレクトリ `.claude/worktrees/sprint-6`）を `main` から作った。#32 → #36 は自動で取り込めた。#29 で `web/src/quota.test.tsx` が競合したため、react-specialist に解消させた（「取得中にやめる」は #29 の版を採り、#32 のその他の変更は残す）。
- 統合（react-specialist）：`quota.test.tsx` の競合を解消した（「取得中にやめる」は #29 の版、#32 の `act` と 50ms の待ちは外した）。マージコミット 9b1e88d。統合ブランチで `npm test` 12ファイル 211件 pass（#29 は `it` を増やしていないので、#32 の 211件と同じ）、`npm run build` 成功、`make test-race` ok、`make vuln` 0件。項目7：unmount 時の abort を外すと「取得中にやめる」が fail する。`ctrl.signal.aborted` の判定だけを外しても pass する（`cancelled` の判定で止まる二重の防御のため）。
- デモ：`.scrum/demos/sprint-6/`（README.md、demo.sh、scenes.json、browser.mjs）。1回目。統合ブランチ `scrum/sprint-6`、作業ディレクトリ `.claude/worktrees/sprint-6`。
- リハーサル（1回目）：4場面すべて一致、確認 NG 0件。場面1の `Retry-After` は `date` の値と差 0 秒。場面2の画面は「約1時間」（3600）と「約60分」（3500 台）の両方を確かめ、スクリーンショット2枚を目視した。場面4は20回とも 116 件 pass。台本との違い：場面2の画面は、`curl` に使ったサーバとは別の新しいサーバで確かめる（同じサーバでは最初から「約60分」になるため）。phase を review にした。
- レビュー：PO がデモを受け入れた。PR #37 でマージした（マージ後の main は 275f2cc）。#32、#36、#29 は PR の Closes で閉じた。
- マージ後の main のテスト：`make test-race` は6パッケージ ok（テスト関数 115、前回 94 から +21）。`make vuln` は「No vulnerabilities found.」のみ。web は `npm test` 12ファイル 211件 pass（前回 165 から +46）、`npm run build` 成功。
- 後片付け：PBI の作業ディレクトリ3つと統合の作業ディレクトリを消し、ブランチ7本（scrum/32・36・29・sprint-6 と worktree-agent-*）を消した。ロックは残っていなかった。
- PO に示した事項（UI 仕様の3点：3599秒が「約60分」、日付形式の `Retry-After` を使わない、24時間以上を時間で出す）について、PO は個別の変更を求めなかった。

## デモの判定
| 回 | 日時 | 判定 | PO の指摘 | 原因の PBI | 対応 |
|---|---|---|---|---|---|
| 1 | 2026-11-02T16:28:14+09:00 | 受け入れ | — | — | マージした |
