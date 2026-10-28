import { describe, expect, it } from "vitest";
import { DEFAULT_API_TARGET, resolveApiTarget } from "./api-target.ts";

describe("resolveApiTarget（プロキシ先）", () => {
  it("未設定・空は既定の http://localhost:8080", () => {
    expect(resolveApiTarget(undefined)).toBe(DEFAULT_API_TARGET);
    expect(resolveApiTarget("")).toBe("http://localhost:8080");
  });
  it("指定した URL を使う（パスは落として origin にする）", () => {
    expect(resolveApiTarget("http://localhost:9000")).toBe("http://localhost:9000");
    expect(resolveApiTarget("https://example.test/api/")).toBe("https://example.test");
  });
  it("不正な値は黙って既定に戻さず、起動時に失敗する", () => {
    expect(() => resolveApiTarget("localhost:9000")).toThrow(/API_PROXY_TARGET/);
    expect(() => resolveApiTarget("not a url")).toThrow(/API_PROXY_TARGET/);
    expect(() => resolveApiTarget("ftp://localhost")).toThrow(/http/);
  });
});
