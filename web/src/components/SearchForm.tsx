import { useEffect, useRef, useState, type FormEvent } from "react";
import { useViewsFetch, type FetchOutcome } from "../hooks/useViewsFetch";
import { FetchStatus } from "./FetchStatus";
import { QuotaNotice } from "./QuotaNotice";

interface Props {
  /** 正規化キー（normKey）が使用済みか */
  isUsed: (key: string) => boolean;
  /** found / nomatch だけを受ける。通信失敗と q 不正はここで処理する。 */
  onResult: (outcome: FetchOutcome) => void;
  /** クォータ切れの「ホームへ戻る」。各モードの「やめる」と同じ処理を渡す。 */
  onHome: () => void;
}

export function SearchForm({ isUsed, onResult, onHome }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, submit, retry, dismiss } = useViewsFetch({
    isUsed,
    onResult: (outcome) => {
      if (outcome.type === "found") setValue("");
      onResult(outcome);
    },
  });
  const loading = state.kind === "loading";

  // プレイ画面を開いたら検索入力へ。
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 重複・通信失敗・q 不正のあとは検索入力へフォーカスを戻す。
  useEffect(() => {
    if (
      state.kind === "duplicate" ||
      state.kind === "error" ||
      state.kind === "invalid" ||
      state.kind === "throttled"
    ) {
      inputRef.current?.focus();
    }
  }, [state]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (loading || !value.trim()) return;
    inputRef.current?.focus();
    submit(value);
  };

  const onRetry = () => {
    // 再試行ボタンは消えるので、フォーカスを入力欄へ移す。
    inputRef.current?.focus();
    retry();
  };

  if (state.kind === "quota") return <QuotaNotice onHome={onHome} />;

  return (
    <section className="panel">
      <form className="search-form" onSubmit={onSubmit} data-testid="search-form" noValidate>
        <div className="field">
          <label htmlFor="q">検索ワード（スペース区切りで複数可）</label>
          <input
            id="q"
            ref={inputRef}
            type="text"
            value={value}
            readOnly={loading}
            aria-busy={loading}
            placeholder="例：猫 ピアノ"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            onChange={(e) => {
              setValue(e.target.value);
              dismiss();
            }}
            data-testid="search-input"
          />
        </div>
        <button
          type="submit"
          className="btn"
          disabled={loading || !value.trim()}
          data-testid="search-submit"
        >
          決定
        </button>
        <FetchStatus state={state} onRetry={onRetry} />
      </form>
    </section>
  );
}
