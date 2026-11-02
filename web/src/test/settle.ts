import { act } from "@testing-library/react";
import { setImmediate as nextMacrotask } from "node:timers/promises";

/**
 * 否定のテスト（〜が出ない・〜が変わらない）の前に、応答の処理が済むまで待つ。
 * 使い方：`d.resolve(res); await settleAfter(d.promise);` のあとで「出ない」ことを検証する。
 * 渡した応答（Promise）が解決し、そのあとの Promise 連鎖と React の状態更新が反映されるまで戻らない。
 * 偽タイマーを使うテストでも、node の本物のタイマーで待つ。
 */
export async function settleAfter(...pending: Array<Promise<unknown>>): Promise<void> {
  await Promise.allSettled(pending);
  // マイクロタスクをすべて流し切るため、マクロタスク境界を複数回またぐ（Response.json() など）。
  await act(async () => {
    for (let i = 0; i < 5; i++) await nextMacrotask();
  });
}
