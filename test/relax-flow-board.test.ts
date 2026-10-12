import { describe, expect, it } from "vitest";
import {
  buildRelaxFlowAnnotationSummary,
  type RelaxBounds,
  type RelaxFlowElement
} from "../src/components/canvas/relax-flow-model";

describe("Relax Flow board", () => {
  it("describes independent flow components relative to the centered image node", () => {
    const imageBounds: RelaxBounds = { x: -260, y: -200, width: 520, height: 400 };
    const elements: RelaxFlowElement[] = [
      {
        id: "rect-1",
        kind: "rect",
        bounds: { x: -100, y: -100, width: 100, height: 80 },
        color: "#ff3b30",
        strokeWidth: 10,
        fillOpacity: 0.12,
        opacity: 1,
        visible: true
      },
      {
        id: "text-1",
        kind: "text",
        bounds: { x: 300, y: 0, width: 180, height: 72 },
        color: "#171717",
        strokeWidth: 8,
        opacity: 1,
        visible: true,
        text: "换成木质桌面",
        fontSize: 24,
        align: "left",
        autoSize: false
      }
    ];

    const summary = buildRelaxFlowAnnotationSummary(elements, imageBounds);

    expect(summary).toContain("矩形：中心位于原图内部 40%,35%");
    expect(summary).toContain("文字“换成木质桌面”：位于原图外侧 125%,59%");
    expect(summary).toContain("范围约为原图 35%×18%");
  });
});
