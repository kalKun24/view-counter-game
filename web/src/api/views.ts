/** GET /api/views?q=... の呼び出しと、応答の分類。 */

export const FETCH_TIMEOUT_MS = 15000;

export type ErrorReason = "network" | "timeout" | "http" | "malformed";

export type ViewsResult =
  | { kind: "found"; viewCount: number; title: string; videoId: string }
  | { kind: "nomatch" }
  | { kind: "invalid" }
  | { kind: "quota" }
  | { kind: "throttled"; retryAfter: number | null }
  | { kind: "error"; reason: ErrorReason; status?: number }
  | { kind: "cancelled" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

/** JSON として読めなければ undefined。中止・通信断などそれ以外の例外は投げ直す。 */
async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (e) {
    if (e instanceof SyntaxError) return undefined;
    throw e;
  }
}

/**
 * Retry-After を整数秒として読む。半角数字だけで 1 以上の安全な整数なら、その値。
 * 欠落・0・負・小数・符号付き・日時形式・単位付き・桁区切り・安全な整数を超える値は null。
 */
export function parseRetryAfter(raw: string | null): number | null {
  if (raw === null) return null;
  const s = raw.trim();
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

async function classify(res: Response): Promise<ViewsResult> {
  if (res.status === 429) {
    // 429 のうち too_many_requests だけを「制限中」とする。それ以外は通信失敗のまま。
    const body = await readJson(res);
    const code = isRecord(body) && isRecord(body.error) ? body.error.code : undefined;
    if (code === "too_many_requests") {
      return { kind: "throttled", retryAfter: parseRetryAfter(res.headers.get("Retry-After")) };
    }
    return { kind: "error", reason: "http", status: res.status };
  }
  if (res.status === 400) {
    const body = await readJson(res);
    const code = isRecord(body) && isRecord(body.error) ? body.error.code : undefined;
    return code === "invalid_query"
      ? { kind: "invalid" }
      : { kind: "error", reason: "http", status: res.status };
  }
  if (res.status === 503) {
    // 503 のうち quota_exceeded だけをクォータ切れとする。それ以外は通信失敗のまま。
    const body = await readJson(res);
    const code = isRecord(body) && isRecord(body.error) ? body.error.code : undefined;
    if (code === "quota_exceeded") return { kind: "quota" };
    return { kind: "error", reason: "http", status: res.status };
  }
  if (!res.ok) return { kind: "error", reason: "http", status: res.status };

  const body = await readJson(res);
  if (!isRecord(body) || typeof body.found !== "boolean") {
    return { kind: "error", reason: "malformed" };
  }
  if (!body.found) return { kind: "nomatch" };

  const video = body.video;
  if (
    typeof body.viewCount !== "number" ||
    !Number.isFinite(body.viewCount) ||
    body.viewCount < 0 ||
    !isRecord(video) ||
    typeof video.title !== "string"
  ) {
    return { kind: "error", reason: "malformed" };
  }
  return {
    kind: "found",
    viewCount: body.viewCount,
    title: video.title,
    videoId: typeof video.id === "string" ? video.id : "",
  };
}

/**
 * 再生回数を取得する。例外は投げず、分類した結果を返す。
 * - caller が signal を中止した場合は "cancelled"（エラー表示もログもしない）
 * - timeoutMs を過ぎた場合は "error"（reason: "timeout"）
 */
export async function fetchViews(
  query: string,
  signal: AbortSignal,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<ViewsResult> {
  const ctrl = new AbortController();
  const forward = () => ctrl.abort();
  if (signal.aborted) return { kind: "cancelled" };
  signal.addEventListener("abort", forward, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    const res = await fetch(`/api/views?q=${encodeURIComponent(query)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    return await classify(res);
  } catch {
    if (timedOut) return { kind: "error", reason: "timeout" };
    if (signal.aborted) return { kind: "cancelled" };
    return { kind: "error", reason: "network" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", forward);
  }
}
