import { describe, expect, it } from "vitest";
import type { LogRow } from "../../components/WordLog";
import { LEVELS } from "../../lib/levels";
import { clearRuleText, judge, remainingOf } from "./judge";

const row = (truncated: number): LogRow => ({ query: "q", truncated, actual: truncated, title: "t" });

describe("remainingOf", () => {
  it("お題から切り捨て値の合計を引く（正しい再生回数は使わない）", () => {
    const log: LogRow[] = [{ query: "a", truncated: 1230000, actual: 1234567, title: "t" }];
    expect(remainingOf(5000000, log)).toBe(3770000);
  });
});

describe("judge（0未満でアウト → 許容幅以下でクリア → ターン切れでアウト）", () => {
  const L = LEVELS.normal; // turns 5, tol 2%
  const target = 500000000;

  it("0未満はアウト", () => {
    expect(judge(target, L, [row(target + 10000)])).toBe("out-negative");
  });
  it("ちょうど0はクリア", () => {
    expect(judge(target, L, [row(target)])).toBe("clear");
  });
  it("許容幅ちょうどはクリア、1万超えると続行", () => {
    const tol = target * 0.02; // 10,000,000
    expect(judge(target, L, [row(target - tol)])).toBe("clear");
    expect(judge(target, L, [row(target - tol - 10000)])).toBe("continue");
  });
  it("最終ターンでもクリアがターン切れより先", () => {
    const log = [row(1), row(1), row(1), row(1), row(target - 4)];
    expect(judge(target, L, log)).toBe("clear");
  });
  it("最終ターンで0未満ならアウト（ターン切れより先でも同じアウト）", () => {
    const log = [row(1), row(1), row(1), row(1), row(target)];
    expect(judge(target, L, log)).toBe("out-negative");
  });
  it("ターン数に達して許容幅の外ならターン切れ", () => {
    expect(judge(target, L, Array.from({ length: 5 }, () => row(10000)))).toBe("out-turns");
    expect(judge(target, L, Array.from({ length: 4 }, () => row(10000)))).toBe("continue");
  });
  it("hard の 0.5% 境界も整数で比べる", () => {
    const H = LEVELS.hard;
    const t = 1000000001;
    // 許容 = 5,000,000.005 → 残り 5,000,000 はクリア、5,000,001 は続行
    expect(judge(t, H, [row(t - 5000000)])).toBe("clear");
    expect(judge(t, H, [row(t - 5000001)])).toBe("continue");
  });
});

describe("clearRuleText", () => {
  it("5% / 2% / 0.5%", () => {
    expect(clearRuleText(LEVELS.easy)).toBe("残りがお題の 5% 以下（0未満はアウト）");
    expect(clearRuleText(LEVELS.normal)).toContain("2%");
    expect(clearRuleText(LEVELS.hard)).toContain("0.5%");
  });
});
