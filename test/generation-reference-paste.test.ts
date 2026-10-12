import { describe, expect, it } from "vitest";
import type { GeneratedImage } from "../src/components/canvas/image-node-model";
import { placeGenerationReferenceImages } from "../src/components/canvas/generation-reference-paste";

function image(id: string, width: number, height: number): GeneratedImage {
  return { id, path: `/${id}.png`, dataUrl: `data:${id}`, jobId: `job-${id}`, width, height };
}

describe("generation reference paste placement", () => {
  it("stacks pasted references to the left and centers the group on the generation node", () => {
    const placed = placeGenerationReferenceImages(
      [image("square", 100, 100), image("wide", 200, 100)],
      { x: 600, y: 200, width: 340, height: 500 }
    );

    expect(placed).toMatchObject([
      { placementPosition: { x: 240, y: 236 }, preserveViewportOnCreate: true },
      { placementPosition: { x: 240, y: 532 }, preserveViewportOnCreate: true }
    ]);
  });
});
