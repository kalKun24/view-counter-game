/** GET /api/views?q=... の呼び出しと、応答の分類。 */

export const FETCH_TIMEOUT_MS = 15000;

export type ErrorReason = "network" | "timeout" | "http" | "malformed";

export type ViewsResult =
  | { kind: "found"; viewCount: number; title: string; videoId: string }
  | { kind: "nomatch" }
  | { kind: "invalid" }
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

async function classify(res: Response): Promise<ViewsResult> {
  if (res.status === 400) {
    const body = await readJson(res);
    const code = isRecord(body) && isRecord(body.error) ? body.error.code : undefined;
    return code === "invalid_query"
      ? { kind: "invalid" }
      : { kind: "error", reason: "http", status: res.status };
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
