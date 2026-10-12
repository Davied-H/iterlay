import type { Edge, Node } from "@xyflow/react";
import type {
  BoardGenerationNode,
  BoardTextNode,
  BoardVideoGenerationNode,
  BoardVideoNode
} from "@shared/types";
import { describe, expect, it, vi } from "vitest";
import {
  patchCanvasWorkflowNode,
  projectCanvasNodes,
  type CanvasWorkflowNode,
  type CanvasNodeProjectionBindings
} from "@/components/canvas/canvas-node-projection";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import { VIDEO_GENERATION_NODE_HEIGHT, VIDEO_NODE_HEIGHT } from "@/components/canvas/canvas-node-layout";

const onCopy = vi.fn();
const onSave = vi.fn();
const onUseReference = vi.fn();
const onTextChange = vi.fn();
const onGenerationChange = vi.fn();
const emptyComments: [] = [];

const bindings: CanvasNodeProjectionBindings = {
  imageData: () => ({
    comments: emptyComments,
    onCopy,
    onSave,
    onUseReference
  }),
  textData: (node) => ({ text: node.text, onChange: onTextChange }),
  generationData: (node) => ({
    prompt: node.prompt ?? "",
    model: node.model ?? "",
    size: node.size ?? "1024x1024",
    count: node.count ?? 1,
    onChange: onGenerationChange
  })
};

function image(id: string, overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id,
    path: `${id}.png`,
    dataUrl: `data:${id}`,
    jobId: id,
    width: 100,
    height: 100,
    ...overrides
  };
}

function textNode(id: string, text: string): BoardTextNode {
  return { id, type: "text", text, x: 0, y: 0 };
}

function generationNode(id: string, prompt = ""): BoardGenerationNode {
  return { id, type: "generation", prompt, x: 0, y: 0 };
}

function project(options: {
  previousNodes?: readonly Node[];
  images?: readonly GeneratedImage[];
  workflowNodes?: ReadonlyArray<CanvasWorkflowNode>;
  edges?: readonly Edge[];
  initialLayouts?: Record<string, { x: number; y: number; width?: number; height?: number }>;
  userPositionedNodeIds?: ReadonlySet<string>;
  projectionBindings?: CanvasNodeProjectionBindings;
}) {
  return projectCanvasNodes({
    previousNodes: options.previousNodes ?? [],
    images: options.images ?? [],
    workflowNodes: options.workflowNodes ?? [],
    edges: options.edges ?? [],
    initialLayouts: options.initialLayouts,
    userPositionedNodeIds: options.userPositionedNodeIds,
    bindings: options.projectionBindings ?? bindings
  });
}

describe("canvas node projection", () => {
  it("patches workflow data and geometry without mutating the previous node", () => {
    const previous: Node = Object.freeze({
      id: "text",
      type: "textNode",
      position: Object.freeze({ x: 10, y: 20 }),
      height: 272,
      data: Object.freeze({ text: "旧内容", displayHeight: 272, heightMode: "auto" })
    });

    const next = patchCanvasWorkflowNode(
      [previous],
      previous.id,
      { text: "新内容", displayHeight: 360, heightMode: "manual" },
      360
    );

    expect(next[0]).not.toBe(previous);
    expect(next[0].data).toEqual({ text: "新内容", displayHeight: 360, heightMode: "manual" });
    expect(next[0].height).toBe(360);
    expect(previous.data).toEqual({ text: "旧内容", displayHeight: 272, heightMode: "auto" });
    expect(previous.height).toBe(272);
  });

  it("preserves the node array for a no-op or a non-workflow target", () => {
    const workflow: Node = {
      id: "text",
      type: "textNode",
      position: { x: 0, y: 0 },
      data: { text: "相同" }
    };
    const imageNode: Node = {
      id: "image",
      type: "imageNode",
      position: { x: 0, y: 0 },
      data: { image: image("image") }
    };
    const nodes = [workflow, imageNode];

    expect(patchCanvasWorkflowNode(nodes, workflow.id, { text: "相同" })).toBe(nodes);
    expect(patchCanvasWorkflowNode(nodes, imageNode.id, { text: "不能写入" })).toBe(nodes);
  });

  it("structurally shares an unchanged projection without mutating its inputs", () => {
    const artwork = Object.freeze(image("artwork"));
    const text = Object.freeze(textNode("text", "说明"));
    const first = project({ images: [artwork], workflowNodes: [text] });
    const previousNodes = Object.freeze(first.nodes.map((node) => Object.freeze(node)));

    const second = project({ previousNodes, images: [artwork], workflowNodes: [text] });

    expect(second.nodes).toBe(previousNodes);
    expect(second.nodes[0]).toBe(previousNodes[0]);
    expect(second.nodes[1]).toBe(previousNodes[1]);
    expect(second.layoutChanged).toBe(false);
    expect(second.addedIds).toEqual([]);
    expect(second.removedIds).toEqual([]);
  });

  it("uses initial layout before explicit placement and preserves the requested image width", () => {
    const result = project({
      images: [image("placed", { placementPosition: { x: 900, y: 800 }, placementWidth: 400 })],
      initialLayouts: { placed: { x: 120, y: 240, width: 360 } }
    });

    expect(result.nodes[0]).toMatchObject({
      position: { x: 120, y: 240 },
      width: 360,
      height: 360
    });
  });

  it("prioritizes existing, restored, and persisted workflow positions", () => {
    const existing: Node = {
      id: "existing",
      type: "textNode",
      position: { x: 10, y: 20 },
      width: 320,
      height: 272,
      data: { text: "existing" }
    };
    const result = project({
      previousNodes: [existing],
      workflowNodes: [
        { ...textNode("existing", "existing"), x: 30, y: 40 },
        { ...textNode("restored", "restored"), x: 50, y: 60 },
        { ...textNode("persisted", "persisted"), x: 70, y: 80 }
      ],
      initialLayouts: {
        existing: { x: 90, y: 100 },
        restored: { x: 110, y: 120 }
      }
    });

    expect(Object.fromEntries(result.nodes.map((node) => [node.id, node.position]))).toEqual({
      existing: { x: 10, y: 20 },
      restored: { x: 110, y: 120 },
      persisted: { x: 70, y: 80 }
    });
  });

  it("places an image after an existing generation anchor with horizontally aligned centers", () => {
    const anchor: Node = {
      id: "generator",
      type: "generationNode",
      position: { x: 100, y: 50 },
      width: 340,
      height: 320,
      data: { prompt: "", model: "", size: "1024x1024", count: 1 }
    };
    const result = project({
      previousNodes: [anchor],
      images: [image("output", { placementAnchorId: anchor.id })],
      workflowNodes: [generationNode(anchor.id)]
    });

    expect(result.nodes[0].position).toEqual({ x: 632, y: 78 });
  });

  it("realigns a completed landscape result using its final height", () => {
    const anchor: Node = {
      id: "generator",
      type: "generationNode",
      position: { x: 100, y: 50 },
      width: 340,
      height: 480,
      data: { prompt: "", model: "", size: "auto", count: 1 }
    };
    const pending = image("output", {
      pending: true,
      placementAnchorId: anchor.id,
      width: undefined,
      height: undefined
    });
    const first = project({
      previousNodes: [anchor],
      images: [pending],
      workflowNodes: [{ ...generationNode(anchor.id), displayHeight: 480 }]
    });
    const completed = image("output", {
      placementAnchorId: anchor.id,
      width: 1600,
      height: 900
    });
    const result = project({
      previousNodes: first.nodes,
      images: [completed],
      workflowNodes: [{ ...generationNode(anchor.id), displayHeight: 480 }]
    });

    const output = result.nodes.find((node) => node.id === "output")!;
    const generator = result.nodes.find((node) => node.id === anchor.id)!;
    expect(output.position.x).toBe(632);
    expect(output.position.y + output.height! / 2).toBe(generator.position.y + generator.height! / 2);
  });

  it("centers repeated video outputs as a non-overlapping column", () => {
    const generation: BoardVideoGenerationNode = {
      id: "video-generation",
      type: "video-generation",
      x: 0,
      y: 0,
      aspectRatio: "16:9"
    };
    const output = (id: string): BoardVideoNode => ({
      id,
      type: "video",
      videoPath: "",
      jobId: id,
      source: "generated",
      generationNodeId: generation.id,
      aspectRatio: "16:9",
      x: 0,
      y: 0
    });

    const result = project({ workflowNodes: [generation, output("first"), output("second")] });
    const positions = Object.fromEntries(result.nodes.map((node) => [node.id, node.position]));

    expect(positions.first).toEqual({ x: 532, y: 95.5 });
    expect(positions.second).toEqual({ x: 532, y: 338 });
  });

  it("selects all newly requested images and clears the previous selection", () => {
    const existingImage = image("existing");
    const first = project({ images: [existingImage], workflowNodes: [textNode("text", "A")] });
    const selected = first.nodes.map((node) => ({ ...node, selected: true }));
    const result = project({
      previousNodes: selected,
      images: [existingImage, image("new-a", { selectOnCreate: true }), image("new-b", { selectOnCreate: true })],
      workflowNodes: [textNode("text", "A")]
    });

    expect(result.nodes.map((node) => [node.id, Boolean(node.selected)])).toEqual([
      ["existing", false],
      ["new-a", true],
      ["new-b", true],
      ["text", true]
    ]);
  });

  it("applies an explicit placement update once", () => {
    const original = image("version");
    const first = project({ images: [original] });
    const placed = image("version", { placementPosition: { x: 120, y: 360 } });
    const second = project({ previousNodes: first.nodes, images: [placed] });
    const third = project({ previousNodes: second.nodes, images: [{ ...placed }] });

    expect(second.nodes[0].position).toEqual({ x: 120, y: 360 });
    expect(third.nodes[0].position).toBe(second.nodes[0].position);
  });

  it("does not move a user-positioned placeholder when its completed image grows", () => {
    const pending = image("pending", { pending: true, width: 100, height: 100 });
    const first = project({ images: [pending, image("obstacle")] });
    const overlapping = first.nodes.map((node) => node.id === "obstacle"
      ? { ...node, position: { x: 0, y: 300 } }
      : node);
    const result = project({
      previousNodes: overlapping,
      images: [image("pending", { width: 100, height: 300 }), image("obstacle")],
      userPositionedNodeIds: new Set(["pending"])
    });

    expect(result.nodes[0].position).toBe(overlapping[0].position);
    expect(result.nodes[0].height).toBe(792);
  });

  it("resolves newly projected text and image references in the same pass", () => {
    const reference = image("reference");
    const workflowNodes = [textNode("text", "上游描述"), generationNode("generation", "自己的提示")];
    const edges: Edge[] = [
      { id: "text-edge", source: "text", target: "generation", data: { kind: "reference" } },
      { id: "image-edge", source: "reference", target: "generation", data: { kind: "reference" } }
    ];

    const result = project({ images: [reference], workflowNodes, edges });
    const generation = result.nodes.find((node) => node.id === "generation")!;

    expect(generation.data.upstreamPrompt).toBe("上游描述");
    expect(generation.data.referenceImages).toEqual([reference]);
  });

  it("reuses an equal reference image list across projections", () => {
    const reference = image("reference");
    const workflows = [generationNode("generation")];
    const edges: Edge[] = [
      { id: "edge", source: "reference", target: "generation", data: { kind: "reference" } }
    ];
    const first = project({ images: [reference], workflowNodes: workflows, edges });
    const second = project({ previousNodes: first.nodes, images: [reference], workflowNodes: workflows, edges });

    expect(second.nodes).toBe(first.nodes);
    expect(second.nodes[1].data.referenceImages).toBe(first.nodes[1].data.referenceImages);
  });

  it("updates injected handlers by identity while preserving layout", () => {
    const artwork = image("image");
    const first = project({ images: [artwork] });
    const replacement = vi.fn();
    const nextBindings: CanvasNodeProjectionBindings = {
      ...bindings,
      imageData: () => ({ comments: emptyComments, onCopy, onSave, onUseReference: replacement })
    };
    const second = project({ previousNodes: first.nodes, images: [artwork], projectionBindings: nextBindings });

    expect(second.nodes[0]).not.toBe(first.nodes[0]);
    expect(second.nodes[0].position).toBe(first.nodes[0].position);
    expect(second.nodes[0].data.onUseReference).toBe(replacement);
    expect(second.layoutChanged).toBe(false);
  });

  it("reports added and removed ids independently from geometry", () => {
    const first = project({ images: [image("removed"), image("kept")] });
    const second = project({ previousNodes: first.nodes, images: [image("kept"), image("added")] });

    expect(second.addedIds).toEqual(["added"]);
    expect(second.removedIds).toEqual(["removed"]);
    expect(second.layoutChanged).toBe(true);
  });

  it("projects persisted video media and video-generation contracts with stable defaults", () => {
    const result = project({
      workflowNodes: [
        {
          id: "video",
          type: "video",
          x: 40,
          y: 80,
          video: { id: "video", path: "result.mp4", dataUrl: "", durationMs: 5000, status: "completed" }
        },
        {
          id: "video-generation",
          type: "video-generation",
          x: 480,
          y: 80,
          mode: "remix",
          prompt: "缓慢推进",
          model: "seedance",
          referenceVideoPaths: ["/assets/source.mp4"],
          referenceAudioPaths: ["/assets/voice.wav"]
        }
      ]
    });

    expect(result.nodes[0]).toMatchObject({
      id: "video",
      type: "videoNode",
      position: { x: 40, y: 80 },
      width: 360,
      height: VIDEO_NODE_HEIGHT,
      data: { video: { path: "result.mp4", status: "completed" } }
    });
    expect(result.nodes[1]).toMatchObject({
      id: "video-generation",
      type: "videoGenerationNode",
      position: { x: 480, y: 80 },
      width: 340,
      height: VIDEO_GENERATION_NODE_HEIGHT,
      data: {
        prompt: "缓慢推进",
        model: "seedance",
        mode: "remix",
        duration: 5,
        aspectRatio: "16:9",
        resolution: "720p",
        generateAudio: false,
        status: "draft",
        referenceVideos: [{ path: "/assets/source.mp4", name: "source.mp4" }],
        referenceAudios: [{ path: "/assets/voice.wav", name: "voice.wav" }]
      }
    });
  });

  it("uses decoded dimensions before an inherited requested video ratio", () => {
    const result = project({
      workflowNodes: [
        {
          id: "square-generation",
          type: "video-generation",
          x: 0,
          y: 0,
          aspectRatio: "1:1"
        },
        {
          id: "square-video",
          type: "video",
          x: 440,
          y: 0,
          videoPath: "/videos/square.mp4",
          jobId: "square-job",
          source: "generated",
          generationNodeId: "square-generation",
          width: 1280,
          height: 720
        }
      ]
    });

    expect(result.nodes.find((node) => node.id === "square-video")).toMatchObject({
      width: 360,
      height: 202.5
    });
  });
});


describe("comic drama canvas projection", () => {
  it("projects semantic cards through the normal workflow-node registry", () => {
    const node: CanvasWorkflowNode = {
      id: "setting", type: "comic-setting", x: 120, y: 80, status: "saved", activeVersionId: "v1",
      versions: [{ versionId: "v1", createdAt: "2026-08-22T08:00:00.000Z", fields: {
        title: "连续英数VeryLongTitleWithoutSpaces1234567890", synopsis: "一段很长的漫剧梗概", genre: "悬疑", tone: "克制",
        worldRules: [], visualStyle: "冷色手绘", constraints: [], aspectRatio: "9:16", targetDurationSeconds: 30
      } }]
    };
    const result = project({
      workflowNodes: [node],
      projectionBindings: { ...bindings, comicDramaData: (comicNode) => ({ node: comicNode }) }
    });
    expect(result.nodes[0]).toMatchObject({ id: "setting", type: "comicSettingNode", position: { x: 120, y: 80 }, width: 280, height: 260 });
    expect(result.nodes[0]?.data.node).toBe(node);
  });
});
