import { useCallback, useMemo, useState } from "react";
import { Counter } from "../../components/Counter";
import { ScreenTop } from "../../components/ScreenTop";
import { SearchForm } from "../../components/SearchForm";
import { WordLog, type LogRow } from "../../components/WordLog";
import type { FetchOutcome } from "../../hooks/useViewsFetch";
import { comma, jp, truncateViews } from "../../lib/format";
import { normKey } from "../../lib/words";
import { Handoff } from "./Handoff";
import { deriveGame, judgeMove, type Direction, type GameView, type Move } from "./judge";
import { Survivors, type SurvivorStatus } from "./Survivors";

export interface VersusFinish {
  moves: Move[];
  view: GameView;
}

interface Props {
  title: string;
  names: string[];
  dir: Direction;
  /** lower のお題（higher では null） */
  topic: number | null;
  onFinish: (r: VersusFinish) => void;
  onQuit: () => void;
}

export const logRowsOf = (moves: Move[], names: string[]): LogRow[] =>
  moves.flatMap((m) =>
    m.truncated === undefined || m.viewCount === undefined
      ? []
      : [
          {
            query: m.query,
            truncated: m.truncated,
            actual: m.viewCount,
            title: m.title ?? "",
            who: names[m.player],
            out: m.outcome === "lose",
          },
        ],
  );

export function VersusPlay({ title, names, dir, topic, onFinish, onQuit }: Props) {
  // 手の履歴だけをゲーム状態として持つ。生存者・手番・前の値・使用済みは履歴から導く。
  const [moves, setMoves] = useState<Move[]>([]);
  // 引き継ぎカードを確認した手数。moves.length がこれより大きい間はカードを出す。
  const [acked, setAcked] = useState(0);
  const view = deriveGame(names.length, dir, topic, moves);

  const usedKeys = useMemo(() => new Set(moves.map((m) => normKey(m.query))), [moves]);
  const isUsed = useCallback((key: string) => usedKeys.has(key), [usedKeys]);

  const onResult = (r: FetchOutcome) => {
    const player = view.current;
    let move: Move;
    if (r.type === "nomatch") {
      // 該当なしは脱落。前の値は更新しない。
      move = { player, query: r.query, outcome: "nomatch", prev: view.prev };
    } else {
      const truncated = truncateViews(r.viewCount);
      move = {
        player,
        query: r.query,
        outcome: judgeMove(dir, view.prev, truncated),
        viewCount: r.viewCount,
        title: r.title,
        truncated,
        prev: view.prev,
      };
    }
    const next = [...moves, move];
    const nextView = deriveGame(names.length, dir, topic, next);
    if (nextView.winner !== null) {
      onFinish({ moves: next, view: nextView });
      return;
    }
    setMoves(next);
  };

  const statuses: SurvivorStatus[] = view.alive.map((a, i) =>
    !a ? "out" : i === view.current ? "current" : "alive",
  );
  const aliveCount = view.alive.filter(Boolean).length;
  const showHandoff = moves.length > acked;
  const last = moves[moves.length - 1];
  const name = names[view.current];

  let condition: string;
  let value: string;
  let sub: string;
  if (view.prev === null) {
    condition = "最初の1手（なんでもOK）";
    value = "—";
    sub = "好きなワードで検索してスタート";
  } else {
    condition =
      view.isFirstHand && dir === "lower"
        ? "お題より低く"
        : dir === "higher"
          ? "この数字より高く"
          : "この数字より低く";
    value = comma(view.prev);
    sub = `${jp(view.prev)} 回`;
  }

  return (
    <div className="vs-screen" data-testid="vs-play">
      <ScreenTop
        backLabel="やめる"
        onBack={onQuit}
        backTestId="play-quit"
        title={title}
        focusHeading={false}
      />
      <div>
        <span className="eyebrow" data-testid="vs-alive-count">
          のこり {aliveCount} 人 / 全 {names.length} 人
        </span>
        <Survivors names={names} statuses={statuses} />
      </div>
      <div data-testid="vs-counter">
        <Counter
          testIdPrefix="counter"
          label={
            <>
              <span data-testid="vs-current-player">{name}</span> の番 ・ {condition}
            </>
          }
          value={value}
          sub={sub}
        />
      </div>
      {showHandoff && last ? (
        <Handoff
          dir={dir}
          move={last}
          moverName={names[last.player]}
          nextName={name}
          onGo={() => setAcked(moves.length)}
        />
      ) : (
        <SearchForm key={moves.length} isUsed={isUsed} onResult={onResult} onHome={onQuit} />
      )}
      <WordLog rows={logRowsOf(moves, names)} sign="" />
    </div>
  );
}
