import { afterEach, describe, expect, it, vi } from "vitest";
import {
  found,
  gatewayTimeout,
  invalidQuery,
  jsonResponse,
  mockFetch,
  notFound,
  quotaExceeded,
  upstreamError,
} from "../test/fakeApi";
import { fetchViews } from "./views";

const signal = () => new AbortController().signal;

describe("fetchViews の分類", () => {
  it("found:true", async () => {
    const f = mockFetch(found(1234567, "タイトル", "abc"));
    const r = await fetchViews("猫 ピアノ", signal());
    expect(r).toEqual({ kind: "found", viewCount: 1234567, title: "タイトル", videoId: "abc" });
    expect(f.mock.calls[0]![0]).toBe(`/api/views?q=${encodeURIComponent("猫 ピアノ")}`);
  });
  it("found:false は nomatch", async () => {
    mockFetch(notFound());
    expect(await fetchViews("x", signal())).toEqual({ kind: "nomatch" });
  });
  it("400 invalid_query は invalid", async () => {
    mockFetch(invalidQuery());
    expect(await fetchViews("x", signal())).toEqual({ kind: "invalid" });
  });
  it("502 / 504(timeout) は error", async () => {
    mockFetch(upstreamError(), gatewayTimeout());
    expect(await fetchViews("x", signal())).toMatchObject({ kind: "error", reason: "http", status: 502 });
    expect(await fetchViews("x", signal())).toMatchObject({ kind: "error", reason: "http", status: 504 });
  });
  it("503 quota_exceeded は quota", async () => {
    mockFetch(quotaExceeded());
    expect(await fetchViews("x", signal())).toEqual({ kind: "quota" });
  });
  it("quota_exceeded 以外の 503（別 code・本文なし・JSON でない）は error", async () => {
    mockFetch(
      jsonResponse({ error: { code: "other" } }, 503),
      new Response("", { status: 503 }),
      new Response("<html>", { status: 503 }),
      jsonResponse({ error: { code: "quota_exceeded" } }, 502),
    );
    for (const status of [503, 503, 503, 502]) {
      expect(await fetchViews("x", signal())).toMatchObject({ kind: "error", reason: "http", status });
    }
  });
  it("ネットワーク断は error(network)", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    expect(await fetchViews("x", signal())).toMatchObject({ kind: "error", reason: "network" });
  });
  it("JSON でない・found の欠損は error(malformed)", async () => {
    mockFetch(
      new Response("<html>", { status: 200 }),
      jsonResponse({ found: true, video: { id: "a", title: "t" } }),
      jsonResponse({ found: true, viewCount: 5, video: { id: "a" } }),
      jsonResponse({ nothing: 1 }),
    );
    for (let i = 0; i < 4; i++) {
      expect(await fetchViews("x", signal())).toMatchObject({ kind: "error", reason: "malformed" });
    }
  });
  it("呼び出し元の中止は cancelled（エラーにしない）", async () => {
    mockFetch(new Promise<Response>(() => {}));
    const ctrl = new AbortController();
    const p = fetchViews("x", ctrl.signal);
    ctrl.abort();
    expect(await p).toEqual({ kind: "cancelled" });
  });
});

describe("fetchViews のタイムアウト", () => {
  afterEach(() => vi.useRealTimers());
  it("15秒で応答がなければ error(timeout)。cancelled とは区別する", async () => {
    vi.useFakeTimers();
    mockFetch(new Promise<Response>(() => {}));
    const p = fetchViews("x", signal());
    await vi.advanceTimersByTimeAsync(14999);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toMatchObject({ kind: "error", reason: "timeout" });
  });
});
