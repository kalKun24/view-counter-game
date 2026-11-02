import { describe, expect, it } from "vitest";
import { waitText } from "./waitText";

describe("waitText（PBI 32 基準7）", () => {
  it.each([
    [1, "約1秒"],
    [59, "約59秒"],
    [60, "約1分"],
    [61, "約2分"],
    [120, "約2分"],
    [3540, "約59分"],
    [3599, "約60分"],
    [3600, "約1時間"],
    [3601, "約2時間"],
    [7200, "約2時間"],
    [82800, "約23時間"],
    [86400, "約24時間"],
    [90000, "約25時間"],
  ])("%s 秒 → %s", (s, text) => {
    expect(waitText(s)).toBe(text);
  });

  it("空白や桁区切りを入れず、日・明日の語を使わない", () => {
    for (const s of [1, 59, 60, 3599, 3600, 90000, 1_000_000]) {
      const t = waitText(s);
      expect(t).toMatch(/^約[0-9]+(秒|分|時間)$/);
      expect(t).not.toMatch(/明日|日/);
    }
  });
});
