export type ModeId = "countdown" | "charge" | "versus";

export interface ModeInfo {
  id: ModeId;
  tag: string;
  title: string;
  description: string;
}

/** ホームに並べる3モード（順序は試作版どおり）。 */
export const MODES: ModeInfo[] = [
  {
    id: "countdown",
    tag: "ソロ・減らす",
    title: "カウントダウン",
    description: "お題の数字から再生回数を引いていく。0を割ったらアウト。0にどこまで近づけるか。",
  },
  {
    id: "charge",
    tag: "ソロ・増やす",
    title: "チャージ",
    description: "0から再生回数を足していき、ターン内に目標ラインへ。上限を超えたらバースト。",
  },
  {
    id: "versus",
    tag: "みんなで・スマホを回す",
    title: "ハイ＆ロー対戦",
    description: "順番に検索。前の人より高い（または低い）数字を出せなかった人の負け。",
  },
];

/**
 * 遊べるモード。ここ1か所で有効/準備中を切り替える。
 * #4（チャージ）と #5（ハイ＆ロー対戦）は自分のモードを true にして、App.tsx の modeScreens に画面を足す。
 */
export const enabledModes: Record<ModeId, boolean> = {
  countdown: true,
  charge: false,
  versus: false,
};

export const modeTitle = (id: ModeId): string => MODES.find((m) => m.id === id)?.title ?? "";
