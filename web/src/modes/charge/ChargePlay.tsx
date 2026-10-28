import { useCallback, useMemo, useState } from "react";
import { ScreenTop } from "../../components/ScreenTop";
import { SearchForm } from "../../components/SearchForm";
import { WordLog, type LogRow } from "../../components/WordLog";
import type { FetchOutcome } from "../../hooks/useViewsFetch";
import { jp, truncateViews } from "../../lib/format";
import type { Level } from "../../lib/levels";
import { normKey } from "../../lib/words";
import { ChargeCounter } from "./ChargeCounter";
import { judge, REASONS, totalOf } from "./judge";

export interface ChargeFinish {
  win: boolean;
  reason: string;
  log: LogRow[];
}

interface Props {
  title: string;
  level: Level;
  target: number;
  onFinish: (result: ChargeFinish) => void;
  onQuit: () => void;
}

export function ChargePlay({ title, level, target, onFinish, onQuit }: Props) {
  // 履歴だけをゲーム状態として持つ。合計・残りターン・使用済みは履歴から導く。
  const [log, setLog] = useState<LogRow[]>([]);
  const total = totalOf(log);
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
    ? `${jp(last.truncated)} を足して、合計 ${jp(total)}。残り${left}ターン。`
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
      <ChargeCounter target={target} level={level} total={total} left={left} />
      <SearchForm isUsed={isUsed} onResult={onResult} onHome={onQuit} />
      <p className="sr-only" role="status">
        {announce}
      </p>
      <WordLog rows={log} sign="+" />
    </>
  );
}
