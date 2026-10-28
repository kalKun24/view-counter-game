/** ハイ＆ロー対戦の判定。ゲーム状態は手の履歴（moves）だけで、ほかは導出する。 */

export type Direction = "higher" | "lower";

/** ok：成功 / lose：負けて脱落 / nomatch：該当なしで脱落 / zero：0ちょうどでその場で勝ち */
export type MoveOutcome = "ok" | "lose" | "nomatch" | "zero";

export interface Move {
  /** 登録順の位置 */
  player: number;
  query: string;
  outcome: MoveOutcome;
  /** nomatch では無し */
  viewCount?: number;
  title?: string;
  /** 判定値（10,000 未満を切り捨てた値）。nomatch では無し */
  truncated?: number;
  /** 比べた相手の値（higher の最初の1手は null。lower の最初の1手はお題） */
  prev: number | null;
}

/** 判定値と前の値から結果を決める。同値は負け。負けでなく 0 ちょうどなら zero。 */
export function judgeMove(
  dir: Direction,
  prev: number | null,
  truncated: number,
): "ok" | "lose" | "zero" {
  const lose = prev !== null && (dir === "higher" ? truncated <= prev : truncated >= prev);
  if (lose) return "lose";
  return truncated === 0 ? "zero" : "ok";
}

export interface GameView {
  alive: boolean[];
  /** 次に打つ人（決着後は最後に打った人の次） */
  current: number;
  /** 前の値。成功した手だけが更新する。higher の最初は null、lower の最初はお題 */
  prev: number | null;
  winner: number | null;
  winReason: "last" | "zero" | null;
  /** 成功した手がまだ無いか */
  isFirstHand: boolean;
}

export function deriveGame(
  count: number,
  dir: Direction,
  topic: number | null,
  moves: Move[],
): GameView {
  const alive = Array.from({ length: count }, () => true);
  let prev: number | null = dir === "lower" ? topic : null;
  let isFirstHand = true;
  let zeroWinner: number | null = null;
  for (const m of moves) {
    if (m.outcome === "lose" || m.outcome === "nomatch") alive[m.player] = false;
    if (m.outcome === "ok" && m.truncated !== undefined) {
      prev = m.truncated;
      isFirstHand = false;
    }
    if (m.outcome === "zero") zeroWinner = m.player;
  }
  const last = moves[moves.length - 1];
  let current = 0;
  if (last) {
    current = last.player;
    for (let i = 1; i <= count; i++) {
      const c = (last.player + i) % count;
      if (alive[c]) {
        current = c;
        break;
      }
    }
  }
  const survivors = alive.flatMap((a, i) => (a ? [i] : []));
  if (zeroWinner !== null) {
    return { alive, current, prev, winner: zeroWinner, winReason: "zero", isFirstHand };
  }
  if (survivors.length === 1) {
    return { alive, current, prev, winner: survivors[0], winReason: "last", isFirstHand };
  }
  return { alive, current, prev, winner: null, winReason: null, isFirstHand };
}
