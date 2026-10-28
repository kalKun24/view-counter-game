import { PREFS_KEY, savePrefs } from "../../lib/prefs";
import type { Direction } from "./judge";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const NAME_MAX = 16;

export interface VsPrefs {
  dir: Direction;
  players: string[];
}

/** 保存済みの向きと名前。壊れた値は既定に戻す。 */
export function loadVsPrefs(): VsPrefs {
  let raw: unknown = {};
  try {
    raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    raw = {};
  }
  const o = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const dir: Direction = o.dir === "lower" ? "lower" : "higher";
  const p = o.players;
  const players =
    Array.isArray(p) &&
    p.length >= MIN_PLAYERS &&
    p.length <= MAX_PLAYERS &&
    p.every((x) => typeof x === "string")
      ? (p as string[]).map((x) => x.slice(0, NAME_MAX))
      : ["", ""];
  return { dir, players };
}

export const saveVsPrefs = (prefs: VsPrefs): void =>
  savePrefs({ dir: prefs.dir, players: prefs.players });
