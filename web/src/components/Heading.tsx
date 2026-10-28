import { useEffect, useRef, type ElementType, type ReactNode } from "react";

interface Props {
  as?: ElementType;
  className?: string;
  testId?: string;
  /** 画面を切り替えたときに見出しへフォーカスを移す（既定 true）。 */
  focusOnMount?: boolean;
  children: ReactNode;
}

/** 画面の h1。tabindex=-1 でフォーカスを受け、画面切り替えを読み上げに伝える。 */
export function Heading({
  as: Tag = "h1",
  className,
  testId,
  focusOnMount = true,
  children,
}: Props) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <Tag ref={ref} tabIndex={-1} className={className} data-testid={testId}>
      {children}
    </Tag>
  );
}
