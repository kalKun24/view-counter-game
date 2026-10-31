import type { FetchState } from "../hooks/useViewsFetch";

interface Props {
  state: FetchState;
  onRetry: () => void;
}

/**
 * 取得中・エラー・重複などのメッセージと再試行ボタン。
 * role=status の領域は常に存在し、通信失敗だけ role=alert で出す。
 */
export function FetchStatus({ state, onRetry }: Props) {
  return (
    <div
      className="fetch-status"
      data-testid="search-status"
      data-state={state.kind}
      data-reason={state.kind === "error" ? state.reason : undefined}
      data-retry-after={
        state.kind === "throttled" && state.retryAfter !== null ? state.retryAfter : undefined
      }
    >
      <div role="status" aria-live="polite">
        {state.kind === "loading" && (
          <p className="msg" data-testid="loading-message">
            取得中…
          </p>
        )}
        {state.kind === "duplicate" && (
          <p className="msg bad" data-testid="error-message">
            そのワードの組み合わせはもう使われています。
          </p>
        )}
        {state.kind === "invalid" && (
          <p className="msg bad" data-testid="error-message">
            このワードでは検索できません。別のワードを入れてください。
          </p>
        )}
        {state.kind === "throttled" && (
          <p className="msg" data-testid="throttle-message">
            {state.retryAfter !== null
              ? `操作が多すぎます。あと約${state.retryAfter}秒待ってから、もう一度試してください。`
              : "少し待ってから、もう一度試してください。"}
          </p>
        )}
      </div>
      {state.kind === "error" && (
        <div role="alert" className="fetch-error">
          <p className="msg bad" data-testid="error-message">
            取得に失敗しました。通信を確かめて、もう一度試してください。
          </p>
          <p className="muted small">ターンは減っていません。</p>
          <button type="button" className="btn ghost" onClick={onRetry} data-testid="retry-button">
            もう一度試す
          </button>
        </div>
      )}
    </div>
  );
}
