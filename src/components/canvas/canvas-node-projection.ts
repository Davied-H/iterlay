import type { Edge, Node } from "@xyflow/react";
import type {
  BoardGenerationNode,
  BoardComicDramaEntryNode,
  ComicDramaBoardNode,
  BoardTextNode,
  BoardCanvasNode,
  BoardVideoGenerationNode,
  BoardVideoNode,
  BoardVideoSequenceEntryNode
} from "@shared/types";
import type { CanvasNodeLayout } from "./canvas-history";
import {
  GENERATION_NODE_HEIGHT,
  GENERATION_NODE_WIDTH,
  TEXT_NODE_HEIGHT,
  TEXT_NODE_WIDTH,
  VIDEO_GENERATION_NODE_HEIGHT,
  VIDEO_GENERATION_NODE_WIDTH,
  VIDEO_NODE_HEIGHT,
  VIDEO_NODE_WIDTH,
  nodeRenderedHeight,
  nodeRenderedWidth
} from "./canvas-node-layout";
import {
  IMAGE_NODE_MIN_WIDTH,
  IMAGE_NODE_WIDTH,
  imageKey,
  imageNodeHeight,
  type GeneratedImage
} from "./image-node-model";
import type { GenerationNodeData } from "./GenerationNode";
import type { ComicDramaEntryNodeData } from "./ComicDramaEntryNode";
import type { ImageNodeData } from "./ImageNode";
import type { TextNodeData } from "./TextNode";
import type { VideoNodeData } from "./VideoNode";
import type { VideoGenerationNodeData } from "./VideoGenerationNode";
import type { VideoSequenceEntryNodeData } from "./VideoSequenceEntryNode";
import type { GeneratedVideo } from "./video-node-model";
import { resolveGenerationNodeInput } from "./canvas-workflow";
import {
  GENERATION_OUTPUT_HORIZONTAL_GAP,
  layoutGenerationOutputColumn
} from "@shared/generation-output-layout";

const NODE_GAP = 40;

/** Legacy nested renderer model remains readable while persisted boards use BoardVideoNode. */
export type PersistedVideoNode = BoardVideoNode | {
  id: string;
  type: "video";
  x: number;
  y: number;
  video: GeneratedVideo;
  displayHeight?: number;
};

export type PersistedVideoGenerationNode = BoardVideoGenerationNode;

export type CanvasWorkflowNode = BoardCanvasNode | BoardTextNode | BoardGenerationNode | PersistedVideoNode | PersistedVideoGenerationNode | ComicDramaBoardNode | BoardComicDramaEntryNode | BoardVideoSequenceEntryNode;
type GenerationNodeBaseData = Omit<GenerationNodeData, "referenceImages" | "upstreamPrompt">;

export interface CanvasWorkflowNodeProjectionContext {
  displayHeight: number;
}

export interface CanvasNodeProjectionBindings {
  imageData: (image: GeneratedImage) => Omit<ImageNodeData, "image">;
  canvasData?: (node: BoardCanvasNode) => Record<string, unknown>;
  textData: (node: BoardTextNode, context: CanvasWorkflowNodeProjectionContext) => TextNodeData;
  generationData: (
    node: BoardGenerationNode,
    context: CanvasWorkflowNodeProjectionContext
  ) => GenerationNodeBaseData;
  videoData?: (node: PersistedVideoNode, context: CanvasWorkflowNodeProjectionContext) => VideoNodeData;
  videoGenerationData?: (
    node: PersistedVideoGenerationNode,
    context: CanvasWorkflowNodeProjectionContext
  ) => VideoGenerationNodeData;
  comicDramaData?: (node: ComicDramaBoardNode, context: CanvasWorkflowNodeProjectionContext) => Record<string, unknown>;
  comicDramaEntryData?: (node: BoardComicDramaEntryNode, context: CanvasWorkflowNodeProjectionContext) => ComicDramaEntryNodeData;
  videoSequenceEntryData?: (node: BoardVideoSequenceEntryNode, context: CanvasWorkflowNodeProjectionContext) => VideoSequenceEntryNodeData;
}

export interface CanvasNodeProjectionInput {
  previousNodes: readonly Node[];
  images: readonly GeneratedImage[];
  workflowNodes: readonly CanvasWorkflowNode[];
  edges: readonly Edge[];
  initialLayouts?: Readonly<Record<string, CanvasNodeLayout>>;
  userPositionedNodeIds?: ReadonlySet<string>;
  bindings: CanvasNodeProjectionBindings;
}

export interface CanvasNodeProjectionResult {
  nodes: Node[];
  layoutChanged: boolean;
  addedIds: string[];
  removedIds: string[];
}

export function patchCanvasWorkflowNode(
  nodes: readonly Node[],
  id: string,
  patch: object,
  height?: number
): Node[] {
  const dataPatch = patch as Record<string, unknown>;
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id !== id || !["codeCanvasNode", "textNode", "generationNode", "videoNode", "videoGenerationNode", "comicSettingNode", "comicCharacterNode", "comicSegmentNode", "comicDramaEntryNode"].includes(node.type ?? "")) return node;
    const dataChanged = Object.entries(dataPatch).some(([key, value]) => node.data[key] !== value);
    const heightChanged = height !== undefined && node.height !== height;
    if (!dataChanged && !heightChanged) return node;
    changed = true;
    return {
      ...node,
      ...(height === undefined ? {} : { height }),
      data: dataChanged ? { ...node.data, ...dataPatch } : node.data
    };
  });
  return changed ? next : nodes as Node[];
}

interface GenerationPresentation {
  upstreamPrompt: string;
  referenceImages: GeneratedImage[];
}

export function projectCanvasNodes(input: CanvasNodeProjectionInput): CanvasNodeProjectionResult {
  const previousNodes = input.previousNodes;
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));
  const addedIds: string[] = [];
  const projectedIds = new Set<string>();
  const newlySelectedIds = new Set(
    input.images
      .filter((image) => image.selectOnCreate && !previousById.has(imageKey(image)))
      .map(imageKey)
  );
  // Preserve the existing placement behavior: nodes present before reconciliation
  // remain collision obstacles for every node introduced by this projection.
  const placedNodes = [...previousNodes];
  let maxRight = placedNodes.length > 0
    ? Math.max(...placedNodes.map((node) => node.position.x + nodeRenderedWidth(node)))
    : -NODE_GAP;
  let minTop = placedNodes.length > 0
    ? Math.min(...placedNodes.map((node) => node.position.y))
    : 0;

  const projected: Node[] = [];
  for (const image of input.images) {
    const id = imageKey(image);
    const existing = previousById.get(id);
    const candidate = projectImageNode({
      image,
      existing,
      data: { image, ...input.bindings.imageData(image) },
      initialLayout: input.initialLayouts?.[id],
      userPositioned: input.userPositionedNodeIds?.has(id) ?? false,
      clearExistingSelection: newlySelectedIds.size > 0,
      selectNewNode: newlySelectedIds.has(id),
      placedNodes,
      maxRight,
      minTop
    });
    projected.push(reuseNode(existing, candidate));
    projectedIds.add(id);
    if (!existing) {
      addedIds.push(id);
      placedNodes.push(candidate);
      maxRight = Math.max(maxRight, candidate.position.x + nodeRenderedWidth(candidate));
      minTop = Math.min(minTop, candidate.position.y);
    }
  }

  const workflowDrafts = new Map<string, Node>();
  const workflowById = new Map(input.workflowNodes.map((node) => [node.id, node]));
  for (const workflowNode of input.workflowNodes) {
    const existing = previousById.get(workflowNode.id);
    const persistedPosition = Number.isFinite(workflowNode.x) && Number.isFinite(workflowNode.y)
      ? { x: workflowNode.x, y: workflowNode.y }
      : undefined;
    const position = existing?.position
      ?? input.initialLayouts?.[workflowNode.id]
      ?? persistedPosition
      ?? { x: maxRight + NODE_GAP, y: minTop };
    const type = projectedWorkflowNodeType(workflowNode);
    const { width, height: defaultHeight } = projectedWorkflowNodeSize(type);
    const videoMedia = workflowNode.type === "video"
      ? "video" in workflowNode ? workflowNode.video : workflowNode
      : undefined;
    const generationSource = workflowNode.type === "video" && !("video" in workflowNode)
      ? workflowById.get(workflowNode.generationNodeId ?? "")
      : undefined;
    const inheritedAspectRatio = generationSource?.type === "video-generation"
      ? generationSource.aspectRatio
      : undefined;
    const requestedVideoRatio = workflowNode.type === "video" && !("video" in workflowNode)
      ? parseVideoAspectRatio(workflowNode.aspectRatio ?? inheritedAspectRatio)
      : workflowNode.type === "video" && "video" in workflowNode
        ? parseVideoAspectRatio(workflowNode.video.aspectRatio)
        : undefined;
    const decodedVideoRatio = videoMedia?.width
      && videoMedia.height
      && videoMedia.width > 0
      && videoMedia.height > 0
      ? videoMedia.width / videoMedia.height
      : undefined;
    const videoRatio = decodedVideoRatio ?? requestedVideoRatio;
    const height = workflowNode.type === "video"
      ? Math.max(1, width / (videoRatio ?? 16 / 9))
      : workflowNode.displayHeight ?? defaultHeight;
    const context = { displayHeight: height };
    const data = projectedWorkflowNodeData(workflowNode, context, input.bindings) as unknown as Record<string, unknown>;
    const candidate: Node = existing
      ? { ...existing, type, position, width, height, data }
      : { id: workflowNode.id, type, position, width, height, data };
    workflowDrafts.set(workflowNode.id, candidate);
    projected.push(candidate);
    projectedIds.add(workflowNode.id);
    if (!existing) addedIds.push(workflowNode.id);
    maxRight = Math.max(maxRight, position.x + width);
    minTop = Math.min(minTop, position.y);
  }

  // Resolve generation inputs against this projection, not the previous render.
  // This makes a newly-created upstream node and edge visible in the same pass.
  const arrangedProjected = arrangeGeneratedVideoOutputs(
    projected,
    input.workflowNodes,
    input.userPositionedNodeIds
  );
  const finalNodes = arrangedProjected.map((candidate) => {
    const workflowNode = workflowById.get(candidate.id);
    if (!workflowNode || workflowNode.type !== "generation") {
      return reuseNode(previousById.get(candidate.id), candidate);
    }
    const presentation = generationPresentation(
      workflowNode.id,
      workflowNode.prompt ?? "",
      arrangedProjected,
      input.edges,
      previousById.get(workflowNode.id)
    );
    const draft = workflowDrafts.get(workflowNode.id) ?? candidate;
    return reuseNode(previousById.get(candidate.id), {
      ...draft,
      data: { ...draft.data, ...presentation }
    });
  });
  const removedIds = previousNodes
    .filter((node) => !projectedIds.has(node.id))
    .map((node) => node.id);
  const nodes = arraysShareItems(previousNodes, finalNodes) ? previousNodes as Node[] : finalNodes;

  return {
    nodes,
    layoutChanged: addedIds.length > 0 || removedIds.length > 0 || layoutsDiffer(previousNodes, nodes),
    addedIds,
    removedIds
  };
}

function arrangeGeneratedVideoOutputs(
  nodes: readonly Node[],
  workflowNodes: readonly CanvasWorkflowNode[],
  userPositionedNodeIds: ReadonlySet<string> | undefined
): Node[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outputsByGeneration = new Map<string, Node[]>();
  for (const workflowNode of workflowNodes) {
    if (
      workflowNode.type !== "video"
      || "video" in workflowNode
      || !workflowNode.generationNodeId
      || userPositionedNodeIds?.has(workflowNode.id)
    ) continue;
    const output = nodeById.get(workflowNode.id);
    if (!output) continue;
    const outputs = outputsByGeneration.get(workflowNode.generationNodeId) ?? [];
    outputs.push(output);
    outputsByGeneration.set(workflowNode.generationNodeId, outputs);
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [generationNodeId, outputs] of outputsByGeneration) {
    const anchor = nodeById.get(generationNodeId);
    if (!anchor) continue;
    const arranged = layoutGenerationOutputColumn(
      {
        x: anchor.position.x,
        y: anchor.position.y,
        width: nodeRenderedWidth(anchor),
        height: nodeRenderedHeight(anchor)
      },
      outputs.map((output) => ({ id: output.id, height: nodeRenderedHeight(output) }))
    );
    for (const [id, position] of arranged) positions.set(id, position);
  }
  if (positions.size === 0) return nodes as Node[];
  return nodes.map((node) => {
    const position = positions.get(node.id);
    return position
      && (node.position.x !== position.x || node.position.y !== position.y)
      ? { ...node, position }
      : node;
  });
}

function parseVideoAspectRatio(value: string | undefined): number | undefined {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/u.exec(value?.trim() ?? "");
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : undefined;
}

function projectedWorkflowNodeType(node: CanvasWorkflowNode): "codeCanvasNode" | "textNode" | "generationNode" | "videoNode" | "videoGenerationNode" | "comicSettingNode" | "comicCharacterNode" | "comicSegmentNode" | "comicDramaEntryNode" | "videoSequenceEntryNode" {
  if (node.type === "canvas") return "codeCanvasNode";
  if (node.type === "text") return "textNode";
  if (node.type === "generation") return "generationNode";
  if (node.type === "video") return "videoNode";
  if (node.type === "video-generation") return "videoGenerationNode";
  if (node.type === "comic-setting") return "comicSettingNode";
  if (node.type === "comic-character") return "comicCharacterNode";
  if (node.type === "comic-segment-script") return "comicSegmentNode";
  if (node.type === "comic-drama-entry") return "comicDramaEntryNode";
  return "videoSequenceEntryNode";
}

function projectedWorkflowNodeSize(type: ReturnType<typeof projectedWorkflowNodeType>): { width: number; height: number } {
  if (type === "codeCanvasNode") return { width: 680, height: 500 };
  if (type === "textNode") return { width: TEXT_NODE_WIDTH, height: TEXT_NODE_HEIGHT };
  if (type === "generationNode") return { width: GENERATION_NODE_WIDTH, height: GENERATION_NODE_HEIGHT };
  if (type === "videoNode") return { width: VIDEO_NODE_WIDTH, height: VIDEO_NODE_HEIGHT };
  if (type === "videoGenerationNode") return { width: VIDEO_GENERATION_NODE_WIDTH, height: VIDEO_GENERATION_NODE_HEIGHT };
  if (type === "comicSettingNode") return { width: 280, height: 260 };
  if (type === "comicCharacterNode") return { width: 240, height: 268 };
  if (type === "comicSegmentNode") return { width: 300, height: 300 };
  if (type === "comicDramaEntryNode") return { width: 420, height: 304 };
  return { width: 280, height: 190 };
}

function projectedWorkflowNodeData(
  node: CanvasWorkflowNode,
  context: CanvasWorkflowNodeProjectionContext,
  bindings: CanvasNodeProjectionBindings
): TextNodeData | GenerationNodeBaseData | VideoNodeData | VideoGenerationNodeData | ComicDramaEntryNodeData | VideoSequenceEntryNodeData | Record<string, unknown> {
  if (node.type === "canvas") return bindings.canvasData?.(node) ?? { ...node };
  if (node.type === "text") return bindings.textData(node, context);
  if (node.type === "video-sequence-entry") return bindings.videoSequenceEntryData?.(node, context) ?? { node };
  if (node.type === "comic-drama-entry") return bindings.comicDramaEntryData?.(node, context) ?? { node };
  if (node.type === "generation") return bindings.generationData(node, context);
  if (node.type === "comic-setting" || node.type === "comic-character" || node.type === "comic-segment-script") {
    return bindings.comicDramaData?.(node, context) ?? { node };
  }
  if (node.type === "video") return bindings.videoData?.(node, context) ?? {
    video: "video" in node ? node.video : {
      id: node.id,
      path: node.videoPath,
      dataUrl: node.videoPath,
      posterPath: node.posterPath,
      width: node.width,
      height: node.height,
      durationMs: node.durationMs,
      mimeType: node.mimeType,
      version: (node.activeVersion ?? 0) + 1,
      title: node.title,
      status: node.status ?? (node.videoPath ? "completed" : "draft"),
      error: node.error
    }
  };
  return bindings.videoGenerationData?.(node, context) ?? {
    mode: node.mode ?? "generate",
    prompt: node.prompt ?? "",
    sourceVideoPath: node.sourceVideoPath,
    model: node.model ?? "",
    duration: node.duration ?? 5,
    aspectRatio: node.aspectRatio ?? "16:9",
    resolution: node.resolution ?? "720p",
    generateAudio: node.generateAudio ?? false,
    referenceVideos: (node.referenceVideoPaths ?? []).map((path, index) => ({
      id: `video-reference-${index}-${path}`,
      name: path.split(/[\\/]/).pop() || `参考视频 ${index + 1}`,
      path,
      dataUrl: path
    })),
    referenceAudios: (node.referenceAudioPaths ?? []).map((path, index) => ({
      id: `audio-reference-${index}-${path}`,
      name: path.split(/[\\/]/).pop() || `参考音频 ${index + 1}`,
      path
    })),
    status: node.status ?? "draft",
    error: node.error
  };
}

interface ImageProjectionOptions {
  image: GeneratedImage;
  existing?: Node;
  data: ImageNodeData;
  initialLayout?: CanvasNodeLayout;
  userPositioned: boolean;
  clearExistingSelection: boolean;
  selectNewNode: boolean;
  placedNodes: readonly Node[];
  maxRight: number;
  minTop: number;
}

function projectImageNode(options: ImageProjectionOptions): Node {
  const { image, existing } = options;
  const id = imageKey(image);
  if (existing) {
    const previousImage = readImage(existing);
    const requestedPosition = previousImage ? resolveNewPlacement(previousImage, image) : null;
    const completedFromPlaceholder = Boolean(
      previousImage?.pending &&
      !image.pending &&
      !options.userPositioned
    );
    let position = existing.position;
    if (requestedPosition) {
      position = requestedPosition;
    } else if (completedFromPlaceholder) {
      const otherNodes = options.placedNodes.filter((node) => node.id !== id);
      const anchor = image.placementAnchorId
        ? otherNodes.find((node) => node.id === image.placementAnchorId)
        : undefined;
      position = (anchor ? positionNextToAnchor(anchor, image, otherNodes) : null)
        ?? settleCompletedNodePosition(existing.position, image, otherNodes);
    }
    const width = nodeRenderedWidth(existing);
    return {
      ...existing,
      position,
      width,
      height: imageNodeHeight(image) * width / IMAGE_NODE_WIDTH,
      data: options.data as unknown as Record<string, unknown>,
      selected: options.clearExistingSelection ? false : existing.selected
    };
  }

  const anchor = image.placementAnchorId
    ? options.placedNodes.find((node) => node.id === image.placementAnchorId)
    : undefined;
  const position = options.initialLayout
    ?? image.placementPosition
    ?? (anchor ? positionNextToAnchor(anchor, image, options.placedNodes) : null)
    ?? { x: options.maxRight + NODE_GAP, y: options.minTop };
  const requestedWidth = options.initialLayout?.width ?? image.placementWidth;
  const width = requestedWidth && requestedWidth >= IMAGE_NODE_MIN_WIDTH
    ? requestedWidth
    : IMAGE_NODE_WIDTH;
  return {
    id,
    type: "imageNode",
    position,
    width,
    height: imageNodeHeight(image) * width / IMAGE_NODE_WIDTH,
    data: options.data as unknown as Record<string, unknown>,
    selected: options.selectNewNode
  };
}

function generationPresentation(
  nodeId: string,
  ownPrompt: string,
  nodes: readonly Node[],
  edges: readonly Edge[],
  previous?: Node
): GenerationPresentation {
  const resolved = resolveGenerationNodeInput(nodeId, nodes, edges);
  const normalizedOwnPrompt = ownPrompt.trim();
  let upstreamPrompt = resolved.prompt;
  if (normalizedOwnPrompt && resolved.prompt.startsWith(`${normalizedOwnPrompt}\n\n`)) {
    upstreamPrompt = resolved.prompt.slice(normalizedOwnPrompt.length + 2);
  } else if (normalizedOwnPrompt === resolved.prompt) {
    upstreamPrompt = "";
  }
  const previousImages = (previous?.data as Partial<GenerationNodeData> | undefined)?.referenceImages;
  return {
    upstreamPrompt,
    referenceImages: arraysShareItems(previousImages, resolved.images) ? previousImages! : resolved.images
  };
}

function reuseNode(previous: Node | undefined, candidate: Node): Node {
  if (!previous) return candidate;
  const samePosition = previous.position.x === candidate.position.x && previous.position.y === candidate.position.y;
  const sameData = shallowCanvasNodeDataEqual(previous.data, candidate.data);
  return previous.type === candidate.type &&
    samePosition &&
    previous.width === candidate.width &&
    previous.height === candidate.height &&
    previous.selected === candidate.selected &&
    sameData
    ? previous
    : candidate;
}

export function shallowCanvasNodeDataEqual(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): boolean {
  const keys = Object.keys(next);
  return keys.length === Object.keys(previous).length
    && keys.every((key) => canvasNodeDataValueEqual(previous[key], next[key], 0));
}

function canvasNodeDataValueEqual(previous: unknown, next: unknown, depth: number): boolean {
  if (Object.is(previous, next)) return true;
  if (depth >= 2) return false;
  if (Array.isArray(previous) && Array.isArray(next)) {
    return previous.length === next.length
      && previous.every((item, index) => canvasNodeDataValueEqual(item, next[index], depth + 1));
  }
  if (isPlainRecord(previous) && isPlainRecord(next)) {
    const keys = Object.keys(next);
    return keys.length === Object.keys(previous).length
      && keys.every((key) => canvasNodeDataValueEqual(previous[key], next[key], depth + 1));
  }
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function arraysShareItems<T>(previous: readonly T[] | undefined, next: readonly T[]): boolean {
  return Boolean(previous) && previous!.length === next.length && previous!.every((item, index) => item === next[index]);
}

function layoutsDiffer(previous: readonly Node[], next: readonly Node[]): boolean {
  if (previous.length !== next.length) return true;
  const previousById = new Map(previous.map((node) => [node.id, node]));
  return next.some((node) => {
    const before = previousById.get(node.id);
    return !before ||
      before.position.x !== node.position.x ||
      before.position.y !== node.position.y ||
      nodeRenderedWidth(before) !== nodeRenderedWidth(node) ||
      nodeRenderedHeight(before) !== nodeRenderedHeight(node);
  });
}

function readImage(node: Node): GeneratedImage | null {
  const image = (node.data as Partial<ImageNodeData> | undefined)?.image;
  return image ?? null;
}

export function canvasPlacementGapAfterAnchorType(type: Node["type"]): number {
  return type === "generationNode" ? GENERATION_OUTPUT_HORIZONTAL_GAP : NODE_GAP;
}

function positionNextToAnchor(
  anchor: Node,
  image: GeneratedImage,
  placedNodes: readonly Node[]
): { x: number; y: number } | null {
  const x = anchor.position.x + nodeRenderedWidth(anchor) + canvasPlacementGapAfterAnchorType(anchor.type);
  const centeredY = anchor.position.y + (nodeRenderedHeight(anchor) - imageNodeHeight(image)) / 2;
  const step = Math.max(nodeRenderedHeight(anchor), imageNodeHeight(image)) + NODE_GAP;
  const offsets = [0, ...Array.from({ length: 12 }, (_, index) => [index + 1, -(index + 1)]).flat()];
  for (const offset of offsets) {
    const candidate = { x, y: centeredY + offset * step };
    if (placedNodes.every((node) => node.id === anchor.id || !overlapsNode(candidate, image, node))) {
      return candidate;
    }
  }
  return null;
}

function overlapsNode(
  position: { x: number; y: number },
  image: GeneratedImage,
  node: Node
): boolean {
  return position.x < node.position.x + nodeRenderedWidth(node) + NODE_GAP &&
    position.x + IMAGE_NODE_WIDTH + NODE_GAP > node.position.x &&
    position.y < node.position.y + nodeRenderedHeight(node) + NODE_GAP &&
    position.y + imageNodeHeight(image) + NODE_GAP > node.position.y;
}

export function settleCompletedNodePosition(
  position: { x: number; y: number },
  image: GeneratedImage,
  otherNodes: readonly Node[]
): { x: number; y: number } {
  if (otherNodes.every((node) => !overlapsNode(position, image, node))) return position;
  const step = imageNodeHeight(image) + NODE_GAP;
  const offsets = Array.from({ length: 24 }, (_, index) => [index + 1, -(index + 1)]).flat();
  for (const offset of offsets) {
    const candidate = { x: position.x, y: position.y + offset * step };
    if (otherNodes.every((node) => !overlapsNode(candidate, image, node))) return candidate;
  }
  const maxRight = otherNodes.length > 0
    ? Math.max(...otherNodes.map((node) => node.position.x + nodeRenderedWidth(node)))
    : position.x - NODE_GAP;
  return { x: maxRight + NODE_GAP, y: position.y };
}

export function resolveNewPlacement(
  previousImage: GeneratedImage,
  nextImage: GeneratedImage
): { x: number; y: number } | null {
  const previous = previousImage.placementPosition;
  const next = nextImage.placementPosition;
  if (!next || (previous?.x === next.x && previous.y === next.y)) return null;
  return next;
}
