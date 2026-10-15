import type { ReactNode } from "react";
/** @deprecated UI components now localize their own literals with useUiText. */
export function LegacyI18nBridge({ children }: { children: ReactNode }): React.ReactElement {
  return <>{children}</>;
}
