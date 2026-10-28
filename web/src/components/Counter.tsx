import type { ReactNode } from "react";

interface CounterProps {
  /** data-testid の接頭辞。"counter" なら counter / counter-value。 */
  testIdPrefix?: string;
  ariaLabel?: string;
  label: ReactNode;
  /** 大きい数字（整形済みの文字列） */
  value: string;
  sub: ReactNode;
  bar?: ReactNode;
}

/** 暗い背景の大きい数字表示。モードごとに label / value / sub / bar を差し替える。 */
export function Counter({ testIdPrefix, ariaLabel, label, value, sub, bar }: CounterProps) {
  return (
    <div
      className="counter"
      aria-label={ariaLabel}
      data-testid={testIdPrefix}
    >
      <span className="label">{label}</span>
      <span className="num" data-testid={testIdPrefix && `${testIdPrefix}-value`}>
        {value}
      </span>
      <span className="jp">{sub}</span>
      {bar}
    </div>
  );
}

interface CounterBarProps {
  testIdPrefix?: string;
  /** 塗りの幅（0〜100） */
  percent: number;
  /** 赤い目印の位置（左から 0〜100%） */
  markPercent: number;
}

/** 進捗バー。装飾なので読み上げない（同じ情報は数字で出す）。 */
export function CounterBar({ testIdPrefix, percent, markPercent }: CounterBarProps) {
  return (
    <div className="bar" aria-hidden="true" data-testid={testIdPrefix && `${testIdPrefix}-bar`}>
      <i style={{ width: `${percent}%` }} />
      <u style={{ left: `${markPercent}%` }} />
    </div>
  );
}
