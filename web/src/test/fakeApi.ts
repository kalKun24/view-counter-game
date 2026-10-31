import { vi } from "vitest";

/** 本物のネットワークには出ない。fetch を差し替えるテスト用の API。 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const found = (viewCount: number, title = `Mock video ${viewCount}`, id = "vid") =>
  jsonResponse({ found: true, viewCount, video: { id, title } });

export const notFound = () => jsonResponse({ found: false });

export const upstreamError = () =>
  jsonResponse({ error: { code: "upstream_error", message: "x" } }, 502);

export const quotaExceeded = () =>
  jsonResponse({ error: { code: "quota_exceeded", message: "x" } }, 503);

/** 429 too_many_requests。retryAfter が undefined ならヘッダーを付けない。 */
export const tooMany = (retryAfter?: string, code = "too_many_requests") =>
  new Response(JSON.stringify({ error: { code, message: "x" } }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      ...(retryAfter === undefined ? {} : { "Retry-After": retryAfter }),
    },
  });

export const gatewayTimeout = () =>
  jsonResponse({ error: { code: "timeout", message: "x" } }, 504);

export const invalidQuery = () =>
  jsonResponse({ error: { code: "invalid_query", message: "x" } }, 400);

type Reply = Response | Error | Promise<Response>;

/**
 * 呼び出し順に応答を返す fetch のモック。signal の中止にも反応する。
 * 応答が尽きたらテストの失敗として扱う。
 */
export function mockFetch(...replies: Reply[]) {
  const queue = [...replies];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const next = queue.shift();
    if (next === undefined) return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      const abort = () => reject(new DOMException("aborted", "AbortError"));
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (next instanceof Error) return reject(next);
      Promise.resolve(next).then(resolve, reject);
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** 手動で解決できる応答（取得中の状態を作る）。 */
export function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export const requestedQueries = (fn: ReturnType<typeof mockFetch>): string[] =>
  fn.mock.calls.map(([url]) => decodeURIComponent(String(url).split("?q=")[1] ?? ""));
