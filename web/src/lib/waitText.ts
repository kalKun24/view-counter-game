/**
 * 503 quota_exceeded の待ち時間を「約N秒／約N分／約N時間」にする。
 * 判定は切り上げ前の秒数で行い、単位ごとに切り上げる（60 秒未満は秒、1 時間未満は分、それ以上は時間）。
 * 429 の表示（秒のまま）では使わない。
 */
export function waitText(seconds: number): string {
  if (seconds < 60) return `約${seconds}秒`;
  if (seconds < 3600) return `約${Math.ceil(seconds / 60)}分`;
  return `約${Math.ceil(seconds / 3600)}時間`;
}
