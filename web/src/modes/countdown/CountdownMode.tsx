import { useState } from "react";
import { DifficultySetup } from "../../components/DifficultySetup";
import { ResultView } from "../../components/ResultView";
import { WordLog, type LogRow } from "../../components/WordLog";
import { comma } from "../../lib/format";
import { LEVELS, type LevelKey } from "../../lib/levels";
import { loadLevel, savePrefs } from "../../lib/prefs";
import { modeTitle } from "../../modes";
import { CountdownPlay, type CountdownFinish } from "./CountdownPlay";
import { clearRuleText, pickTarget, remainingOf } from "./judge";

type Phase =
  | { name: "setup" }
  | { name: "play"; target: number; level: LevelKey }
  | { name: "result"; target: number; level: LevelKey; win: boolean; reason: string; log: LogRow[] };

/** カウントダウンの画面遷移（難易度設定 → プレイ → 結果）。ホームへ戻るときは onExit。 */
export function CountdownMode({ onExit }: { onExit: () => void }) {
  const title = modeTitle("countdown");
  const [level, setLevel] = useState<LevelKey>(loadLevel);
  const [phase, setPhase] = useState<Phase>({ name: "setup" });

  const changeLevel = (key: LevelKey) => {
    setLevel(key);
    savePrefs({ level: key });
  };

  if (phase.name === "setup") {
    return (
      <DifficultySetup
        modeTitle={title}
        level={level}
        onLevelChange={changeLevel}
        clearRule={clearRuleText}
        onBack={onExit}
        onStart={() => {
          setPhase({ name: "play", target: pickTarget(LEVELS[level]), level });
        }}
      />
    );
  }

  if (phase.name === "play") {
    const { target, level: playLevel } = phase;
    return (
      <CountdownPlay
        title={title}
        level={LEVELS[playLevel]}
        target={target}
        onQuit={onExit}
        onFinish={(r: CountdownFinish) =>
          setPhase({ name: "result", target, level: playLevel, ...r })
        }
      />
    );
  }

  const { target, win, reason, log } = phase;
  const remaining = remainingOf(target, log);
  return (
    <ResultView
      heading={win ? "CLEAR" : "GAME OVER"}
      tone={win ? "good" : "bad"}
      reason={reason}
      detail={`残り ${comma(remaining)} 回（お題の ${((remaining / target) * 100).toFixed(2)}%）・${log.length}ターン`}
      onAgain={() => setPhase({ name: "setup" })}
      onHome={onExit}
    >
      <WordLog rows={log} sign={"−"} />
    </ResultView>
  );
}
