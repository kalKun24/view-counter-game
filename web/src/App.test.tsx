import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { LEVELS, type LevelKey } from "./lib/levels";
import {
  deferred,
  found,
  invalidQuery,
  jsonResponse,
  mockFetch,
  notFound,
  requestedQueries,
  upstreamError,
} from "./test/fakeApi";

const MINUS = String.fromCharCode(0x2212);
const tid = (id: string) => screen.getByTestId(id);
const queryTid = (id: string) => screen.queryByTestId(id);

type User = ReturnType<typeof userEvent.setup>;

/** お題を target に固定して「お題を引く」まで進める。 */
async function startGame(
  user: User,
  { level = "normal", target = 500_000_000 }: { level?: LevelKey; target?: number } = {},
) {
  const L = LEVELS[level];
  vi.spyOn(Math, "random").mockReturnValue((target - L.min + 0.5) / (L.max - L.min));
  await user.click(tid("mode-countdown"));
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

describe("ホーム", () => {
  it("3モードを出し、カウントダウンとチャージが有効。準備中は aria-disabled で何も起きない", async () => {
    const user = setup();
    expect(tid("home-title")).toHaveTextContent("再生回数カウンター");
    expect(screen.getByRole("heading", { level: 1 })).toBe(tid("home-title"));
    expect(tid("mode-countdown")).not.toHaveAttribute("aria-disabled");
    for (const id of ["mode-versus"]) {
      const b = tid(id);
      expect(b).toHaveAttribute("aria-disabled", "true");
      expect(b).not.toBeDisabled();
      expect(b).toHaveTextContent("準備中");
      await user.click(b);
      b.focus();
      await user.keyboard("{Enter}");
      await user.keyboard(" ");
    }
    expect(tid("home-title")).toBeInTheDocument();
  });

  it("共通ルールは手入力・YouTube リンクを含まず、切り捨てを説明する", () => {
    setup();
    const panel = screen.getByRole("heading", { name: "共通ルール" }).closest("section")!;
    expect(panel).toHaveTextContent("切り捨てた値");
    expect(panel).not.toHaveTextContent("YouTubeで探す");
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("難易度設定（受け入れ基準 1）", () => {
  it.each([
    ["easy", "1億 〜 3億", "6", "5%"],
    ["normal", "3億 〜 10億", "5", "2%"],
    ["hard", "10億 〜 50億", "4", "0.5%"],
  ] as const)("%s のお題の範囲・ターン数・許容幅", async (level, range, turns, tol) => {
    const user = setup();
    await user.click(tid("mode-countdown"));
    await user.click(tid(`level-${level}`));
    expect(tid(`level-${level}`)).toHaveAttribute("aria-pressed", "true");
    expect(tid("rule-range")).toHaveTextContent(`お題：${range} 回のあいだでランダム`);
    expect(tid("rule-turns")).toHaveTextContent(`ターン数：${turns}`);
    expect(tid("rule-clear")).toHaveTextContent(`残りがお題の ${tol} 以下（0未満はアウト）`);
  });

  it("初期選択はふつう。選択は vc-prefs に保存され、次回に復元される", async () => {
    const user = setup();
    await user.click(tid("mode-countdown"));
    expect(tid("level-normal")).toHaveAttribute("aria-pressed", "true");
    await user.click(tid("level-hard"));
    expect(JSON.parse(localStorage.getItem("vc-prefs")!).level).toBe("hard");
    await user.click(tid("setup-back"));
    await user.click(tid("mode-countdown"));
    expect(tid("level-hard")).toHaveAttribute("aria-pressed", "true");
  });

  it("保存に失敗しても遊べる", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const user = setup();
    await user.click(tid("mode-countdown"));
    await user.click(tid("level-easy"));
    expect(tid("level-easy")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("プレイ：取得して引く（受け入れ基準 2・3・4）", () => {
  it("お題を表示し、API の再生回数を10,000未満切り捨てで引く", async () => {
    const f = mockFetch(found(1234567, "猫とピアノ"));
    const user = setup();
    await startGame(user, { target: 500_000_000 });
    expect(tid("counter-target")).toHaveTextContent("5億");
    expect(tid("counter-value")).toHaveTextContent("500,000,000");
    expect(tid("counter-turns")).toHaveTextContent("残り5ターン");
    expect(tid("search-input")).toHaveFocus();

    await search(user, "猫 ピアノ");

    expect(requestedQueries(f)).toEqual(["猫 ピアノ"]);
    expect(tid("counter-value")).toHaveTextContent("498,770,000");
    expect(tid("counter-sub")).toHaveTextContent("4億9877万 回");
    expect(tid("counter-turns")).toHaveTextContent("残り4ターン");
    expect(tid("counter-bar")).toHaveAttribute("aria-hidden", "true");
  });

  it("履歴の行に、ワード・切り捨て値・正しい再生回数・タイトル（文字のみ）が出る", async () => {
    mockFetch(found(1234567, '<img src=x onerror="alert(1)"><b>猫</b>'));
    const user = setup();
    await startGame(user);
    await search(user, "猫 ピアノ");

    const row = tid("log-row");
    expect(row).toHaveAttribute("data-index", "1");
    expect(within(row).getByTestId("log-word")).toHaveTextContent("猫 ピアノ");
    expect(within(row).getByTestId("log-value")).toHaveTextContent(`${MINUS}123万`);
    expect(within(row).getByTestId("log-actual")).toHaveTextContent("実際の再生回数 1,234,567 回");
    const title = within(row).getByTestId("log-title");
    expect(title).toHaveTextContent('<img src=x onerror="alert(1)"><b>猫</b>');
    expect(title.querySelector("img, b")).toBeNull();
    expect(row.querySelector("img")).toBeNull();
    expect(row.querySelector("a")).toBeNull();
    expect(tid("log")).toBeInTheDocument();
  });

  it("履歴は古い順に並び、入力は成功のたびに空に戻る", async () => {
    mockFetch(found(1_000_000, "一つ目"), found(2_000_000, "二つ目"));
    const user = setup();
    await startGame(user);
    expect(queryTid("log")).toBeNull(); // 0行のときは出さない
    await search(user, "one");
    expect(tid("search-input")).toHaveValue("");
    expect(tid("search-input")).toHaveFocus();
    await search(user, "two");
    const rows = screen.getAllByTestId("log-row");
    expect(rows.map((r) => r.getAttribute("data-index"))).toEqual(["1", "2"]);
    expect(within(rows[1]!).getByTestId("log-title")).toHaveTextContent("二つ目");
    expect(tid("counter-value")).toHaveTextContent("497,000,000");
  });

  it("9,999 以下は切り捨てて −0 になり、ターンは消費する", async () => {
    mockFetch(found(9999, "少ない"));
    const user = setup();
    await startGame(user);
    await search(user, "rare");
    expect(tid("log-value")).toHaveTextContent(`${MINUS}0`);
    expect(tid("log-actual")).toHaveTextContent("9,999 回");
    expect(tid("counter-value")).toHaveTextContent("500,000,000");
    expect(tid("counter-turns")).toHaveTextContent("残り4ターン");
  });

  it("継続時は読み上げ領域に引いた値と残りを出す", async () => {
    mockFetch(found(1_234_567));
    const user = setup();
    await startGame(user);
    await search(user, "a");
    expect(screen.getByText("123万 を引いて、残り 4億9877万。残り4ターン。")).toHaveAttribute(
      "role",
      "status",
    );
  });
});

describe("同じワードの組み合わせ（受け入れ基準 5）", () => {
  it("語順・大文字小文字・全角半角が違っても拒否し、API を呼ばず、ターンも変えない", async () => {
    const f = mockFetch(found(1_000_000, "first"));
    const user = setup();
    await startGame(user);
    await search(user, "Cat piano");
    expect(f).toHaveBeenCalledTimes(1);

    for (const variant of ["piano cat", "ＣＡＴ　ＰＩＡＮＯ", "PIANO   CAT"]) {
      await search(user, variant);
      expect(tid("search-status")).toHaveAttribute("data-state", "duplicate");
      expect(tid("error-message")).toHaveTextContent("そのワードの組み合わせはもう使われています。");
      expect(queryTid("retry-button")).toBeNull();
      expect(tid("search-input")).toHaveValue(variant);
      expect(tid("search-input")).toHaveFocus();
    }
    expect(f).toHaveBeenCalledTimes(1);
    expect(tid("counter-turns")).toHaveTextContent("残り4ターン");
    expect(screen.getAllByTestId("log-row")).toHaveLength(1);
  });

  it("入力を変えると重複メッセージは消える", async () => {
    mockFetch(found(1_000_000));
    const user = setup();
    await startGame(user);
    await search(user, "cat");
    await search(user, "CAT");
    expect(tid("search-status")).toHaveAttribute("data-state", "duplicate");
    await user.type(tid("search-input"), "s");
    expect(tid("search-status")).toHaveAttribute("data-state", "idle");
  });

  it("使用済みは新しいゲームに持ち越さない", async () => {
    const f = mockFetch(found(1_000_000), found(1_000_000));
    const user = setup();
    await startGame(user);
    await search(user, "cat");
    await user.click(tid("play-quit"));
    await startGame(user);
    await search(user, "cat");
    expect(f).toHaveBeenCalledTimes(2);
    expect(tid("search-status")).toHaveAttribute("data-state", "idle");
  });
});

describe("判定（受け入れ基準 6・7）", () => {
  it("該当なしは GAME OVER。履歴とターンは直前のまま、理由にワード", async () => {
    mockFetch(found(1_000_000), notFound());
    const user = setup();
    await startGame(user);
    await search(user, "first");
    await search(user, "nomatch");
    expect(tid("result-heading")).toHaveTextContent("GAME OVER");
    expect(tid("result-reason")).toHaveTextContent(
      "条件に合う動画が見つかりませんでした。（ワード：nomatch）",
    );
    expect(tid("result-detail")).toHaveTextContent("残り 499,000,000 回（お題の 99.80%）・1ターン");
    expect(screen.getAllByTestId("log-row")).toHaveLength(1);
  });

  it("0未満はアウト", async () => {
    mockFetch(found(600_000_000));
    const user = setup();
    await startGame(user);
    await search(user, "big");
    expect(tid("result-heading")).toHaveTextContent("GAME OVER");
    expect(tid("result-reason")).toHaveTextContent("0を割ってしまった！");
    expect(tid("result-detail")).toHaveTextContent("残り −100,000,000 回");
  });

  it("許容幅以下でクリア（残りが2%ちょうど）", async () => {
    mockFetch(found(490_000_000));
    const user = setup();
    await startGame(user);
    await search(user, "near");
    expect(tid("result-heading")).toHaveTextContent("CLEAR");
    expect(tid("result-reason")).toHaveTextContent("ゴール圏に到達！");
    expect(tid("result-detail")).toHaveTextContent("残り 10,000,000 回（お題の 2.00%）・1ターン");
  });

  it("ターン切れでアウト", async () => {
    mockFetch(...Array.from({ length: 5 }, () => found(10_000_000)));
    const user = setup();
    await startGame(user);
    for (const w of ["a", "b", "c", "d"]) await search(user, w);
    expect(tid("counter-turns")).toHaveTextContent("残り1ターン");
    await search(user, "e");
    expect(tid("result-heading")).toHaveTextContent("GAME OVER");
    expect(tid("result-reason")).toHaveTextContent("ターン切れ。");
    expect(tid("result-detail")).toHaveTextContent("5ターン");
    expect(screen.getAllByTestId("log-row")).toHaveLength(5);
  });

  it("最終ターンの判定では、クリアがターン切れより先", async () => {
    mockFetch(...Array.from({ length: 4 }, () => found(10_000)), found(499_960_000));
    const user = setup();
    await startGame(user);
    for (const w of ["a", "b", "c", "d", "e"]) await search(user, w);
    expect(tid("result-heading")).toHaveTextContent("CLEAR");
  });

  it("結果画面：もう一回は難易度設定へ、モード選択へはホームへ。状態は破棄される", async () => {
    mockFetch(found(490_000_000));
    const user = setup();
    await startGame(user);
    await search(user, "near");
    expect(screen.getByRole("heading", { level: 1 })).toBe(tid("result-heading"));
    expect(tid("log-row")).toBeInTheDocument();
    await user.click(tid("result-again"));
    expect(tid("setup-start")).toBeInTheDocument();
    await user.click(tid("setup-start"));
    expect(tid("counter-value")).toHaveTextContent("500,000,000");
    expect(queryTid("log")).toBeNull();
    await user.click(tid("play-quit"));
    expect(tid("home-title")).toBeInTheDocument();
  });
});

describe("取得中（受け入れ基準 8）", () => {
  it("決定を無効にし「取得中…」を出し、二重送信できない", async () => {
    const d = deferred();
    const f = mockFetch(d.promise);
    const user = setup();
    await startGame(user);
    await user.type(tid("search-input"), "slow");
    await user.click(tid("search-submit"));

    expect(tid("search-status")).toHaveAttribute("data-state", "loading");
    expect(tid("loading-message")).toHaveTextContent("取得中…");
    expect(tid("search-submit")).toBeDisabled();
    expect(tid("search-input")).toHaveAttribute("readonly");
    expect(tid("search-input")).toHaveAttribute("aria-busy", "true");
    expect(tid("search-input")).toHaveValue("slow");
    expect(tid("search-input")).toHaveFocus();

    await user.type(tid("search-input"), "{Enter}{Enter}");
    await user.click(tid("search-submit"));
    expect(f).toHaveBeenCalledTimes(1);

    d.resolve(found(1_000_000, "遅い動画"));
    await waitFor(() => expect(tid("counter-turns")).toHaveTextContent("残り4ターン"));
    expect(tid("search-status")).toHaveAttribute("data-state", "idle");
    expect(tid("search-submit")).toBeDisabled(); // 入力が空に戻ったため
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("やめるで取得を中止し、あとから届いた結果は捨てる", async () => {
    const d = deferred();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = mockFetch(d.promise);
    const user = setup();
    await startGame(user);
    await search(user, "slow");
    await user.click(tid("play-quit"));
    expect(tid("home-title")).toBeInTheDocument();
    d.resolve(found(1_000_000));
    await Promise.resolve();
    expect(tid("home-title")).toBeInTheDocument();
    expect(f.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    // 中止はエラー扱いにしない（ログにも出さない）
    expect(errors).not.toHaveBeenCalled();
    expect(warns).not.toHaveBeenCalled();
  });
});

describe("通信失敗（受け入れ基準 9）", () => {
  it("502：メッセージと再試行を出し、ターンも使用済みも消費しない。再試行で成功する", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = mockFetch(upstreamError(), found(1_000_000, "成功"));
    const user = setup();
    await startGame(user);
    await search(user, "error");

    const status = tid("search-status");
    expect(status).toHaveAttribute("data-state", "error");
    expect(tid("error-message")).toHaveTextContent(
      "取得に失敗しました。通信を確かめて、もう一度試してください。",
    );
    expect(status).toHaveTextContent("ターンは減っていません。");
    expect(within(status).getByRole("alert")).toBeInTheDocument();
    expect(tid("counter-turns")).toHaveTextContent("残り5ターン");
    expect(tid("counter-value")).toHaveTextContent("500,000,000");
    expect(queryTid("log")).toBeNull();
    expect(tid("search-input")).toHaveValue("error");
    expect(tid("search-input")).toHaveFocus();
    expect(tid("search-submit")).toBeEnabled();

    await user.click(tid("retry-button"));
    await waitFor(() => expect(tid("counter-turns")).toHaveTextContent("残り4ターン"));
    expect(requestedQueries(f)).toEqual(["error", "error"]);
    expect(queryTid("retry-button")).toBeNull();
    expect(tid("log-title")).toHaveTextContent("成功");
  });

  it("失敗したワードは使用済みにならず、決定し直せる（重複扱いにならない）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = mockFetch(upstreamError(), found(1_000_000));
    const user = setup();
    await startGame(user);
    await search(user, "cat");
    expect(tid("search-status")).toHaveAttribute("data-state", "error");
    await user.click(tid("search-submit"));
    await waitFor(() => expect(tid("counter-turns")).toHaveTextContent("残り4ターン"));
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("再試行中は再試行ボタンが消えて取得中になり、入力欄にフォーカスが移る", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deferred();
    mockFetch(upstreamError(), d.promise);
    const user = setup();
    await startGame(user);
    await search(user, "x");
    await user.click(tid("retry-button"));
    expect(tid("search-status")).toHaveAttribute("data-state", "loading");
    expect(queryTid("retry-button")).toBeNull();
    expect(tid("search-input")).toHaveFocus();
    d.resolve(notFound());
    await waitFor(() => expect(tid("result-heading")).toBeInTheDocument());
  });

  it("入力を変えるとエラーは消える", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(upstreamError());
    const user = setup();
    await startGame(user);
    await search(user, "x");
    await user.type(tid("search-input"), "y");
    expect(tid("search-status")).toHaveAttribute("data-state", "idle");
    expect(queryTid("retry-button")).toBeNull();
  });

  it("ネットワーク断・不正な応答・503 も通信失敗として扱う（ログに理由を残す）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(
      new TypeError("Failed to fetch"),
      new Response("not json", { status: 200 }),
      jsonResponse({ error: { code: "quota_exceeded", message: "x" } }, 503),
    );
    const user = setup();
    await startGame(user);
    for (const [w, reason] of [
      ["a", "network"],
      ["b", "malformed"],
      ["c", "http"],
    ] as const) {
      await search(user, w);
      expect(tid("search-status")).toHaveAttribute("data-state", "error");
      expect(tid("search-status")).toHaveAttribute("data-reason", reason);
      expect(tid("retry-button")).toBeInTheDocument();
    }
    expect(warn).toHaveBeenCalledTimes(3);
    expect(tid("counter-turns")).toHaveTextContent("残り5ターン");
  });

  it("タイムアウトは通信失敗（理由は timeout）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch(new Promise<Response>(() => {}));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await startGame(user);
    await search(user, "hang");
    expect(tid("search-status")).toHaveAttribute("data-state", "loading");
    await vi.advanceTimersByTimeAsync(15000);
    await waitFor(() => expect(tid("search-status")).toHaveAttribute("data-state", "error"));
    expect(tid("search-status")).toHaveAttribute("data-reason", "timeout");
    expect(tid("retry-button")).toBeInTheDocument();
  });

  it("400 invalid_query は専用メッセージで、再試行は出さない。使用済みにもしない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(invalidQuery(), found(1_000_000));
    const user = setup();
    await startGame(user);
    await search(user, "bad");
    expect(tid("search-status")).toHaveAttribute("data-state", "invalid");
    expect(tid("error-message")).toHaveTextContent(
      "このワードでは検索できません。別のワードを入れてください。",
    );
    expect(queryTid("retry-button")).toBeNull();
    expect(tid("counter-turns")).toHaveTextContent("残り5ターン");
    await user.click(tid("search-submit"));
    await waitFor(() => expect(tid("counter-turns")).toHaveTextContent("残り4ターン"));
  });
});

describe("入力が空（受け入れ基準 10）", () => {
  it("空・空白だけでは決定が無効で、Enter でも送信しない", async () => {
    const f = mockFetch();
    const user = setup();
    await startGame(user);
    expect(tid("search-submit")).toBeDisabled();
    await user.type(tid("search-input"), "   ");
    expect(tid("search-submit")).toBeDisabled();
    await user.type(tid("search-input"), "{Enter}");
    expect(f).not.toHaveBeenCalled();
    expect(tid("search-status")).toHaveAttribute("data-state", "idle");
    await user.type(tid("search-input"), "a");
    expect(tid("search-submit")).toBeEnabled();
  });

  it("前後の空白は除いて送る", async () => {
    const f = mockFetch(found(1_000_000));
    const user = setup();
    await startGame(user);
    await search(user, "  猫  ピアノ ");
    expect(requestedQueries(f)).toEqual(["猫  ピアノ"]);
  });
});

describe("アクセシビリティ", () => {
  it("各画面の h1 は1つで、画面を切り替えたら h1 にフォーカス（プレイは検索入力）", async () => {
    const user = setup();
    await user.click(tid("mode-countdown"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("カウントダウン");
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    await user.click(tid("setup-start"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(tid("search-input")).toHaveFocus();
    await user.click(tid("play-quit"));
    expect(tid("home-title")).toHaveFocus();
  });

  it("入力のラベルと属性、FetchStatus は常に status 領域を持つ", async () => {
    const user = setup();
    await startGame(user);
    const input = screen.getByLabelText("検索ワード（スペース区切りで複数可）");
    expect(input).toBe(tid("search-input"));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("enterkeyhint", "go");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocapitalize", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(within(tid("search-status")).getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(tid("search-form").tagName).toBe("FORM");
  });
});
