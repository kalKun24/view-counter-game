import { useCallback, useMemo, useState } from "react";
import { Counter, CounterBar } from "../../components/Counter";
import { ScreenTop } from "../../components/ScreenTop";
import { SearchForm } from "../../components/SearchForm";
import { WordLog, type LogRow } from "../../components/WordLog";
import type { FetchOutcome } from "../../hooks/useViewsFetch";
import { comma, jp, truncateViews } from "../../lib/format";
import type { Level } from "../../lib/levels";
import { normKey } from "../../lib/words";
import { judge, REASONS, remainingOf } from "./judge";

export interface CountdownFinish {
  win: boolean;
  reason: string;
  log: LogRow[];
}

interface Props {
  title: string;
  level: Level;
  target: number;
  onFinish: (result: CountdownFinish) => void;
  onQuit: () => void;
}

export function CountdownPlay({ title, level, target, onFinish, onQuit }: Props) {
  // 履歴だけをゲーム状態として持つ。残り・ターン数・使用済みは履歴から導く。
  const [log, setLog] = useState<LogRow[]>([]);
  const remaining = remainingOf(target, log);
  const left = level.turns - log.length;

  const usedKeys = useMemo(() => new Set(log.map((r) => normKey(r.query))), [log]);
  const isUsed = useCallback((key: string) => usedKeys.has(key), [usedKeys]);

  const onResult = (r: FetchOutcome) => {
    if (r.type === "nomatch") {
      onFinish({
        win: false,
        reason: `条件に合う動画が見つかりませんでした。（ワード：${r.query}）`,
        log,
      });
      return;
    }
    const next = [
      ...log,
      { query: r.query, truncated: truncateViews(r.viewCount), actual: r.viewCount, title: r.title },
    ];
    const outcome = judge(target, level, next);
    if (outcome === "continue") {
      setLog(next);
      return;
    }
    onFinish({ win: outcome === "clear", reason: REASONS[outcome], log: next });
  };

  const last = log[log.length - 1];
  const announce = last
    ? `${jp(last.truncated)} を引いて、残り ${jp(remaining)}。残り${left}ターン。`
    : "";

  return (
    <>
      <ScreenTop
        backLabel="やめる"
        onBack={onQuit}
        backTestId="play-quit"
        title={title}
        focusHeading={false}
      />
      <Counter
        testIdPrefix="counter"
        label={
          <>
            のこり ・ お題 <span data-testid="counter-target">{jp(target)}</span>
          </>
        }
        value={comma(remaining)}
        sub={
          <>
            <span data-testid="counter-sub">{jp(remaining)} 回</span> ／{" "}
            <span data-testid="counter-turns">残り{left}ターン</span>
          </>
        }
        bar={
          <CounterBar
            testIdPrefix="counter"
            percent={Math.max(0, (remaining / target) * 100)}
            markPercent={level.tol * 100}
          />
        }
      />
      <SearchForm isUsed={isUsed} onResult={onResult} onHome={onQuit} />
      <p className="sr-only" role="status">
        {announce}
      </p>
      <WordLog rows={log} sign={"−"} />
    </>
  );
}
