import type { ReactNode } from "react";
import { Heading } from "./Heading";

interface Props {
  /** "CLEAR" / "GAME OVER" / "GAME SET" */
  heading: string;
  tone: "good" | "bad" | "neutral";
  /** counter 左上の小さな見出し（既定「結果」。対戦は「決着」） */
  label?: string;
  reason: string;
  detail: string;
  onAgain: () => void;
  onHome: () => void;
  /** 履歴（WordLog） */
  children?: ReactNode;
}

/** 結果画面の骨格（ResultBanner + 詳細 + ResultActions + 履歴）。 */
export function ResultView({
  heading,
  tone,
  label = "結果",
  reason,
  detail,
  onAgain,
  onHome,
  children,
}: Props) {
  return (
    <>
      <div className="counter">
        <span className="label">{label}</span>
        <Heading className={`num result-${tone}`} testId="result-heading">
          {heading}
        </Heading>
        <span className="jp" data-testid="result-reason">
          {reason}
        </span>
      </div>
      <p className="muted center" data-testid="result-detail">
        {detail}
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={onAgain} data-testid="result-again">
          もう一回
        </button>
        <button type="button" className="btn ghost" onClick={onHome} data-testid="result-home">
          モード選択へ
        </button>
      </div>
      {children}
    </>
  );
}
