import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./../../App";
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

function setup() {
  const user = userEvent.setup();
  render(<App />);
  return user;
}

/** 名前を入れ、向きを選んで開始する。 */
async function start(user: User, names: string[], dir: "higher" | "lower" = "higher") {
  await user.click(tid("mode-versus"));
  while (screen.queryAllByTestId(/^vs-player-input-/).length < names.length) {
    await user.click(tid("vs-add-player"));
  }
  for (const [i, n] of names.entries()) {
    if (n) await user.type(tid(`vs-player-input-${i}`), n);
  }
  await user.click(tid(dir === "higher" ? "vs-dir-higher" : "vs-dir-lower"));
  await user.click(tid("vs-start"));
}

async function search(user: User, word: string) {
  await user.type(tid("search-input"), word);
  await user.click(tid("search-submit"));
}

/** 検索して、決着していなければ引き継ぎカードの「始める」まで進める。 */
async function play(user: User, word: string) {
  await search(user, word);
  if (await screen.findByTestId(/^(vs-handoff|vs-result)$/).then((e) => e.dataset.testid === "vs-handoff")) {
    await user.click(tid("vs-handoff-go"));
  }
}

const status = (i: number) => tid(`vs-survivor-${i}`).dataset.status;

describe("設定（受け入れ基準 1・2）", () => {
  it("2〜8人。2人のとき削除なし、8人で追加が無効。空欄はプレイヤーN。名前の重複は許す", async () => {
    const user = setup();
    await user.click(tid("mode-versus"));
    expect(tid("vs-player-count")).toHaveTextContent("現在 2 人");
    expect(queryTid("vs-player-remove-0")).toBeNull();
    for (let i = 0; i < 6; i++) await user.click(tid("vs-add-player"));
    expect(tid("vs-player-count")).toHaveTextContent("現在 8 人");
    expect(tid("vs-add-player")).toBeDisabled();
    expect(screen.getByText("これ以上増やせません")).toBeInTheDocument();
    await user.click(tid("vs-player-remove-7"));
    await user.click(tid("vs-player-remove-6"));
    await user.click(tid("vs-player-remove-5"));
    await user.click(tid("vs-player-remove-4"));
    await user.click(tid("vs-player-remove-3"));
    await user.click(tid("vs-player-remove-2"));
    expect(queryTid("vs-player-remove-0")).toBeNull();
    await user.type(tid("vs-player-input-0"), "たろう");
    await user.type(tid("vs-player-input-1"), "たろう");
    await user.click(tid("vs-start"));
    expect(tid("vs-survivor-0")).toHaveTextContent("たろう");
    expect(tid("vs-survivor-1")).toHaveTextContent("たろう");
  });

  it("空欄はスタート時にプレイヤーNになる。追加で新しい行にフォーカスする", async () => {
    const user = setup();
    await user.click(tid("mode-versus"));
    await user.click(tid("vs-add-player"));
    expect(tid("vs-player-input-2")).toHaveFocus();
    await user.type(tid("vs-player-input-1"), "ハナ");
    await user.click(tid("vs-start"));
    expect(tid("vs-survivor-0")).toHaveTextContent("プレイヤー1");
    expect(tid("vs-survivor-1")).toHaveTextContent("ハナ");
    expect(tid("vs-survivor-2")).toHaveTextContent("プレイヤー3");
    expect(tid("search-input")).toHaveFocus();
  });

  it("向きを選べ、説明が差し替わる。向きと名前は保存されて次回に残る", async () => {
    const user = setup();
    await user.click(tid("mode-versus"));
    expect(tid("vs-dir-higher")).toHaveAttribute("aria-pressed", "true");
    await user.click(tid("vs-dir-lower"));
    expect(tid("vs-dir-lower")).toHaveAttribute("aria-pressed", "true");
    expect(tid("vs-dir-help")).toHaveTextContent("お題の数字より低く");
    await user.type(tid("vs-player-input-0"), "あい");
    await user.click(tid("vs-back"));
    await user.click(tid("mode-versus"));
    expect(tid("vs-dir-lower")).toHaveAttribute("aria-pressed", "true");
    expect(tid("vs-player-input-0")).toHaveValue("あい");
  });

  it("名前の削除で残りの名前は振り直さない", async () => {
    const user = setup();
    await user.click(tid("mode-versus"));
    await user.click(tid("vs-add-player"));
    await user.type(tid("vs-player-input-0"), "A");
    await user.type(tid("vs-player-input-1"), "B");
    await user.type(tid("vs-player-input-2"), "C");
    await user.click(tid("vs-player-remove-0"));
    expect(tid("vs-player-input-0")).toHaveValue("B");
    expect(tid("vs-player-input-1")).toHaveValue("C");
    expect(tid("vs-player-input-0")).toHaveFocus();
  });
});

describe("higher の進行（受け入れ基準 3・4・6・7）", () => {
  it("最初の1手は何でもOK。前より低い・同じ値で脱落し、手番は脱落者を飛ばす。最後の1人が勝つ", async () => {
    const user = setup();
    mockFetch(
      found(1_234_567, "title one"),
      found(500_000, "title two"),
      found(1_239_999, "title three"), // 123万: 同じ値は負け
      found(2_000_000, "title four"),
    );
    await start(user, ["A", "B", "C"]);
    expect(tid("counter-value")).toHaveTextContent("—");
    expect(tid("vs-current-player")).toHaveTextContent("A");
    expect(tid("vs-alive-count")).toHaveTextContent("のこり 3 人 / 全 3 人");

    await search(user, "w1");
    expect(tid("vs-handoff-result")).toHaveTextContent("A：123万 OK");
    expect(tid("vs-handoff-next")).toHaveTextContent("次は B さん。スマホを渡してください。");
    expect(queryTid("search-input")).toBeNull();
    expect(tid("vs-handoff-go")).toHaveFocus();
    await user.click(tid("vs-handoff-go"));
    expect(tid("search-input")).toHaveFocus();
    expect(tid("counter-value")).toHaveTextContent("1,230,000");

    await search(user, "w2");
    expect(tid("vs-handoff-result")).toHaveTextContent("B は脱落！（50万 は 123万 より高くない）");
    expect(status(1)).toBe("out");
    expect(tid("vs-alive-count")).toHaveTextContent("のこり 2 人 / 全 3 人");
    expect(tid("vs-handoff-next")).toHaveTextContent("次は C さん");
    await user.click(tid("vs-handoff-go"));
    expect(status(2)).toBe("current");
    expect(tid("counter-value")).toHaveTextContent("1,230,000");

    await search(user, "w3");
    // C の脱落で A だけが残り、引き継ぎカードを出さず結果画面へ
    expect(queryTid("vs-handoff")).toBeNull();
    expect(tid("vs-winner-name")).toHaveTextContent("A の勝ち！");
    expect(tid("vs-winner-reason")).toHaveTextContent("最後の1人まで生き残った！");
    expect(tid("vs-result-turns")).toHaveTextContent("3手つづきました");
    expect(status(0)).toBe("winner");
    expect(status(1)).toBe("out");
    expect(status(2)).toBe("out");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("GAME SET");
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(screen.getAllByTestId("vs-log-out")).toHaveLength(2);
  });

  it("履歴に プレイヤー名・ワード・タイトル・切り捨て値・正しい再生回数 が #3 と同じ形で出る", async () => {
    const user = setup();
    mockFetch(found(1_234_567, "title one"));
    await start(user, ["A", "B"]);
    await search(user, "w1");
    const row = tid("log-row");
    expect(within(row).getByTestId("log-word")).toHaveTextContent("A：w1");
    expect(within(row).getByTestId("log-title")).toHaveTextContent("title one");
    expect(within(row).getByTestId("log-actual")).toHaveTextContent("実際の再生回数 1,234,567 回");
    expect(within(row).getByTestId("log-value")).toHaveTextContent("123万");
    expect(queryTid("vs-log-out")).toBeNull();
  });

  it("手番は登録順で、脱落者の次の生存者へ。末尾の次は先頭に戻る", async () => {
    const user = setup();
    mockFetch(found(100_000), found(200_000), found(150_000), found(300_000));
    await start(user, ["A", "B", "C", "D"]);
    await play(user, "w1"); // A ok
    await play(user, "w2"); // B ok
    await play(user, "w3"); // C lose(15万<=20万)
    expect(status(2)).toBe("out");
    expect(status(3)).toBe("current");
    await play(user, "w4"); // D ok (30万)
    expect(status(0)).toBe("current");
    expect(tid("counter-value")).toHaveTextContent("300,000");
  });
});

describe("lower（受け入れ基準 2・3）", () => {
  it("最初のお題は 5億〜30億。お題以上は負け、未満は成功", async () => {
    const user = setup();
    vi.spyOn(Math, "random").mockReturnValue(0); // お題 5億
    mockFetch(found(500_000_000), found(499_999_999), found(300_000_000));
    await start(user, ["A", "B", "C"], "lower");
    expect(tid("counter-value")).toHaveTextContent("500,000,000");
    expect(tid("vs-counter")).toHaveTextContent("お題より低く");
    await search(user, "w1");
    expect(tid("vs-handoff-result")).toHaveTextContent("A は脱落！（5億 は 5億 より低くない）");
    await user.click(tid("vs-handoff-go"));
    await search(user, "w2");
    expect(tid("vs-handoff-result")).toHaveTextContent("B：4億9999万 OK");
    await user.click(tid("vs-handoff-go"));
    expect(tid("vs-counter")).toHaveTextContent("この数字より低く");
    expect(tid("counter-value")).toHaveTextContent("499,990,000");
    await search(user, "w3");
    expect(tid("vs-handoff-result")).toHaveTextContent("C：3億 OK");
  });

  it("10,000回未満の動画（判定値0）は、残り人数に関わらずその場で勝ち", async () => {
    const user = setup();
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockFetch(found(5000, "tiny"));
    await start(user, ["A", "B", "C"], "lower");
    await search(user, "n5000");
    expect(queryTid("vs-handoff")).toBeNull();
    expect(tid("vs-winner-name")).toHaveTextContent("A の勝ち！");
    expect(tid("vs-winner-reason")).toHaveTextContent("A が0ちょうどを出した！");
    expect(status(0)).toBe("winner");
    expect(tid("log-actual")).toHaveTextContent("実際の再生回数 5,000 回");
    expect(queryTid("vs-log-out")).toBeNull();
  });
});

describe("該当なし（受け入れ基準 5）", () => {
  it("該当なしで脱落し、直前の値は更新されない", async () => {
    const user = setup();
    mockFetch(found(3_000_000), notFound(), found(4_000_000));
    await start(user, ["A", "B", "C"]);
    await play(user, "w1");
    await search(user, "none");
    expect(tid("vs-handoff-result")).toHaveTextContent(
      "B は脱落！（条件に合う動画がありませんでした）",
    );
    expect(tid("vs-handoff-note")).toHaveTextContent("直前の数字はそのまま");
    await user.click(tid("vs-handoff-go"));
    expect(status(1)).toBe("out");
    expect(tid("counter-value")).toHaveTextContent("3,000,000");
    await search(user, "w3");
    expect(tid("vs-handoff-result")).toHaveTextContent("C：400万 OK");
  });

  it("残り2人のうち1人が該当なしなら、もう1人の勝ち", async () => {
    const user = setup();
    mockFetch(notFound());
    await start(user, ["A", "B"]);
    await search(user, "none");
    expect(tid("vs-winner-name")).toHaveTextContent("B の勝ち！");
    expect(queryTid("vs-handoff")).toBeNull();
  });
});

describe("ワード重複（受け入れ基準 8）", () => {
  it("正規化後に同じワードは、人が変わっても使えず、API を呼ばず手番も動かない", async () => {
    const user = setup();
    const f = mockFetch(found(100_000), found(200_000));
    await start(user, ["A", "B", "C"]);
    await play(user, "猫 ピアノ");
    await user.type(tid("search-input"), "ＰＩＡＮＯ　猫".replace("ＰＩＡＮＯ", "ピアノ"));
    await user.click(tid("search-submit"));
    expect(tid("search-status")).toHaveAttribute("data-state", "duplicate");
    expect(tid("error-message")).toHaveTextContent("そのワードの組み合わせはもう使われています。");
    expect(requestedQueries(f)).toEqual(["猫 ピアノ"]);
    expect(tid("vs-current-player")).toHaveTextContent("B");
    expect(tid("log-row")).toBeInTheDocument();
  });
});

describe("取得中・通信エラー（受け入れ基準 9）", () => {
  it("取得中は決定が無効で、手番も生存者も変わらない", async () => {
    const user = setup();
    const d = deferred();
    mockFetch(d.promise);
    await start(user, ["A", "B"]);
    await search(user, "w1");
    expect(tid("loading-message")).toHaveTextContent("取得中…");
    expect(tid("search-submit")).toBeDisabled();
    expect(tid("vs-current-player")).toHaveTextContent("A");
    d.resolve(found(100_000));
    expect(await screen.findByTestId("vs-handoff")).toBeInTheDocument();
  });

  it("502 / 400 では手番を進めず、使用済みにもしない。再試行で成功する", async () => {
    const user = setup();
    const f = mockFetch(upstreamError(), invalidQuery(), found(100_000));
    await start(user, ["A", "B"]);
    await search(user, "w1");
    expect(await screen.findByTestId("retry-button")).toBeInTheDocument();
    expect(tid("vs-current-player")).toHaveTextContent("A");
    expect(queryTid("log")).toBeNull();
    expect(queryTid("vs-handoff")).toBeNull();
    await user.clear(tid("search-input"));
    await user.type(tid("search-input"), "w1 ");
    await user.click(tid("search-submit"));
    expect(await screen.findByText("このワードでは検索できません。別のワードを入れてください。")).toBeInTheDocument();
    expect(tid("vs-current-player")).toHaveTextContent("A");
    await user.click(tid("search-submit"));
    expect(await screen.findByTestId("vs-handoff")).toBeInTheDocument();
    expect(requestedQueries(f)).toEqual(["w1", "w1", "w1"]);
  });
});

describe("結果画面からの遷移", () => {
  it("もう一回は設定へ（名前と向きを残す）、モード選択へはホームへ", async () => {
    const user = setup();
    mockFetch(notFound(), notFound());
    await start(user, ["A", "B"], "lower");
    await search(user, "none");
    await user.click(tid("result-again"));
    expect(tid("vs-setup")).toBeInTheDocument();
    expect(tid("vs-dir-lower")).toHaveAttribute("aria-pressed", "true");
    expect(tid("vs-player-input-0")).toHaveValue("A");
    await user.click(tid("vs-start"));
    await search(user, "none"); // 使用済みは新しいゲームに持ち越さない
    await user.click(tid("result-home"));
    expect(tid("home-title")).toBeInTheDocument();
  });

  it("やめるでホームへ戻る", async () => {
    const user = setup();
    await start(user, ["A", "B"]);
    await user.click(tid("play-quit"));
    expect(tid("home-title")).toBeInTheDocument();
  });
});
