#!/usr/bin/env bash
# Sprint 6 のデモ。使い方：bash demo.sh [コードのディレクトリ] [--rehearse]
# USE_MOCK=1 だけを使い、YouTube Data API は呼ばない（YOUTUBE_API_KEY は環境から外す）。
# 接続先は 127.0.0.1 の自分のサーバだけ。ポートは空いているものを選ぶ（8080 は使わない）。
# 起動確認は /api/ 以外に向ける（/api/ への成功は、回数制限と1日のユニットの両方を消費するため）。
# 待つためのループで pgrep -f は使わない。サーバの起動待ちは curl を回数の上限つきで回す。
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

# 環境から外す変数（利用者の設定がデモに混ざらないようにする）
UNSET_ENV=(-u YOUTUBE_API_KEY -u CACHE_TTL -u RATE_LIMIT -u RATE_LIMIT_WINDOW -u TRUSTED_PROXY_HOPS -u DAILY_UNIT_LIMIT)

# start_mock <名前> <ポート> [環境変数...] -> モックのサーバを起動し、PID を SERVER_PIDS に足す。
# SERVER_PID に直前の PID を入れる。ログは $TMP/<名前>.log。
start_mock() {
  local name="$1" port="$2"; shift 2
  env "${UNSET_ENV[@]}" PORT="$port" USE_MOCK=1 "$@" "$TMP/server" >"$TMP/$name.log" 2>&1 &
  SERVER_PID="$!"
  SERVER_PIDS+=("$SERVER_PID")
  wait_for "http://127.0.0.1:$port/" "$name" || { cat "$TMP/$name.log" >&2; return 1; }
}

# run_fail <名前> [環境変数...] -> 起動に失敗するはずのサーバを実行し、ログを $TMP/<名前>.log、終了コードを RC に残す。
# 起動してしまった場合は 10 秒で止める（終了コード 124）。
run_fail() {
  local name="$1" port; shift
  port="$(free_port)"
  env "${UNSET_ENV[@]}" PORT="$port" USE_MOCK=1 "$@" timeout 10 "$TMP/server" >"$TMP/$name.log" 2>&1
  RC=$?
}

stop_server() { # stop_server <PID>
  kill "$1" 2>/dev/null
  wait "$1" 2>/dev/null
}

# get_i <URL> <名前> -> curl -i の出力をそのまま表示し、$TMP/<名前>.i に残す。HTTP_CODE と RETRY_AFTER（無ければ空）に入れる。
get_i() {
  local url="$1" name="$2"
  echo "\$ curl -i '$url'"
  curl -s -i "$url" >"$TMP/$name.i"
  cat "$TMP/$name.i"
  echo
  HTTP_CODE="$(head -n 1 "$TMP/$name.i" | awk '{print $2}')"
  RETRY_AFTER="$(grep -i '^retry-after:' "$TMP/$name.i" | tr -d '\r' | awk '{print $2}')"
}

# ---------------------------------------------------------------- サーバのビルド
echo "== 準備: Go サーバをビルドする（コード：$SERVER） =="
if ! (cd "$SERVER" && go build -o "$TMP/server" .); then
  echo "ビルドに失敗した" >&2
  exit 1
fi
echo "ビルド完了"

# ---------------------------------------------------------------- 場面 1
echo
echo "== 場面 1: DAILY_UNIT_LIMIT=202 で起動し、違うワードを curl -i で3回送る（#32） =="
P1="$(free_port)"
start_mock lim "$P1" DAILY_UNIT_LIMIT=202 RATE_LIMIT=100 || { echo "サーバが起動しなかった" >&2; exit 1; }
LIM_PID="$SERVER_PID"
echo "上限 202 ユニット（検索1回 = 101）のサーバ：http://127.0.0.1:$P1（モック）"
for w in alpha beta; do
  echo
  get_i "http://127.0.0.1:$P1/api/views?q=$w" "l$w"
done
echo
get_i "http://127.0.0.1:$P1/api/views?q=gamma" lgamma
# 比べる値：同じ時点の、太平洋時間（America/Los_Angeles）の次の 0 時までの秒数（date で求める）
NOW_EPOCH="$(date +%s)"
MIDNIGHT_EPOCH="$(TZ=America/Los_Angeles date -d 'tomorrow 00:00' +%s)"
EXPECT=$((MIDNIGHT_EPOCH - NOW_EPOCH))
echo "TZ=America/Los_Angeles の date で求めた、次の 0 時までの秒数：$EXPECT（Retry-After：${RETRY_AFTER:-なし}）"
echo "（求めた時刻のほうが、サーバが応答してから数秒あとなので、Retry-After は数秒だけ大きいのが正しい）"
if [ "$HTTP_CODE" = 503 ] && grep -q 'quota_exceeded' "$TMP/lgamma.i"; then
  ok "3回目は 503 quota_exceeded"
else
  ng "3回目が 503 quota_exceeded でない（$HTTP_CODE）"
fi
if [ "$(head -n 1 "$TMP/lalpha.i" | awk '{print $2}')" = 200 ] && [ "$(head -n 1 "$TMP/lbeta.i" | awk '{print $2}')" = 200 ]; then
  ok "1・2回目は 200"
else
  ng "1・2回目が 200 でない"
fi
if [[ "$RETRY_AFTER" =~ ^[0-9]+$ ]]; then
  DIFF=$((RETRY_AFTER - EXPECT))
  [ "$DIFF" -lt 0 ] && DIFF=$((-DIFF))
  if [ "$DIFF" -le 5 ]; then
    ok "Retry-After（$RETRY_AFTER）が、次の太平洋時間 0 時までの秒数（$EXPECT）と ${DIFF} 秒の差で一致"
  else
    ng "Retry-After（$RETRY_AFTER）と、次の太平洋時間 0 時までの秒数（$EXPECT）が $DIFF 秒ずれている"
  fi
else
  ng "3回目の 503 に整数の Retry-After が付いていない（${RETRY_AFTER:-なし}）"
fi
# 本文（ヘッダの後の部分）に数字が無い：残りのユニット数・使用量・上限の値（202、101 など）が出ていない
BODY="$(sed -n '/^\r\{0,1\}$/,$p' "$TMP/lgamma.i" | tail -n +2)"
if [ -n "$BODY" ] && ! printf '%s' "$BODY" | grep -q '[0-9]' && ! grep -qiE '^x-.*quota|^x-ratelimit' "$TMP/lgamma.i"; then
  ok "503 の本文に数字が無く、残り・使用量・上限を示すヘッダも無い（本文：$BODY）"
else
  ng "503 の本文に数字がある、または残量を示すヘッダがある"
fi
stop_server "$LIM_PID"

# ---------------------------------------------------------------- 場面 2
echo
echo "== 場面 2: 上限を 1000 にして quota を送り、別のワードを送る。ブラウザで検索する（#32） =="
P2="$(free_port)"
start_mock sup "$P2" DAILY_UNIT_LIMIT=1000 RATE_LIMIT=100 || { echo "サーバが起動しなかった" >&2; exit 1; }
SUP_PID="$SERVER_PID"
echo "上限 1000 ユニットのサーバ：http://127.0.0.1:$P2（モック）"
echo
get_i "http://127.0.0.1:$P2/api/views?q=quota" squota
QUOTA_RA="$RETRY_AFTER"
QUOTA_CODE="$HTTP_CODE"
get_i "http://127.0.0.1:$P2/api/views?q=delta" sdelta
DELTA_RA="$RETRY_AFTER"
DELTA_CODE="$HTTP_CODE"
if [ "$QUOTA_CODE" = 503 ] && [ "$QUOTA_RA" = 3600 ]; then
  ok "quota の 503 に Retry-After: 3600"
else
  ng "quota が 503 + Retry-After: 3600 でない（$QUOTA_CODE、${QUOTA_RA:-なし}）"
fi
if [ "$DELTA_CODE" = 503 ] && [[ "$DELTA_RA" =~ ^[0-9]+$ ]] && [ "$DELTA_RA" -ge 1 ] && [ "$DELTA_RA" -le 3600 ]; then
  ok "次のワードの 503 に 3600 以下の Retry-After（$DELTA_RA）。上流を呼ばない抑制中の残り秒数"
else
  ng "次のワードが 503 + 3600 以下の Retry-After でない（$DELTA_CODE、${DELTA_RA:-なし}）"
fi
stop_server "$SUP_PID"

echo
echo "--- 画面で確かめる（新しいサーバを起動する。最初の検索が quota なら、Retry-After は 3600 で固定になる） ---"
API_PORT="$(free_port)"
start_mock web "$API_PORT" DAILY_UNIT_LIMIT=1000 RATE_LIMIT=100 || { echo "画面用のサーバが起動しなかった" >&2; exit 1; }
echo "Go サーバ：http://127.0.0.1:$API_PORT（モック、上限 1000）"

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
    ok "見出し「いまは遊べません」、注記「ゲームは進んでいません。ターンは減っていません。」。data-retry-after=3600 のとき「あと約1時間で、もう一度遊べます。」。続けて抑制中の別のワードでは、3600 未満の値（3500 台）のとき「あと約60分で、もう一度遊べます。」"
  else
    ng "画面の確認が外れた（browser.mjs の終了コード $RC）"
  fi
else
  echo
  echo "Node 22 以上か Chrome（または Chromium）が無いため、画面の自動確認を飛ばした。" >&2
  echo "（未達）上の URL を開き、README の台本を手で試す。" >&2
  ng "画面の自動確認を実行できなかった（未達）"
fi

# ---------------------------------------------------------------- 場面 3
echo
echo "== 場面 3: CACHE_TTL を設定せず、24h、25h で起動する（#36） =="
echo
echo "--- CACHE_TTL を設定しない ---"
P3="$(free_port)"
start_mock ttl_unset "$P3" || { echo "サーバが起動しなかった" >&2; exit 1; }
TTL_PID="$SERVER_PID"
grep -E 'msg=cache ' "$TMP/ttl_unset.log"
if grep -qE 'msg=cache ttl=6h0m0s' "$TMP/ttl_unset.log"; then
  ok "未設定で起動し、既定の6時間（ttl=6h0m0s）"
else
  ng "起動ログに ttl=6h0m0s が無い"
fi
stop_server "$TTL_PID"

echo
echo "--- CACHE_TTL=24h ---"
start_mock ttl_24h "$P3" CACHE_TTL=24h || { echo "CACHE_TTL=24h でサーバが起動しなかった" >&2; cat "$TMP/ttl_24h.log" >&2; ng "24h で起動できない"; }
grep -E 'msg=cache ' "$TMP/ttl_24h.log"
if grep -qE 'msg=cache ttl=24h0m0s' "$TMP/ttl_24h.log"; then
  ok "24h は起動できる（ttl=24h0m0s）"
else
  ng "24h の起動ログに ttl=24h0m0s が無い"
fi
stop_server "$SERVER_PID"

echo
echo "--- CACHE_TTL=25h ---"
run_fail ttl_25h CACHE_TTL=25h
cat "$TMP/ttl_25h.log"
echo "終了コード: $RC"
if [ "$RC" -ne 0 ] && [ "$RC" -ne 124 ] && grep -q '24h0m0s' "$TMP/ttl_25h.log" && grep -q '25h' "$TMP/ttl_25h.log"; then
  ok "25h は起動に失敗し、エラーに上限（24h0m0s）と設定値（25h）が出る"
else
  ng "25h で想定どおりに失敗しない（終了コード $RC）"
fi

echo
echo "--- README の式と例（$CODE/README.md） ---"
grep -nE '^- (有効時間の既定|人気のワード1つが1日に使うユニット数)' "$CODE/README.md"
if grep -q '101 ×（24 ÷ 期限の時間）' "$CODE/README.md" && grep -q '2,424' "$CODE/README.md" && grep -q '404' "$CODE/README.md" && grep -qE '24時間なら 101' "$CODE/README.md"; then
  ok "README に式 101×(24÷期限の時間) と例（2,424／404／101）がある"
else
  ng "README に式か例（2,424／404／101）が無い"
fi

echo
echo "\$ go test -v ./ -run TestCacheMaxEntriesCoversDailyEntries   （server/ で実行）"
(cd "$SERVER" && env -u YOUTUBE_API_KEY go test -v -count=1 . -run 'TestCacheMaxEntriesCoversDailyEntries') 2>&1 | tee "$TMP/s3t.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && grep -q -- '--- PASS: TestCacheMaxEntriesCoversDailyEntries' "$TMP/s3t.log" && ! grep -q -- '--- FAIL' "$TMP/s3t.log"; then
  ok "件数の上限の式のテスト（TestCacheMaxEntriesCoversDailyEntries）が PASS"
else
  ng "TestCacheMaxEntriesCoversDailyEntries が失敗した、または PASS が出ていない"
fi

# ---------------------------------------------------------------- 場面 4
echo
echo "== 場面 4: CACHE_TTL= （空）で起動する。置き換えたテストを20回実行する（#29） =="
echo
echo "--- CACHE_TTL=（空） ---"
run_fail ttl_empty CACHE_TTL=
cat "$TMP/ttl_empty.log"
echo "終了コード: $RC"
if [ "$RC" -ne 0 ] && [ "$RC" -ne 124 ] && grep -q 'CACHE_TTL' "$TMP/ttl_empty.log"; then
  ok "空の CACHE_TTL は起動に失敗し、エラーに CACHE_TTL が出る"
else
  ng "空の CACHE_TTL で想定どおりに失敗しない（終了コード $RC）"
fi

echo
echo "--- 置き換えたテストを20回実行（4ファイル：App.test.tsx、quota.test.tsx、throttle.test.tsx、api/views.test.ts） ---"
echo "\$ vitest run src/App.test.tsx src/quota.test.tsx src/throttle.test.tsx src/api/views.test.ts   （×20、web/ で実行）"
VITEST_BIN="$CODE/web/node_modules/.bin/vitest"
PASS_RUNS=0
LINES=""
for i in $(seq 1 20); do
  OUT="$(cd "$CODE/web" && NO_COLOR=1 "$VITEST_BIN" run src/App.test.tsx src/quota.test.tsx src/throttle.test.tsx src/api/views.test.ts 2>&1)"
  RC=$?
  SUMMARY="$(printf '%s\n' "$OUT" | grep -E '^ *Tests ' | tr -s ' ')"
  printf '回 %2d: 終了コード %d,%s\n' "$i" "$RC" "$SUMMARY"
  if [ "$RC" -eq 0 ] && printf '%s' "$SUMMARY" | grep -q 'passed' && ! printf '%s' "$SUMMARY" | grep -q 'failed'; then
    PASS_RUNS=$((PASS_RUNS + 1))
  else
    printf '%s\n' "$OUT" | tail -n 30
  fi
  LINES="$LINES
$SUMMARY"
done
KINDS="$(printf '%s\n' "$LINES" | grep -v '^$' | sort -u | wc -l)"
echo "全 pass の回：$PASS_RUNS / 20"
if [ "$PASS_RUNS" -eq 20 ] && [ "$KINDS" -eq 1 ]; then
  ok "20回すべて全件 pass（件数は毎回同じ）"
else
  ng "全件 pass が $PASS_RUNS / 20 回（件数の種類 $KINDS）"
fi

# ---------------------------------------------------------------- 終了
echo
echo "デモ終了（確認 NG: $NG）"

if [ "$REHEARSE" = 1 ]; then
  [ "$NG" -eq 0 ]
  exit $?
fi

echo
echo "URL：$URL"
echo "自分で触れる状態で待っている（このサーバは抑制中なので、どのワードで検索しても「いまは遊べません」の画面になる。約1時間のうちの残りの時間が出る）。Enter で終了する。"
read -r _
[ "$NG" -eq 0 ]
exit $?
