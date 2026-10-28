import { useEffect, useRef } from "react";
import { jp } from "../../lib/format";
import type { Direction, Move } from "./judge";

interface Props {
  dir: Direction;
  /** 直前の手 */
  move: Move;
  moverName: string;
  nextName: string;
  onGo: () => void;
}

/** 手番の引き継ぎカード。結果を全員が見てから次の人へ渡す。 */
export function Handoff({ dir, move, moverName, nextName, onGo }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
  }, []);

  let text: string;
  let good = false;
  if (move.outcome === "ok") {
    good = true;
    text = `${moverName}：${jp(move.truncated ?? 0)} OK`;
  } else if (move.outcome === "lose") {
    const rel = dir === "higher" ? "高くない" : "低くない";
    text = `${moverName} は脱落！（${jp(move.truncated ?? 0)} は ${jp(move.prev ?? 0)} より${rel}）`;
  } else {
    text = `${moverName} は脱落！（条件に合う動画がありませんでした）`;
  }

  return (
    <section className="panel vs-handoff" data-testid="vs-handoff">
      <p
        className={`msg ${good ? "good" : "bad"}`}
        role="status"
        aria-live="polite"
        data-testid="vs-handoff-result"
      >
        {text}
      </p>
      {move.outcome === "nomatch" && (
        <p className="muted small" data-testid="vs-handoff-note">
          直前の数字はそのまま
        </p>
      )}
      <p data-testid="vs-handoff-next">次は {nextName} さん。スマホを渡してください。</p>
      <button
        ref={btn}
        type="button"
        className="btn vs-go"
        onClick={onGo}
        data-testid="vs-handoff-go"
      >
        {nextName} です。始める
      </button>
    </section>
  );
}
