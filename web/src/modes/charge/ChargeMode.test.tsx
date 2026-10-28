import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { LEVELS, type LevelKey } from "../../lib/levels";
import {
  deferred,
  found,
  invalidQuery,
  mockFetch,
  notFound,
  requestedQueries,
  upstreamError,
} from "../../test/fakeApi";

const tid = (id: string) => screen.getByTestId(id);
const queryTid = (id: string) => screen.queryByTestId(id);
type User = ReturnType<typeof userEvent.setup>;

/** 目標を固定して「お題を引く」まで進める（Math.random の差し替え。本番に開発用スイッチは無い）。 */
async function startGame(
  user: User,
  { level = "normal", target = 500_000_000 }: { level?: LevelKey; target?: number } = {},
) {
  const L = LEVELS[level];
  vi.spyOn(Math, "random").mockReturnValue((target - L.min + 0.5) / (L.max - L.min));
  await user.click(tid("mode-charge"));
  await user.click(tid(`level-${level}`));
  await user.click(tid("setup-start"));
}

async function search(user: User, word: string) {
  await user.clear(tid("search-input"));
  await user.type(tid("search-input"), word);
  await user.click(tid("search-submit"));
}

function setup() {
  const user = userEvent.setup();
  render(<App />);
  return user;
}

describe("難易度設定（チャージ）", () => {
  it.each([
    ["easy", "1億 〜 3億", "6", "105%"],
    ["normal", "3億 〜 10億", "5", "102%"],
    ["hard", "10億 〜 50億", "4", "100.5%"],
  ] as const)("%s の範囲・ターン数・クリア条件", async (level, range, turns, limit) => {
    const user = setup();
    await user.click(tid("mode-charge"));
    await user.click(tid(`level-${level}`));
    expect(tid("rule-range")).toHaveTextContent(range);
    expect(tid("rule-turns")).toHaveTextContent(turns);
    expect(tid("charge-rule")).toHaveTextContent(
      `クリア条件：目標以上、かつ目標の ${limit} 以下（超えたらバースト）`,
    );
    expect(queryTid("rule-clear")).toBeNull();
  });
});

describe("プレイ画面（初期）", () => {
  it("合計 0、あと{目標}回、残りターン、バー 0%、履歴なし", async () => {
    const user = setup();
    await startGame(user);
    expect(tid("charge-label")).toHaveTextContent("合計 ・ 目標 5億 〜 上限 5億1000万");
    expect(tid("charge-total")).toHaveTextContent(/^0$/);
    expect(tid("charge-sub")).toHaveTextContent("あと 5億 回 ／ 残り5ターン");
    expect(tid("charge-bar-fill")).toHaveAttribute("data-percent", "0.0");
    expect(tid("charge-bar")).toHaveAttribute("aria-hidden", "true");
    expect(queryTid("log")).toBeNull();
  });
});

describe("合計と履歴（受け入れ基準 2）", () => {
  it("切り捨て値を足し、正しい再生回数とタイトルを履歴に出す", async () => {
    const user = setup();
    mockFetch(found(123_456_789, "動画A"));
    await startGame(user);
    await search(user, "a");
    expect(await screen.findByTestId("charge-total")).toHaveTextContent("123,450,000");
    expect(tid("charge-sub")).toHaveTextContent("あと 3億7655万 回 ／ 残り4ターン");
    expect(tid("log-value")).toHaveTextContent("+1億2345万");
    expect(tid("log-actual")).toHaveTextContent("実際の再生回数 123,456,789 回");
    expect(tid("log-title")).toHaveTextContent("動画A");
    // 123,450,000 / 510,000,000
    expect(tid("charge-bar-fill")).toHaveAttribute("data-percent", "24.2");
    expect(tid("charge-bar-target").style.left).toMatch(/^98\.0/);
    expect(tid("search-input")).toHaveValue("");
    expect(tid("search-input")).toHaveFocus();
  });

  it("10,000 未満は +0 で合計は変わらずターンは減る", async () => {
    const user = setup();
    mockFetch(found(9_999));
    await startGame(user);
    await search(user, "a");
    expect(await screen.findByTestId("log-value")).toHaveTextContent(/^\+0$/);
    expect(tid("charge-total")).toHaveTextContent(/^0$/);
    expect(tid("charge-sub")).toHaveTextContent("残り4ターン");
  });
});

describe("結果（受け入れ基準 3・4）", () => {
  it("ちょうど目標はクリア。detail は小数 1 桁", async () => {
    const user = setup();
    mockFetch(found(500_000_000));
    await startGame(user);
    await search(user, "a");
    expect(await screen.findByTestId("result-heading")).toHaveTextContent("CLEAR");
    expect(tid("result-reason")).toHaveTextContent("目標ラインに到達！");
    expect(tid("result-detail")).toHaveTextContent("合計 500,000,000 回（目標の 100.0%）・1ターン");
    expect(tid("log-value")).toHaveTextContent("+5億");
  });

  it("ちょうど上限(510,000,000)はクリア", async () => {
    const user = setup();
    mockFetch(found(510_000_000));
    await startGame(user);
    await search(user, "a");
    expect(await screen.findByTestId("result-heading")).toHaveTextContent("CLEAR");
    expect(tid("result-detail")).toHaveTextContent("（目標の 102.0%）");
  });

  it("上限を超えたらバースト（GAME OVER）", async () => {
    const user = setup();
    mockFetch(found(520_000_000));
    await startGame(user);
    await search(user, "a");
    expect(await screen.findByTestId("result-heading")).toHaveTextContent("GAME OVER");
    expect(tid("result-reason")).toHaveTextContent("上限を超えてバースト！");
  });

  it("2 回の合計で上限を超えた場合もバースト", async () => {
    const user = setup();
    mockFetch(found(300_000_000), found(215_000_000));
    await startGame(user);
    await search(user, "a");
    await screen.findByTestId("charge-total");
    await search(user, "b");
    expect(await screen.findByTestId("result-reason")).toHaveTextContent("上限を超えてバースト！");
    expect(screen.getAllByTestId("log-row")).toHaveLength(2);
  });

  it("ターン切れ", async () => {
    const user = setup();
    mockFetch(...Array.from({ length: 5 }, (_, i) => found(10_000 * (i + 1))));
    await startGame(user);
    for (let i = 0; i < 5; i++) {
      await search(user, `w${i}`);
      if (i < 4) await screen.findByText(`w${i}`);
    }
    expect(await screen.findByTestId("result-heading")).toHaveTextContent("GAME OVER");
    expect(tid("result-reason")).toHaveTextContent("ターン切れ。");
    expect(tid("result-detail")).toHaveTextContent("・5ターン");
  });

  it("「もう一回」は難易度設定へ（選択保持）、「モード選択へ」はホームへ", async () => {
    const user = setup();
    mockFetch(found(500_000_000));
    await startGame(user, { level: "easy", target: 200_000_000 });
    await search(user, "a");
    await screen.findByTestId("result-heading");
    await user.click(tid("result-again"));
    expect(tid("level-easy")).toHaveAttribute("aria-pressed", "true");
    expect(queryTid("charge-rule")).not.toBeNull();
  });
});

describe("使用済み・該当なし・通信エラー（受け入れ基準 5・6・7）", () => {
  it("同じ組み合わせ（語順・大文字小文字・全角半角）は API を呼ばず拒否し、ターンも合計も進まない", async () => {
    const user = setup();
    const fn = mockFetch(found(100_000_000));
    await startGame(user);
    await search(user, "cat piano");
    await screen.findByTestId("log");
    await search(user, "ＰＩＡＮＯ　Cat");
    expect(tid("search-status")).toHaveAttribute("data-state", "duplicate");
    expect(requestedQueries(fn)).toEqual(["cat piano"]);
    expect(tid("charge-sub")).toHaveTextContent("残り4ターン");
    expect(tid("charge-total")).toHaveTextContent("100,000,000");
  });

  it("該当なしは GAME OVER。その時点の合計で detail を出し、履歴に入れない", async () => {
    const user = setup();
    mockFetch(found(100_000_000), notFound());
    await startGame(user);
    await search(user, "a");
    await screen.findByTestId("log");
    await search(user, "zzz");
    expect(await screen.findByTestId("result-heading")).toHaveTextContent("GAME OVER");
    expect(tid("result-reason")).toHaveTextContent("ワード：zzz");
    expect(tid("result-detail")).toHaveTextContent("合計 100,000,000 回（目標の 20.0%）・1ターン");
    expect(screen.getAllByTestId("log-row")).toHaveLength(1);
  });

  it("取得中は決定ボタン無効と「取得中…」。合計は変わらない", async () => {
    const user = setup();
    const d = deferred();
    mockFetch(d.promise);
    await startGame(user);
    await search(user, "a");
    expect(tid("search-status")).toHaveAttribute("data-state", "loading");
    expect(tid("loading-message")).toHaveTextContent("取得中…");
    expect(tid("search-submit")).toBeDisabled();
    expect(tid("charge-total")).toHaveTextContent(/^0$/);
    d.resolve(found(100_000_000));
    expect(await screen.findByText("+1億")).toBeInTheDocument();
  });

  it("通信エラー（502）は再試行でき、失敗では合計・ターン・使用済みが変わらない", async () => {
    const user = setup();
    const fn = mockFetch(upstreamError(), found(100_000_000));
    await startGame(user);
    await search(user, "a");
    expect(await screen.findByTestId("retry-button")).toBeInTheDocument();
    expect(tid("charge-total")).toHaveTextContent(/^0$/);
    expect(tid("charge-sub")).toHaveTextContent("残り5ターン");
    expect(queryTid("log")).toBeNull();
    await user.click(tid("retry-button"));
    expect(await screen.findByText("+1億")).toBeInTheDocument();
    expect(requestedQueries(fn)).toEqual(["a", "a"]);
  });

  it("400 は再試行なしの案内で、使用済みにならない", async () => {
    const user = setup();
    mockFetch(invalidQuery(), found(100_000_000));
    await startGame(user);
    await search(user, "a");
    expect(await screen.findByText(/検索できません/)).toBeInTheDocument();
    expect(queryTid("retry-button")).toBeNull();
    await search(user, "a");
    expect(await screen.findByText("+1億")).toBeInTheDocument();
  });
});
