import { useViewport } from "@xyflow/react";
import type { HelperLineGuide } from "./helper-lines";

interface HelperLinesProps {
  horizontal: HelperLineGuide | null;
  vertical: HelperLineGuide | null;
}

/** Render flow-space alignment coordinates as fixed one-pixel viewport guides. */
export function HelperLines({ horizontal, vertical }: HelperLinesProps): React.ReactElement {
  const { x, y, zoom } = useViewport();

  return (
    <div
      aria-hidden
      data-canvas-helper-lines=""
      className="pointer-events-none absolute inset-0 z-[4] overflow-hidden"
    >
      {vertical === null ? null : (
        <div
          data-helper-line="vertical"
          className="canvas-helper-line canvas-helper-line--vertical absolute w-px"
          style={{
            left: Math.round(vertical.position * zoom + x),
            top: Math.round(vertical.start * zoom + y),
            height: Math.max(1, Math.round((vertical.end - vertical.start) * zoom))
          }}
        />
      )}
      {horizontal === null ? null : (
        <div
          data-helper-line="horizontal"
          className="canvas-helper-line canvas-helper-line--horizontal absolute h-px"
          style={{
            left: Math.round(horizontal.start * zoom + x),
            top: Math.round(horizontal.position * zoom + y),
            width: Math.max(1, Math.round((horizontal.end - horizontal.start) * zoom))
          }}
        />
      )}
    </div>
  );
}
