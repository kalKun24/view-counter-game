#!/usr/bin/env bash
# Sprint 4 のデモ。使い方：bash demo.sh [コードのディレクトリ] [--rehearse]
# USE_MOCK=1 だけを使い、YouTube Data API は呼ばない（YOUTUBE_API_KEY は環境から外す）。
# 接続先は 127.0.0.1 の自分のサーバだけ。ポートは空いているものを選ぶ（8080 は使わない）。
# ネットワークを使うのは make vuln（脆弱性データベース）と、初回の make test-race（依存取得）だけ。
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$HERE"
CODE="${1:-$HERE/../../..}"
CODE="$(cd "$CODE" && pwd)"
REHEARSE=0
[ "${2:-}" = "--rehearse" ] && REHEARSE=1

SERVER="$CODE/server"
TMP="$(mktemp -d)"
SERVER_PIDS=()
VITE_PID=""
cleanup() {
  # Vite は setsid で独立したプロセスグループにしてあるので、孫プロセスごと止める。
  if [ -n "$VITE_PID" ]; then
    kill -- "-$VITE_PID" 2>/dev/null || kill "$VITE_PID" 2>/dev/null
  fi
  local p
  for p in "${SERVER_PIDS[@]:-}"; do
    [ -n "$p" ] && kill "$p" 2>/dev/null
  done
  wait 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

NG=0
ok() { echo "確認 OK: $1"; }
ng() { echo "確認 NG: $1"; NG=$((NG + 1)); }

free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'
}

wait_for() { # wait_for <url> <名前>
  local i
  for i in $(seq 1 100); do
    if curl -s -o /dev/null "$1"; then return 0; fi
    sleep 0.1
  done
  echo "$2 が10秒以内に起動しなかった" >&2
  return 1
}

# start_mock <名前> <ポート> [環境変数...] -> モックのサーバを起動し、PID を SERVER_PIDS に足す
start_mock() {
  local name="$1" port="$2"; shift 2
  env -u YOUTUBE_API_KEY -u CACHE_TTL -u RATE_LIMIT -u RATE_LIMIT_WINDOW -u TRUSTED_PROXY_HOPS \
    PORT="$port" USE_MOCK=1 "$@" "$TMP/server" >"$TMP/$name.log" 2>&1 &
  SERVER_PIDS+=("$!")
  # 起動確認は /api/ 以外に向ける（/api/ への成功は制限の回数に数えられるため）。404 でも待ち受けの確認には足りる。
  wait_for "http://127.0.0.1:$port/" "$name" || { cat "$TMP/$name.log" >&2; return 1; }
}

# fetch <URL> <名前> -> ステータス行・ヘッダ・本文を表示し、$TMP/<名前>.{h,b} に残す。HTTP_CODE に入れる。
fetch() {
  local url="$1" name="$2"; shift 2
  HTTP_CODE="$(curl -s -D "$TMP/$name.h" -o "$TMP/$name.b" -w '%{http_code}' "$@" "$url")"
  echo "HTTP $HTTP_CODE"
  grep -iE '^(retry-after|content-type):' "$TMP/$name.h" | tr -d '\r'
  cat "$TMP/$name.b"
  echo
}

# ---------------------------------------------------------------- 場面 1
echo "== 場面 1: make vuln と make test-race（#21） =="
echo "--- go.mod ---"
grep -nE '^(go |toolchain |require )' "$SERVER/go.mod"
echo "--- Makefile のイメージの行 ---"
grep -nE '^(GO_IMAGE|GOVULNCHECK_VERSION)' "$SERVER/Makefile"
if grep -q 'golang.org/x/text v0.39.0' "$SERVER/go.mod" && grep -q '^toolchain go1.26.10' "$SERVER/go.mod" \
  && grep -q 'golang:1.26.10-bookworm' "$SERVER/Makefile"; then
  ok "x/text v0.39.0、toolchain go1.26.10、イメージ golang:1.26.10-bookworm"
else
  ng "go.mod か Makefile の版が想定と異なる"
fi

echo
echo "\$ make vuln"
(cd "$SERVER" && env -u YOUTUBE_API_KEY make vuln) 2>&1 | tee "$TMP/s1v.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && grep -qE 'No vulnerabilities found|affected by 0 vulnerabilities' "$TMP/s1v.log"; then
  ok "make vuln が終了コード 0、呼び出される脆弱性は 0 件（module レベルの未呼び出しの検出は出力に残りうる）"
else
  ng "make vuln が非 0 で終了した、または No vulnerabilities found が出ていない"
fi

echo
echo "\$ make test-race"
(cd "$SERVER" && env -u YOUTUBE_API_KEY make test-race) 2>&1 | tee "$TMP/s1t.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && ! grep -Eq '^(FAIL|---)' "$TMP/s1t.log" && grep -q '^ok' "$TMP/s1t.log"; then
  ok "全パッケージ ok（ok 行 $(grep -c '^ok' "$TMP/s1t.log") 件、FAIL なし）"
else
  ng "make test-race が失敗した、または ok が出ていない"
fi

# ---------------------------------------------------------------- サーバのビルド
echo
echo "== 準備: Go サーバをビルドする（コード：$SERVER） =="
if ! (cd "$SERVER" && go build -o "$TMP/server" .); then
  echo "ビルドに失敗した" >&2
  exit 1
fi
echo "ビルド完了"

# ---------------------------------------------------------------- 場面 2
echo
echo "== 場面 2: RATE_LIMIT=3 で起動して curl を4回、長すぎるワードと語数超過、静的ファイルと XFF（#7） =="
LIM_PORT="$(free_port)"
start_mock limited "$LIM_PORT" RATE_LIMIT=3 || { echo "RATE_LIMIT=3 のサーバが起動しなかった" >&2; exit 1; }
echo "制限 3回/分のサーバ：http://127.0.0.1:$LIM_PORT（モック）"
CODES=""
for i in 1 2 3 4; do
  echo
  echo "\$ curl -i 'http://127.0.0.1:$LIM_PORT/api/views?q=foo'   （$i 回目）"
  fetch "http://127.0.0.1:$LIM_PORT/api/views?q=foo" "lim$i"
  CODES="$CODES $HTTP_CODE"
done
if [ "$CODES" = " 200 200 200 429" ] && grep -qi '^retry-after: [0-9]' "$TMP/lim4.h" && grep -q 'too_many_requests' "$TMP/lim4.b"; then
  ok "1〜3回目は 200、4回目は 429 で Retry-After があり too_many_requests"
else
  ng "ステータスが 200 200 200 429 でない、または Retry-After / too_many_requests が無い（$CODES）"
fi

BIG_PORT="$(free_port)"
start_mock big "$BIG_PORT" RATE_LIMIT=1000 || { echo "RATE_LIMIT=1000 のサーバが起動しなかった" >&2; exit 1; }
echo
echo "制限を大きくしたサーバ：http://127.0.0.1:$BIG_PORT（モック。場面 3 でも使う）"
LONG="$(python3 -c 'print("a"*51)')"
echo
echo "\$ curl -G --data-urlencode 'q=<a を51文字>' http://127.0.0.1:$BIG_PORT/api/views"
fetch "http://127.0.0.1:$BIG_PORT/api/views" long -G --data-urlencode "q=$LONG"
if [ "$HTTP_CODE" = "400" ] && grep -q 'invalid_query' "$TMP/long.b"; then
  ok "51文字のワードは 400 invalid_query"
else
  ng "51文字のワードが 400 invalid_query にならない（$HTTP_CODE）"
fi
echo "\$ curl -G --data-urlencode 'q=a b c d e f' http://127.0.0.1:$BIG_PORT/api/views"
fetch "http://127.0.0.1:$BIG_PORT/api/views" six -G --data-urlencode "q=a b c d e f"
if [ "$HTTP_CODE" = "400" ] && grep -q 'invalid_query' "$TMP/six.b"; then
  ok "6語の q は 400 invalid_query"
else
  ng "6語の q が 400 invalid_query にならない（$HTTP_CODE）"
fi
echo "\$ curl -G --data-urlencode 'q=a b c d e' http://127.0.0.1:$BIG_PORT/api/views   （5語は通る）"
fetch "http://127.0.0.1:$BIG_PORT/api/views" five -G --data-urlencode "q=a b c d e"
if [ "$HTTP_CODE" = "200" ]; then
  ok "5語の q は 200"
else
  ng "5語の q が 200 にならない（$HTTP_CODE）"
fi

echo
echo "\$ go test ./internal/api -run 'TestRateLimitSkipsNonAPIPaths|TestClientIP|TestSpoofedXFFDoesNotBypassLimit' -v"
(cd "$SERVER" && env -u YOUTUBE_API_KEY go test ./internal/api -run 'TestRateLimitSkipsNonAPIPaths|TestClientIP|TestSpoofedXFFDoesNotBypassLimit' -v -count=1) 2>&1 | tee "$TMP/s2t.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && grep -q -- '--- PASS: TestRateLimitSkipsNonAPIPaths' "$TMP/s2t.log" \
  && grep -q -- '--- PASS: TestClientIP' "$TMP/s2t.log" \
  && grep -q -- '--- PASS: TestSpoofedXFFDoesNotBypassLimit' "$TMP/s2t.log" \
  && ! grep -q -- '--- FAIL' "$TMP/s2t.log"; then
  ok "静的ファイルを数えないこと、クライアント IP の取り方、偽の X-Forwarded-For で回避できないことが PASS"
else
  ng "静的ファイル・XFF のテストが失敗した、または PASS が出ていない"
fi

# ---------------------------------------------------------------- 場面 3
echo
echo "== 場面 3: q=quota で curl を2回（#10） =="
CODES=""
for i in 1 2; do
  echo
  echo "\$ curl -i 'http://127.0.0.1:$BIG_PORT/api/views?q=quota'   （$i 回目）"
  fetch "http://127.0.0.1:$BIG_PORT/api/views?q=quota" "quota$i"
  CODES="$CODES $HTTP_CODE"
  grep -q 'quota_exceeded' "$TMP/quota$i.b" || CODES="$CODES(code無し)"
done
if [ "$CODES" = " 503 503" ]; then
  ok "2回とも 503 と quota_exceeded（キャッシュされず、同じ応答）"
else
  ng "2回とも 503 quota_exceeded にならない（$CODES）"
fi

echo
echo "\$ go test ./internal/api -run TestQuotaVersusOtherUpstreamErrors -v"
(cd "$SERVER" && env -u YOUTUBE_API_KEY go test ./internal/api -run TestQuotaVersusOtherUpstreamErrors -v -count=1) 2>&1 | tee "$TMP/s3t.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && grep -q -- '--- PASS: TestQuotaVersusOtherUpstreamErrors' "$TMP/s3t.log" && ! grep -q -- '--- FAIL' "$TMP/s3t.log"; then
  ok "quotaExceeded は 503、dailyLimitExceeded を含む他の 403 は 502 であることが PASS"
else
  ng "TestQuotaVersusOtherUpstreamErrors が失敗した、または PASS が出ていない"
fi

# ---------------------------------------------------------------- 場面 4
echo
echo "== 場面 4: カウントダウンの途中で quota を入れる（#11） =="
# 画面用のサーバ。制限は既定のまま（画面の操作は十分に少ない）。
API_PORT="$(free_port)"
start_mock web "$API_PORT" || { echo "画面用のサーバが起動しなかった" >&2; exit 1; }
echo "Go サーバ：http://127.0.0.1:$API_PORT（モック）"

WEB_PORT="$(free_port)"
VITE_BIN="$CODE/web/node_modules/.bin/vite"
if [ ! -x "$VITE_BIN" ]; then
  echo "web/node_modules が無い。先に (cd web && npm ci) を実行する" >&2
  exit 1
fi
(cd "$CODE/web" && exec env API_PROXY_TARGET="http://127.0.0.1:$API_PORT" setsid "$VITE_BIN" --port "$WEB_PORT" --strictPort --host 127.0.0.1 >"$TMP/vite.log" 2>&1) &
VITE_PID=$!
wait_for "http://127.0.0.1:$WEB_PORT/" "Vite" || { cat "$TMP/vite.log" >&2; exit 1; }
URL="http://127.0.0.1:$WEB_PORT/"
echo "画面：$URL（スマホ幅で開くと見やすい。開発者ツールで幅 390px にする）"

if [ "$REHEARSE" = 1 ]; then
  SHOTS="$DEMO_DIR/shots/$(date +%Y%m%dT%H%M%S)"
else
  SHOTS="$TMP/shots"
fi
echo "スクリーンショットの出力先：$SHOTS"

NODE_OK=0
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; then
  NODE_OK=1
fi
CHROME_OK=0
if [ -n "${DEMO_CHROME:-}" ] && [ -x "$DEMO_CHROME" ]; then CHROME_OK=1; fi
for c in google-chrome google-chrome-stable chromium chromium-browser; do
  command -v "$c" >/dev/null 2>&1 && CHROME_OK=1
done

if [ "$NODE_OK" = 1 ] && [ "$CHROME_OK" = 1 ]; then
  echo
  node "$DEMO_DIR/browser.mjs" "$DEMO_DIR/scenes.json" "$URL" "$SHOTS"
  RC=$?
  echo "browser.mjs の終了コード：$RC"
  if [ "$RC" -eq 0 ]; then
    ok "「今日は遊べません」が出て、GAME OVER にならず、残りターンも変わらない。再試行ボタンが無く、ホームへ戻れる"
  else
    ng "画面の確認が外れた（browser.mjs の終了コード $RC）"
  fi
else
  echo
  echo "Node 22 以上か Chrome（または Chromium）が無いため、画面の自動確認を飛ばした。" >&2
  echo "（未達）上の URL を開き、README の台本を手で試す。" >&2
  ng "画面の自動確認を実行できなかった（未達）"
fi

echo
echo "\$ npx vitest run src/quota.test.tsx   （チャージ・対戦の扱いはテストで示す）"
(cd "$CODE/web" && npx vitest run src/quota.test.tsx) 2>&1 | tail -n 40 | tee "$TMP/s4t.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && ! grep -Eq 'FAIL|failed' "$TMP/s4t.log"; then
  ok "quota.test.tsx が全件 pass"
else
  ng "quota.test.tsx が失敗した"
fi

# ---------------------------------------------------------------- 場面 5
echo
echo "== 場面 5: go test ./internal/youtube/ -run Timeout -v（#22） =="
(cd "$SERVER" && env -u YOUTUBE_API_KEY go test ./internal/youtube/ -run Timeout -v -count=1) 2>&1 | tee "$TMP/s5t.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && grep -q -- '--- PASS: TestNilHTTPClientTimeoutOnHangingServer' "$TMP/s5t.log" && ! grep -q -- '--- FAIL' "$TMP/s5t.log"; then
  ok "応答しない偽サーバへの呼び出しが打ち切られ、PASS（$(grep -c -- '--- PASS' "$TMP/s5t.log") 件）"
else
  ng "Timeout のテストが失敗した、または PASS が出ていない"
fi
echo
echo "--- youtube.go で http.DefaultClient を探す（コメントも含めて 0 件のはず） ---"
grep -n 'http.DefaultClient' "$SERVER/internal/youtube/youtube.go" || echo "（見つからない）"
if ! grep -q 'http.DefaultClient' "$SERVER/internal/youtube/youtube.go"; then
  ok "youtube.go に http.DefaultClient が無い"
else
  ng "youtube.go に http.DefaultClient が残っている"
fi
echo "--- 既定のタイムアウトの定数と、nil のときの組み立て ---"
grep -nE 'DefaultHTTPTimeout|hc = &http.Client' "$SERVER/internal/youtube/youtube.go"

# ---------------------------------------------------------------- 終了
echo
if [ "$NG" -eq 0 ]; then
  echo "デモ終了（確認 NG: 0）"
else
  echo "デモ終了（確認 NG: $NG）"
fi

if [ "$REHEARSE" = 1 ]; then
  [ "$NG" -eq 0 ]
  exit $?
fi

echo
echo "URL：$URL"
echo "自分で触れる状態で待っている（検索ワードに quota を入れるとクォータ切れの画面になる）。Enter で終了する。"
read -r _
[ "$NG" -eq 0 ]
exit $?
