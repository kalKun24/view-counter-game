import type { LogRow } from "../../components/WordLog";
import { percent } from "../../lib/format";
import type { Level } from "../../lib/levels";

export type Outcome = "out-negative" | "clear" | "out-turns" | "continue";

export const REASONS = {
  "out-negative": "0を割ってしまった！",
  clear: "ゴール圏に到達！",
  "out-turns": "ターン切れ。",
} as const;

/** 残りは常に「お題 − 切り捨て値の合計」。正しい再生回数（actual）は使わない。 */
export const remainingOf = (target: number, log: LogRow[]): number =>
  log.reduce((rest, r) => rest - r.truncated, target);

/**
 * 判定。0未満でアウト → 許容幅以下でクリア → ターン切れでアウト の順（試作版と同じ）。
 * 許容幅は千分率の整数にそろえ、小数の誤差で境界がずれないようにする。
 */
export function judge(target: number, level: Level, log: LogRow[]): Outcome {
  const remaining = remainingOf(target, log);
  if (remaining < 0) return "out-negative";
  const tolPermille = Math.round(level.tol * 1000);
  if (remaining * 1000 <= target * tolPermille) return "clear";
  if (log.length >= level.turns) return "out-turns";
  return "continue";
}

export const clearRuleText = (level: Level): string =>
  `残りがお題の ${percent(level.tol)}% 以下（0未満はアウト）`;
