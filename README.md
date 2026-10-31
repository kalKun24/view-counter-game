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

## 検証（-race と govulncheck）

ホストに cgo・gcc・`govulncheck` が無くても、Docker があれば `server/` で次の2つを実行できる。`make` と Docker が必要である。

```sh
cd server
make test-race   # Docker 内で go test -race ./... を実行し、全パッケージの結果を表示する
make vuln        # Docker 内で govulncheck を実行し、結果を表示する
```

- `make test-race` は、全パッケージが通れば各行が `ok` になる。失敗があれば非 0 で終了する。
- `make vuln` は、脆弱性が無ければ `No vulnerabilities found.` を表示する。検出があれば一覧を表示して非 0 で終了する。
- Docker のイメージ（`golang:1.26.10-bookworm`、ダイジェストつき）と `govulncheck` のバージョン（`v1.9.0`）は `server/Makefile` で固定している。上げる手順は、下の「版を上げるとき」を見る。
- 初回はイメージと依存の取得のため、ネットワークと時間が要る。ソースは読み取り専用でマウントするため、リポジトリのファイルは変わらない。

### 版を上げるとき

Go の版、イメージ、`govulncheck` の版は、次の順にそろえて変える。

1. 新しいイメージを取得し、ダイジェストを確かめる。`docker pull golang:<版>-bookworm` を実行し、`docker image inspect golang:<版>-bookworm --format '{{index .RepoDigests 0}}'` で `sha256:` の値を得る。タグは後から別のイメージに付け替えられるため、タグだけで固定しない。
2. `server/Makefile` の `GO_IMAGE` を `golang:<版>-bookworm@sha256:<ダイジェスト>` に書き換える。`docker pull golang:<版>-bookworm@sha256:<ダイジェスト>` が通ることを確かめる。
3. `server/go.mod` の `toolchain go<版>` を、イメージの版と同じにする。
4. `govulncheck` の版を上げる場合は、`server/Makefile` の `GOVULNCHECK_VERSION` を書き換える。
5. `server/` で `make test-race` と `make vuln` を実行し、通ることを確かめる。`make vuln` は `No vulnerabilities found.` だけで終わり、`modules you require` の注記が出ないことを確かめる。

### `make vuln` が検出を出したとき

検出の ID（`GO-YYYY-NNNN`）を `-show verbose` で確かめ、次の順に扱う。

1. 修正版があれば、その版に上げる（モジュールなら `go get`、標準ライブラリなら上の手順で Go の版を上げる）。上げたら `make test-race` と `make vuln` をやり直す。
2. 修正版が無ければ、自分のコードから脆弱な関数を呼んでいるかを確かめる。呼び出しが無い場合は、呼び出しが無い理由（どの関数が脆弱で、なぜ経路に無いか）と ID を記録して残す。
3. 呼び出しがあれば、公開を止める。修正版が出るか、呼び出しを取り除くまで公開しない。

## キャッシュ

同じワードの組み合わせ（語順・大文字小文字・全角半角の違いを同一視）の検索結果は、サーバーのメモリにキャッシュして YouTube Data API のクォータを節約する。

- 有効時間の既定は1時間。環境変数 `CACHE_TTL` で変える（Go の `time.ParseDuration` 形式。例 `2s`、`30m`、`1h`）。解釈できない値や0以下の値のときは、起動に失敗してエラーを出す。
- エントリ数の上限は1,000。超えたら古いものから破棄する。
- 該当なしの結果もキャッシュする。上流のエラー（クォータ切れを含む）はキャッシュしない。
- 同時に届いた同じキーのリクエストは、上流を1回だけ呼ぶ。
- ログに `cache hit` / `cache miss` を出す。

### 制約

キャッシュはインスタンスごとのメモリ上にあるため、Cloud Run でインスタンスが入れ替わる（再起動、スケールイン、再デプロイ）とキャッシュは消える。複数のインスタンスが同時に動く場合も、インスタンス間でキャッシュは共有されない。そのため、入れ替わった直後は同じワードでも API を呼び直し、クォータを消費する。

## 連打への対策（回数制限と入力の上限）

`/api/*` へのリクエストを、クライアントの IP アドレスごとに数える。静的ファイルは対象外である。キャッシュに当たったリクエストも、検証で 400 になったリクエストも数える。制限を超えると `429 {"error":{"code":"too_many_requests",...}}` と、待つ秒数を示す `Retry-After` ヘッダーを返す。

| 環境変数 | 意味 | 既定 | 範囲 |
|---|---|---|---|
| `RATE_LIMIT` | 1ウィンドウに許す回数 | 10 | 1〜100000 の整数 |
| `RATE_LIMIT_WINDOW` | ウィンドウの長さ（`time.ParseDuration` 形式） | 1m | 1s〜24h |
| `TRUSTED_PROXY_HOPS` | `X-Forwarded-For` の右から数えて、信頼できる中継が足した数 | 1 | 1〜10 の整数 |

- 3つとも、未設定のときだけ既定になる。空・解釈できない値・範囲外の値は、黙って既定に戻さず、起動に失敗する。
- クライアントの IP は、`X-Forwarded-For` の右から `TRUSTED_PROXY_HOPS` 番目の値を使う。Cloud Run の前面は、接続元の IP を右端に足す。左側の値は利用者が自由に書けるので使わない。Cloud Run に直接つなぐ構成は既定の 1 でよい。前にロードバランサーを置く構成は 2 にする。ヘッダーが無い、項目が足りない、IP として読めないときは `RemoteAddr` を使う。IPv6 は /64 単位でまとめる。
- 検索ワードは、1語50文字以内、5語以内（正規化・空白分割後）。超えると `400 {"error":{"code":"invalid_query",...}}` を返す。
- 回数の記録は期限が切れたものを定期的に消す。記録は最大100,000件で、満杯で空きが無いときは新しいクライアントを拒否する（クォータを守る側に倒す）。

### 制約

回数の状態はインスタンスのメモリ内にある。複数のインスタンスが動くと、状態は分散し、インスタンス間で共有されない。実効の上限は「設定値 × インスタンス数」になる。インスタンスが入れ替わると、記録は消える。

## 上流呼び出しの全体上限とクォータ切れ中の抑制

インスタンス全体で、YouTube Data API の消費をユニットで数える。`search.list` は 100、`videos.list` は 1 である（外れ1回で 101）。キャッシュに当たった検索は数えない。上流がエラーを返した呼び出しも数える。

| 環境変数 | 意味 | 既定 | 範囲 |
|---|---|---|---|
| `DAILY_UNIT_LIMIT` | 1日に使う自前の上限（ユニット） | 8000 | 1〜10000 の整数 |

- 未設定のときだけ既定になる。空・整数でない値・範囲外（10,000 を超える値を含む）は、黙って既定に戻さず、起動に失敗する。
- 日付は太平洋時間（`America/Los_Angeles`）の 0 時で切り替わり、カウンタは 0 に戻る。タイムゾーンのデータはバイナリに埋め込んであり、イメージやホストに tzdata が無くても動く。
- 上限に達したとき（残りが外れ1回分の 101 ユニットに満たないとき）は、上流を呼ばずに `503 {"error":{"code":"quota_exceeded",...}}` を返す。`search.list` だけ呼んで `videos.list` を断る無駄を避けるため、検索は直後の `videos.list` の分まで余裕があるときだけ呼ぶ。
- 上流が 403 `quotaExceeded` を返したら、1時間は上流を呼ばずに 503 `quota_exceeded` を返す。1時間後の最初の1リクエストだけ上流を試す（同時には1件）。成功すれば再開し、また `quotaExceeded` なら、さらに1時間止める。
- ログに、上限への到達（その日の初回）、抑制の開始、再開を、それぞれ1回ずつ出す。抑制中や上限到達後の個々のリクエストは、既定のログレベルでは出さない。
- モック（`USE_MOCK=1`）も同じ数え方をする。上限を小さくすれば、本物の API を呼ばずに確かめられる。例：`DAILY_UNIT_LIMIT=202 USE_MOCK=1 go run .` で、異なるワードを3回送ると3回目が 503 になる（同じワードはキャッシュから 200）。`quota` を送ると抑制が始まる。

### 制約

カウンタと抑制の状態はインスタンスのメモリ内にある。インスタンスが増えると、実効の上限は「設定値 × インスタンス数」になる。再起動すると 0 に戻る。次の「デプロイ」の `max-instances=1` で台数を1に抑える。受け入れているリスクとして、攻撃者は約80回のキャッシュの外れで、その日の遊びを止められる。

## デプロイ（Cloud Run）

カウンタがインスタンスのメモリにあるため、`max-instances=1` を必ず付ける。付けないと、インスタンスの台数倍の上限になる（8,000 ユニットのつもりが、2台で 16,000 になり、API の 10,000 を超えうる）。また、再起動やスケールインでインスタンスが入れ替わると、カウンタは 0 に戻る。

```sh
gcloud run deploy view-counter-game \
  --source . \
  --max-instances=1 \
  --set-secrets=YOUTUBE_API_KEY=youtube-api-key:latest
```

- 環境変数 `DAILY_UNIT_LIMIT`・`RATE_LIMIT` などは `--set-env-vars` で渡す（上の各節を見る）。
- 上の例のサービス名・ソースの指定は一例である。大事なのは `--max-instances=1` である。

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

`USE_MOCK=1` を設定すると、YouTube Data API を呼ばずにモックが応答する。`YOUTUBE_API_KEY` と同時に設定すると起動に失敗するので、どちらか一方だけを設定する。`USE_MOCK` に `1` 以外の値（`true`、`yes` など）を設定した場合も、モックのつもりで本物の API を呼ばないよう、起動に失敗する（未設定、空、`0` は無効として扱う）。検索ワード（正規化後）に次のワードを含めると、動作を再現できる。複数含めたときの優先順位は表の上から順。

| ワード | 動作 |
|---|---|
| `error` | 上流エラー（500）を返す |
| `quota` | クォータ切れ（403 `quotaExceeded`）を返す。1時間の抑制が始まる（上の「上流呼び出しの全体上限とクォータ切れ中の抑制」） |
| `nomatch` | 該当なしを返す |
| `slow` | 3秒遅れて結果を返す |
| `n<数字>` | 再生回数がその数字の動画を返す（例：`n5000`、`n0`）。タイトルは `Mock video: <ワード>` |

- `n<数字>` は `slow` と併用できる。`n5000 slow` は遅れたうえで5,000回になる。`error`・`quota`・`nomatch` を含むときは、そちらが先に効く。
- `n<数字>` が複数あるときは、正規化後のワードを辞書順に並べた最初の1つを使う（`n2 n1` は1回）。
- 数字は 0 以上の整数のみ。`n-5`・`n12a`・桁あふれ（int64 を超える値）は通常のワードとして扱う。
- 上記以外のワードは、ワードの組み合わせから決まる固定の再生回数になる。
