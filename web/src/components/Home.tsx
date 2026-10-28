import type { ModeId } from "../modes";
import { Counter } from "./Counter";
import { Heading } from "./Heading";
import { ModeList } from "./ModeList";

interface Props {
  onSelect: (id: ModeId) => void;
  /** 画面を切り替えて戻ってきたときだけ見出しへフォーカスする（起動直後は奪わない）。 */
  focusHeading: boolean;
}

export function Home({ onSelect, focusHeading }: Props) {
  return (
    <>
      <header className="home-header">
        <span className="eyebrow">YOUTUBE 再生回数ゲーム</span>
        <Heading testId="home-title" focusOnMount={focusHeading}>
          再生回数カウンター
        </Heading>
        <p className="muted">
          YouTubeで言葉を検索して、タイトルに検索ワードが全部入っている動画のうち一番再生されている動画の回数を使います。
        </p>
      </header>
      <Counter
        ariaLabel="例"
        label="例：お題の数字"
        value="487,215,330"
        sub="4億8721万5330 回 ／ 残り5ターン"
      />
      <ModeList onSelect={onSelect} />
      <section className="panel">
        <h2>共通ルール</h2>
        <ol className="rules">
          <li>検索ワードを入れて「決定」を押す（スペース区切りで複数可）。</li>
          <li>
            タイトルに検索ワードが<b>全部</b>入っている動画の中で、一番再生回数が多いものの回数を、自動で取得する。
          </li>
          <li>
            判定には、再生回数の10,000未満を切り捨てた値を使う（例：1,234,567回は1,230,000回）。正しい再生回数は履歴に表示される。
          </li>
          <li>同じワードの組み合わせは2回使えない。語順、大文字と小文字、全角と半角の違いは同じとみなす。</li>
        </ol>
      </section>
    </>
  );
}
