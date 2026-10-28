# Sprint 2
- phase: retrospective
- goal: PO がスマホ幅のブラウザで、モックを相手に、カウントダウン・チャージ・ハイ＆ロー対戦の3モードを最後まで遊べる。判定には10,000未満を切り捨てた値を使い、画面には正しい再生回数も注釈として出る。
- started: 2026-10-28T15:17:50+09:00
- base_branch: main

## 対象 PBI
| PBI | points | ui | 担当構成 | 状態 | 差し戻し | ブランチ | 作業ディレクトリ |
|---|---|---|---|---|---|---|---|
| #3 | 5 | yes | ui-designer → golang-pro（モックの追加）→ react-specialist | accepted | 1 | scrum/3 | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-a2f662f90a14ba8b6 |
| #4 | 2 | yes | ui-designer → react-specialist | accepted | 1 | scrum/4 | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-ae188a3b7dc57a129 |
| #5 | 3 | yes | ui-designer → react-specialist | accepted | 1 | scrum/5 | /home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-ae4331f11c9c2f8e7 |

## デモ台本
| # | PO の操作 | 期待する結果 | PBI |
|---|---|---|---|
| 1 | カウントダウンの「ふつう」でお題を引き、ワードを入れて決定する。 | 残りが切り捨て値で減る。履歴に、切り捨て値・正しい再生回数（注釈）・動画タイトルが並ぶ。 | #3 |
| 2 | 語順や全角半角を変えた同じワードを入れる。 | 使用済みとして拒否される。 | #3 |
| 3 | `nomatch` を入れる。 | GAME OVER になる。 | #3 |
| 4 | `slow` を入れる。続けて `error` を入れる。 | `slow` では「取得中…」とボタンの無効化が見える。`error` ではエラーと再試行が出て、残りターンが減らない。 | #3 |
| 5 | チャージで、再生回数を指定できるモックのワードを足していく。 | 合計がバーに積まれ、クリア・バースト・ターン切れの各結果になる。 | #4 |
| 6 | ハイ＆ロー対戦を3人・「前より高く」で始め、1人が前より低い値を出す。 | その人が脱落し、手番が飛ばされ、最後の1人が勝者として表示される。 | #5 |
| 7 | 「前より低く」で、10,000回未満になるモックのワードを入れる。 | 判定値が0になり、その場で勝つ。 | #5 |

## 実行計画
- 3件とも UI を含むため、先に design 枠（ui-designer）が UI 仕様を `.scrum/designs/<pbi-id>.md` に書く。3件の仕様は並列に書く。
- #3 は、implement 枠を2人に分ける。先に golang-pro が、モックに「再生回数を指定できるワード」（例：`n5000` → 5,000回）を足す（デモでクリア・バースト・0ちょうどを再現するため）。続けて react-specialist が、同じ作業ディレクトリ・同じブランチで Vite の雛形、共通処理、カウントダウンを実装する。API 契約は Sprint 1 の `GET /api/views` のまま。開発中は Vite の開発サーバから Go のモックサーバへ `/api` をプロキシする。
- 依存：#4 と #5 は #3 の共通処理と画面部品に依存する。積み重ねの順序：`main` ← `scrum/3` ← `scrum/4`、`main` ← `scrum/3` ← `scrum/5`（#4 と #5 は並列）。
- #3 を却下すると、#4 と #5 もそのままではマージできない。
- 自動テストは本物の YouTube Data API を呼ばない。
- チーム合意 T1-1（実装前チェックリスト）と T1-2（既知の未対応リスクの表）を、依頼に含める。
- 飛ばした PBI：#7・#10〜#13（capacity に空きが無い）、#15〜#18（優先度 6 に置いた。Sprint 3 以降）。

## Agent 実行ログ
| PBI | Agent | 目的 | tokens | tool_uses | 所要時間 |
|---|---|---|---|---|---|
| #4 | ui-designer | design | 41110 | 11 | 66s |
| #3 | golang-pro | implement | 36175 | 33 | 97s |
| #5 | ui-designer | design | 46124 | 10 | 102s |
| #3 | ui-designer | design | 55301 | 10 | 163s |
| #3 | react-specialist | implement | 136013 | 77 | 471s |
| #3 | code-reviewer | review | 69374 | 33 | 82s |
| #3 | security-auditor | review | 43459 | 17 | 45s |
| #4 | react-specialist | implement | 71892 | 31 | 155s |
| #4 | code-reviewer | review | 50674 | 13 | 55s |
| #4 | security-auditor | review | 25302 | 7 | 22s |
| #5 | react-specialist | implement | 95602 | 37 | 243s |
| #5 | code-reviewer | review | 44726 | 18 | 58s |
| #5 | security-auditor | review | 32277 | 12 | 51s |
| - | react-specialist | demo（競合の解消） | 21307 | 18 | 61s |
| - | react-specialist | demo | 78706 | 27 | 196s |
| - | react-specialist | demo（2回目：競合の解消とデモの更新） | 54465 | 23 | 125s |
| #3 | react-specialist | rework | 26270 | 17 | 57s |
| #4 | react-specialist | rework | 28186 | 12 | 52s |
| #5 | react-specialist | rework | 25788 | 17 | 58s |
| #4 | code-reviewer | review | 21254 | 7 | 28s |
| #4 | security-auditor | review | 16082 | 6 | 15s |
| #3 | code-reviewer | review | 17747 | 5 | 27s |
| #3 | security-auditor | review | 15558 | 5 | 14s |
| #5 | code-reviewer | review | 16801 | 7 | 35s |
| #5 | security-auditor | review | 14482 | 5 | 14s |
| #3・#4・#5 | ui-designer | design（UI 仕様の追随） | 46995 | 14 | 30s |

## 記録
### planning
- PO が計画を承認した。
- 改善 PBI #15〜#18 は `priority:6` に置いた（#7 より前）。
- DoD 変更案（`-race` と `govulncheck` の結果をレビューの報告に載せる）：見送り。#15 の完了後のスプリント計画で改めて採否を決める（#15 にコメントで記録）。

### #4 design（ui-designer）
- 結果：done。`.scrum/designs/4.md`。チャージ固有の部分だけを定め、共通部品は #3 の仕様を参照する。
- assumptions
  - 3.md が未作成だったため、共通部品は試作版と同じ見た目で #3 が定めると想定した。食い違えば #3 を優先する。
  - 切り捨て後が 0 の再生回数も有効な入力で、ターンを消費する。デモ台本5のワードは 10,000 以上の値にする必要がある。
  - 上限が小数になりうるため、整数どうしの比較（許容幅を千分率で持つ）を勧めた。
  - 該当なしで終わるときは、そのターンを履歴に入れない。

### #3 implement 前半（golang-pro）
- 結果：done。作業ディレクトリ `/home/kal24hi/Projects/view-counter-game/.claude/worktrees/agent-a2f662f90a14ba8b6`、`scrum/3`、コミット c593291。モックに `n<数字>` のワードを追加（`n0`、`n5000` など）。API 契約は変更なし。README に「モックの特別なワード」の表を追加。
- assumptions
  - 優先順位は error > quota > nomatch > slow > `n<数字>`。
  - `n` ワードが複数あれば、正規化後のワード集合（辞書順）で最初に int64 に収まるもの。合計は取らない。
  - ワード全体が「`n` + 数字」のときだけ対象。
- T1-1 チェックリスト：6項目すべてに回答あり（4 は対応、他は該当なし）。
- unresolved：なし。`-race` は cgo 無効のため未実行。

### #5 design（ui-designer）
- 結果：done。`.scrum/designs/5.md`。新しい部品は生存者一覧、手番の引き継ぎカード（`vs-handoff`）、勝者表示の3つ。脱落は `▶`・取り消し線・「脱落」の文字で示し、色だけに頼らない。
- assumptions
  - 3.md が未作成だったため、共通部品は想定で書いた。食い違えば 3.md を優先する。
  - 引き継ぎカードは試作版に無く新規。成功・脱落でゲームが続くときに出し、1手ごとに1タップ増える（品質＝遊び心地を優先）。
  - 判定は「負け」を先に、次に「0ちょうど」を見る。「前より高く」の2手目以降で0を出すと負け、最初の1手で0なら勝ち。
  - 「前より低く」の最初のお題は切り捨てずに比べる。エラー時はワードを使用済みにしない。
- unresolved：3.md との突合が未了。
- **PO に示す事項（レビュー）**：(1) 引き継ぎカードで1手ごとにタップが1回増える（代案：脱落時だけ出す）。(2) 「前より高く」で最初の1手が0ちょうどならその場で勝ちになる。

### #3 design（ui-designer）
- 結果：done。`.scrum/designs/3.md`。ホーム・難易度設定・プレイ・結果の4画面。共通部品（AppShell、ScreenTop、ModeList、DifficultyPicker、Counter、SearchForm、FetchStatus、WordLog、ResultBanner、取得フック、LEVELS/jp/comma/normWords）とモード固有を分けた。未実装のモードは `enabledModes` で「準備中」にする。`data-testid` を画面ごとに定義。
- assumptions
  - nomatch は履歴にも使用済みにも入れず、ターンも増やさず、その場で GAME OVER。
  - 重複チェックは API を呼ぶ前に行う（クォータ節約）。
  - 正規化は試作版の `normWords` に NFKC を足す（全角英数の同一視のため）。
  - 試作版から変えた見た目：ライトモードのオレンジを #c2410c にする（コントラスト AA）、入力文字 16px（iOS の自動ズーム防止）、ボタンと入力の高さ 44px 以上。
  - fetch のタイムアウト 15秒。503 は #10・#11 まで他の 5xx と同じ表示。
  - 切り捨て値が 0 の行は `−0` と表示し、ターンを消費する。
  - 動画タイトルは React のテキストノードで表示し、`unicode-bidi:isolate` で閉じ込める。
- #3 の後半（フロントエンド）を react-specialist に依頼した（同じ作業ディレクトリ・`scrum/3`）。

### #3 implement 後半（react-specialist）
- 結果：done。`scrum/3` のコミット fa3215a。`web/`（React 19 + TS strict + Vite 8 + Vitest + RTL）。`npm test` 65 件 pass、`npm run build` 通過。360px はヘッドレス Chrome で手動確認。README に起動方法、`.gitignore` に `node_modules/` と `web/dist/`。
- 共通部品：`web/src/components/`、`hooks/useViewsFetch.ts`、`lib/`、`api/views.ts`、`modes.ts`（`enabledModes`）。ゲーム状態は履歴だけで、他は導出する。
- assumptions：Counter に `testIdPrefix`。4.md の `charge-total` は `${prefix}-value` と名前が合わず #4 で調整が要る。FetchStatus は `role="status"` を常に置き、失敗時だけ `role="alert"` を出す。
- T1-1 チェックリスト：6項目すべてに回答あり（2〜5 は対応、1・6 は該当なし）。fetch タイムアウト 15秒、`API_PROXY_TARGET` の不正値は起動失敗、エラーの種類を `data-reason` と `console.warn` で区別。
- unresolved：なし。
- 運用上の出来事：報告後も Vite の開発サーバ（127.0.0.1:15173）がバックグラウンドに残っていたため、スクラムマスターが Agent を停止して片付けた。ポート 8080 は無関係なサービス（401 を返す）が使っており、#4・#5 の developer に別ポートを使うよう伝えた。
- #3 のレビュー2件と、#4・#5 の実装（`scrum/3` から分岐、並列）を起動した。

### #3 review
- code-review（code-reviewer）：approve。must 0 / should 0。受け入れ基準12項目・UI 仕様・追加承認分（`n<数字>`）を確認。T1-1 の回答は妥当と所見。
  - 既知の未対応（#7、#10・#11、#12）に該当する箇所を、T1-2 のとおり末尾にまとめた。
- security-review（security-auditor）：approve。must 0 / should 1。
  - [should] `web/index.html` で Google Fonts を SRI なしで読み込んでいる。訪問者の IP と Referer が Google に送られる。フォントの自前配信か、#12 で CSP の `style-src`・`font-src` を2ホストに限定することを推奨。
  - 既知の未対応（#7、#12、#18）に該当する箇所を末尾1行にまとめた。T1-2 の must 基準に当たる指摘は無し。
  - 参考：`npm audit` はネットワークが要るため未実行。依存のバージョンが知識より新しく、既知の脆弱性との突合はできていない。
- 判定：approved（差し戻し 0）。

### #4 implement（react-specialist）
- 結果：done。`scrum/4`（分岐元 `scrum/3`）、コミット c249257。`web/src/modes/charge/`。`npm test` 92 件 pass、build 通過。手動確認のサーバは起動していない（残るプロセス無し）。
- 共通部品への変更（#5 と競合しうる）：`modes.ts`（charge: true）、`App.tsx`（modeScreens）、`DifficultySetup.tsx`（任意 props `clearRuleTestId`）、`App.test.tsx`（準備中の対象から charge を外した）。
- assumptions
  - 4.md の testid（charge-*）に合わせるため、共通の Counter を使わず `ChargeCounter` で同じクラスを組んだ。
  - 開発用スイッチは足さず、デモは画面の目標値を読んで `n<数字>` を組み立てる。
- unresolved：実ブラウザでの目視確認は未実施（jsdom のみ）。
- T1-1 チェックリスト：6項目すべてに回答あり（2・4 は対応、他は該当なし）。

### #4 review
- code-review（code-reviewer）：approve。must 0 / should 3。
  - [should] テスト名に「モード選択へ」とあるが、本文で確かめていない。
  - [should] ターン0の行や使用済み後のフォーカスの戻りが未確認（軽微）。
  - [should] charge では `rule-clear` の代わりに `charge-rule` になることが、3.md の testid 表に書かれていない。
  - 判断メモ：共通の Counter を使わず `ChargeCounter` を組んだのは 3.md の方針から外れるが、4.md の testid を満たすためで重複は約35行。must にしない。
  - T1-1 の所見：回答は妥当。デモの方式（目標値を読んで `n<数字>` を組む）は、リハーサルで実ブラウザの確認が要る。
- security-review（security-auditor）：approve。must 0 / should 0（既知の未対応リスクの再掲を1行にまとめた）。依存の追加なし。
- 判定：approved（差し戻し 0）。

### #5 implement（react-specialist）
- 結果：done。`scrum/5`（分岐元 `scrum/3`）。`web/src/modes/versus/`。`npm test` 89 件 pass、build 通過。手動確認のサーバは起動していない。
- 共通部品への変更（#4 と競合しうる）：`WordLog.tsx`（`LogRow` に任意の `out`）、`modes.ts`、`App.tsx`、`App.test.tsx`。
- 3.md 優先の読み替え：結果画面は ResultView が勝者名を挟めないため VersusMode 内に自前で書いた（testid は 3.md 側）。
- assumptions
  - 該当なしのワードは使用済みにする（エラー時はしない）。該当なしの手は履歴に出さず、手数には数える。
  - 0ちょうどの勝ちの理由の文言は、5.md の文言節を採用した（状態表と食い違っていた）。
  - 0ちょうどで勝った場合、他の生存者も結果画面では脱落の表示になる。
- unresolved：実ブラウザでの確認は未実施。引き継ぎカードによるタップ数は PO の判断事項。
- T1-1 チェックリスト：6項目すべてに回答あり（2・4・5 は対応、他は該当なし）。

### #5 review
- code-review（code-reviewer）：approve。must 0 / should 3。
  - [should] 結果画面を VersusMode 内に自前で組み、ResultView と二重になっている。ResultView に見出しのスロットを足して共通化する。
  - [should] `versus.css` で `.chip` と `.msg.good` をグローバルに定義しており、他のモードと衝突しうる。
  - [should] 「前より高く」の2手目以降で0は負け、該当なしのワードは使用済み、の2つの仮定をテストで固定したい。
  - T1-1 の所見：スクラムマスターがレビュー依頼に developer の T1-1 回答を書き写さなかったため、回答の有無をレビュアーが確かめられなかった（回答は報告にあった）。
- security-review（security-auditor）：approve。must 0 / should 3。
  - [should] プレイヤー名から bidi 制御文字・ゼロ幅文字を取り除いていない（同じ端末の表示に限られる）。
  - [should] 動画タイトルとプレイヤー名を同じ行に並べ、タイトルの bidi 制御文字を除去していない（#3 から続く既存の問題。3.md は `unicode-bidi:isolate` で閉じ込めるとしている）。
  - [should] 名前の切り詰めが UTF-16 のコード単位で、サロゲートペアの途中で切れうる。
  - 参考：不可視文字の Grep は `grep -P` で行ったが、ロケールが UTF-8 でなければ検出できていない可能性がある。
- 判定：approved（差し戻し 0）。

### execution のまとめ
- 3件すべて approved、差し戻し 0、blocked 0。
- 指摘件数：must 0 / should 10（#3：1、#4：3、#5：6）。既知の未対応リスクは T1-2 のとおり末尾にまとめられ、個別の should は 0 件。
- T1-1 に当たる観点（6項目）の should：0 件（Sprint 1 は 12 件）。
- 運用上の出来事：#3 の developer が Vite の開発サーバを残した。ポート 8080 は無関係なサービスが使用中。
- PO に示す事項
  1. #5：手番ごとの引き継ぎカードで、1手ごとにタップが1回増える（代案：脱落時だけ出す）。
  2. #5：「前より高く」で最初の1手が0ちょうどならその場で勝ち。2手目以降の0は負け。
  3. #5：該当なしのワードも使用済みにする。0ちょうどで勝ったとき、他の生存者も脱落の表示になる。
  4. #3：試作版から変えた見た目（ライトモードのオレンジを #c2410c、入力 16px、ボタン・入力 44px 以上）。
  5. #3：Google Fonts を外部から読み込んでおり、訪問者の IP が Google に送られる。

### demo（1回目）
- 統合ブランチ：`scrum/sprint-2`（`main` に #3 → #4 → #5 の順で `--no-ff` マージ。#5 で `modes.ts`・`App.tsx`・`App.test.tsx` が競合し、react-specialist が両方を活かす形で解消。統合後は web 116件・Go 5パッケージがすべて pass）
- 作業ディレクトリ：/home/kal24hi/Projects/view-counter-game/.claude/worktrees/sprint-2
- デモの場所：/home/kal24hi/Projects/view-counter-game/.scrum/demos/sprint-2/（README.md、demo.sh、scenes.json、browser.mjs、rehearsal.md、shots/）
- リハーサル：1回目で自動の全場面が一致（場面1〜4、5a、5b、6、7）。場面5c（チャージのクリア）は目標がランダムなため自動化の対象外とし、境界値のテストで代替した（未達）。
- 画面で気づいた点：見出し「履歴」の字形が二重に見える（レイアウトの崩れやエラーは無い）。場面7で負けていない人も「脱落」と表示される。

### デモ（1回目）の差し戻し
- PO の指摘（言い直し）：台本の場面1・5・7で、お題（目標）が「5億1234万5678」のように1の位まで出る。そうではなく、お題も10,000未満を切り捨てた値であってほしい。プレイヤーが出す値は1万単位なので、端数は判定の役に立たない。
- 区分：3件とも基準の書き漏れ（受け入れ基準は判定に使う再生回数の切り捨てだけを定め、お題に触れていなかった）。
- #3：カウントダウンのお題（`CountdownMode.tsx` の `rand(L.min, L.max)`）を切り捨てる。
- #4：チャージの目標（`ChargeMode.tsx` の `rand(L.min, L.max)`）を切り捨てる。上限（目標×(1+許容幅)）も1万単位に切り下げて表示・判定する。合計は1万単位でしか増えないため、バーストになる場面は変わらない。
- #5：対戦「前より低く」の最初のお題（`VersusMode.tsx` の `rand(5e8, 3e9)`）を切り捨てる。
- お題の範囲（難易度ごとの最小と最大）は試作版のまま変えない。
- 対応：直して見せ直す（PO が承認）。
- 追加の受け入れ基準を #3・#4・#5 の Issue にコメントで記録した。

### rework（デモ1回目の差し戻し）
- #3（react-specialist）：`scrum/3` のコミット 06e1a21。`countdown/judge.ts` に `pickTarget(level)`（`truncateViews(rand(min, max))`）を足した。lib/ は未変更。npm test 70件 pass、build 通過。T1-1 は6項目とも該当なし。
- #4（react-specialist）：`scrum/4` のコミット 15259d8。目標を `truncateViews(rand(...))` にし、`limitOf` を1万単位に切り下げた（表示と判定で同じ値）。上限ちょうどはクリア、+1万はバースト。npm test 94件 pass、build 通過。T1-1 は6項目とも該当なし。
- #5（react-specialist）：`scrum/5` のコミット 3c1b3bf。「前より低く」の最初のお題を `truncateViews(rand(5e8, 3e9))` にした。判定の比較は変更不要。npm test 90件 pass、build 通過。T1-1 は6項目とも該当なし。
  - unresolved：5.md の仮定「最初のお題は切り捨てずに比べる」が古くなった。
- レビュー：6件すべて approve。must 0 / should 1。
  - [should]（#5 code-review）5.md の 221・234行目付近の仮定を「最初のお題も10,000未満を切り捨てる」に更新する。ui-designer に依頼した。ui-designer が 3.md・4.md・5.md のお題・目標・上限の記述を、切り捨てに合わせて直した（main の未コミットの変更）。
  - T1-1 の回答は、今回からレビュー依頼に書き写した。全レビュアーが妥当と判断した。
  - T1-2 の既知の未対応リスクに該当する新しい所見は無し。
- 判定：#3・#4・#5 とも approved（差し戻し 1）。

### demo（2回目）
- 統合ブランチ：`scrum/sprint-2` を作り直した（`main` に #3 → #4 → #5 を `--no-ff` マージ）。#5 で `modes.ts`・`App.tsx`・`App.test.tsx` が1回目と同じく競合し、react-specialist が3ブランチの変更を活かして解消した（3333ea5）。統合後は web 124件・Go 5パッケージがすべて pass。
- 作業ディレクトリ：/home/kal24hi/Projects/view-counter-game/.claude/worktrees/sprint-2
- デモ：場面 8a〜8c（お題・目標と上限・対戦の最初のお題が万の位まで）を追加した。1回目の記録は rehearsal-1.md に写した。
- リハーサル：1回目で自動の全場面が一致（1〜4、5a、5b、6〜7、8a〜8c）。5c は1回目と同じく未達（テストで代替）。
- 運用上の出来事：最初の `git worktree add` が、無視されたファイル（`web/.vite`）が残っていたため失敗し、ブランチだけ作られた。残っていたディレクトリを消して、既存のブランチで作り直した。
- 運用上の出来事：1回目のデモを PO が対話モードで起動したまま（Enter 待ち）、統合ブランチの worktree を作り直した。PO に Enter で止めてから実行し直すよう伝えた。

### review
- PO がデモ2回目を受け入れた。PR #19 を `--merge` でマージした（マージコミット 7491432）。#3・#4・#5 は `Closes` で閉じ、`status:sprint` を外した。
- main でのテスト：web 9ファイル 124件 pass、Go 5パッケージ ok。
- PO に示した事項（引き継ぎカード、0ちょうどの決着時の「脱落」表示、「前より高く」の0、該当なしの使用済み、見た目の変更、Google Fonts、「履歴」の字形）は、PO から改善 PBI の指示が無かった。PBI は作っていない。
- 後片付け：統合ブランチと #3〜#5 の worktree・ブランチ、`worktree-agent-*` のブランチを削除した。

## デモの判定
| 回 | 日時 | 判定 | PO の指摘 | 原因の PBI | 対応 |
|---|---|---|---|---|---|
| 1 | 2026-10-28T18:06:38+09:00 | 差し戻し | お代の数字も、10,000未満は切り捨てようよ。　出してる意味なくない？ | #3, #4, #5 | 直して見せ直す |
| 2 | 2026-10-28T19:08:16+09:00 | 受け入れ | — | — | マージした |
