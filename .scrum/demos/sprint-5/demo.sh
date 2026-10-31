#!/usr/bin/env bash
# Sprint 5 のデモ。使い方：bash demo.sh [コードのディレクトリ] [--rehearse]
# USE_MOCK=1 だけを使い、YouTube Data API は呼ばない（YOUTUBE_API_KEY は環境から外す）。
# 接続先は 127.0.0.1 の自分のサーバだけ。ポートは空いているものを選ぶ（8080 は使わない）。
# ネットワークを使うのは make vuln（脆弱性データベース、Docker のイメージ）だけ。
# 起動確認は /api/ 以外に向ける（/api/ への成功は、回数制限と1日のユニットの両方を消費するため）。
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

# start_mock <名前> <ポート> [環境変数...] -> モックのサーバを起動し、PID を SERVER_PIDS に足す。
# SERVER_PID に直前の PID を入れる。ログは $TMP/<名前>.log。
start_mock() {
  local name="$1" port="$2"; shift 2
  env -u YOUTUBE_API_KEY -u CACHE_TTL -u RATE_LIMIT -u RATE_LIMIT_WINDOW -u TRUSTED_PROXY_HOPS -u DAILY_UNIT_LIMIT \
    PORT="$port" USE_MOCK=1 "$@" "$TMP/server" >"$TMP/$name.log" 2>&1 &
  SERVER_PID="$!"
  SERVER_PIDS+=("$SERVER_PID")
  wait_for "http://127.0.0.1:$port/" "$name" || { cat "$TMP/$name.log" >&2; return 1; }
}

stop_server() { # stop_server <PID>
  kill "$1" 2>/dev/null
  wait "$1" 2>/dev/null
}

# fetch <URL> <名前> -> ステータスと本文を表示し、$TMP/<名前>.b に残す。HTTP_CODE に入れる。
fetch() {
  local url="$1" name="$2"; shift 2
  HTTP_CODE="$(curl -s -o "$TMP/$name.b" -w '%{http_code}' "$@" "$url")"
  echo "HTTP $HTTP_CODE  $(cat "$TMP/$name.b")"
}

# count_log <名前> <文字列> -> ログ中でその文字列を含む行数
count_log() { grep -c -- "$2" "$TMP/$1.log"; }

# ---------------------------------------------------------------- サーバのビルド
echo "== 準備: Go サーバをビルドする（コード：$SERVER） =="
if ! (cd "$SERVER" && go build -o "$TMP/server" .); then
  echo "ビルドに失敗した" >&2
  exit 1
fi
echo "ビルド完了"

# ---------------------------------------------------------------- 場面 1
echo
echo "== 場面 1: DAILY_UNIT_LIMIT=202 で起動し、違うワードで curl を3回、1回目のワードをもう一度（#26） =="
P1="$(free_port)"
start_mock lim "$P1" DAILY_UNIT_LIMIT=202 RATE_LIMIT=100 || { echo "サーバが起動しなかった" >&2; exit 1; }
LIM_PID="$SERVER_PID"
echo "上限 202 ユニット（検索1回 = search 100 + videos 1 = 101）のサーバ：http://127.0.0.1:$P1（モック）"
CODES=""
for w in alpha beta gamma; do
  echo
  echo "\$ curl 'http://127.0.0.1:$P1/api/views?q=$w'"
  fetch "http://127.0.0.1:$P1/api/views?q=$w" "w$w"
  CODES="$CODES $HTTP_CODE"
done
echo
echo "\$ curl 'http://127.0.0.1:$P1/api/views?q=alpha'   （1回目のワードをもう一度）"
fetch "http://127.0.0.1:$P1/api/views?q=alpha" walpha2
CODES="$CODES $HTTP_CODE"
echo
echo "--- サーバのログ（WARN 以上） ---"
grep -E 'level=(WARN|ERROR)' "$TMP/lim.log"
if [ "$CODES" = " 200 200 503 200" ] && grep -q 'quota_exceeded' "$TMP/wgamma.b"; then
  ok "1・2回目は 200、3回目は 503 quota_exceeded、1回目のワードの再送はキャッシュから 200"
else
  ng "ステータスが 200 200 503 200 でない、または 3回目に quota_exceeded が無い（$CODES）"
fi
N="$(count_log lim 'daily unit limit reached')"
if [ "$N" = 1 ]; then
  ok "ログに「daily unit limit reached」が 1 回だけ出た"
else
  ng "「daily unit limit reached」が $N 回（期待は 1 回）"
fi
stop_server "$LIM_PID"

# ---------------------------------------------------------------- 場面 2
echo
echo "== 場面 2: 上限を 1000 にして quota を送り、そのあと別のワードを2つ（#26） =="
P2="$(free_port)"
start_mock sup "$P2" DAILY_UNIT_LIMIT=1000 RATE_LIMIT=100 || { echo "サーバが起動しなかった" >&2; exit 1; }
SUP_PID="$SERVER_PID"
echo "上限 1000 ユニットのサーバ：http://127.0.0.1:$P2（モック）"
CODES=""
for w in quota delta epsilon; do
  echo
  echo "\$ curl 'http://127.0.0.1:$P2/api/views?q=$w'"
  fetch "http://127.0.0.1:$P2/api/views?q=$w" "s$w"
  CODES="$CODES $HTTP_CODE"
done
echo
echo "--- サーバのログ（WARN 以上） ---"
grep -E 'level=(WARN|ERROR)' "$TMP/sup.log"
if [ "$CODES" = " 503 503 503" ]; then
  ok "quota も、後の2つ（モックなら 200 になるワード）も 503。上流を呼んでいない"
else
  ng "3回とも 503 にならない（$CODES）"
fi
N1="$(count_log sup 'upstream calls suppressed after quotaExceeded')"
N2="$(count_log sup 'youtube quota exceeded')"
if [ "$N1" = 1 ] && [ "$N2" = 1 ]; then
  ok "抑制の開始のログは 1 回だけ。上流の quotaExceeded を受けたのも 1 回だけ（後の2つは上流に届いていない）"
else
  ng "抑制の開始 $N1 回、上流の quotaExceeded $N2 回（期待は両方 1 回）"
fi
stop_server "$SUP_PID"

echo
echo "\$ go test -v ./internal/quota/ -run 'TestSuppressionBoundaryAndResume|TestPacificMidnightResets|TestPacificMidnightInWinter|TestLimitBoundary'"
(cd "$SERVER" && env -u YOUTUBE_API_KEY go test -v -count=1 ./internal/quota/ -run 'TestSuppressionBoundaryAndResume|TestPacificMidnightResets|TestPacificMidnightInWinter|TestLimitBoundary') 2>&1 | tee "$TMP/s2t.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && ! grep -q -- '--- FAIL' "$TMP/s2t.log" \
  && grep -q -- '--- PASS: TestSuppressionBoundaryAndResume' "$TMP/s2t.log" \
  && grep -q -- '--- PASS: TestPacificMidnightResets' "$TMP/s2t.log" \
  && grep -q -- '--- PASS: TestPacificMidnightInWinter' "$TMP/s2t.log" \
  && grep -q -- '--- PASS: TestLimitBoundary' "$TMP/s2t.log"; then
  ok "1時間の抑制の境界（59分59秒と1時間ちょうど）、太平洋時間 0 時の切り替え（PDT・PST）、上限の境界が PASS"
else
  ng "quota のテストが失敗した、または PASS が出ていない"
fi

# ---------------------------------------------------------------- 場面 3
echo
echo "== 場面 3: make vuln と go.mod・Makefile の該当行（#28） =="
echo "--- go.mod ---"
grep -nE '^(go |toolchain |require )' "$SERVER/go.mod"
echo "--- Makefile のイメージの行 ---"
grep -nE '^(GO_IMAGE|GOVULNCHECK_VERSION)' "$SERVER/Makefile"
if grep -q 'golang.org/x/text v0.41.0' "$SERVER/go.mod" && grep -qE '^GO_IMAGE := .*@sha256:[0-9a-f]{64}' "$SERVER/Makefile"; then
  ok "x/text v0.41.0、イメージは @sha256: で固定"
else
  ng "go.mod か Makefile が想定と異なる"
fi
echo
echo "\$ make vuln"
(cd "$SERVER" && env -u YOUTUBE_API_KEY make vuln) 2>&1 | tee "$TMP/s3v.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && grep -q 'No vulnerabilities found\.' "$TMP/s3v.log" && ! grep -q 'modules you require' "$TMP/s3v.log"; then
  ok "make vuln が終了コード 0 で「No vulnerabilities found.」。「modules you require」の注記は無い"
else
  ng "make vuln が非 0、または No vulnerabilities found. が無い、または「modules you require」の注記が残っている"
fi

# ---------------------------------------------------------------- 場面 4
echo
echo "== 場面 4: RATE_LIMIT=2 で起動し、カウントダウンで3回続けて検索する（#25） =="
API_PORT="$(free_port)"
start_mock web "$API_PORT" RATE_LIMIT=2 || { echo "画面用のサーバが起動しなかった" >&2; exit 1; }
echo "Go サーバ：http://127.0.0.1:$API_PORT（モック、RATE_LIMIT=2、窓は既定の1分）"

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
    ok "3回目に「操作が多すぎます。」が出る。ターンと履歴は2回目の後のまま。再試行ボタンとエラー表示は無い"
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
echo "\$ npx vitest run src/throttle.test.tsx   （入力が残ること、秒数の出し方、対戦・チャージの扱いはテストで示す）"
(cd "$CODE/web" && npx vitest run src/throttle.test.tsx) 2>&1 | tail -n 40 | tee "$TMP/s4t.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && ! grep -Eq 'FAIL|failed' "$TMP/s4t.log"; then
  ok "throttle.test.tsx が全件 pass"
else
  ng "throttle.test.tsx が失敗した"
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
echo "自分で触れる状態で待っている（このサーバは RATE_LIMIT=2。3回続けて検索すると制限の表示になる）。Enter で終了する。"
read -r _
[ "$NG" -eq 0 ]
exit $?
