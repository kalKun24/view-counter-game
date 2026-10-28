/** 難易度。試作版の LEVELS と同値。 */
export type LevelKey = "easy" | "normal" | "hard";

export interface Level {
  name: string;
  turns: number;
  min: number;
  max: number;
  tol: number;
}

export const LEVELS: Record<LevelKey, Level> = {
  easy: { name: "やさしい", turns: 6, min: 1e8, max: 3e8, tol: 0.05 },
  normal: { name: "ふつう", turns: 5, min: 3e8, max: 1e9, tol: 0.02 },
  hard: { name: "むずかしい", turns: 4, min: 1e9, max: 5e9, tol: 0.005 },
};

export const LEVEL_KEYS: LevelKey[] = ["easy", "normal", "hard"];

export const isLevelKey = (v: unknown): v is LevelKey =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(LEVELS, v);
