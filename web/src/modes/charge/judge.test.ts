import { describe, expect, it } from "vitest";
import type { LogRow } from "../../components/WordLog";
import { LEVELS } from "../../lib/levels";
import { clearRuleText, isBurst, judge, limitOf, totalOf } from "./judge";

const row = (truncated: number): LogRow => ({ query: "q", truncated, actual: truncated, title: "t" });

describe("LEVELS（受け入れ基準 1）", () => {
  it("ターン数・目標の範囲・許容幅が試作版と一致", () => {
    expect(LEVELS.easy).toMatchObject({ turns: 6, min: 1e8, max: 3e8, tol: 0.05 });
    expect(LEVELS.normal).toMatchObject({ turns: 5, min: 3e8, max: 1e9, tol: 0.02 });
    expect(LEVELS.hard).toMatchObject({ turns: 4, min: 1e9, max: 5e9, tol: 0.005 });
  });
});

describe("totalOf", () => {
  it("切り捨て値の総和（正しい再生回数は使わない）", () => {
    const log: LogRow[] = [
      { query: "a", truncated: 1230000, actual: 1234567, title: "t" },
      { query: "b", truncated: 0, actual: 9999, title: "t" },
    ];
    expect(totalOf(log)).toBe(1230000);
    expect(totalOf([])).toBe(0);
  });
});

describe("judge（バースト → クリア → ターン切れ）", () => {
  const L = LEVELS.normal; // turns 5, 2%
  const target = 500000000;
  const limit = target * 1.02; // 510,000,000

  it("ちょうど目標はクリア、1 足りなければ続行", () => {
    expect(judge(target, L, [row(target)])).toBe("clear");
    expect(judge(target, L, [row(target - 1)])).toBe("continue");
  });
  it("ちょうど上限はバーストでなくクリア、上限 +1 はバースト", () => {
    expect(judge(target, L, [row(limit)])).toBe("clear");
    expect(judge(target, L, [row(limit + 1)])).toBe("burst");
  });
  it("最終ターンでちょうど目標ならターン切れより先にクリア", () => {
    expect(judge(target, L, [row(1), row(1), row(1), row(1), row(target - 4)])).toBe("clear");
  });
  it("最終ターンで上限超えならターン切れより先にバースト", () => {
    expect(judge(target, L, [row(1), row(1), row(1), row(1), row(limit)])).toBe("burst");
  });
  it("ターン数に達して目標未満ならターン切れ", () => {
    expect(judge(target, L, Array.from({ length: 5 }, () => row(10000)))).toBe("out-turns");
    expect(judge(target, L, Array.from({ length: 4 }, () => row(10000)))).toBe("continue");
  });
  it("0 の行も 1 ターン消費する", () => {
    expect(judge(target, L, Array.from({ length: 5 }, () => row(0)))).toBe("out-turns");
  });
  it("hard の 0.5% 境界も整数で比べる（上限が小数になる目標）", () => {
    const H = LEVELS.hard;
    const t = 1000000001; // 上限 1,005,000,001.005
    expect(isBurst(1005000001, t, H)).toBe(false);
    expect(isBurst(1005000002, t, H)).toBe(true);
    expect(limitOf(t, H)).toBeCloseTo(1005000001.005, 3);
  });
});

describe("clearRuleText", () => {
  it("105% / 102% / 100.5%", () => {
    expect(clearRuleText(LEVELS.easy)).toBe("目標以上、かつ目標の 105% 以下（超えたらバースト）");
    expect(clearRuleText(LEVELS.normal)).toContain("102%");
    expect(clearRuleText(LEVELS.hard)).toContain("100.5%");
  });
});
