import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { LEVELS, type LevelKey } from "./lib/levels";
import {
  deferred,
  found,
  jsonResponse,
  mockFetch,
  quotaExceeded,
  requestedQueries,
  tooMany,
} from "./test/fakeApi";

const tid = (id: string) => screen.getByTestId(id);
const queryTid = (id: string) => screen.queryByTestId(id);
type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const user = userEvent.setup();
  render(<App />);
  return user;
}

async function startSolo(user: User, mode: "countdown" | "charge", level: LevelKey = "normal") {
  const L = LEVELS[level];
  vi.spyOn(Math, "random").mockReturnValue((500_000_000 - L.min + 0.5) / (L.max - L.min));
  await user.click(tid(`mode-${mode}`));
  await user.click(tid(`level-${level}`));
  await user.click(tid("setup-start"));
}

async function startVersus(user: User) {
  await user.click(tid("mode-versus"));
  await user.type(tid("vs-player-input-0"), "A");
  await user.type(tid("vs-player-input-1"), "B");
  await user.click(tid("vs-start"));
}

async function search(user: User, word: string) {
  await user.clear(tid("search-input"));
  await user.type(tid("search-input"), word);
  await user.click(tid("search-submit"));
}

const GONE = ["search-input", "search-submit", "search-status", "retry-button", "result-heading"];

describe("クォータ切れ（PBI 11・カウントダウン）", () => {
  it("503 quota_exceeded：「いまは遊べません」を出し、結果にならず、ターンも使用済みも変えない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = mockFetch(found(1_000_000, "一回目"), quotaExceeded());
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "first");
    await waitFor(() => expect(tid("counter-turns")).toHaveTextContent("残り4ターン"));
    const valueBefore = tid("counter-value").textContent;

    await search(user, "quota");
    expect(await screen.findByTestId("quota-notice")).toBeInTheDocument();
    expect(tid("quota-title")).toHaveTextContent("いまは遊べません");
    expect(tid("quota-title")).toHaveFocus();
    expect(tid("quota-message")).toHaveTextContent(
      "サーバーの利用上限に達しました。しばらくしてから、もう一度遊んでください。",
    );
    expect(tid("quota-notice")).toHaveTextContent("ゲームは進んでいません。ターンは減っていません。");
    // 通信失敗の文言とは区別する
    expect(tid("quota-notice")).not.toHaveTextContent(/エラー|失敗|通信/);
    for (const id of GONE) expect(queryTid(id)).toBeNull();
    // QuotaNotice のボタンは「ホームへ戻る」だけ
    expect(within(tid("quota-notice")).getAllByRole("button")).toEqual([tid("quota-home")]);
    // 残り・ターン・履歴は直前のまま
    expect(tid("counter-turns")).toHaveTextContent("残り4ターン");
    expect(tid("counter-value").textContent).toBe(valueBefore);
    expect(tid("log-title")).toHaveTextContent("一回目");
    expect(requestedQueries(f)).toEqual(["first", "quota"]);
  });

  it("「ホームへ戻る」でモード選択に戻り、新しいゲームでは通常どおり遊べる（記憶しない）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(quotaExceeded(), found(1_000_000, "再開"));
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "quota");
    await user.click(await screen.findByTestId("quota-home"));
    expect(tid("home-title")).toBeInTheDocument();
    expect(queryTid("quota-notice")).toBeNull();

    await startSolo(user, "countdown");
    expect(tid("search-input")).toBeInTheDocument();
    await search(user, "quota"); // 同じワードが使用済みになっていない
    await waitFor(() => expect(tid("log-title")).toHaveTextContent("再開"));
  });

  it("クォータ切れでも「やめる」でホームへ戻る", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(quotaExceeded());
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "quota");
    await screen.findByTestId("quota-notice");
    await user.click(tid("play-quit"));
    expect(tid("home-title")).toBeInTheDocument();
  });

  it("503 でも quota_exceeded でなければ従来どおり通信失敗（再試行あり）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(jsonResponse({ error: { code: "other", message: "x" } }, 503));
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "x");
    await waitFor(() => expect(tid("search-status")).toHaveAttribute("data-state", "error"));
    expect(tid("retry-button")).toBeInTheDocument();
    expect(queryTid("quota-notice")).toBeNull();
  });

  it("取得中に「やめる」を押したら、届いたクォータ切れの応答は表示しない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deferred();
    mockFetch(d.promise);
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "slow");
    await user.click(tid("play-quit"));
    d.resolve(quotaExceeded("3600"));
    // 応答が処理されるのに十分な実時間を置く（1回の microtask の待ちでは足りない）
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(tid("home-title")).toBeInTheDocument();
    expect(queryTid("quota-notice")).toBeNull();
  });
});

describe("クォータ切れ（PBI 11・チャージ）", () => {
  it("503 quota_exceeded：合計・ターン・履歴を変えず、結果にもならない。ホームへ戻れる", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(found(100_000_000), quotaExceeded());
    const user = setup();
    await startSolo(user, "charge");
    await search(user, "a");
    expect(await screen.findByText("+1億")).toBeInTheDocument();
    const total = tid("charge-total").textContent;
    const sub = tid("charge-sub").textContent;

    await search(user, "quota");
    expect(await screen.findByTestId("quota-notice")).toBeInTheDocument();
    expect(tid("quota-title")).toHaveTextContent("いまは遊べません");
    for (const id of GONE) expect(queryTid(id)).toBeNull();
    expect(tid("charge-total").textContent).toBe(total);
    expect(tid("charge-sub").textContent).toBe(sub);
    expect(tid("log")).toBeInTheDocument();

    await user.click(tid("quota-home"));
    expect(tid("home-title")).toBeInTheDocument();
  });
});

describe("クォータ切れ（PBI 11・ハイ＆ロー対戦）", () => {
  it("503 quota_exceeded：脱落させず手番も動かさない。引き継ぎも結果も出さず、ホームへ戻れる", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(quotaExceeded());
    const user = setup();
    await startVersus(user);
    await search(user, "w1");

    expect(await screen.findByTestId("quota-notice")).toBeInTheDocument();
    expect(tid("quota-title")).toHaveTextContent("いまは遊べません");
    for (const id of [...GONE, "vs-handoff", "vs-result", "log"]) {
      expect(queryTid(id)).toBeNull();
    }
    expect(tid("vs-current-player")).toHaveTextContent("A");
    expect(tid("vs-survivor-0").dataset.status).toBe("current");
    expect(tid("vs-survivor-1").dataset.status).toBe("alive");

    await user.click(tid("quota-home"));
    expect(tid("home-title")).toBeInTheDocument();
  });
});

const PREFIX = "サーバーの利用上限に達しました。";
const NO_WAIT = `${PREFIX}しばらくしてから、もう一度遊んでください。`;

async function quotaWith(retryAfter: string | undefined, extra?: Record<string, unknown>) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mockFetch(quotaExceeded(retryAfter, extra));
  const user = setup();
  await startSolo(user, "countdown");
  await search(user, "quota");
  await screen.findByTestId("quota-notice");
  return user;
}

describe("待ち時間の表示（PBI 32）", () => {
  it.each([
    ["1", "あと約1秒で、もう一度遊べます。"],
    ["59", "あと約59秒で、もう一度遊べます。"],
    ["60", "あと約1分で、もう一度遊べます。"],
    ["61", "あと約2分で、もう一度遊べます。"],
    ["120", "あと約2分で、もう一度遊べます。"],
    ["3540", "あと約59分で、もう一度遊べます。"],
    ["3599", "あと約60分で、もう一度遊べます。"],
    ["3600", "あと約1時間で、もう一度遊べます。"],
    ["3601", "あと約2時間で、もう一度遊べます。"],
    ["7200", "あと約2時間で、もう一度遊べます。"],
    ["82800", "あと約23時間で、もう一度遊べます。"],
    ["86400", "あと約24時間で、もう一度遊べます。"],
    ["90000", "あと約25時間で、もう一度遊べます。"],
  ])("Retry-After %s 秒 → %s", async (raw, tail) => {
    await quotaWith(raw);
    expect(tid("quota-message").textContent).toBe(PREFIX + tail);
    expect(tid("quota-notice")).toHaveAttribute("data-retry-after", raw);
    expect(tid("quota-title").textContent).toBe("いまは遊べません");
    expect(tid("quota-notice")).toHaveTextContent("ゲームは進んでいません。ターンは減っていません。");
  });

  it("先頭 0 付き（0060）は 60 秒として読む。data-retry-after は 60", async () => {
    await quotaWith("0060");
    expect(tid("quota-message").textContent).toBe(`${PREFIX}あと約1分で、もう一度遊べます。`);
    expect(tid("quota-notice")).toHaveAttribute("data-retry-after", "60");
  });

  it.each([
    ["ヘッダー無し", undefined],
    ["0", "0"],
    ["-5", "-5"],
    ["abc", "abc"],
    ["1.5", "1.5"],
    ["+5", "+5"],
    ["1,000", "1,000"],
    ["30s", "30s"],
    ["日付形式", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["安全な整数超過", "9007199254740993"],
    ["複数の値", "60, 60"],
  ])("使えない Retry-After（%s）：「しばらくしてから」の文。数字も単位も出ない", async (_n, raw) => {
    await quotaWith(raw);
    expect(tid("quota-message").textContent).toBe(NO_WAIT);
    expect(tid("quota-message").textContent).not.toMatch(/[0-9約]|秒|分|時間/);
    expect(tid("quota-notice")).not.toHaveAttribute("data-retry-after");
    expect(tid("quota-notice")).toHaveTextContent("ゲームは進んでいません。ターンは減っていません。");
  });

  it("旧文言（今日は遊べません・明日・日をあらためて・1日の）が出ない（秒数あり・なしの両方）", async () => {
    await quotaWith("3600");
    const withWait = tid("quota-notice").textContent ?? "";
    expect(withWait).not.toMatch(/今日は遊べません|明日|日をあらためて|1日/);
    expect(withWait).not.toMatch(/エラー|失敗|通信/);
  });

  it("旧文言が出ない（秒数なし）", async () => {
    await quotaWith(undefined);
    const text = tid("quota-notice").textContent ?? "";
    expect(text).not.toMatch(/今日は遊べません|明日|日をあらためて|1日/);
  });

  it("本文の error.code 以外の値（残り・使用量・上限）を画面が読まない", async () => {
    await quotaWith("3600", { remaining: 4321, used: 5678, limit: 9999, retryAfter: 17 });
    const text = tid("quota-notice").textContent ?? "";
    expect(text).not.toMatch(/4321|5678|9999|17/);
    expect(tid("quota-message").textContent).toBe(`${PREFIX}あと約1時間で、もう一度遊べます。`);
  });

  it("コンソールの警告に retryAfter を残し、検索ワードは含めない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(quotaExceeded("90"));
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "secretword");
    await screen.findByTestId("quota-notice");
    expect(warn).toHaveBeenCalledWith("views fetch rejected: quota_exceeded", { retryAfter: 90 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secretword");
  });

  it("503 で quota_exceeded 以外は、Retry-After があっても通信失敗のまま", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(
      new Response(JSON.stringify({ error: { code: "other", message: "x" } }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Retry-After": "3600" },
      }),
    );
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "x");
    await waitFor(() => expect(tid("search-status")).toHaveAttribute("data-state", "error"));
    expect(tid("retry-button")).toBeInTheDocument();
    expect(queryTid("quota-notice")).toBeNull();
  });

  it("429 の表示は秒のまま（Retry-After 3600 でも「約3600秒」。分・時間にならない）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(tooMany("3600"));
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "x");
    const msg = await screen.findByTestId("throttle-message");
    expect(msg.textContent).toBe("操作が多すぎます。あと約3600秒待ってから、もう一度試してください。");
    expect(tid("search-status")).toHaveAttribute("data-state", "throttled");
    expect(msg.textContent).not.toMatch(/分|時間/);
    expect(queryTid("quota-notice")).toBeNull();
  });
});
