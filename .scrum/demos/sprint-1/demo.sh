#!/usr/bin/env bash
# Sprint 1 のデモ。使い方：bash demo.sh [コードのディレクトリ] [--rehearse]
# USE_MOCK=1 だけを使い、YouTube Data API は呼ばない。curl は 127.0.0.1 だけに向ける。
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE="${1:-$HERE/../../..}"
CODE="$(cd "$CODE" && pwd)"
# 第2引数 --rehearse は、待つ場面が無いので受け取って無視する。

TMP="$(mktemp -d)"
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do
    [ -n "$p" ] && kill "$p" 2>/dev/null
  done
  wait 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'
}

echo "== 準備: バイナリをビルドする =="
if ! (cd "$CODE/server" && go build -o "$TMP/server" .); then
  echo "ビルドに失敗した" >&2
  exit 1
fi
echo "ビルド完了（コード：$CODE/server）"

# start_server <名前> [環境変数...]  -> PORT と LOG を設定する
start_server() {
  local name="$1"; shift
  PORT="$(free_port)"
  LOG="$TMP/$name.log"
  : >"$LOG"
  env -u YOUTUBE_API_KEY -u USE_MOCK -u CACHE_TTL PORT="$PORT" "$@" "$TMP/server" >"$LOG" 2>&1 &
  PIDS+=("$!")
  local i
  for i in $(seq 1 100); do
    # 存在しないパスでも応答（4xx）が返れば待ち受け中。-f は使えないので status で判定する。
    if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/views?q=ready" ; then
      return 0
    fi
    sleep 0.1
  done
  echo "サーバーが10秒以内に起動しなかった" >&2
  cat "$LOG" >&2
  exit 1
}

MARK=0
mark() { MARK="$(wc -l <"$LOG")"; }
newlog() { tail -n +"$((MARK + 1))" "$LOG"; MARK="$(wc -l <"$LOG")"; }

# req <q の値>  -> HTTP ステータスと本文を表示する
req() {
  echo "\$ curl -G --data-urlencode 'q=$1' http://127.0.0.1:$PORT/api/views"
  curl -s -G --data-urlencode "q=$1" -w '\nHTTP %{http_code}\n' "http://127.0.0.1:$PORT/api/views"
}

# --- 場面 1 ---
echo
echo "== 場面 1: API キー無し、USE_MOCK 無しでサーバーを起動する =="
P1="$(free_port)"
env -u YOUTUBE_API_KEY -u USE_MOCK -u CACHE_TTL PORT="$P1" timeout 10 "$TMP/server" >"$TMP/s1.log" 2>&1
RC=$?
echo "終了コード: $RC"
echo "--- ログ ---"
cat "$TMP/s1.log"

# --- 場面 2 ---
echo
echo "== 場面 2: USE_MOCK=1 でサーバーを起動する =="
start_server main USE_MOCK=1
echo "ポート: $PORT"
echo "--- 起動ログ ---"
grep 'youtube client' "$LOG"
mark
newlog >/dev/null

# --- 場面 3 ---
echo
echo "== 場面 3: 「猫 ピアノ」を送る =="
req '猫 ピアノ'
echo "--- ログ ---"; newlog

# --- 場面 4 ---
echo
echo "== 場面 4: 語順・全角スペース・大文字を変えて送る =="
req 'ピアノ 猫'
req '猫　ピアノ'
req 'Cat Piano'
req 'cat　PIANO'
echo "--- ログ（同じキーなので hit になる） ---"; newlog

# --- 場面 5 ---
echo
echo "== 場面 5: q を空にして送る =="
req ''
echo "--- ログ ---"; newlog

# --- 場面 6 ---
echo
echo "== 場面 6: q=nomatch を送る =="
req 'nomatch'
echo "--- ログ ---"; newlog

# --- 場面 7 ---
echo
echo "== 場面 7: q=error を送る =="
req 'error'
echo "--- ログ（API キーや上流の生の応答が出ていないこと） ---"; newlog

# --- 場面 8 ---
echo
echo "== 場面 8: 新しいワード「犬 ギター」を2回送る =="
req '犬 ギター'
echo "--- ログ（1回目） ---"; newlog
req '犬 ギター'
echo "--- ログ（2回目） ---"; newlog

# --- 場面 9 ---
echo
echo "== 場面 9: CACHE_TTL=2s で起動し、送って3秒後にもう一度送る =="
start_server ttl USE_MOCK=1 CACHE_TTL=2s
echo "ポート: $PORT（CACHE_TTL=2s）"
mark
newlog >/dev/null
req '鳥 ドラム'
echo "--- ログ（1回目） ---"; newlog
echo "3秒待つ..."
sleep 3
req '鳥 ドラム'
echo "--- ログ（3秒後） ---"; newlog

# --- 補足 ---
echo
echo "== 補足: テストで示す項目（go test ./...） =="
(cd "$CODE/server" && go test ./... 2>&1)
TRC=$?
echo "go test の終了コード: $TRC"
echo "--- 対応するテスト ---"
echo "同時アクセスで上流1回      : TestConcurrentSameKeyCallsUpstreamOnce, TestConcurrentSameKeyCallsLoaderOnce"
echo "エラーを保存しない         : TestUpstreamErrorsAreNotCached, TestErrorsAreNotCached"
echo "上限1,000で破棄            : TestEntryLimitEvictsOldest, TestEvictsOldestOverLimit"
echo "API キーがログに出ない     : TestKeyNotInLogs, TestTransportErrorDoesNotLeakKeyOrURL"
echo "一致判定（全ワードを含む） : TestContainsAll, TestKeyIgnoresOrderCaseWidth"

echo
echo "デモ終了"
exit "$TRC"
