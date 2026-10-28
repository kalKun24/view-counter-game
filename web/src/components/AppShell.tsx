import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="wrap">{children}</div>;
}
