import { comma, jp } from "../lib/format";

export interface LogRow {
  query: string;
  /** 10,000 未満を切り捨てた値（判定に使う） */
  truncated: number;
  /** API の正しい再生回数（注釈として表示する） */
  actual: number;
  title: string;
  /** ハイ＆ロー対戦のプレイヤー名 */
  who?: string;
}

interface Props {
  rows: LogRow[];
  /** 右列の符号。カウントダウン "−"、チャージ "+"、対戦は "" */
  sign: string;
}

/** 履歴。1行以上あるときだけ表示する。タイトルと検索ワードは文字のみ（HTML として解釈しない）。 */
export function WordLog({ rows, sign }: Props) {
  if (rows.length === 0) return null;
  return (
    <section className="panel">
      <h2>履歴</h2>
      <ul className="log" data-testid="log">
        {rows.map((r, i) => (
          <li key={i} data-testid="log-row" data-index={i + 1}>
            <span className="t">{String(i + 1).padStart(2, "0")}</span>
            <span className="w">
              <span className="word" data-testid="log-word">
                {r.who ? <b>{r.who}：</b> : null}
                {r.query}
              </span>
              <span className="title" data-testid="log-title">
                {r.title}
              </span>
              <span className="actual" data-testid="log-actual">
                実際の再生回数 {comma(r.actual)} 回
              </span>
            </span>
            <span className="v" data-testid="log-value">
              {sign}
              {jp(r.truncated)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
