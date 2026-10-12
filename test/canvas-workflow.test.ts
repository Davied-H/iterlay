import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { GeneratedImage } from "@/components/canvas/ImageNode";
import { resolveGenerationNodeInput } from "@/components/canvas/canvas-workflow";

function node(id: string, type: string, data: Record<string, unknown>): Node {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function image(id: string, overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id,
    path: `/assets/${id}.png`,
    dataUrl: `iterlay-asset://${id}`,
    jobId: `job-${id}`,
    ...overrides
  };
}

function edge(id: string, source: string, target: string, kind: "visual" | "reference" = "reference"): Edge {
  return { id, source, target, data: { kind } };
}

describe("resolveGenerationNodeInput", () => {
  it("combines the generation prompt with transitive text in stable upstream order", () => {
    const nodes = [
      node("generation", "generationNode", { prompt: "  local instruction  " }),
      node("middle", "textNode", { text: "middle text" }),
      node("first", "textNode", { text: " first text " }),
      node("second", "textNode", { text: "second text" })
    ];
    const edges = [
      edge("middle-generation", "middle", "generation"),
      edge("first-middle", "first", "middle"),
      edge("second-generation", "second", "generation")
    ];

    expect(resolveGenerationNodeInput("generation", nodes, edges)).toEqual({
      prompt: "local instruction\n\nfirst text\n\nmiddle text\n\nsecond text",
      images: [],
      sourceNodeIds: ["first", "middle", "second"]
    });
  });

  it("ignores visual edges and prevents reference cycles from being revisited", () => {
    const nodes = [
      node("generation", "generationNode", { prompt: "generate" }),
      node("a", "textNode", { text: "A" }),
      node("b", "textNode", { text: "B" }),
      node("visual", "textNode", { text: "not included" })
    ];
    const edges = [
      edge("a-generation", "a", "generation"),
      edge("b-a", "b", "a"),
      edge("a-b", "a", "b"),
      edge("visual-generation", "visual", "generation", "visual")
    ];

    expect(resolveGenerationNodeInput("generation", nodes, edges)).toMatchObject({
      prompt: "generate\n\nB\n\nA",
      sourceNodeIds: ["b", "a"]
    });
  });

  it("accepts persisted top-level reference kinds", () => {
    const reference = {
      id: "persisted-reference",
      source: "text",
      target: "generation",
      kind: "reference"
    } as Edge & { kind: "reference" };

    expect(resolveGenerationNodeInput("generation", [
      node("generation", "generationNode", { prompt: "" }),
      node("text", "textNode", { text: "from persisted edge" })
    ], [reference]).prompt).toBe("from persisted edge");
  });

  it("deduplicates usable images and limits references to four", () => {
    const shared = image("copy-a", { path: "/assets/shared.png" });
    const candidates = [
      image("one"),
      shared,
      image("copy-b", { path: shared.path }),
      image("pending", { pending: true }),
      image("empty", { path: "", dataUrl: "" }),
      image("three"),
      image("four"),
      image("five")
    ];
    const nodes = [
      node("generation", "generationNode", { prompt: "prompt" }),
      ...candidates.map((candidate) => node(candidate.id, "imageNode", { image: candidate }))
    ];
    const edges = candidates.map((candidate, index) => edge(`edge-${index}`, candidate.id, "generation"));

    const result = resolveGenerationNodeInput("generation", nodes, edges);

    expect(result.images.map((candidate) => candidate.id)).toEqual(["one", "copy-a", "three", "four"]);
    expect(result.sourceNodeIds).toEqual(["one", "copy-a", "three", "four"]);
  });

  it("ignores malformed and missing source nodes without disturbing later inputs", () => {
    const valid = image("valid", { path: "", dataUrl: "data:image/png;base64,AA==" });
    const nodes = [
      node("generation", "generationNode", { prompt: "" }),
      node("blank", "textNode", { text: "   " }),
      node("malformed-text", "textNode", {}),
      node("malformed", "imageNode", { image: { id: "malformed" } }),
      node("unknown", "pluginNode", { text: "not a registered resource" }),
      node("valid", "imageNode", { image: valid })
    ];
    const edges = [
      edge("missing", "missing", "generation"),
      edge("blank", "blank", "generation"),
      edge("malformed-text", "malformed-text", "generation"),
      edge("malformed", "malformed", "generation"),
      edge("unknown", "unknown", "generation"),
      edge("valid", "valid", "generation")
    ];

    expect(resolveGenerationNodeInput("generation", nodes, edges)).toEqual({
      prompt: "",
      images: [valid],
      sourceNodeIds: ["valid"]
    });
  });
  it("resolves a pinned image version to its own media path instead of the active version", () => {
    const versioned = image("versioned", {
      path: "/assets/active.png", dataUrl: "asset:active", jobId: "job-active", activeVersion: 1,
      versions: [
        { path: "/assets/pinned.png", dataUrl: "asset:pinned", jobId: "job-pinned" },
        { path: "/assets/active.png", dataUrl: "asset:active", jobId: "job-active" }
      ]
    });
    const binding = {
      id: "pinned", source: "versioned", target: "generation",
      data: { kind: "reference", versionBinding: { mode: "pinned", versionId: "job-pinned" } }
    } as Edge;
    const result = resolveGenerationNodeInput("generation", [
      node("generation", "generationNode", { prompt: "prompt" }),
      node("versioned", "imageNode", { image: versioned })
    ], [binding]);
    expect(result.images[0]).toMatchObject({ path: "/assets/pinned.png", dataUrl: "asset:pinned", jobId: "job-pinned" });
    expect(result.versionConflicts).toBeUndefined();
  });

  it("reports a conflict instead of silently sending active media for an invalid pin", () => {
    const binding = {
      id: "pinned", source: "versioned", target: "generation",
      data: { kind: "reference", versionBinding: { mode: "pinned", versionId: "missing-version" } }
    } as Edge;
    const result = resolveGenerationNodeInput("generation", [
      node("generation", "generationNode", { prompt: "prompt" }),
      node("versioned", "imageNode", { image: image("versioned") })
    ], [binding]);
    expect(result.images).toEqual([]);
    expect(result.versionConflicts?.[0]).toContain("missing-version");
  });

});
