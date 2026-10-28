# Sprint 4 のデモ
## ゴール
PO が、脆弱性の検出が0件になったこと、連打が 429 で止まること、クォータ切れで 503 と「今日は遊べない」の画面が出ること、YouTube の呼び出しが必ず打ち切られることを、本物の API を呼ばずに確かめられる。

## 動かし方
```
bash .scrum/demos/sprint-4/demo.sh
```
- 前提：Go、Docker、make、curl、python3、Node 22 以上、Chrome（または Chromium）が使えること。`web/node_modules` があること（無ければ `cd web && npm ci`）。所要時間は、Docker のイメージと依存が取得済みなら数分以内（初回は取得の分だけ延びる）。
- 動かすコードを変える場合は、第1引数にディレクトリを渡す。第2引数 `--rehearse` は、最後で Enter を待たずに終わる。
- ネットワークを使うのは、場面 1 の `make vuln`（脆弱性データベース）と、初回の `make test-race`（依存取得）だけである。サーバは `USE_MOCK=1` で動かし、本物の YouTube Data API は呼ばない（`YOUTUBE_API_KEY` は環境から外す）。
- サーバと画面の開発サーバ（Vite）は、空いているポートで動かす（8080 は使わない）。宛先は 127.0.0.1 の自分のサーバだけである。
- 場面ごとに「確認 OK／NG」を表示する。終了コードは NG の数で決まる（0 件なら 0）。
- 全場面のあと、スクリプトは画面の URL（`http://127.0.0.1:<ポート>/`、実行時に表示）を表示して待つ。ブラウザで開くと自分でも触れる。検索ワードに `quota` を入れるとクォータ切れの画面になる。Enter で終了する（サーバを止めて一時ファイルを消す）。
- 場面 1 の `make vuln` には、module レベルの検出 1 件（GO-2026-6629、`x/text/secure/precis`）が出力に残る。このコードは呼び出されない（import していない）ため、検出 0 件・終了コード 0 は変わらない。PO の判断事項（修正版 v0.41.0 に上げるか）として、#28 に回してある。

## 台本
| # | PO の操作 | 期待する結果 | PBI |
|---|---|---|---|
| 1 | `server/` で `make vuln` と `make test-race` を実行する。`go.mod` と Makefile の版の行も見る。 | `make vuln` は検出 0 件で終了コード 0、`make test-race` は全パッケージ ok。`go.mod` に `x/text v0.39.0` と `toolchain go1.26.10`、Makefile に `golang:1.26.10-bookworm` がある。 | #21 |
| 2 | `RATE_LIMIT=3` のモックで `curl` を4回続ける。制限を大きくしたサーバで、51文字のワードと6語の q を送る。`go test -run 'TestRateLimitSkipsNonAPIPaths\|TestClientIP\|TestSpoofedXFFDoesNotBypassLimit' -v` を実行する。 | 4回目に 429 と `Retry-After`、`too_many_requests`。51文字のワードと6語の q は 400 `invalid_query`（5語は 200）。静的ファイルを数えないこと、クライアント IP の取り方、偽の X-Forwarded-For で回避できないことが PASS。 | #7 |
| 3 | `q=quota` で `curl` を2回実行する。`go test -run TestQuotaVersusOtherUpstreamErrors -v` を実行する。 | 2回とも 503 と `quota_exceeded`（キャッシュされない）。`dailyLimitExceeded` を含む他の 403 は 502 になることが PASS。 | #10 |
| 4 | 画面でカウントダウンを始め、1語入れたあと、検索ワードに `quota` を入れる。`npx vitest run src/quota.test.tsx` を実行する。 | 「今日は遊べません」が出る。GAME OVER にならず、残りターンも履歴も変わらない（残り4ターン、履歴1行のまま）。再試行ボタンと入力欄が無く、「ホームへ戻る」でモード選択に戻る。チャージ・対戦の扱いはテストが PASS。スクリーンショットが残る。 | #11 |
| 5 | `go test ./internal/youtube/ -run Timeout -v` を実行する。`youtube.go` に `http.DefaultClient` が無いことを見る。 | 応答しない偽サーバへの呼び出しが打ち切られ、PASS。`http.DefaultClient` は 0 件で、10 秒の定数 `DefaultHTTPTimeout` を使う。 | #22 |

## 後片付け
不要（ビルドしたバイナリ、ログ、起動したサーバ、Vite は終了時に止めて一時ディレクトリごと消える。リハーサルのスクリーンショットだけが `.scrum/demos/sprint-4/shots/` に残る）。
