import { jp } from "../lib/format";
import { LEVEL_KEYS, LEVELS, type Level, type LevelKey } from "../lib/levels";
import { ScreenTop } from "./ScreenTop";

interface PickerProps {
  value: LevelKey;
  onChange: (key: LevelKey) => void;
}

/** 難易度の3択。 */
export function DifficultyPicker({ value, onChange }: PickerProps) {
  return (
    <div className="seg" role="group" aria-label="難易度">
      {LEVEL_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={k === value}
          onClick={() => onChange(k)}
          data-testid={`level-${k}`}
        >
          {LEVELS[k].name}
        </button>
      ))}
    </div>
  );
}

interface SetupProps {
  modeTitle: string;
  level: LevelKey;
  onLevelChange: (key: LevelKey) => void;
  /** モード固有のクリア条件の1行（先頭の「クリア条件：」は含めない） */
  clearRule: (level: Level) => string;
  onBack: () => void;
  onStart: () => void;
}

/** 難易度設定画面（カウントダウンとチャージが共用する）。 */
export function DifficultySetup({
  modeTitle,
  level,
  onLevelChange,
  clearRule,
  onBack,
  onStart,
}: SetupProps) {
  const L = LEVELS[level];
  return (
    <>
      <ScreenTop backLabel="← 戻る" onBack={onBack} backTestId="setup-back" title={modeTitle} />
      <section className="panel">
        <h2>難易度</h2>
        <DifficultyPicker value={level} onChange={onLevelChange} />
        <ul className="rules">
          <li data-testid="rule-range">
            お題：{jp(L.min)} 〜 {jp(L.max)} 回のあいだでランダム
          </li>
          <li data-testid="rule-turns">ターン数：{L.turns}</li>
          <li data-testid="rule-clear">クリア条件：{clearRule(L)}</li>
        </ul>
        <button type="button" className="btn" onClick={onStart} data-testid="setup-start">
          お題を引く
        </button>
      </section>
    </>
  );
}
