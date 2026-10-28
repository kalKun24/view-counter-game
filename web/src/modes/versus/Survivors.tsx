export type SurvivorStatus = "alive" | "current" | "out" | "winner";

interface Props {
  names: string[];
  statuses: SurvivorStatus[];
}

const ARIA: Record<SurvivorStatus, string> = {
  current: "手番",
  alive: "生存",
  out: "脱落",
  winner: "勝者",
};

/** 生存者一覧。登録順の位置で区別する（名前は重複しうる）。色だけで区別せず、記号と文字を併用する。 */
export function Survivors({ names, statuses }: Props) {
  return (
    <ul className="vs-survivors" data-testid="vs-survivors">
      {names.map((name, i) => {
        const s = statuses[i];
        return (
          <li
            key={i}
            className="chip"
            data-status={s}
            data-testid={`vs-survivor-${i}`}
            aria-label={`${name}、${ARIA[s]}`}
            aria-current={s === "current" ? "true" : undefined}
          >
            {s === "current" && <span aria-hidden="true">▶ </span>}
            {s === "winner" && <span aria-hidden="true">勝 </span>}
            <span className="name">{name}</span>
            {s === "out" && <span aria-hidden="true"> 脱落</span>}
          </li>
        );
      })}
    </ul>
  );
}
