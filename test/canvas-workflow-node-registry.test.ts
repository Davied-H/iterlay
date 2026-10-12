import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import {
  canvasNodeTypes,
  getCanvasNodeDefinition,
  nodeRenderedHeight,
  nodeRenderedWidth
} from "@/components/canvas/NodeRegistry";
import {
  GENERATION_NODE_HEIGHT,
  GENERATION_NODE_MAX_HEIGHT,
  clampGenerationNodeHeight,
  generationStatusLabel
} from "@/components/canvas/GenerationNode";
import {
  TEXT_NODE_HEIGHT,
  TEXT_NODE_MAX_HEIGHT,
  clampTextNodeHeight
} from "@/components/canvas/TextNode";
import {
  VIDEO_GENERATION_NODE_HEIGHT,
  VideoGenerationNode,
  videoGenerationStatusLabel
} from "@/components/canvas/VideoGenerationNode";
import { VideoNode } from "@/components/canvas/VideoNode";
import { formatVideoDuration, videoNodeStatusLabel } from "@/components/canvas/video-node-model";

function canvasNode(type: string, data: Record<string, unknown>): Node {
  return { id: `${type}-1`, type, position: { x: 0, y: 0 }, data };
}

describe("canvas workflow node registry", () => {
  it("registers text, image generation, video, and video generation renderers", () => {
    expect(canvasNodeTypes.textNode).toBeDefined();
    expect(canvasNodeTypes.generationNode).toBeDefined();
    expect(canvasNodeTypes.videoNode).toBe(VideoNode);
    expect(canvasNodeTypes.videoGenerationNode).toBe(VideoGenerationNode);
  });

  it("exposes text as an upstream resource", () => {
    const definition = getCanvasNodeDefinition("textNode");
    const node = canvasNode("textNode", { text: "sunset reference" });

    expect(definition.getResource(node)).toEqual({ type: "text", value: "sunset reference" });
    expect(definition.ports).toContainEqual({
      id: "source-right",
      direction: "output",
      resource: "text"
    });
    expect(nodeRenderedWidth(node)).toBe(320);
    expect(nodeRenderedHeight(node)).toBe(272);
  });

  it("clamps text node resizing to its supported height range", () => {
    expect(clampTextNodeHeight(120)).toBe(TEXT_NODE_HEIGHT);
    expect(clampTextNodeHeight(416.4)).toBe(416);
    expect(clampTextNodeHeight(900)).toBe(TEXT_NODE_MAX_HEIGHT);
  });

  it("accepts text and image references without masquerading as an image resource", () => {
    const definition = getCanvasNodeDefinition("generationNode");
    const node = canvasNode("generationNode", {
      prompt: "editorial portrait",
      model: "test-model",
      size: "1024x1024",
      count: 2,
      status: "idle"
    });

    expect(definition.ports).toContainEqual({
      id: "target-left",
      direction: "input",
      resource: ["text", "image", "comic-setting", "comic-character", "comic-segment-script"]
    });
    expect(definition.ports).toContainEqual({
      id: "source-right",
      direction: "output",
      resource: "generation"
    });
    expect(definition.getResource(node)).toMatchObject({
      type: "generation",
      value: { prompt: "editorial portrait", count: 2 }
    });
    expect(nodeRenderedWidth(node)).toBe(340);
    expect(nodeRenderedHeight(node)).toBe(GENERATION_NODE_HEIGHT);
  });

  it("clamps generation node resizing to its supported height range", () => {
    expect(clampGenerationNodeHeight(120)).toBe(GENERATION_NODE_HEIGHT);
    expect(clampGenerationNodeHeight(416.4)).toBe(416);
    expect(clampGenerationNodeHeight(900)).toBe(GENERATION_NODE_MAX_HEIGHT);
  });

  it("maps generation status to compact display labels", () => {
    expect(generationStatusLabel("idle")).toBe("待运行");
    expect(generationStatusLabel("running")).toBe("生成中");
    expect(generationStatusLabel("failed")).toBe("失败");
  });

  it("describes video resources and semantic video-generation inputs", () => {
    const video = canvasNode("videoNode", {
      video: { id: "video-1", path: "video.mp4", dataUrl: "", durationMs: 5200 }
    });
    const generation = getCanvasNodeDefinition("videoGenerationNode");

    expect(getCanvasNodeDefinition("videoNode").getResource(video)).toMatchObject({
      type: "video",
      value: { id: "video-1", path: "video.mp4" }
    });
    expect(generation.ports).toContainEqual({ id: "target-start-frame", direction: "input", resource: ["image", "generation"] });
    expect(generation.ports).toContainEqual({ id: "target-reference", direction: "input", resource: ["image", "text", "comic-segment-script"] });
    expect(generation.ports).toContainEqual({ id: "target-video-reference", direction: "input", resource: "video" });
    expect(generation.defaultData).toMatchObject({ mode: "generate" });
    expect(nodeRenderedHeight(canvasNode("videoGenerationNode", {}))).toBe(VIDEO_GENERATION_NODE_HEIGHT);
  });

  it("formats video state and metadata labels without fake precision", () => {
    expect(videoNodeStatusLabel("post_processing")).toBe("下载中");
    expect(videoGenerationStatusLabel("recovering")).toBe("恢复中");
    expect(formatVideoDuration(undefined)).toBe("--:--");
    expect(formatVideoDuration(65_200)).toBe("1:05");
  });
});
