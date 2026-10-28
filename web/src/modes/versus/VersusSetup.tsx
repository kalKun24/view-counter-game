import { useEffect, useRef, useState } from "react";
import { ScreenTop } from "../../components/ScreenTop";
import type { Direction } from "./judge";
import { MAX_PLAYERS, MIN_PLAYERS, NAME_MAX, type VsPrefs } from "./vsPrefs";

interface Props {
  title: string;
  initial: VsPrefs;
  onChange: (prefs: VsPrefs) => void;
  onBack: () => void;
  /** 空欄を「プレイヤーN」にした名前の一覧 */
  onStart: (dir: Direction, names: string[]) => void;
}

interface Row {
  id: number;
  name: string;
}

const HELP: Record<Direction, string> = {
  higher: "前の人より低い数字を出したら負け。同じ数字も負け。負けた人は脱落し、残りで続ける。",
  lower:
    "前の人より高い数字を出したら負け。同じ数字も負け。最初の人はお題の数字より低く。負けた人は脱落し、残りで続ける。",
};

export function VersusSetup({ title, initial, onChange, onBack, onStart }: Props) {
  const nextId = useRef(initial.players.length);
  const [dir, setDir] = useState<Direction>(initial.dir);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.players.map((name, id) => ({ id, name })),
  );
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const focusIndex = useRef<number | null>(null);

  useEffect(() => {
    if (focusIndex.current === null) return;
    const row = rows[focusIndex.current];
    focusIndex.current = null;
    if (row) inputs.current.get(row.id)?.focus();
  }, [rows]);

  const update = (nextDir: Direction, nextRows: Row[]) => {
    setDir(nextDir);
    setRows(nextRows);
    onChange({ dir: nextDir, players: nextRows.map((r) => r.name) });
  };

  const add = () => {
    if (rows.length >= MAX_PLAYERS) return;
    focusIndex.current = rows.length;
    update(dir, [...rows, { id: nextId.current++, name: "" }]);
  };

  const remove = (i: number) => {
    if (rows.length <= MIN_PLAYERS) return;
    // 同じ位置の次の行へ。最後の行を消したら1つ前へ。
    focusIndex.current = Math.min(i, rows.length - 2);
    update(
      dir,
      rows.filter((_, k) => k !== i),
    );
  };

  const full = rows.length >= MAX_PLAYERS;

  return (
    <div className="vs-screen" data-testid="vs-setup">
      <ScreenTop backLabel="← 戻る" onBack={onBack} backTestId="vs-back" title={title} />
      <section className="panel">
        <h2>勝ち負けの向き</h2>
        <div className="seg" role="group" aria-label="勝ち負けの向き">
          <button
            type="button"
            aria-pressed={dir === "higher"}
            onClick={() => update("higher", rows)}
            data-testid="vs-dir-higher"
          >
            前より高く
          </button>
          <button
            type="button"
            aria-pressed={dir === "lower"}
            onClick={() => update("lower", rows)}
            data-testid="vs-dir-lower"
          >
            前より低く
          </button>
        </div>
        <p className="muted small" data-testid="vs-dir-help">
          {HELP[dir]}
        </p>
      </section>
      <section className="panel">
        <h2>プレイヤー（2〜8人）</h2>
        <p className="vs-count">
          <span data-testid="vs-player-count">現在 {rows.length} 人</span>
          {full && <span className="muted small"> これ以上増やせません</span>}
        </p>
        {rows.map((r, i) => (
          <div className="vs-player-row" key={r.id}>
            <input
              type="text"
              value={r.name}
              maxLength={NAME_MAX}
              placeholder={`プレイヤー${i + 1}`}
              aria-label={`プレイヤー${i + 1}の名前`}
              autoComplete="off"
              ref={(el) => {
                if (el) inputs.current.set(r.id, el);
                else inputs.current.delete(r.id);
              }}
              onChange={(e) =>
                update(
                  dir,
                  rows.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)),
                )
              }
              data-testid={`vs-player-input-${i}`}
            />
            {rows.length > MIN_PLAYERS && (
              <button
                type="button"
                className="btn ghost vs-remove"
                aria-label={`プレイヤー${i + 1}を削除`}
                onClick={() => remove(i)}
                data-testid={`vs-player-remove-${i}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div className="row">
          <button
            type="button"
            className="btn ghost"
            disabled={full}
            onClick={add}
            data-testid="vs-add-player"
          >
            ＋ 追加
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              onStart(
                dir,
                rows.map((r, i) => r.name.trim() || `プレイヤー${i + 1}`),
              )
            }
            data-testid="vs-start"
          >
            スタート
          </button>
        </div>
        <p className="muted small">最後の1人まで残った人の勝ち。0ちょうどを出した人は、その場で勝ち。</p>
      </section>
    </div>
  );
}
