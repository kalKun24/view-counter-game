import { useEffect, useRef } from "react";

interface Props {
  onHome: () => void;
}

/**
 * クォータ切れの表示。SearchForm の panel と入れ替えて出す。
 * 再試行は出さず、ホームへ戻る操作だけを置く。検索入力が外れるので見出しへフォーカスを移す。
 */
export function QuotaNotice({ onHome }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <section className="panel" aria-labelledby="quota-title" data-testid="quota-notice">
      {/* search-form は縦並びで、ボタンを幅いっぱいにする既存のレイアウト */}
      <div className="search-form">
        <h2 id="quota-title" ref={titleRef} tabIndex={-1} data-testid="quota-title">
          今日は遊べません
        </h2>
        <p data-testid="quota-message">
          サーバーの1日の利用上限に達しました。日をあらためて、もう一度遊んでください。
        </p>
        <p className="muted small">ゲームは進んでいません。ターンは減っていません。</p>
        <button type="button" className="btn" onClick={onHome} data-testid="quota-home">
          ホームへ戻る
        </button>
      </div>
    </section>
  );
}
