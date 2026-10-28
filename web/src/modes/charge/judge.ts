import type { LogRow } from "../../components/WordLog";
import { percent, truncateViews } from "../../lib/format";
import type { Level } from "../../lib/levels";

export type Outcome = "burst" | "clear" | "out-turns" | "continue";

export const REASONS = {
  burst: "上限を超えてバースト！",
  clear: "目標ラインに到達！",
  "out-turns": "ターン切れ。",
} as const;

/** 許容幅を千分率の整数にする（0.005 → 5）。小数の誤差を境界に持ち込まない。 */
export const tolPermille = (level: Level): number => Math.round(level.tol * 1000);

/** 合計は常に「切り捨て値の総和」。正しい再生回数（actual）は使わない。 */
export const totalOf = (log: LogRow[]): number => log.reduce((sum, r) => sum + r.truncated, 0);

/** 上限：目標 ×（1 + 許容幅）を 10,000 未満切り捨てにした整数。表示も判定もこの値を使う。 */
export const limitOf = (target: number, level: Level): number =>
  truncateViews(Math.floor((target * (1000 + tolPermille(level))) / 1000));

/** 合計が上限を超えたか。上限ちょうどはバーストでない。 */
export const isBurst = (total: number, target: number, level: Level): boolean =>
  total > limitOf(target, level);

/** 判定。バースト → クリア → ターン切れ の順。 */
export function judge(target: number, level: Level, log: LogRow[]): Outcome {
  const total = totalOf(log);
  if (isBurst(total, target, level)) return "burst";
  if (total >= target) return "clear";
  if (log.length >= level.turns) return "out-turns";
  return "continue";
}

export const clearRuleText = (level: Level): string =>
  `目標以上、かつ目標の ${100 + percent(level.tol)}% 以下（超えたらバースト）`;
