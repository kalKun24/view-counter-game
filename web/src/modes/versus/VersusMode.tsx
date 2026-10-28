import { useState } from "react";
import { Heading } from "../../components/Heading";
import { WordLog } from "../../components/WordLog";
import { rand } from "../../lib/format";
import { modeTitle } from "../../modes";
import type { Direction, Move } from "./judge";
import { Survivors, type SurvivorStatus } from "./Survivors";
import { VersusPlay, logRowsOf, type VersusFinish } from "./VersusPlay";
import { VersusSetup } from "./VersusSetup";
import { loadVsPrefs, saveVsPrefs, type VsPrefs } from "./vsPrefs";
import "./versus.css";

type Phase =
  | { name: "setup" }
  | { name: "play"; names: string[]; dir: Direction; topic: number | null }
  | { name: "result"; names: string[]; dir: Direction; moves: Move[]; finish: VersusFinish };

/** ハイ＆ロー対戦の画面遷移（設定 → プレイ → 結果）。 */
export function VersusMode({ onExit }: { onExit: () => void }) {
  const title = modeTitle("versus");
  const [prefs, setPrefs] = useState<VsPrefs>(loadVsPrefs);
  const [phase, setPhase] = useState<Phase>({ name: "setup" });

  if (phase.name === "setup") {
    return (
      <VersusSetup
        title={title}
        initial={prefs}
        onChange={(p) => {
          setPrefs(p);
          saveVsPrefs(p);
        }}
        onBack={onExit}
        onStart={(dir, names) =>
          // lower の最初のお題は試作版と同じ rand(5e8, 3e9)
          setPhase({ name: "play", names, dir, topic: dir === "lower" ? rand(5e8, 3e9) : null })
        }
      />
    );
  }

  if (phase.name === "play") {
    const { names, dir, topic } = phase;
    return (
      <VersusPlay
        title={title}
        names={names}
        dir={dir}
        topic={topic}
        onQuit={onExit}
        onFinish={(finish) => setPhase({ name: "result", names, dir, moves: finish.moves, finish })}
      />
    );
  }

  const { names, moves, finish } = phase;
  const { winner, winReason } = finish.view;
  const winnerName = winner === null ? "" : names[winner];
  const statuses: SurvivorStatus[] = names.map((_, i) => (i === winner ? "winner" : "out"));
  const reason =
    winReason === "zero"
      ? `${winnerName} が0ちょうどを出した！ 残りの人数に関係なく、その場で勝ち。`
      : "最後の1人まで生き残った！";

  return (
    <div className="vs-screen" data-testid="vs-result">
      <div className="counter" data-testid="vs-winner">
        <span className="label">決着</span>
        <Heading className="num" testId="result-heading">
          GAME SET
        </Heading>
        <span className="vs-winner-name" data-testid="vs-winner-name">
          {winnerName} の勝ち！
        </span>
        <span className="jp" data-testid="vs-winner-reason">
          {reason}
        </span>
      </div>
      <Survivors names={names} statuses={statuses} />
      <p className="muted center" data-testid="vs-result-turns">
        {moves.length}手つづきました
      </p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => setPhase({ name: "setup" })}
          data-testid="result-again"
        >
          もう一回
        </button>
        <button type="button" className="btn ghost" onClick={onExit} data-testid="result-home">
          モード選択へ
        </button>
      </div>
      <WordLog rows={logRowsOf(moves, names)} sign="" />
    </div>
  );
}
