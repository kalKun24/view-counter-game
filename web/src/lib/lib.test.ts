import { describe, expect, it } from "vitest";
import { comma, jp, percent, rand, truncateViews } from "./format";
import { LEVELS } from "./levels";
import { loadLevel, savePrefs } from "./prefs";
import { normKey } from "./words";

describe("jp / comma（試作版と同じ）", () => {
  it("億・万で区切る", () => {
    expect(jp(487215330)).toBe("4億8721万5330");
    expect(jp(1230000)).toBe("123万");
    expect(jp(0)).toBe("0");
    expect(jp(100000000)).toBe("1億");
    expect(jp(5000)).toBe("5000");
  });
  it("負号は U+2212", () => {
    expect(jp(-1230000)).toBe(`${String.fromCharCode(0x2212)}123万`);
    expect(comma(-1500)).toBe(`${String.fromCharCode(0x2212)}1,500`);
  });
  it("comma は桁区切り", () => {
    expect(comma(487215330)).toBe("487,215,330");
  });
  it("percent は誤差を丸める", () => {
    expect(percent(0.05)).toBe(5);
    expect(percent(0.005)).toBe(0.5);
  });
});

describe("rand / truncateViews", () => {
  it("min 以上 max 未満の整数", () => {
    for (let i = 0; i < 200; i++) {
      const n = rand(10, 13);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThan(13);
    }
  });
  it("10,000 未満を切り捨てる", () => {
    expect(truncateViews(1234567)).toBe(1230000);
    expect(truncateViews(9999)).toBe(0);
    expect(truncateViews(10000)).toBe(10000);
    expect(truncateViews(0)).toBe(0);
  });
});

describe("LEVELS は試作版と一致", () => {
  it("ターン数・範囲・許容幅", () => {
    expect(LEVELS.easy).toMatchObject({ turns: 6, min: 1e8, max: 3e8, tol: 0.05 });
    expect(LEVELS.normal).toMatchObject({ turns: 5, min: 3e8, max: 1e9, tol: 0.02 });
    expect(LEVELS.hard).toMatchObject({ turns: 4, min: 1e9, max: 5e9, tol: 0.005 });
  });
});

describe("normKey（同じワードの組み合わせ）", () => {
  it("語順・大文字小文字・全角半角を同一視する", () => {
    const k = normKey("cat Piano");
    expect(normKey("piano  CAT")).toBe(k);
    expect(normKey("ｃａｔ　ＰＩＡＮＯ")).toBe(k);
    expect(normKey("  Piano　cat ")).toBe(k);
  });
  it("別のワードは別のキー", () => {
    expect(normKey("cat")).not.toBe(normKey("cat piano"));
  });
});

describe("prefs（vc-prefs）", () => {
  it("既定は normal。壊れた値や不正な level も normal", () => {
    expect(loadLevel()).toBe("normal");
    localStorage.setItem("vc-prefs", "{broken");
    expect(loadLevel()).toBe("normal");
    localStorage.setItem("vc-prefs", JSON.stringify({ level: "zzz" }));
    expect(loadLevel()).toBe("normal");
  });
  it("level を保存しても他のキーを消さない", () => {
    localStorage.setItem("vc-prefs", JSON.stringify({ dir: "lower" }));
    savePrefs({ level: "hard" });
    expect(JSON.parse(localStorage.getItem("vc-prefs")!)).toEqual({ dir: "lower", level: "hard" });
    expect(loadLevel()).toBe("hard");
  });
});
