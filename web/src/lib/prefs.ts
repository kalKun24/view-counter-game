import { isLevelKey, type LevelKey } from "./levels";

/** localStorage のキー。#5 が dir / players を同じキーに足す。 */
export const PREFS_KEY = "vc-prefs";

function readAll(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function loadLevel(): LevelKey {
  const level = readAll().level;
  return isLevelKey(level) ? level : "normal";
}

/** 既存の他のキー（dir, players など）を壊さずに一部だけ保存する。失敗は無視する。 */
export function savePrefs(patch: Record<string, unknown>): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readAll(), ...patch }));
  } catch {
    /* 保存できなくても遊べる */
  }
}
