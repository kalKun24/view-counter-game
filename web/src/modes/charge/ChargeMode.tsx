import { useState } from "react";
import { DifficultySetup } from "../../components/DifficultySetup";
import { ResultView } from "../../components/ResultView";
import { WordLog, type LogRow } from "../../components/WordLog";
import { comma, rand, truncateViews } from "../../lib/format";
import { LEVELS, type LevelKey } from "../../lib/levels";
import { loadLevel, savePrefs } from "../../lib/prefs";
import { modeTitle } from "../../modes";
import { ChargePlay, type ChargeFinish } from "./ChargePlay";
import { clearRuleText, totalOf } from "./judge";

type Phase =
  | { name: "setup" }
  | { name: "play"; target: number; level: LevelKey }
  | { name: "result"; target: number; level: LevelKey; win: boolean; reason: string; log: LogRow[] };

/** チャージの画面遷移（難易度設定 → プレイ → 結果）。ホームへ戻るときは onExit。 */
export function ChargeMode({ onExit }: { onExit: () => void }) {
  const title = modeTitle("charge");
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
        clearRuleTestId="charge-rule"
        onBack={onExit}
        onStart={() => {
          const L = LEVELS[level];
          setPhase({ name: "play", target: truncateViews(rand(L.min, L.max)), level });
        }}
      />
    );
  }

  if (phase.name === "play") {
    const { target, level: playLevel } = phase;
    return (
      <ChargePlay
        title={title}
        level={LEVELS[playLevel]}
        target={target}
        onQuit={onExit}
        onFinish={(r: ChargeFinish) => setPhase({ name: "result", target, level: playLevel, ...r })}
      />
    );
  }

  const { target, win, reason, log } = phase;
  const total = totalOf(log);
  return (
    <ResultView
      heading={win ? "CLEAR" : "GAME OVER"}
      tone={win ? "good" : "bad"}
      reason={reason}
      detail={`合計 ${comma(total)} 回（目標の ${((total / target) * 100).toFixed(1)}%）・${log.length}ターン`}
      onAgain={() => setPhase({ name: "setup" })}
      onHome={onExit}
    >
      <WordLog rows={log} sign="+" />
    </ResultView>
  );
}
