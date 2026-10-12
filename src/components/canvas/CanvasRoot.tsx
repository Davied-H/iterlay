import type { ReactNode } from "react";
import { Background, BackgroundVariant, ReactFlowProvider } from "@xyflow/react";

export function CanvasRoot({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <ReactFlowProvider>
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1.5}
        color="hsl(var(--canvas-dot))"
        bgColor="oklch(var(--canvas-surface))"
        className="!z-0"
      />
      {children}
    </ReactFlowProvider>
  );
}
