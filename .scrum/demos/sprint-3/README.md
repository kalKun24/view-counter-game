# Sprint 3 のデモ
## ゴール
PO が1コマンドで、競合検出（`-race`）と脆弱性の検査が動くこと、キャッシュの読み込みの panic や設定の矛盾でサーバが落ちず自分で止まること、`videos.list` に併用できないパラメータを送らないことを確かめられる。

## 動かし方
```
bash .scrum/demos/sprint-3/demo.sh
```
- 前提：Go、Docker、make、curl、python3 が使えること。所要時間は、Docker のイメージと依存が取得済みなら数分以内（初回は取得の分だけ延びる）。
- ネットワークを使うのは、場面 1 の `make test-race`（初回の依存取得）と場面 2 の `make vuln`（脆弱性データベース）だけである。それ以外は使わない。
- 本物の YouTube Data API は呼ばない。`YOUTUBE_API_KEY` は環境から外して実行する。場面 5 の `dummy-demo-key` は、漏れないことを確かめるための偽の値である。
- 場面 5 のサーバは空いているポートで起動する（8080 は使わない）。curl の宛先は 127.0.0.1 の自分のサーバだけである。
- 場面 2 は、**今は検出 2 件（GO-2026-6809、GO-2026-5970）で非 0 終了する**。これは期待どおりの結果で、修正は #21 で行う。スクリプトは止まらずに次へ進み、「検出あり（#21 で修正予定）」と表示する。確認 NG には数えない。
- 場面ごとに「確認 OK／NG」を表示する。終了コードは NG の数で決まる（0 件なら 0）。
- 動かすコードを変える場合は、第1引数にディレクトリを渡す。第2引数 `--rehearse` は受け取って無視する。

## 台本
| # | PO の操作 | 期待する結果 | PBI |
|---|---|---|---|
| 1 | `server/` で `make test-race` を実行する。 | Docker の中で `go test -race ./...` が動き、全パッケージが ok になる。 | #15 |
| 2 | `make vuln` を実行する。 | govulncheck の結果が出る。今は検出 2 件（GO-2026-6809、GO-2026-5970）で非 0 終了し、「検出あり（#21 で修正予定）」と表示される。 | #15 |
| 3 | `go test ./internal/youtube -run 'VideosList\|SearchList\|StrictFake' -v` を実行し、README の「YouTube Data API との突合」の表を見る。 | `videos.list` に併用できないパラメータを送っていないことが、pass で示される。README の突合の表（公式ドキュメントとの対応）が表示される。 | #16 |
| 4 | `go test ./internal/cache -run Panic -v` と `go test ./internal/api -run Panic -v` を実行する。 | どちらも pass。panic でプロセスが落ちず、待っている呼び出し全員にエラーが返る。同じキーの次の呼び出しで読み込み直す。ハンドラ経由で 500 になり、上流エラー（502）と区別できるログが出る。 | #17 |
| 5 | `USE_MOCK=1 YOUTUBE_API_KEY=dummy-demo-key` で起動する。続けて `USE_MOCK=true`、`USE_MOCK=1` だけで起動する。 | 1つ目は終了コード 1 で、エラーに `USE_MOCK` と `YOUTUBE_API_KEY` の両方が出て、`dummy-demo-key` は出ない。2つ目も終了コード 1 で、値 `true` がエラーに出る。3つ目は起動して `youtube client: mock` が出て、`/api/views?q=foo` が 200 を返す。 | #18 |

## 後片付け
不要（ビルドしたバイナリとログは一時ディレクトリに置き、終了時に消える。起動したサーバは場面の中で止める）。
