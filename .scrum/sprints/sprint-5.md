# Sprint 5
- phase: review
- goal: 本物の API を呼ばずに、PO が次の3点を確かめられる。ワードを変えて連打しても1日の上限で上流の呼び出しが止まり、クォータが切れた後は上流を呼ばない。連打の制限に当たると「あと約N秒待って」の画面が出て、ゲームの状態は変わらない。`make vuln` の検出が、呼び出しの無いモジュールまで含めて0件になる。
- started: 2026-10-31T13:03:05+09:00
- base_branch: main

## 対象 PBI
| PBI | points | ui | 担当構成 | 状態 | 差し戻し | ブランチ | 作業ディレクトリ |
|---|---|---|---|---|---|---|---|
| #26 | 5 | no | golang-pro | approved | 0 | scrum/26 | .claude/worktrees/agent-afbd53001fefb6037 |
| #28 | 2 | no | golang-pro | approved | 0 | scrum/28 | .claude/worktrees/agent-ad7e5412cbface0d5 |
| #25 | 3 | yes | ui-designer → react-specialist | approved | 0 | scrum/25 | .claude/worktrees/agent-aca7d6bff5be4ca12 |

## デモ台本
| # | PO の操作 | 期待する結果 | PBI |
|---|---|---|---|
| 1 | 上限を外れ2回分に下げてモックで起動し、違うワードで `curl` を3回送る | 3回目に 503 `quota_exceeded` が返る。同じワードをもう一度送ると、キャッシュから 200 が返る | #26 |
| 2 | 上限を大きくして起動し直し、`quota` を送った後、続けて別のワードを送る（実装の報告を受けて、上限の 503 が先に返らないよう直した） | どちらも 503 が返る。後のほうは上流を呼ばない（抑制の開始がログに1回出る）。1時間の抑制と太平洋時間0時の切り替えは、テストの出力で見る | #26 |
| 3 | `make vuln` を実行する | 呼び出しの無いモジュールの注記まで含めて、検出0件で終わる | #28 |
| 4 | 制限を2回に下げて起動し、カウントダウンで3回続けて検索する | 「あと約N秒待って…」が出る。ターンと履歴は変わらず、入力したワードは残る。再試行ボタンは出ない | #25 |

ポート 8080 は別のサービスが使っているため、使わない。

## 実行計画
- golang-pro が #26 と #28 を、`main` から並行して作る。どちらも README を触る。統合時の競合は golang-pro が解消する。
- #25 は、先に ui-designer が `.scrum/designs/25.md` を書く。仕様には、待ち秒数の表示規則（T2-1）と、画面が受ける応答の一覧（応答コード｜画面の表示｜担当 PBI）を入れる。その後、react-specialist が `main` から作る。
- 依頼には、受け入れ基準を原文のまま、項目数とともに貼る（T4-1）。
- 統合ブランチへの取り込みは #28 → #26 → #25 の順にする。

## Agent 実行ログ
| PBI | Agent | 目的 | tokens | tool_uses | 所要時間 |
|---|---|---|---|---|---|
| #26,#27,#28,#29 | golang-pro | refinement | 30546 | 9 | 57s |
| #25,#31 | react-specialist | refinement | 52071 | 18 | 62s |
| #26,#27 | security-auditor | refinement | 47504 | 12 | 76s |
| #25 | ui-designer | design | 73978 | 22 | 125s |
| #28 | golang-pro | implement | 28682 | 30 | 216s |
| #25 | react-specialist | implement | 82553 | 30 | 186s |
| #25 | security-auditor | review | 29263 | 13 | 162s |
| #25 | code-reviewer | review | 44131 | 17 | 168s |
| #28 | code-reviewer | review | 23372 | 9 | 310s |
| #28 | security-auditor | review | 26810 | 12 | 324s |
| #26 | golang-pro | implement | 84439 | 61 | 739s |
| #26 | security-auditor | review | 41514 | 18 | 214s |
| #26 | code-reviewer | review | 36805 | 13 | 217s |
| - | golang-pro | demo | 65715 | 24 | 150s |

## 記録
### planning
- リファインメント：#25（3pt）、#26（5pt）、#27（3pt）、#28（2pt）、#29（2pt）、#31（5pt）を見積もった。受け入れ基準の不足と PO の判断の要る点は、推奨案のとおり PO が承認し、本文を更新した。分割は無し。
- T4-2 により、#26・#27 は security-review が量を計算した。search.list 100 + videos.list 1 で、1回の外れは 101 ユニットである。1 IP で約5分、複数 IP なら数秒〜1分で 10,000 ユニットに届く。
- PO の判断（リファインメント）：
  - #26：1日 8,000 ユニット（太平洋時間0時で切り替え）、クォータ切れの後は1時間止める（#10 の基準4を置き換える）、`RATE_LIMIT` の既定を1分10回にする、`max-instances=1`。受け入れるリスクは「約80回の外れで、その日の遊びを止められる」。
  - #27：fail closed と IPv6 /64 を維持する。`TRUSTED_PROXY_HOPS` を 0 にできない点は共有にとどめる。
  - #25：秒数を出し、カウントダウンはしない。決定ボタンは押せるまま。
  - #28：M3 の「検出0件」に、module レベルの検出も含める（`.scrum/inception-deck.md` に反映）。
  - #29：`Timeout: 0` は 10 秒を補う。
- T3-2 による PO の判断（計画）：#11 の UI 仕様の「PO に示す事項」3点は、案のまま承認した（#11 にコメント）。
- 優先度の並べ替え（PO 承認）：#26 → #28 → #25 → #31 → #27 → #29 → #23 → #20 → #12 → #13。
- 飛ばした PBI：#31・#27・#29・#23・#20・#12・#13。容量（10）を超えるためである。#31 が入らないため、#25 で増えるテストが負荷でタイムアウトしうる。起きたときは、レビュアーに再実行させ、記録する。
- 既知リスクの表（T1-2・T4-2）：

| リスク | 解消する PBI | 状態 | PO の判断 | 残余リスク |
|---|---|---|---|---|
| クォータを使い切られる | #26 | 今スプリント | 1日 8,000 ユニット、1時間の停止 | 約80回の外れで当日停止（受け入れ）。再起動・複数台でカウンタが戻る・増える（`max-instances=1` で抑える） |
| module レベルの脆弱性の検出（GO-2026-6629） | #28 | 今スプリント | M3 に含める | 無し |
| 画面が 429 を扱わない | #25 | 今スプリント | 秒数を出す | 無し |
| 回数制限の満杯時の走査・ログ量・プロキシの前提 | #27 | 未着手 | 優先度5 | `TRUSTED_PROXY_HOPS` を 0 にできない |
| 設定（`CACHE_TTL` の空、`Timeout: 0`）とテストの待ち方 | #29 | 未着手 | 優先度6 | — |
| web のテストの負荷でのタイムアウト | #31 | 未着手 | 優先度4 | — |
| キャッシュ読み込みの Goexit、panic の値のログ | #23 | 未着手 | 優先度9 | — |
| 表示する文字列の bidi 制御文字・サロゲートペア | #20 | 未着手 | 優先度10 | — |
| CSP などのセキュリティヘッダ、Google Fonts の外部読み込み | #12 | 未着手 | 優先度11 | — |
| キャッシュ（1,000 件の FIFO）を異なるワードで追い出され、外れが増える | 未定 | 未着手 | 未定（次の計画で示す） | — |

### execution
- #25 design（ui-designer）：`.scrum/designs/25.md`。検索フォームを残し、FetchStatus に状態 `throttled` を足す形にした。文言は `.msg` の通常色（赤にしない）。data-testid は `throttle-message`。T2-1 の表は待ち秒数の1行で、根拠は基準2。扱う応答の一覧を付けた。依存元（3.md・4.md・5.md・11.md）との突合：済。
  - assumptions：`Retry-After` は半角数字だけの1以上の整数に限る（第2項）。補足の1行（「ターンは減っていません」）は足さない（第1項）。
  - PO に示す事項：(1) #26 は、1日の上限到達と1時間の抑制のどちらも 503 `quota_exceeded` を返す。#11 の文言「日をあらためて」は、1時間で戻る抑制には合わず、遊び手が1日待ってしまうおそれがある。案は「変えない」、別案は「しばらく、または日をあらためて」。変えるなら `QuotaNotice.tsx` の1文とテスト。(2) 429 の表示に「ターンは減っていません。」を足すか。案は「足さない」（基準1が文言を定めている）。
- #28 implement（golang-pro）：ef27f01。x/text v0.41.0、Makefile のイメージをダイジェスト（386f0cbb...）で固定、README に「版を上げるとき」と「`make vuln` が検出を出したとき」を足した。基準の充足表 4行（N=4）。`make vuln` は `No vulnerabilities found.` のみ（module レベルの注記なし）、`make test-race` 5パッケージ ok。T1-1 はすべて該当なし。
  - assumptions：候補のダイジェスト 386f0cbb... を採用した。同じタグは今、別のダイジェスト 23ce7133...（同じ go1.26.10）に付け替えられている（第2項）。基準1・2のテストは go.mod と Makefile の文字列の検査にした。
  - unresolved：無し。
- #25 implement（react-specialist）：29ccf3d。`views.ts` に `throttled` と `parseRetryAfter`、`useViewsFetch` に `throttled`、`FetchStatus` に `throttle-message`。モードは無変更。基準の充足表 5行（N=5）。否定の確かめは `throttle-message` の出現を待ってから書いた。最終コミットで `npm test` 11 ファイル 165 件 pass（追加 31 件、タイムアウトなし）、`npm run build` 成功。T1-1 は 4b・5・6 を表つきで「対応」。
  - assumptions：`Retry-After` は半角数字のみ、`007` は 7（第2項）。消えないことのテストは実時間で 1.5 秒待つ。
  - unresolved：無し。
- #25 security-review：approve（must 0、should 1）。基準の表 5行（N=5）。`npm test` 165 件 pass（タイムアウトなし）、`npm run build` 成功、`npm audit` 0 件。`Retry-After` は `^[0-9]+$` と安全な整数で検証され、表示は React のテキストノード、ログは検証済みの数値だけ。偽の 429 は表示を出させるだけで、状態は壊れない。
  - should：`Retry-After` に上限が無く、`MAX_SAFE_INTEGER` 付近（約2.9億年）がそのまま出る。基準2と UI 仕様どおりで、悪用の経路は無い。解消先：新規（PO に基準2の上限を示す。案は「86400 秒を超えたら秒数なしの文言」）。
  - 残余リスク：サーバが異常に大きい `Retry-After` を返すと、その秒数が出る。
- #25 code-review：approve（must 0、should 2）。基準の表 5行（N=5）。`npm test` は `.bin` が作られず、`node node_modules/vitest/vitest.mjs run` で 165 件 pass（タイムアウトなし）。`tsc -b --noEmit` pass。`npm run build` は同じ理由で未実行（security-review が成功を確認済み）。UI 仕様・T2-1（新しい数字は待ち秒数だけ）と一致。否定のテストは、実装を壊すと fail することを4通り読んで確かめた。→ #25 を approved にした。
  - should：(1) 「取得中に『やめる』」のテストが `await Promise.resolve()` 1回の待ちで、キャンセル判定を壊しても pass する（Sprint 4 の #11 と同じ型）。解消先：新規。#29 の基準3（quota.test.tsx の同じ型）と同じ直し方で、#29 に足す案を PO に示す。(2) 実時間で 1.5 秒待つテストがある。解消先：既知（#31）。
  - 残余リスク：決定ボタンを押し続けられるので、429 を重ねて受ける（基準3の帰結。サーバの制限が抑える）。
- #28 code-review：approve（must 0、should 1）。基準の表 4行（N=4）。`make test-race` 5パッケージ ok、`make vuln` は `No vulnerabilities found.` のみ（module レベル 0 件）。README の手順のコマンドは、そのまま実行できる形である。
  - should：`pinning_test.go` の minor の数値化を `strconv.Atoi` にする。解消先：不要（動作に影響しない）。
- #28 security-review：approve（must 0、should 2）。基準の表 4行（N=4）。両 make を自分で実行して同じ結果。GO-2026-6629 は解消した。古いダイジェスト（386f0cbb...）と、タグが今指すもの（23ce7133...）は、Created と RootFS の7層がすべて同一で、ファイルシステムの中身は同じである（違うのは image index だけ）。→ #28 を approved にした。
  - should：(1) README に「ダイジェストはタグの現在値でなくてよい」の補足が無い。解消先：不要（運用の補足にとどまる）。(2) テストはダイジェストの形だけを見る。解消先：不要（手順5の `make` 実行が実在の確認を兼ねる）。
  - 残余リスク：イメージ内の OS パッケージは固定で更新されず、`make vuln` では見えない。検証用のコンテナで本番イメージではないが、公開用のイメージ（#12）で別に見る必要がある。
- #26 implement（golang-pro）：f0d533c。新しいパッケージ `internal/quota` の `Guard` で、キャッシュの下・上流（実クライアントとモック）の上に置いた。`DAILY_UNIT_LIMIT`（1〜10000、既定 8000）、`time/tzdata` を埋め込み、`RATE_LIMIT` の既定を 10。基準の充足表 8行（N=8）。`make test-race` 6パッケージ ok。T1-1 は 4b・5 を表つきで「対応」。
  - assumptions：検索は 101 の余裕があるときだけ通す（第3項）。失敗した試行が 403 quotaExceeded ならもう1時間延ばし、他のエラーなら次のリクエストが試す（第4項）。抑制は日付の切替では解除しない（第4項）。並行の検索は videos.list の分を予約しない（上限は超えない）。
  - unresolved：上限到達・抑制中の 503 に `Retry-After` を付けていない（基準の外）。
  - デモの注意：上限 202 のまま `quota` を送ると、上限の 503 が先に返り、抑制は始まらない。台本の場面2は、上限を大きくして再起動する。
  - コミットの Co-Authored-By は、実行環境の指示で Sonnet 5.5 になった（Sprint 4 の #11 と同じ事象）。
  - 報告の後に「自分のバックグラウンドの作業が残っている」と通知が来た。`ss -ltnp` は既存の 9099・631・53・8080 だけで、残った待ち受けは無い。
- #26 security-review：approve（must 0、should 0）。基準の表 8行（N=8）。`make test-race` 6パッケージ ok。上限を超える経路を確かめた：予約はミューテックスの中で呼び出しの前に加算する。エラー・キャンセルも数える。上流を呼ぶ箇所は `MaxViews` だけで、実クライアントもモックも包まれている。再試行は無く、試行は同時に1件である。README の gcloud の例は、API キーを Secret Manager から渡している。
  - 残余リスク：(1) 約80回の外れで当日停止（PO 承認済み）。(2) 再起動・リビジョン更新の重なりでカウンタが 0 に戻る、または台数倍になる。緩衝は 2,000 ユニット。(3) 同じ API キーの他の用途は数えられない。(4) 真のクォータ切れの間、1時間ごとの試行が最大約 2,400 ユニット/日を消費しうる。(5) 並行時の videos.list の拒否。(6) 503 に `Retry-After` が無い。(7) 複数 IP の分散した外れは上限まで止まらない。(8) キャッシュの FIFO の追い出し（既知、未定）。
- #26 code-review：approve（must 0、should 2）。基準の表 8行（N=8）。assumptions は基準と食い違わない（101 の余裕判定で、8000 なら 79 回目まで通し 80 回目を断つ）。並行は全遷移を `mu` の中で行い、panic・キャンセルでも試行枠を解放する。PDT・PST の両方をテストしている。不可視文字の Grep 0 件（developer の未実行を補った）。→ #26 を approved にした。全 PBI が approved になった。
  - should：(1) 並行の検索は videos.list の1ユニットを予約せず、終盤に 100 ユニットが無駄になりうる。解消先：新規（#33）。(2) 503 に `Retry-After` が無い。解消先：新規（#32。#25 の design の「PO に示す事項」1 とあわせた）。
  - 残余リスク：`max-instances=1` は README だけで、デプロイ設定では強制されない（#13 で扱う）。
- 解消先「新規」の should から PBI を作った（T2-2、`status:new`）。スプリントレビューで PO に示す。
  - #32 上限・抑制中の待ち時間を伝える（Retry-After と画面の文言）（ui）：#26 の code-review と #25 の design。
  - #33 検索の予約に videos.list の分を含める：#26 の code-review。
  - #25 の code-review の should（「取得中に『やめる』」のテスト）は、#29 にコメントで足した。
  - #25 の security-review の should（`Retry-After` の上限）は、PO に示す。採らなければ「不要」とする。
### demo
- 統合ブランチ `scrum/sprint-5`（作業ディレクトリ `.claude/worktrees/sprint-5`）に #28 → #26 → #25 の順で取り込んだ。競合は無かった（README は自動で統合された）。
- 統合ブランチでのテスト：`make test-race` 6パッケージ ok、`make vuln` は `No vulnerabilities found.` のみ（module レベルの注記も無い）、web は 11 ファイル 165 件 pass（17.3 秒、タイムアウトなし）、`npm run build` 成功。
- デモの場所：`.scrum/demos/sprint-5/`（1回目）。`browser.mjs` はスクラムマスターがプラグインから写した（元と同一であることを `cmp` で確かめた）。台本とスクリプトは golang-pro に依頼した。台本の場面2は、#26 の報告を受けて「上限を大きくして起動し直す」に直した。
- リハーサル：1回目の実行で4場面すべて一致した（`rehearsal.md`、確認 NG 0）。画面2枚に崩れやエラーは無い。「履歴」の見出しのにじみは Sprint 4 の画面にもあり、ヘッドレスの Chrome のフォントによる。終了後に残ったプロセスは無い。起動確認は `/` に向けた（Sprint 4 の不一致は再発していない）。
