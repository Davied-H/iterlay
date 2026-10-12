import { lazy, Suspense } from "react";
import type { Node, NodeProps, NodeTypes } from "@xyflow/react";
import type { ComicDramaBoardNode } from "@shared/comic-drama";
import type { ComicDramaEntryNodeData } from "./ComicDramaEntryNode";
import type { ComicDramaNodeData } from "./ComicDramaNode";
import {
  ImageNode,
  IMAGE_NODE_MIN_WIDTH,
  IMAGE_NODE_WIDTH,
  type GeneratedImage,
  type ImageNodeData
} from "./ImageNode";
import {
  GenerationNode,
  type GenerationNodeData
} from "./GenerationNode";
import { TextNode } from "./TextNode";
import { VideoNode, type GeneratedVideo, type VideoNodeData } from "./VideoNode";
import { VideoGenerationNode, type VideoGenerationNodeData } from "./VideoGenerationNode";
import { VideoSequenceEntryNode } from "./VideoSequenceEntryNode";
import {
  GENERATION_NODE_HEIGHT,
  GENERATION_NODE_MIN_WIDTH,
  GENERATION_NODE_WIDTH,
  TEXT_NODE_HEIGHT,
  TEXT_NODE_MIN_WIDTH,
  TEXT_NODE_WIDTH
} from "./canvas-node-layout";
import {
  VIDEO_GENERATION_NODE_HEIGHT,
  VIDEO_GENERATION_NODE_MIN_WIDTH,
  VIDEO_GENERATION_NODE_WIDTH,
  VIDEO_NODE_HEIGHT,
  VIDEO_NODE_MIN_WIDTH,
  VIDEO_NODE_WIDTH
} from "./canvas-node-layout";

export { nodeRenderedHeight, nodeRenderedWidth } from "./canvas-node-layout";

const LazyComicDramaNode = lazy(() => import("./ComicDramaNode").then((module) => ({ default: module.ComicDramaNode })));
function ComicDramaNodeLoader(props: NodeProps): React.ReactElement {
  return <Suspense fallback={null}><LazyComicDramaNode {...props} /></Suspense>;
}

const LazyComicDramaEntryNode = lazy(() => import("./ComicDramaEntryNode").then((module) => ({ default: module.ComicDramaEntryNode })));
function ComicDramaEntryNodeLoader(props: NodeProps): React.ReactElement {
  return <Suspense fallback={null}><LazyComicDramaEntryNode {...props} /></Suspense>;
}


export type CanvasNodeResource =
  | { type: "image"; value: GeneratedImage }
  | { type: "text"; value: string }
  | { type: "generation"; value: GenerationNodeData }
  | { type: "video"; value: GeneratedVideo }
  | { type: "video-generation"; value: VideoGenerationNodeData }
  | { type: "comic-setting"; value: ComicDramaBoardNode }
  | { type: "comic-character"; value: ComicDramaBoardNode }
  | { type: "comic-segment-script"; value: ComicDramaBoardNode };

export type CanvasNodeResourceType = CanvasNodeResource["type"];

export type CanvasNodePort = {
  id: string;
  direction: "input" | "output";
  resource: CanvasNodeResourceType | readonly CanvasNodeResourceType[];
};

export type CanvasNodeDefinition = {
  type: string;
  renderer: NodeTypes[string];
  defaultWidth: number;
  minWidth: number;
  defaultHeight?: number;
  defaultData: Readonly<Record<string, unknown>>;
  minimapColor: string;
  /** Resolves the value this node contributes to downstream consumers. */
  resource: (node: Node) => CanvasNodeResource | null;
  /** Resource types accepted by this node as semantic inputs. */
  accepts: readonly CanvasNodeResourceType[];
  ports: readonly CanvasNodePort[];
  /** @deprecated Use resource. Kept for existing callers while the registry migrates. */
  getResource: (node: Node) => CanvasNodeResource | null;
};

const imageResource = (node: Node): CanvasNodeResource | null => {
  const image = readNodeImage(node);
  return image ? { type: "image", value: image } : null;
};

const textResource = (node: Node): CanvasNodeResource | null => {
  const text = (node.data as Record<string, unknown> | undefined)?.text;
  return typeof text === "string" ? { type: "text", value: text } : null;
};

const generationResource = (node: Node): CanvasNodeResource => ({
  type: "generation",
  value: node.data as unknown as GenerationNodeData
});

const videoResource = (node: Node): CanvasNodeResource | null => {
  const video = (node.data as Partial<VideoNodeData> | undefined)?.video;
  return video && typeof video.id === "string" ? { type: "video", value: video } : null;
};

const videoGenerationResource = (node: Node): CanvasNodeResource => ({
  type: "video-generation",
  value: node.data as unknown as VideoGenerationNodeData
});

const comicDramaResource = (node: Node): CanvasNodeResource | null => {
  const value = (node.data as Partial<ComicDramaNodeData> | undefined)?.node;
  return value ? { type: value.type, value } as CanvasNodeResource : null;
};

const comicDramaEntryResource = (): CanvasNodeResource | null => null;

const imageNodeDefinition: CanvasNodeDefinition = {
  type: "imageNode",
  renderer: ImageNode,
  defaultWidth: IMAGE_NODE_WIDTH,
  minWidth: IMAGE_NODE_MIN_WIDTH,
  defaultData: {},
  minimapColor: "#0ea5e9",
  resource: imageResource,
  accepts: ["image"],
  ports: (["top", "right", "bottom", "left"] as const).flatMap((side) => [
    { id: `target-${side}`, direction: "input" as const, resource: "image" as const },
    { id: `source-${side}`, direction: "output" as const, resource: "image" as const }
  ]),
  getResource: imageResource
};

const textNodeDefinition: CanvasNodeDefinition = {
  type: "textNode",
  renderer: TextNode,
  defaultWidth: TEXT_NODE_WIDTH,
  minWidth: TEXT_NODE_MIN_WIDTH,
  defaultHeight: TEXT_NODE_HEIGHT,
  defaultData: { text: "", title: "文本" },
  minimapColor: "#64748b",
  resource: textResource,
  accepts: ["text"],
  ports: (["top", "right", "bottom", "left"] as const).flatMap((side) => [
    { id: `target-${side}`, direction: "input" as const, resource: "text" as const },
    { id: `source-${side}`, direction: "output" as const, resource: "text" as const }
  ]),
  getResource: textResource
};

const generationNodeDefinition: CanvasNodeDefinition = {
  type: "generationNode",
  renderer: GenerationNode,
  defaultWidth: GENERATION_NODE_WIDTH,
  minWidth: GENERATION_NODE_MIN_WIDTH,
  defaultHeight: GENERATION_NODE_HEIGHT,
  defaultData: {
    mode: "generate",
    prompt: "",
    model: "",
    size: "1024x1024",
    count: 1,
    status: "idle"
  },
  minimapColor: "#0f756b",
  resource: generationResource,
  accepts: ["image", "text", "video", "comic-setting", "comic-character", "comic-segment-script"],
  ports: (["top", "right", "bottom", "left"] as const).flatMap((side) => [
    { id: `target-${side}`, direction: "input" as const, resource: ["text", "image", "comic-setting", "comic-character", "comic-segment-script"] as const },
    { id: `source-${side}`, direction: "output" as const, resource: "generation" as const }
  ]),
  getResource: generationResource
};

const videoNodeDefinition: CanvasNodeDefinition = {
  type: "videoNode",
  renderer: VideoNode,
  defaultWidth: VIDEO_NODE_WIDTH,
  minWidth: VIDEO_NODE_MIN_WIDTH,
  defaultHeight: VIDEO_NODE_HEIGHT,
  defaultData: {},
  minimapColor: "#475569",
  resource: videoResource,
  accepts: ["video", "video-generation"],
  ports: (["top", "right", "bottom", "left"] as const).flatMap((side) => [
    { id: `target-${side}`, direction: "input" as const, resource: ["video", "video-generation"] as const },
    { id: `source-${side}`, direction: "output" as const, resource: "video" as const }
  ]),
  getResource: videoResource
};

const videoGenerationNodeDefinition: CanvasNodeDefinition = {
  type: "videoGenerationNode",
  renderer: VideoGenerationNode,
  defaultWidth: VIDEO_GENERATION_NODE_WIDTH,
  minWidth: VIDEO_GENERATION_NODE_MIN_WIDTH,
  defaultHeight: VIDEO_GENERATION_NODE_HEIGHT,
  defaultData: {
    mode: "generate",
    prompt: "",
    model: "",
    duration: 5,
    aspectRatio: "16:9",
    resolution: "720p",
    generateAudio: false,
    status: "draft"
  },
  minimapColor: "#0f756b",
  resource: videoGenerationResource,
  accepts: ["image", "text", "video", "comic-segment-script"],
  ports: [
    { id: "target-start-frame", direction: "input", resource: ["image", "generation"] },
    { id: "target-end-frame", direction: "input", resource: ["image", "generation"] },
    { id: "target-reference", direction: "input", resource: ["image", "text", "comic-segment-script"] },
    { id: "target-video-reference", direction: "input", resource: "video" },
    { id: "source-right", direction: "output", resource: "video-generation" }
  ],
  getResource: videoGenerationResource
};

const comicSettingNodeDefinition: CanvasNodeDefinition = {
  type: "comicSettingNode", renderer: ComicDramaNodeLoader, defaultWidth: 280, minWidth: 260, defaultHeight: 260,
  defaultData: {}, minimapColor: "#6b7280", resource: comicDramaResource, accepts: ["text", "image"],
  ports: [
    { id: "target-left", direction: "input", resource: ["text", "image"] },
    { id: "source-right", direction: "output", resource: "comic-setting" }
  ], getResource: comicDramaResource
};

const comicCharacterNodeDefinition: CanvasNodeDefinition = {
  type: "comicCharacterNode", renderer: ComicDramaNodeLoader, defaultWidth: 240, minWidth: 220, defaultHeight: 268,
  defaultData: {}, minimapColor: "#6b7280", resource: comicDramaResource, accepts: ["text", "image"],
  ports: [
    { id: "target-left", direction: "input", resource: ["text", "image"] },
    { id: "source-right", direction: "output", resource: "comic-character" }
  ], getResource: comicDramaResource
};

const comicSegmentNodeDefinition: CanvasNodeDefinition = {
  type: "comicSegmentNode", renderer: ComicDramaNodeLoader, defaultWidth: 300, minWidth: 280, defaultHeight: 300,
  defaultData: {}, minimapColor: "#6b7280", resource: comicDramaResource,
  accepts: ["comic-setting", "comic-character", "text"],
  ports: [
    { id: "target-left", direction: "input", resource: ["comic-setting", "comic-character", "text"] },
    { id: "source-right", direction: "output", resource: "comic-segment-script" }
  ], getResource: comicDramaResource
};

const comicDramaEntryNodeDefinition: CanvasNodeDefinition = {
  type: "comicDramaEntryNode",
  renderer: ComicDramaEntryNodeLoader,
  defaultWidth: 420,
  minWidth: 360,
  defaultHeight: 304,
  defaultData: {} satisfies Partial<ComicDramaEntryNodeData>,
  minimapColor: "#4b5563",
  resource: comicDramaEntryResource,
  accepts: [],
  ports: [],
  getResource: comicDramaEntryResource
};

const videoSequenceEntryNodeDefinition: CanvasNodeDefinition = {
  type: "videoSequenceEntryNode", renderer: VideoSequenceEntryNode, defaultWidth: 280, minWidth: 260, defaultHeight: 190,
  defaultData: {}, minimapColor: "#334155", resource: () => null, accepts: [], ports: [], getResource: () => null
};

const unknownNodeDefinition: CanvasNodeDefinition = {
  type: "unknown",
  renderer: () => null,
  defaultWidth: IMAGE_NODE_WIDTH,
  minWidth: IMAGE_NODE_MIN_WIDTH,
  defaultHeight: IMAGE_NODE_WIDTH,
  defaultData: {},
  minimapColor: "#94a3b8",
  resource: () => null,
  accepts: [],
  ports: [],
  getResource: () => null
};

const definitions = new Map<string, CanvasNodeDefinition>([
  [imageNodeDefinition.type, imageNodeDefinition],
  [textNodeDefinition.type, textNodeDefinition],
  [generationNodeDefinition.type, generationNodeDefinition],
  [videoNodeDefinition.type, videoNodeDefinition],
  [videoGenerationNodeDefinition.type, videoGenerationNodeDefinition],
  [comicSettingNodeDefinition.type, comicSettingNodeDefinition],
  [comicCharacterNodeDefinition.type, comicCharacterNodeDefinition],
  [comicSegmentNodeDefinition.type, comicSegmentNodeDefinition],
  [comicDramaEntryNodeDefinition.type, comicDramaEntryNodeDefinition],
  [videoSequenceEntryNodeDefinition.type, videoSequenceEntryNodeDefinition]
]);

export const canvasNodeTypes: NodeTypes = Object.fromEntries(
  Array.from(definitions.values(), (definition) => [definition.type, definition.renderer])
);

export function getCanvasNodeDefinition(type: string | undefined): CanvasNodeDefinition {
  return definitions.get(type ?? "") ?? unknownNodeDefinition;
}

export function listCanvasNodeDefinitions(): readonly CanvasNodeDefinition[] {
  return Array.from(definitions.values());
}

export function createCanvasNodeData(type: string, data: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...getCanvasNodeDefinition(type).defaultData, ...data };
}

export function canvasPortsCompatible(
  sourceType: string | undefined,
  sourceHandle: string | null | undefined,
  targetType: string | undefined,
  targetHandle: string | null | undefined
): boolean {
  const source = getCanvasNodeDefinition(sourceType);
  const target = getCanvasNodeDefinition(targetType);
  const output = source.ports.find((port) =>
    port.direction === "output" && (!sourceHandle || port.id === sourceHandle)
  );
  const input = target.ports.find((port) =>
    port.direction === "input" && (!targetHandle || port.id === targetHandle)
  );
  if (!output || !input) return false;
  const outputTypes = Array.isArray(output.resource) ? output.resource : [output.resource];
  const inputTypes = Array.isArray(input.resource) ? input.resource : [input.resource];
  return outputTypes.some((type) => inputTypes.includes(type) && target.accepts.includes(type));
}

export function compatibleCanvasTargetTypes(
  sourceType: string | undefined,
  sourceHandle: string | null | undefined
): string[] {
  return listCanvasNodeDefinitions()
    .filter((definition) => definition.ports.some((port) =>
      port.direction === "input"
      && canvasPortsCompatible(sourceType, sourceHandle, definition.type, port.id)
    ))
    .map((definition) => definition.type);
}

export function compatibleCanvasTargetHandles(
  sourceType: string | undefined,
  sourceHandle: string | null | undefined,
  targetType: string | undefined
): string[] {
  return getCanvasNodeDefinition(targetType).ports
    .filter((port) => (
      port.direction === "input"
      && canvasPortsCompatible(sourceType, sourceHandle, targetType, port.id)
    ))
    .map((port) => port.id);
}

export function nodeImage(node: Node): GeneratedImage {
  return (node.data as unknown as ImageNodeData).image;
}

function readNodeImage(node: Node): GeneratedImage | null {
  const image = readNodeImageValue(node);
  if (!image) return null;
  const candidate = image as Partial<GeneratedImage>;
  return typeof candidate.id === "string"
    && typeof candidate.path === "string"
    && typeof candidate.dataUrl === "string"
    && typeof candidate.jobId === "string"
    ? candidate as GeneratedImage
    : null;
}

function readNodeImageValue(node: Node): Record<string, unknown> | null {
  const image = (node.data as Record<string, unknown> | undefined)?.image;
  return image && typeof image === "object" ? image as Record<string, unknown> : null;
}
