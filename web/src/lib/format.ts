/** 数字の読み書き。試作版の jp / comma / rand と同じ実装（負号は U+2212）。 */

export function jp(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(Math.round(n));
  const oku = Math.floor(abs / 1e8);
  const man = Math.floor((abs % 1e8) / 1e4);
  const one = abs % 1e4;
  let out = "";
  if (oku) out += `${oku}億`;
  if (man) out += `${man}万`;
  if (one || !out) out += one;
  return (neg ? "−" : "") + out;
}

export const comma = (n: number): string =>
  (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("ja-JP");

/** min 以上 max 未満の整数乱数。 */
export const rand = (min: number, max: number): number =>
  Math.floor(min + Math.random() * (max - min));

/** 判定に使う再生回数：10,000 未満を切り捨てる。 */
export const truncateViews = (n: number): number => Math.floor(n / 10000) * 10000;

/** 割合（0.05 → 5）。浮動小数の誤差を丸める。 */
export const percent = (ratio: number): number => Number((ratio * 100).toFixed(2));
