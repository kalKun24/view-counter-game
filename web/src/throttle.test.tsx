import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { parseRetryAfter } from "./api/views";
import { LEVELS, type LevelKey } from "./lib/levels";
import {
  deferred,
  found,
  jsonResponse,
  mockFetch,
  notFound,
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

const MESSAGE_30 = "操作が多すぎます。あと約30秒待ってから、もう一度試してください。";
const MESSAGE_NONE = "少し待ってから、もう一度試してください。";
const ABSENT = ["error-message", "retry-button", "result-heading", "quota-notice", "loading-message"];

/** 応答の処理が済んだこと（文言の出現）を待つ。否定の確認はこのあとに行う。 */
const throttled = () => screen.findByTestId("throttle-message");

afterEach(() => vi.restoreAllMocks());

describe("parseRetryAfter（基準2）", () => {
  it.each([
    ["30", 30],
    ["7", 7],
    ["007", 7],
    [" 12 ", 12],
    ["3600", 3600],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])("%s は %s", (raw, n) => {
    expect(parseRetryAfter(raw)).toBe(n);
  });

  it.each([
    null,
    "",
    "0",
    "00",
    "-5",
    "abc",
    "Wed, 21 Oct 2026 07:28:00 GMT",
    "1.5",
    "+5",
    "1,000",
    "30s",
    String(Number.MAX_SAFE_INTEGER + 1),
    "99999999999999999999",
  ])("%j は null（秒数を出さない）", (raw) => {
    expect(parseRetryAfter(raw)).toBeNull();
  });
});

describe("連打の制限（PBI 25・カウントダウン）", () => {
  it("基準1・3・4：文言を出し、通信失敗や再試行ボタンは出さず、入力は残り、ターンも履歴も変わらない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = mockFetch(found(1_000_000, "一回目"), tooMany("30"));
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "first");
    await waitFor(() => expect(tid("counter-turns")).toHaveTextContent("残り4ターン"));
    const valueBefore = tid("counter-value").textContent;

    await search(user, "limited word");
    const msg = await throttled();
    expect(msg.textContent).toBe(MESSAGE_30);
    expect(msg).toHaveClass("msg");
    expect(msg).not.toHaveClass("bad");
    expect(tid("search-status")).toHaveAttribute("data-state", "throttled");
    expect(tid("search-status")).toHaveAttribute("data-retry-after", "30");
    expect(msg.closest('[role="status"]')).not.toBeNull();
    for (const id of ABSENT) expect(queryTid(id)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(tid("search-input")).toHaveValue("limited word");
    expect(tid("search-input")).toHaveFocus();
    expect(tid("search-submit")).toBeEnabled();
    expect(tid("counter-turns")).toHaveTextContent("残り4ターン");
    expect(tid("counter-value").textContent).toBe(valueBefore);
    expect(screen.getAllByTestId("log-row")).toHaveLength(1);
    expect(requestedQueries(f)).toEqual(["first", "limited word"]);
    // ログに検索ワードを含めない
    expect(JSON.stringify(warn.mock.calls)).not.toContain("limited");
  });

  it("基準4：使用済みに入らない（同じワードを再送でき、重複にならない）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = mockFetch(tooMany("5"), found(1_000_000, "再送できた"));
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "same");
    await throttled();
    await user.click(tid("search-submit"));
    await waitFor(() => expect(tid("log-title")).toHaveTextContent("再送できた"));
    expect(requestedQueries(f)).toEqual(["same", "same"]);
    expect(queryTid("throttle-message")).toBeNull();
  });

  it("基準2：Retry-After が無い・0・負・数字でない・小数のときは秒数を出さない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(tooMany(undefined), tooMany("0"), tooMany("-5"), tooMany("abc"), tooMany("1.5"));
    const user = setup();
    await startSolo(user, "countdown");
    for (const w of ["a", "b", "c", "d", "e"]) {
      await search(user, w);
      const msg = await throttled();
      expect(msg.textContent).toBe(MESSAGE_NONE);
      expect(tid("search-status")).not.toHaveAttribute("data-retry-after");
    }
  });

  it("基準2：整数秒をそのまま出す（桁区切りなし・言い換えなし）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(tooMany("3600"), tooMany("007"));
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "a");
    expect((await throttled()).textContent).toBe(
      "操作が多すぎます。あと約3600秒待ってから、もう一度試してください。",
    );
    expect(tid("search-status")).toHaveAttribute("data-retry-after", "3600");
    await search(user, "b");
    await waitFor(() => expect(tid("throttle-message").textContent).toContain("あと約7秒"));
  });

  it("基準2：時間が経っても自動では消えず、数字も動かない（カウントダウンなし）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(tooMany("30"));
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "a");
    await throttled();
    await new Promise((r) => setTimeout(r, 1500));
    expect(tid("throttle-message").textContent).toBe(MESSAGE_30);
  });

  it("消える条件：次の送信で取得中に変わり、入力を変えると消える", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deferred();
    mockFetch(tooMany("30"), d.promise);
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "a");
    await throttled();
    await user.click(tid("search-submit"));
    expect(await screen.findByTestId("loading-message")).toBeInTheDocument();
    expect(queryTid("throttle-message")).toBeNull();
    d.resolve(tooMany("12"));
    expect((await throttled()).textContent).toContain("あと約12秒");
    await user.type(tid("search-input"), "x");
    expect(queryTid("throttle-message")).toBeNull();
    expect(tid("search-status")).toHaveAttribute("data-state", "idle");
  });

  it("基準5：429 でも too_many_requests 以外は従来の通信失敗（再試行あり）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(
      tooMany("30", "other"),
      jsonResponse({ error: {} }, 429),
      new Response("not json", { status: 429, headers: { "Retry-After": "30" } }),
    );
    const user = setup();
    await startSolo(user, "countdown");
    for (const w of ["a", "b", "c"]) {
      await search(user, w);
      await waitFor(() => expect(tid("search-status")).toHaveAttribute("data-state", "error"));
      expect(tid("retry-button")).toBeInTheDocument();
      expect(tid("error-message")).toHaveTextContent("取得に失敗しました。");
      expect(queryTid("throttle-message")).toBeNull();
    }
  });

  it("取得中に「やめる」を押したら、届いた制限の応答は表示しない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deferred();
    mockFetch(d.promise);
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "slow");
    await user.click(tid("play-quit"));
    d.resolve(tooMany("30"));
    await Promise.resolve();
    expect(tid("home-title")).toBeInTheDocument();
    expect(queryTid("throttle-message")).toBeNull();
  });

  it("制限中の「やめる」でホームへ戻る", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(tooMany("30"));
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "a");
    await throttled();
    await user.click(tid("play-quit"));
    expect(tid("home-title")).toBeInTheDocument();
  });
});

describe("連打の制限（PBI 25・チャージ）", () => {
  it("基準4：合計・ターン・履歴を変えず、結果にもならない。入力は残る", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(found(100_000_000), tooMany("30"));
    const user = setup();
    await startSolo(user, "charge");
    await search(user, "a");
    expect(await screen.findByText("+1億")).toBeInTheDocument();
    const total = tid("charge-total").textContent;
    const sub = tid("charge-sub").textContent;
    const rows = screen.getAllByTestId("log-row").length;

    await search(user, "b");
    expect((await throttled()).textContent).toBe(MESSAGE_30);
    for (const id of ABSENT) expect(queryTid(id)).toBeNull();
    expect(tid("charge-total").textContent).toBe(total);
    expect(tid("charge-sub").textContent).toBe(sub);
    expect(screen.getAllByTestId("log-row")).toHaveLength(rows);
    expect(tid("search-input")).toHaveValue("b");
    expect(tid("search-submit")).toBeEnabled();
  });

  it("基準4：使用済みに入らない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(tooMany("30"), found(100_000_000, "通った"));
    const user = setup();
    await startSolo(user, "charge");
    await search(user, "b");
    await throttled();
    await user.click(tid("search-submit"));
    await waitFor(() => expect(tid("log-title")).toHaveTextContent("通った"));
  });
});

describe("連打の制限（PBI 25・ハイ＆ロー対戦）", () => {
  it("基準4：脱落させず手番も動かさない。引き継ぎも結果も出さず、入力は残る", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(tooMany("30"));
    const user = setup();
    await startVersus(user);
    const alive = tid("vs-alive-count").textContent;
    await search(user, "w1");

    expect((await throttled()).textContent).toBe(MESSAGE_30);
    for (const id of [...ABSENT, "vs-handoff", "vs-result", "log"]) {
      expect(queryTid(id)).toBeNull();
    }
    expect(tid("vs-current-player")).toHaveTextContent("A");
    expect(tid("vs-survivor-0").dataset.status).toBe("current");
    expect(tid("vs-survivor-1").dataset.status).toBe("alive");
    expect(tid("vs-alive-count").textContent).toBe(alive);
    expect(tid("search-input")).toHaveValue("w1");
    expect(tid("search-submit")).toBeEnabled();
  });

  it("基準4：待ったあとの検索は通常どおり処理される（制限中は脱落ではなかった）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(tooMany("30"), notFound());
    const user = setup();
    await startVersus(user);
    await search(user, "w1");
    await throttled();
    await user.click(tid("search-submit"));
    // 該当なしで初めて A が脱落する
    await waitFor(() => expect(queryTid("vs-handoff") ?? queryTid("vs-result")).not.toBeNull());
    expect(queryTid("throttle-message")).toBeNull();
  });
});
