import { describe, expect, it } from "vitest";
import { deriveGame, judgeMove, type Move } from "./judge";

const mv = (player: number, outcome: Move["outcome"], truncated?: number, prev: number | null = null): Move => ({
  player,
  query: `q${player}-${String(truncated)}-${outcome}`,
  outcome,
  truncated,
  prev,
});

describe("judgeMove", () => {
  it("higher：最初の1手は何でもOK、以降は前より高くなければ負け（同値も負け）", () => {
    expect(judgeMove("higher", null, 10000)).toBe("ok");
    expect(judgeMove("higher", 100000, 110000)).toBe("ok");
    expect(judgeMove("higher", 100000, 100000)).toBe("lose");
    expect(judgeMove("higher", 100000, 90000)).toBe("lose");
  });
  it("lower：前より低くなければ負け（同値も負け）。最初の1手はお題以上なら負け", () => {
    expect(judgeMove("lower", 500000000, 490000000)).toBe("ok");
    expect(judgeMove("lower", 500000000, 500000000)).toBe("lose");
    expect(judgeMove("lower", 500000000, 600000000)).toBe("lose");
  });
  it("0ちょうどは、負けでなければ zero。higher の2手目以降の0は負け", () => {
    expect(judgeMove("higher", null, 0)).toBe("zero");
    expect(judgeMove("lower", 500000000, 0)).toBe("zero");
    expect(judgeMove("higher", 10000, 0)).toBe("lose");
  });
});

describe("deriveGame", () => {
  it("手番は脱落者を飛ばし、末尾の次は先頭に戻る", () => {
    const moves = [mv(0, "ok", 10000), mv(1, "lose", 10000, 10000)];
    const v = deriveGame(3, "higher", null, moves);
    expect(v.alive).toEqual([true, false, true]);
    expect(v.current).toBe(2);
    const v2 = deriveGame(3, "higher", null, [...moves, mv(2, "ok", 20000, 10000)]);
    expect(v2.current).toBe(0);
  });
  it("脱落（負け・該当なし）では前の値を更新しない", () => {
    const moves = [mv(0, "ok", 30000), mv(1, "lose", 10000, 30000), mv(2, "nomatch", undefined, 30000)];
    const v = deriveGame(4, "higher", null, moves);
    expect(v.prev).toBe(30000);
    expect(v.winner).toBeNull();
  });
  it("lower の最初はお題が前の値", () => {
    expect(deriveGame(2, "lower", 700000000, []).prev).toBe(700000000);
    expect(deriveGame(2, "higher", null, []).prev).toBeNull();
  });
  it("最後の1人が勝ち", () => {
    const v = deriveGame(2, "higher", null, [mv(0, "ok", 10000), mv(1, "nomatch", undefined, 10000)]);
    expect(v.winner).toBe(0);
    expect(v.winReason).toBe("last");
  });
  it("0ちょうどは残り人数に関わらずその場で勝ち", () => {
    const v = deriveGame(4, "lower", 600000000, [mv(0, "zero", 0, 600000000)]);
    expect(v.winner).toBe(0);
    expect(v.winReason).toBe("zero");
  });
});
