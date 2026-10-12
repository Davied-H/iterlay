import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { deriveCanvasSelection } from "@/components/canvas/canvas-selection-model";
import type { GeneratedImage } from "@/components/canvas/image-node-model";

function image(id: string, overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id,
    path: `${id}.png`,
    dataUrl: `data:${id}`,
    jobId: id,
    ...overrides
  };
}

function imageNode(value: GeneratedImage, selected = true): Node {
  return {
    id: value.id,
    type: "imageNode",
    position: { x: 0, y: 0 },
    data: { image: value },
    selected
  };
}

describe("canvas selection model", () => {
  it("derives ready, reference, downloadable, and shareable image selections", () => {
    const pending = imageNode(image("pending", { pending: true }));
    const withoutPath = imageNode(image("without-path", { path: "" }));
    const referenced = imageNode(image("referenced"));
    const shareable = imageNode(image("shareable"));
    const text: Node = {
      id: "text",
      type: "textNode",
      position: { x: 0, y: 0 },
      data: { text: "内容" },
      selected: true
    };
    const ignored = imageNode(image("ignored"), false);

    const model = deriveCanvasSelection(
      [pending, withoutPath, referenced, shareable, text, ignored],
      new Set(["referenced"])
    );

    expect(model.selectedNodes).toEqual([pending, withoutPath, referenced, shareable, text]);
    expect(model.selectedImageNodes).toEqual([pending, withoutPath, referenced, shareable]);
    expect(model.selectedReadyCount).toBe(3);
    expect(model.selectedReferenceCandidateCount).toBe(2);
    expect(model.selectedDownloadableCount).toBe(2);
    expect(model.selectedShareableImages).toEqual([
      referenced.data.image,
      shareable.data.image
    ]);
  });

  it("tolerates a malformed selected image node without corrupting the counts", () => {
    const malformed: Node = {
      id: "malformed",
      type: "imageNode",
      position: { x: 0, y: 0 },
      data: {},
      selected: true
    };

    const model = deriveCanvasSelection([malformed], new Set());

    expect(model.selectedImageNodes).toEqual([malformed]);
    expect(model.selectedReadyCount).toBe(0);
    expect(model.selectedShareableImages).toEqual([]);
  });
});
