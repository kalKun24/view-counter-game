import { useCallback, useEffect, useRef, useState } from "react";
import { fetchViews } from "../api/views";
import { normKey } from "../lib/words";

/** SearchForm がモードへ渡す結果。通信失敗と q 不正はモードに渡さない。 */
export type FetchOutcome =
  | { type: "found"; query: string; viewCount: number; title: string; videoId: string }
  | { type: "nomatch"; query: string };

export type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "duplicate" }
  | { kind: "invalid" }
  | { kind: "error"; reason: string };

interface Options {
  /** 正規化キーが使用済みか。 */
  isUsed: (key: string) => boolean;
  onResult: (outcome: FetchOutcome) => void;
}

/**
 * GET /api/views の呼び出し・結果の分類・二重送信防止・使用済み判定。
 * 使用済みへの追加はモード側（onResult の found を受けたとき）が行う。
 */
export function useViewsFetch({ isUsed, onResult }: Options) {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const inFlight = useRef(false);
  const ctrlRef = useRef<AbortController | null>(null);
  const lastQuery = useRef("");

  // await のあとでも最新のクロージャ（履歴など）を使うため ref 経由で呼ぶ。
  const isUsedRef = useRef(isUsed);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    isUsedRef.current = isUsed;
    onResultRef.current = onResult;
  });

  // アンマウント（やめる・画面遷移）で進行中のリクエストを中止し、結果を捨てる。
  useEffect(
    () => () => {
      ctrlRef.current?.abort();
    },
    [],
  );

  const start = useCallback(async (query: string) => {
    inFlight.current = true;
    lastQuery.current = query;
    setState({ kind: "loading" });
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const result = await fetchViews(query, ctrl.signal);
      if (ctrl.signal.aborted || result.kind === "cancelled") return;
      switch (result.kind) {
        case "found":
          setState({ kind: "idle" });
          onResultRef.current({
            type: "found",
            query,
            viewCount: result.viewCount,
            title: result.title,
            videoId: result.videoId,
          });
          return;
        case "nomatch":
          setState({ kind: "idle" });
          onResultRef.current({ type: "nomatch", query });
          return;
        case "invalid":
          console.warn("views fetch rejected: invalid_query");
          setState({ kind: "invalid" });
          return;
        case "error":
          console.warn("views fetch failed", { reason: result.reason, status: result.status });
          setState({ kind: "error", reason: result.reason });
          return;
      }
    } catch (e) {
      // 想定外の例外（onResult の不具合など）も握りつぶさず、ログに残して通信失敗として扱う。
      console.error("views fetch: unexpected error", e);
      setState({ kind: "error", reason: "unexpected" });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const submit = useCallback(
    (raw: string) => {
      if (inFlight.current) return;
      const query = raw.trim();
      if (!query) return;
      if (isUsedRef.current(normKey(query))) {
        setState({ kind: "duplicate" });
        return;
      }
      void start(query);
    },
    [start],
  );

  /** 失敗したクエリで取得だけをやり直す（事前チェックは通過済み）。 */
  const retry = useCallback(() => {
    if (inFlight.current || !lastQuery.current) return;
    void start(lastQuery.current);
  }, [start]);

  /** 入力が変わったときにメッセージを消す。取得中は消さない。 */
  const dismiss = useCallback(() => {
    setState((s) => (s.kind === "loading" ? s : { kind: "idle" }));
  }, []);

  return { state, submit, retry, dismiss };
}
