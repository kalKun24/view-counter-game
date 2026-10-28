import { comma, jp } from "../../lib/format";
import type { Level } from "../../lib/levels";
import { limitOf } from "./judge";

interface Props {
  target: number;
  level: Level;
  total: number;
  left: number;
}

/** チャージ用のカウンター。共通の Counter とは testid の名前が違うため、同じ見た目の枠を自前で組む。 */
export function ChargeCounter({ target, level, total, left }: Props) {
  const limit = limitOf(target, level);
  const shortage = Math.max(0, target - total);
  const fill = Math.min(100, (total / limit) * 100);
  const mark = (target / limit) * 100;
  return (
    <div className="counter" data-testid="charge-counter">
      <span className="label" data-testid="charge-label">
        合計 ・ 目標 {jp(target)} 〜 上限 {jp(limit)}
      </span>
      <span className="num" data-testid="charge-total">
        {comma(total)}
      </span>
      <span className="jp" data-testid="charge-sub">
        あと {jp(shortage)} 回 ／ 残り{left}ターン
      </span>
      <div className="bar" aria-hidden="true" data-testid="charge-bar">
        <i style={{ width: `${fill}%` }} data-testid="charge-bar-fill" data-percent={fill.toFixed(1)} />
        <u style={{ left: `${mark}%` }} data-testid="charge-bar-target" />
      </div>
    </div>
  );
}
