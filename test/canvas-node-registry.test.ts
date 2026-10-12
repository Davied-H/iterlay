import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import {
  canvasPortsCompatible,
  compatibleCanvasTargetHandles,
  compatibleCanvasTargetTypes,
  createCanvasNodeData,
  getCanvasNodeDefinition,
  listCanvasNodeDefinitions,
  nodeRenderedHeight,
  nodeRenderedWidth
} from "@/components/canvas/NodeRegistry";

function imageNode(width?: number, height?: number): Node {
  return {
    id: "image-1",
    type: "imageNode",
    position: { x: 0, y: 0 },
    width,
    height,
    data: { image: { id: "image-1", width: 200, height: 100 } }
  };
}

describe("canvas node registry", () => {
  it("describes the existing image node handles and resource type", () => {
    const definition = getCanvasNodeDefinition("imageNode");

    expect(definition.defaultWidth).toBe(264);
    expect(definition.resource).toBe(definition.getResource);
    expect(definition.accepts).toEqual(["image"]);
    expect(definition.minimapColor).toMatch(/^#/);
    expect(definition.ports).toHaveLength(8);
    expect(definition.ports).toContainEqual({ id: "target-left", direction: "input", resource: "image" });
    expect(definition.ports).toContainEqual({ id: "source-right", direction: "output", resource: "image" });
  });

  it("derives renderers and defaults from declarative definitions", () => {
    expect(listCanvasNodeDefinitions().map((definition) => definition.type)).toEqual([
      "imageNode",
      "textNode",
      "generationNode",
      "videoNode",
      "videoGenerationNode",
      "comicSettingNode",
      "comicCharacterNode",
      "comicSegmentNode",
      "comicDramaEntryNode",
      "videoSequenceEntryNode"
    ]);
    expect(createCanvasNodeData("generationNode", { count: 3 })).toMatchObject({
      prompt: "",
      size: "1024x1024",
      count: 3,
      status: "idle"
    });
  });

  it("keeps existing width fallback and aspect-ratio sizing", () => {
    expect(nodeRenderedWidth(imageNode(2, 1))).toBe(264);
    expect(nodeRenderedHeight(imageNode(528))).toBe(264);
  });

  it("keeps unknown and malformed nodes inert and measurably stable", () => {
    const unknown: Node = {
      id: "unknown-1",
      type: "pluginNode",
      position: { x: 0, y: 0 },
      data: {}
    };
    const malformedImage: Node = {
      id: "broken-image",
      type: "imageNode",
      position: { x: 0, y: 0 },
      data: { image: { id: "broken-image" } }
    };

    expect(getCanvasNodeDefinition(unknown.type).type).toBe("unknown");
    expect(getCanvasNodeDefinition(undefined).ports).toEqual([]);
    expect(getCanvasNodeDefinition(unknown.type).resource(unknown)).toBeNull();
    expect(nodeRenderedWidth(unknown)).toBe(264);
    expect(nodeRenderedHeight(unknown)).toBe(264);
    expect(nodeRenderedHeight(malformedImage)).toBe(264);
  });

  it("validates semantic port compatibility through the registry", () => {
    expect(canvasPortsCompatible("textNode", "source-right", "generationNode", "target-left")).toBe(true);
    expect(canvasPortsCompatible("imageNode", "source-right", "generationNode", "target-left")).toBe(true);
    expect(canvasPortsCompatible("imageNode", "source-right", "textNode", "target-left")).toBe(false);
    expect(canvasPortsCompatible("generationNode", "source-right", "generationNode", "target-left")).toBe(false);
    expect(canvasPortsCompatible("pluginNode", "source-right", "generationNode", "target-left")).toBe(false);
    expect(canvasPortsCompatible(undefined, undefined, "generationNode", "target-left")).toBe(false);
    expect(compatibleCanvasTargetTypes("textNode", "source-right")).toEqual(["textNode", "generationNode", "videoGenerationNode", "comicSettingNode", "comicCharacterNode", "comicSegmentNode"]);
    expect(compatibleCanvasTargetTypes("generationNode", "source-right")).toEqual([]);
    expect(canvasPortsCompatible("imageNode", "source-right", "videoGenerationNode", "target-start-frame")).toBe(true);
    expect(canvasPortsCompatible("textNode", "source-right", "videoGenerationNode", "target-reference")).toBe(true);
    expect(canvasPortsCompatible("videoGenerationNode", "source-right", "videoNode", "target-left")).toBe(true);
    expect(canvasPortsCompatible("videoNode", "source-right", "videoGenerationNode", "target-video-reference")).toBe(true);
    expect(canvasPortsCompatible("textNode", "source-right", "videoNode", "target-left")).toBe(false);
    expect(canvasPortsCompatible("comicSettingNode", "source-right", "comicSegmentNode", "target-left")).toBe(true);
    expect(canvasPortsCompatible("comicCharacterNode", "source-right", "comicSegmentNode", "target-left")).toBe(true);
    expect(canvasPortsCompatible("comicSegmentNode", "source-right", "generationNode", "target-left")).toBe(true);
    expect(canvasPortsCompatible("comicSegmentNode", "source-right", "videoGenerationNode", "target-reference")).toBe(true);
    expect(compatibleCanvasTargetHandles("imageNode", "source-right", "videoGenerationNode")).toEqual([
      "target-start-frame",
      "target-end-frame",
      "target-reference"
    ]);
  });
});
