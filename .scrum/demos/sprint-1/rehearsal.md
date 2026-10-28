# Sprint 1 のリハーサル
- 日時：2026-10-28T14:59:09+09:00
- 回：1
- 実行したコマンド：`bash .scrum/demos/sprint-1/demo.sh /home/kal24hi/Projects/view-counter-game/.claude/worktrees/sprint-1 --rehearse`（コード：/home/kal24hi/Projects/view-counter-game/.claude/worktrees/sprint-1）

| # | 期待する結果 | 実際の出力（要点） | 判定 |
|---|---|---|---|
| 1 | 起動に失敗する。 | 終了コード 1。ログに `cannot start err="YOUTUBE_API_KEY is not set (set USE_MOCK=1 to use the mock)"`。 | 一致 |
| 2 | 起動ログに `youtube client: mock` が出る。 | `msg="youtube client: mock"` が1行出た。 | 一致 |
| 3 | `found:true`、再生回数、動画タイトルが返る。 | HTTP 200、`viewCount` 54352390、title `Mock video: ピアノ 猫`。ログは `cache miss`。 | 一致 |
| 4 | 3 と同じ結果が返る。 | `ピアノ 猫`・`猫　ピアノ` は 3 と同じ結果で `cache hit`。`Cat Piano`・`cat　PIANO` は互いに同じ結果（miss → hit）。 | 一致 |
| 5 | 400 と `invalid_query` が返る。 | HTTP 400、`invalid_query`。 | 一致 |
| 6 | `found:false` が返る。 | HTTP 200、`{"found":false}`。 | 一致 |
| 7 | 5xx のエラー JSON が返り、API キーや上流の生の応答は含まれない。 | HTTP 502、`upstream_error`、固定文言。ログは `youtube: upstream status 500` のみ。 | 一致 |
| 8 | 1回目は `cache miss`、2回目は `cache hit`。 | `犬 ギター` で miss → hit、同じ `viewCount` 77836333。 | 一致 |
| 9 | 3秒後に再び `cache miss`。 | `CACHE_TTL=2s` で 14:59:10.026 に miss、14:59:13.043 に再び miss。 | 一致 |
| 補足 | `go test ./...` がすべて ok。 | 5パッケージすべて ok、終了コード 0。 | 一致 |

## 出力の全文
```
== 準備: バイナリをビルドする ==
ビルド完了（コード：/home/kal24hi/Projects/view-counter-game/.claude/worktrees/sprint-1/server）

== 場面 1: API キー無し、USE_MOCK 無しでサーバーを起動する ==
終了コード: 1
--- ログ ---
time=2026-10-28T14:59:09.721+09:00 level=ERROR msg="cannot start" err="YOUTUBE_API_KEY is not set (set USE_MOCK=1 to use the mock)"

== 場面 2: USE_MOCK=1 でサーバーを起動する ==
ポート: 42891
--- 起動ログ ---
time=2026-10-28T14:59:09.849+09:00 level=INFO msg="youtube client: mock"

== 場面 3: 「猫 ピアノ」を送る ==
$ curl -G --data-urlencode 'q=猫 ピアノ' http://127.0.0.1:42891/api/views
{"found":true,"viewCount":54352390,"video":{"id":"mock:ピアノ 猫","title":"Mock video: ピアノ 猫"}}

HTTP 200
--- ログ ---
time=2026-10-28T14:59:09.874+09:00 level=INFO msg="cache miss" key="ピアノ 猫"

== 場面 4: 語順・全角スペース・大文字を変えて送る ==
$ curl -G --data-urlencode 'q=ピアノ 猫' http://127.0.0.1:42891/api/views
{"found":true,"viewCount":54352390,"video":{"id":"mock:ピアノ 猫","title":"Mock video: ピアノ 猫"}}

HTTP 200
$ curl -G --data-urlencode 'q=猫　ピアノ' http://127.0.0.1:42891/api/views
{"found":true,"viewCount":54352390,"video":{"id":"mock:ピアノ 猫","title":"Mock video: ピアノ 猫"}}

HTTP 200
$ curl -G --data-urlencode 'q=Cat Piano' http://127.0.0.1:42891/api/views
{"found":true,"viewCount":38438598,"video":{"id":"mock:cat piano","title":"Mock video: cat piano"}}

HTTP 200
$ curl -G --data-urlencode 'q=cat　PIANO' http://127.0.0.1:42891/api/views
{"found":true,"viewCount":38438598,"video":{"id":"mock:cat piano","title":"Mock video: cat piano"}}

HTTP 200
--- ログ（同じキーなので hit になる） ---
time=2026-10-28T14:59:09.887+09:00 level=INFO msg="cache hit" key="ピアノ 猫"
time=2026-10-28T14:59:09.894+09:00 level=INFO msg="cache hit" key="ピアノ 猫"
time=2026-10-28T14:59:09.901+09:00 level=INFO msg="cache miss" key="cat piano"
time=2026-10-28T14:59:09.907+09:00 level=INFO msg="cache hit" key="cat piano"

== 場面 5: q を空にして送る ==
$ curl -G --data-urlencode 'q=' http://127.0.0.1:42891/api/views
{"error":{"code":"invalid_query","message":"q は必須です。検索ワードを指定してください。"}}

HTTP 400
--- ログ ---

== 場面 6: q=nomatch を送る ==
$ curl -G --data-urlencode 'q=nomatch' http://127.0.0.1:42891/api/views
{"found":false}

HTTP 200
--- ログ ---
time=2026-10-28T14:59:09.934+09:00 level=INFO msg="cache miss" key=nomatch

== 場面 7: q=error を送る ==
$ curl -G --data-urlencode 'q=error' http://127.0.0.1:42891/api/views
{"error":{"code":"upstream_error","message":"動画情報の取得に失敗しました。"}}

HTTP 502
--- ログ（API キーや上流の生の応答が出ていないこと） ---
time=2026-10-28T14:59:09.947+09:00 level=INFO msg="cache miss" key=error
time=2026-10-28T14:59:09.947+09:00 level=ERROR msg="youtube request failed" err="youtube: upstream status 500"

== 場面 8: 新しいワード「犬 ギター」を2回送る ==
$ curl -G --data-urlencode 'q=犬 ギター' http://127.0.0.1:42891/api/views
{"found":true,"viewCount":77836333,"video":{"id":"mock:ギター 犬","title":"Mock video: ギター 犬"}}

HTTP 200
--- ログ（1回目） ---
time=2026-10-28T14:59:09.960+09:00 level=INFO msg="cache miss" key="ギター 犬"
$ curl -G --data-urlencode 'q=犬 ギター' http://127.0.0.1:42891/api/views
{"found":true,"viewCount":77836333,"video":{"id":"mock:ギター 犬","title":"Mock video: ギター 犬"}}

HTTP 200
--- ログ（2回目） ---
time=2026-10-28T14:59:09.973+09:00 level=INFO msg="cache hit" key="ギター 犬"

== 場面 9: CACHE_TTL=2s で起動し、送って3秒後にもう一度送る ==
ポート: 52851（CACHE_TTL=2s）
$ curl -G --data-urlencode 'q=鳥 ドラム' http://127.0.0.1:52851/api/views
{"found":true,"viewCount":21803568,"video":{"id":"mock:ドラム 鳥","title":"Mock video: ドラム 鳥"}}

HTTP 200
--- ログ（1回目） ---
time=2026-10-28T14:59:10.026+09:00 level=INFO msg="cache miss" key="ドラム 鳥"
3秒待つ...
$ curl -G --data-urlencode 'q=鳥 ドラム' http://127.0.0.1:52851/api/views
{"found":true,"viewCount":21803568,"video":{"id":"mock:ドラム 鳥","title":"Mock video: ドラム 鳥"}}

HTTP 200
--- ログ（3秒後） ---
time=2026-10-28T14:59:13.043+09:00 level=INFO msg="cache miss" key="ドラム 鳥"

== 補足: テストで示す項目（go test ./...） ==
ok  	github.com/kalKun24/view-counter-game/server	(cached)
ok  	github.com/kalKun24/view-counter-game/server/internal/api	(cached)
ok  	github.com/kalKun24/view-counter-game/server/internal/cache	(cached)
ok  	github.com/kalKun24/view-counter-game/server/internal/words	(cached)
ok  	github.com/kalKun24/view-counter-game/server/internal/youtube	(cached)
go test の終了コード: 0
--- 対応するテスト ---
同時アクセスで上流1回      : TestConcurrentSameKeyCallsUpstreamOnce, TestConcurrentSameKeyCallsLoaderOnce
エラーを保存しない         : TestUpstreamErrorsAreNotCached, TestErrorsAreNotCached
上限1,000で破棄            : TestEntryLimitEvictsOldest, TestEvictsOldestOverLimit
API キーがログに出ない     : TestKeyNotInLogs, TestTransportErrorDoesNotLeakKeyOrURL
一致判定（全ワードを含む） : TestContainsAll, TestKeyIgnoresOrderCaseWidth

デモ終了
```
