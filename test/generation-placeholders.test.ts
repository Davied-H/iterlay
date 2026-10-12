import { describe, expect, it } from "vitest";
import type { GeneratedImage } from "../src/components/canvas/image-node-model";
import {
  centerGenerationOutputs,
  removeGeneratedPlaceholders,
  stackGenerationOutputs,
  settleGeneratedPlaceholders
} from "../src/lib/generation-placeholders";

function image(id: string, overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id,
    path: "",
    dataUrl: "",
    jobId: "",
    source: "generated",
    ...overrides
  };
}

describe("generation placeholders", () => {
  it("stacks generation outputs vertically beside their generation node", () => {
    const outputs = stackGenerationOutputs([
      image("portrait", { width: 800, height: 1200 }),
      image("square", { width: 1000, height: 1000 }),
      image("landscape", { width: 1600, height: 900 })
    ], "generation", { x: 100, y: 80, width: 340 });

    expect(outputs.map((output) => output.placementAnchorId)).toEqual([
      "generation",
      "generation",
      "generation"
    ]);
    expect(outputs.map((output) => output.placementPosition)).toEqual([
      { x: 632, y: -204.25 },
      { x: 632, y: 231.75 },
      { x: 632, y: 535.75 }
    ]);
  });

  it("recenters existing outputs when a later generation is added", () => {
    const first = stackGenerationOutputs(
      [image("first", { width: 1000, height: 1000 })],
      "generation",
      { x: 100, y: 80, width: 340, height: 320 }
    );
    const both = centerGenerationOutputs(
      [...first, image("second", {
        width: 1000,
        height: 1000,
        placementAnchorId: "generation"
      })],
      "generation",
      { x: 100, y: 80, width: 340, height: 320 }
    );

    expect(both.map((output) => output.placementPosition)).toEqual([
      { x: 632, y: -44 },
      { x: 632, y: 260 }
    ]);
  });

  it("replaces pending nodes in place and clears transient generation state", () => {
    const current = [
      image("pending", {
        pending: true,
        generationStatus: "running",
        pendingStartedAt: 100,
        pendingPrompt: "头像",
        placementAnchorId: "anchor"
      }),
      image("existing", { path: "/existing.png" })
    ];
    const completed = image("pending", {
      path: "/avatar.png",
      dataUrl: "data:image/png;base64,AAAA",
      jobId: "job-1",
      pending: false,
      width: 1024,
      height: 1024
    });

    expect(settleGeneratedPlaceholders(current, ["pending"], [completed])).toEqual([
      expect.objectContaining({
        id: "pending",
        path: "/avatar.png",
        pending: false,
        generationStatus: undefined,
        pendingStartedAt: undefined,
        pendingPrompt: undefined,
        placementAnchorId: "anchor"
      }),
      current[1]
    ]);
  });

  it("adds completed outputs when the original placeholder is no longer mounted", () => {
    const completed = image("pending", { path: "/avatar.png", pending: false });
    expect(settleGeneratedPlaceholders([], ["pending"], [completed])).toEqual([completed]);
  });

  it("removes only placeholders owned by the failed request", () => {
    const current = [image("one", { pending: true }), image("two", { pending: true })];
    expect(removeGeneratedPlaceholders(current, ["one"])).toEqual([current[1]]);
  });
});
