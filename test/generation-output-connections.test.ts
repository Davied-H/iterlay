import { describe, expect, it } from "vitest";
import type { BoardConnection } from "../shared/types";
import { createMissingGenerationOutputConnections } from "../src/lib/generation-output-connections";

describe("generation output connections", () => {
  it("connects pending character outputs immediately without creating duplicates", () => {
    const existing: BoardConnection[] = [{
      id: "existing",
      source: "character",
      target: "image-a",
      kind: "visual"
    }];
    let nextId = 0;
    const additions = createMissingGenerationOutputConnections({
      sourceId: "character",
      targetIds: ["image-a", "image-b", "image-b"],
      existing,
      label: "角色形象",
      idFactory: () => `connection-${++nextId}`
    });

    expect(additions).toEqual([expect.objectContaining({
      id: "connection-1",
      source: "character",
      target: "image-b",
      sourceHandle: "system-output",
      targetHandle: "system-input",
      kind: "visual",
      label: "角色形象"
    })]);
  });
});
