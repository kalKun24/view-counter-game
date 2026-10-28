# view-counter-game

YouTubeの再生回数を使った数字ゲーム。サーバーがYouTube Data API v3で再生回数を自動で取得し、Cloud Runで公開する。

## 起動方法（開発）

フロントエンドは `web/`（React + TypeScript + Vite）、サーバーは `server/`（Go）にある。YouTube Data API は呼ばず、モックのサーバーで動かせる。

1. Go のモックサーバーを起動する（既定ポート 8080）。

   ```sh
   cd server
   USE_MOCK=1 go run .
   ```

2. 別のターミナルで、Vite の開発サーバーを起動する。

   ```sh
   cd web
   npm install
   npm run dev
   ```

   ブラウザで表示された URL（既定 http://localhost:5173/）を開く。`/api` は Vite が Go のサーバーへ中継する。

- Go のサーバーのポートを変えたとき（`PORT=9000` など）は、`API_PROXY_TARGET` で中継先を合わせる。例：`API_PROXY_TARGET=http://localhost:9000 npm run dev`。URL として読めない値や `http(s)` 以外の値のときは、黙って既定に戻さず、起動に失敗する。
- テストは `npm test`（Vitest を1回実行して終わる）。本物の API には出ず、`fetch` をモックする。ビルドは `npm run build`。
- ゲーム内で使えるモックの特別なワードは、下の「モックの特別なワード」を見る。

## キャッシュ

同じワードの組み合わせ（語順・大文字小文字・全角半角の違いを同一視）の検索結果は、サーバーのメモリにキャッシュして YouTube Data API のクォータを節約する。

- 有効時間の既定は1時間。環境変数 `CACHE_TTL` で変える（Go の `time.ParseDuration` 形式。例 `2s`、`30m`、`1h`）。解釈できない値や0以下の値のときは、起動に失敗してエラーを出す。
- エントリ数の上限は1,000。超えたら古いものから破棄する。
- 該当なしの結果もキャッシュする。上流のエラー（クォータ切れを含む）はキャッシュしない。
- 同時に届いた同じキーのリクエストは、上流を1回だけ呼ぶ。
- ログに `cache hit` / `cache miss` を出す。

### 制約

キャッシュはインスタンスごとのメモリ上にあるため、Cloud Run でインスタンスが入れ替わる（再起動、スケールイン、再デプロイ）とキャッシュは消える。複数のインスタンスが同時に動く場合も、インスタンス間でキャッシュは共有されない。そのため、入れ替わった直後は同じワードでも API を呼び直し、クォータを消費する。

## YouTube Data API との突合

使うエンドポイントのパラメータを、公式ドキュメントと突き合わせた表である（2026-10-28 に取得した [search.list](https://developers.google.com/youtube/v3/docs/search/list)・[videos.list](https://developers.google.com/youtube/v3/docs/videos/list) による）。制約は `server/internal/youtube/youtube_test.go` の偽サーバ（`strictAPI`）が再現し、違反すると 400 を返す。

| エンドポイント | パラメータ | 値 | 根拠（ドキュメントの該当箇所） |
|---|---|---|---|
| search.list | `part` | `snippet` | 必須。「Set the parameter value to snippet」 |
| search.list | `type` | `video` | 任意。既定は `video,channel,playlist` |
| search.list | `order` | `viewCount` | 任意。許容値の1つ |
| search.list | `q` | 検索ワード | 任意。検索語 |
| search.list | `maxResults` | `50` | 任意。許容値は 0〜50、既定は 5 |
| videos.list | `part` | `snippet,statistics` | 必須。取得するプロパティの指定 |
| videos.list | `id` | 動画 ID のカンマ区切り（最大50件） | フィルタ（`id`・`chart`・`myRating` のいずれか1つ）。件数の上限はドキュメントの該当箇所に記載が無い。search.list の上限に合わせて50件以内にしている |
| videos.list | `maxResults` | 送らない | 「`id` パラメータとの併用は未対応」。併用すると 400 になるため外した |
| videos.list | `pageToken` | 送らない | 「`id` パラメータとの併用は未対応」 |

- `x-goog-api-key` ヘッダで API キーを送る（URL に含めない）。
- ドキュメントに載らない挙動（本物の API が実際に返す応答）は、このテストでは確かめない。本物の API での確認は PO が1回だけ行う。

## モックの特別なワード

`USE_MOCK` を有効にすると、YouTube Data API を呼ばずにモックが応答する。検索ワード（正規化後）に次のワードを含めると、動作を再現できる。複数含めたときの優先順位は表の上から順。

| ワード | 動作 |
|---|---|
| `error` | 上流エラー（500）を返す |
| `quota` | クォータ切れ（403 `quotaExceeded`）を返す |
| `nomatch` | 該当なしを返す |
| `slow` | 3秒遅れて結果を返す |
| `n<数字>` | 再生回数がその数字の動画を返す（例：`n5000`、`n0`）。タイトルは `Mock video: <ワード>` |

- `n<数字>` は `slow` と併用できる。`n5000 slow` は遅れたうえで5,000回になる。`error`・`quota`・`nomatch` を含むときは、そちらが先に効く。
- `n<数字>` が複数あるときは、正規化後のワードを辞書順に並べた最初の1つを使う（`n2 n1` は1回）。
- 数字は 0 以上の整数のみ。`n-5`・`n12a`・桁あふれ（int64 を超える値）は通常のワードとして扱う。
- 上記以外のワードは、ワードの組み合わせから決まる固定の再生回数になる。
