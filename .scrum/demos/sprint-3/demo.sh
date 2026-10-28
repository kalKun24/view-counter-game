#!/usr/bin/env bash
# Sprint 3 のデモ。使い方：bash demo.sh [コードのディレクトリ] [--rehearse]
# ネットワークを使うのは make test-race（初回の依存取得）と make vuln（脆弱性データベース）だけ。
# YouTube Data API は呼ばない（YOUTUBE_API_KEY は環境から外す）。ポート 8080 は使わない。
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

NG=0
ok() { echo "確認 OK: $1"; }
ng() { echo "確認 NG: $1"; NG=$((NG + 1)); }

free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'
}

SERVER="$CODE/server"

# --- 場面 1 ---
echo "== 場面 1: make test-race（Docker 内で go test -race） =="
(cd "$SERVER" && env -u YOUTUBE_API_KEY make test-race) 2>&1 | tee "$TMP/s1.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && ! grep -Eq '^(FAIL|---)' "$TMP/s1.log" && grep -q '^ok' "$TMP/s1.log"; then
  ok "全パッケージ ok（ok 行 $(grep -c '^ok' "$TMP/s1.log") 件、FAIL なし）"
else
  ng "make test-race が失敗した、または ok が出ていない"
fi

# --- 場面 2 ---
echo
echo "== 場面 2: make vuln（govulncheck） =="
(cd "$SERVER" && env -u YOUTUBE_API_KEY make vuln) 2>&1 | tee "$TMP/s2.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ]; then
  ok "検出なし（No vulnerabilities found）。#21 が済んでいる場合の結果である"
elif grep -q 'GO-2026-6809' "$TMP/s2.log" && grep -q 'GO-2026-5970' "$TMP/s2.log"; then
  ok "検出あり（#21 で修正予定）: GO-2026-6809、GO-2026-5970 が出力に含まれる。NG には数えない"
elif grep -q 'GO-20' "$TMP/s2.log"; then
  echo "検出あり（#21 で修正予定）。ただし ID が想定（GO-2026-6809、GO-2026-5970）と異なる:"
  grep -o 'GO-[0-9]*-[0-9]*' "$TMP/s2.log" | sort -u
  ok "govulncheck の結果が出た（NG には数えない）"
else
  ng "govulncheck の結果（検出の ID）が出力に無い。実行自体が失敗した可能性がある"
fi

# --- 場面 3 ---
echo
echo "== 場面 3: go test ./internal/youtube -run 'VideosList|SearchList|StrictFake' -v（#16） =="
(cd "$SERVER" && env -u YOUTUBE_API_KEY go test ./internal/youtube -run 'VideosList|SearchList|StrictFake' -v -count=1) 2>&1 | tee "$TMP/s3.log"
RC=${PIPESTATUS[0]}
echo "終了コード: $RC"
if [ "$RC" -eq 0 ] && grep -q -- '--- PASS' "$TMP/s3.log" && ! grep -q -- '--- FAIL' "$TMP/s3.log"; then
  ok "pass（$(grep -c -- '--- PASS' "$TMP/s3.log") 件、FAIL なし）"
else
  ng "テストが失敗した、または pass が出ていない"
fi
echo "--- README の「YouTube Data API との突合」の表 ---"
grep -n '^## YouTube Data API との突合' "$CODE/README.md" || echo "見出しが見つからない"
if grep -q '^## YouTube Data API との突合' "$CODE/README.md"; then
  ok "README.md に突合の節がある"
  awk '/^## YouTube Data API との突合/{f=1;next} /^## /{f=0} f' "$CODE/README.md"
else
  ng "README.md に突合の節が無い"
fi

# --- 場面 4 ---
echo
echo "== 場面 4: go test ./internal/cache -run Panic -v / go test ./internal/api -run Panic -v（#17） =="
(cd "$SERVER" && env -u YOUTUBE_API_KEY go test ./internal/cache -run Panic -v -count=1) 2>&1 | tee "$TMP/s4a.log"
RCA=${PIPESTATUS[0]}
(cd "$SERVER" && env -u YOUTUBE_API_KEY go test ./internal/api -run Panic -v -count=1) 2>&1 | tee "$TMP/s4b.log"
RCB=${PIPESTATUS[0]}
if [ "$RCA" -eq 0 ] && [ "$RCB" -eq 0 ] \
  && grep -q -- '--- PASS' "$TMP/s4a.log" && grep -q -- '--- PASS' "$TMP/s4b.log" \
  && ! grep -q -- '--- FAIL' "$TMP/s4a.log" "$TMP/s4b.log"; then
  ok "cache と api の Panic テストが pass（cache $(grep -c -- '--- PASS' "$TMP/s4a.log") 件、api $(grep -c -- '--- PASS' "$TMP/s4b.log") 件）"
else
  ng "Panic テストが失敗した、または pass が出ていない（cache=$RCA、api=$RCB）"
fi

# --- 場面 5 ---
echo
echo "== 場面 5: USE_MOCK と YOUTUBE_API_KEY の矛盾・不正な値でサーバを起動する（#18） =="
if ! (cd "$SERVER" && go build -o "$TMP/server" .); then
  echo "ビルドに失敗した" >&2
  ng "バイナリをビルドできなかった"
  echo
  echo "デモ終了（NG: $NG）"
  exit 1
fi
echo "ビルド完了（コード：$SERVER）"

# run_fail <名前> [環境変数...]  -> 起動失敗の出力を $TMP/<名前>.log に残し、終了コードを RC に入れる
run_fail() {
  local name="$1"; shift
  local port; port="$(free_port)"
  env -u YOUTUBE_API_KEY -u USE_MOCK -u CACHE_TTL PORT="$port" "$@" timeout 10 "$TMP/server" >"$TMP/$name.log" 2>&1
  RC=$?
  echo "終了コード: $RC"
  echo "--- 出力 ---"
  cat "$TMP/$name.log"
}

echo
echo "-- 5a: USE_MOCK=1 YOUTUBE_API_KEY=dummy-demo-key --"
run_fail s5a USE_MOCK=1 YOUTUBE_API_KEY=dummy-demo-key
if [ "$RC" -eq 1 ] && grep -q 'USE_MOCK' "$TMP/s5a.log" && grep -q 'YOUTUBE_API_KEY' "$TMP/s5a.log" \
  && ! grep -q 'dummy-demo-key' "$TMP/s5a.log"; then
  ok "終了コード 1、両方の変数名が出て、dummy-demo-key は出ない"
else
  ng "終了コード 1、両方の変数名、キーの値が出ないこと、のいずれかを満たさない"
fi

echo
echo "-- 5b: USE_MOCK=true（1 以外の値） --"
run_fail s5b USE_MOCK=true
if [ "$RC" -eq 1 ] && grep -q 'USE_MOCK' "$TMP/s5b.log" && grep -q 'true' "$TMP/s5b.log"; then
  ok "起動に失敗し（終了コード 1）、値 true が出る"
else
  ng "終了コード 1 と値 true の表示を満たさない"
fi

echo
echo "-- 5c: USE_MOCK=1 だけ --"
PORT="$(free_port)"
echo "ポート: $PORT"
env -u YOUTUBE_API_KEY -u USE_MOCK -u CACHE_TTL PORT="$PORT" USE_MOCK=1 "$TMP/server" >"$TMP/s5c.log" 2>&1 &
PIDS+=("$!")
UP=0
for _ in $(seq 1 100); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/views?q=ready"; then
    UP=1
    break
  fi
  sleep 0.1
done
if [ "$UP" -eq 1 ]; then
  echo "\$ curl -sf 'http://127.0.0.1:$PORT/api/views?q=foo' -w '\\nHTTP %{http_code}\\n'"
  curl -sf "http://127.0.0.1:$PORT/api/views?q=foo" -w '\nHTTP %{http_code}\n' >"$TMP/s5c.curl" 2>&1
  CRC=$?
  cat "$TMP/s5c.curl"
else
  CRC=99
  echo "サーバが10秒以内に起動しなかった"
fi
# すぐ止める
kill "${PIDS[-1]}" 2>/dev/null
wait "${PIDS[-1]}" 2>/dev/null
echo "--- サーバの出力 ---"
cat "$TMP/s5c.log"
if [ "$UP" -eq 1 ] && [ "$CRC" -eq 0 ] && grep -q '^HTTP 200$' "$TMP/s5c.curl" && grep -q 'youtube client: mock' "$TMP/s5c.log"; then
  ok "起動し、youtube client: mock が出て、/api/views?q=foo が 200 を返した"
else
  ng "起動、youtube client: mock の表示、200 のいずれかを満たさない（curl=$CRC）"
fi

echo
if [ "$NG" -eq 0 ]; then
  echo "デモ終了（確認 NG: 0）"
else
  echo "デモ終了（確認 NG: $NG）"
fi
[ "$NG" -eq 0 ]
