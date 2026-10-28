#!/usr/bin/env bash
# Sprint 2 のデモ。使い方：bash demo.sh [コードのディレクトリ] [--rehearse]
# USE_MOCK=1 だけを使い、YouTube Data API は呼ばない。接続先は 127.0.0.1 だけ。
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$HERE"
CODE="${1:-$HERE/../../..}"
CODE="$(cd "$CODE" && pwd)"
REHEARSE=0
[ "${2:-}" = "--rehearse" ] && REHEARSE=1

TMP="$(mktemp -d)"
GO_PID=""
VITE_PID=""
cleanup() {
  # Vite は setsid で独立したプロセスグループにしてあるので、孫プロセスごと止める。
  if [ -n "$VITE_PID" ]; then
    kill -- "-$VITE_PID" 2>/dev/null || kill "$VITE_PID" 2>/dev/null
  fi
  if [ -n "$GO_PID" ]; then
    kill "$GO_PID" 2>/dev/null
  fi
  wait 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

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

echo "== 準備: Go サーバをビルドして起動する（USE_MOCK=1） =="
if ! (cd "$CODE/server" && go build -o "$TMP/server" .); then
  echo "ビルドに失敗した" >&2
  exit 1
fi
GO_PORT="$(free_port)"
env -u YOUTUBE_API_KEY -u CACHE_TTL PORT="$GO_PORT" USE_MOCK=1 "$TMP/server" >"$TMP/go.log" 2>&1 &
GO_PID=$!
wait_for "http://127.0.0.1:$GO_PORT/api/views?q=ready" "Go サーバ" || { cat "$TMP/go.log" >&2; exit 1; }
echo "Go サーバ：http://127.0.0.1:$GO_PORT（モック）"

echo "== 準備: Vite の開発サーバを起動する =="
WEB_PORT="$(free_port)"
VITE_BIN="$CODE/web/node_modules/.bin/vite"
if [ ! -x "$VITE_BIN" ]; then
  echo "web/node_modules が無い。先に (cd web && npm ci) を実行する" >&2
  exit 1
fi
(cd "$CODE/web" && exec env API_PROXY_TARGET="http://127.0.0.1:$GO_PORT" setsid "$VITE_BIN" --port "$WEB_PORT" --strictPort --host 127.0.0.1 >"$TMP/vite.log" 2>&1) &
VITE_PID=$!
wait_for "http://127.0.0.1:$WEB_PORT/" "Vite" || { cat "$TMP/vite.log" >&2; exit 1; }
URL="http://127.0.0.1:$WEB_PORT/"
echo "画面：$URL（スマホ幅で開くと見やすい。ブラウザの開発者ツールで幅 390px にする）"

if [ "$REHEARSE" = 1 ]; then
  SHOTS="$DEMO_DIR/shots/$(date +%Y%m%dT%H%M%S)"
else
  SHOTS="$TMP/shots"
fi
echo "スクリーンショットの出力先：$SHOTS"

RC=0
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
else
  echo
  echo "Node 22 以上か Chrome（または Chromium）が無いため、画面の自動確認を飛ばした。" >&2
  echo "（未達）上の URL を開き、README の台本を手で試す。" >&2
  RC=3
fi

echo
echo "== 補足: テストで示す項目（チャージのクリアは画面の目標がランダムなのでテストで示す） =="
(cd "$CODE/web" && npm test 2>&1 | tail -n 15)
echo "npm test の終了コード：${PIPESTATUS[0]}"
(cd "$CODE/server" && go test ./... 2>&1)
echo "go test の終了コード：$?"
echo "--- チャージのクリアに対応するテスト ---"
echo "web/src/modes/charge/judge.test.ts      : 「ちょうど目標はクリア、1 足りなければ続行」「ちょうど上限はバーストでなくクリア、上限 +1 はバースト」「最終ターンでちょうど目標ならターン切れより先にクリア」"
echo "web/src/modes/charge/ChargeMode.test.tsx: 「ちょうど目標はクリア。detail は小数 1 桁」「ちょうど上限(510,000,000)はクリア」"

if [ "$REHEARSE" = 1 ]; then
  echo
  echo "デモ終了（リハーサル）"
  exit "$RC"
fi

echo
echo "URL：$URL"
echo "自分で触れる状態で待っている。Enter で終了する。"
read -r _
exit "$RC"
