import { render, screen, waitFor, within } from "@testing-library/react";
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
  it("503 quota_exceeded：「今日は遊べません」を出し、結果にならず、ターンも使用済みも変えない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = mockFetch(found(1_000_000, "一回目"), quotaExceeded());
    const user = setup();
    await startSolo(user, "countdown");
    await search(user, "first");
    await waitFor(() => expect(tid("counter-turns")).toHaveTextContent("残り4ターン"));
    const valueBefore = tid("counter-value").textContent;

    await search(user, "quota");
    expect(await screen.findByTestId("quota-notice")).toBeInTheDocument();
    expect(tid("quota-title")).toHaveTextContent("今日は遊べません");
    expect(tid("quota-title")).toHaveFocus();
    expect(tid("quota-message")).toHaveTextContent(
      "サーバーの1日の利用上限に達しました。日をあらためて、もう一度遊んでください。",
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
    d.resolve(quotaExceeded());
    await Promise.resolve();
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
    expect(tid("quota-title")).toHaveTextContent("今日は遊べません");
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
    expect(tid("quota-title")).toHaveTextContent("今日は遊べません");
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
