import type { Node } from "@xyflow/react";
import { IMAGE_NODE_MIN_WIDTH, IMAGE_NODE_WIDTH } from "./image-node-model";
import { VIDEO_NODE_HEIGHT, VIDEO_NODE_MIN_WIDTH, VIDEO_NODE_WIDTH } from "./video-node-model";

export { VIDEO_NODE_MIN_WIDTH, VIDEO_NODE_WIDTH } from "./video-node-model";

export const TEXT_NODE_WIDTH = 320;
export const TEXT_NODE_MIN_WIDTH = 260;
export const TEXT_NODE_HEIGHT = 272;

export const GENERATION_NODE_WIDTH = 340;
export const GENERATION_NODE_MIN_WIDTH = 280;
export const GENERATION_NODE_HEIGHT = 320;

export { VIDEO_NODE_HEIGHT };

export const VIDEO_GENERATION_NODE_WIDTH = 340;
export const VIDEO_GENERATION_NODE_MIN_WIDTH = 300;
export const VIDEO_GENERATION_NODE_HEIGHT = 636;
export const COMIC_SETTING_NODE_WIDTH = 280;
export const COMIC_CHARACTER_NODE_WIDTH = 240;
export const COMIC_SEGMENT_NODE_WIDTH = 300;
export const COMIC_SETTING_NODE_HEIGHT = 260;
export const COMIC_CHARACTER_NODE_HEIGHT = 268;
export const COMIC_SEGMENT_NODE_HEIGHT = 300;
export const COMIC_DRAMA_ENTRY_NODE_WIDTH = 300;
export const COMIC_DRAMA_ENTRY_NODE_HEIGHT = 210;

export const VIDEO_GENERATION_TARGET_HANDLE_Y: Readonly<Record<string, number>> = {
  "target-start-frame": 126,
  "target-end-frame": 169,
  "target-reference": 212,
  "target-video-reference": 255
};

export function isVideoGenerationTargetHandle(handleId: string | null | undefined): boolean {
  return Boolean(handleId && VIDEO_GENERATION_TARGET_HANDLE_Y[handleId] !== undefined);
}

export function videoGenerationTargetHandleAnchorRatio(
  handleId: string | null | undefined,
  nodeHeight = VIDEO_GENERATION_NODE_HEIGHT
): number | undefined {
  const y = handleId ? VIDEO_GENERATION_TARGET_HANDLE_Y[handleId] : undefined;
  if (y === undefined || nodeHeight <= 0) return undefined;
  return Math.min(1, Math.max(0, y / nodeHeight));
}

interface CanvasNodeLayoutDefinition {
  defaultWidth: number;
  minWidth: number;
  defaultHeight?: number;
}

const IMAGE_LAYOUT: CanvasNodeLayoutDefinition = {
  defaultWidth: IMAGE_NODE_WIDTH,
  minWidth: IMAGE_NODE_MIN_WIDTH
};

const UNKNOWN_LAYOUT: CanvasNodeLayoutDefinition = {
  defaultWidth: IMAGE_NODE_WIDTH,
  minWidth: IMAGE_NODE_MIN_WIDTH,
  defaultHeight: IMAGE_NODE_WIDTH
};

export function getCanvasNodeLayoutDefinition(type: string | undefined): CanvasNodeLayoutDefinition {
  if (type === "codeCanvasNode") return { defaultWidth: 680, minWidth: 680, defaultHeight: 500 };
  if (type === "imageNode") return IMAGE_LAYOUT;
  if (type === "textNode") {
    return { defaultWidth: TEXT_NODE_WIDTH, minWidth: TEXT_NODE_MIN_WIDTH, defaultHeight: TEXT_NODE_HEIGHT };
  }
  if (type === "generationNode") {
    return {
      defaultWidth: GENERATION_NODE_WIDTH,
      minWidth: GENERATION_NODE_MIN_WIDTH,
      defaultHeight: GENERATION_NODE_HEIGHT
    };
  }
  if (type === "videoNode") {
    return { defaultWidth: VIDEO_NODE_WIDTH, minWidth: VIDEO_NODE_MIN_WIDTH, defaultHeight: VIDEO_NODE_HEIGHT };
  }
  if (type === "videoGenerationNode") {
    return {
      defaultWidth: VIDEO_GENERATION_NODE_WIDTH,
      minWidth: VIDEO_GENERATION_NODE_MIN_WIDTH,
      defaultHeight: VIDEO_GENERATION_NODE_HEIGHT
    };
  }
  if (type === "comicSettingNode") return { defaultWidth: COMIC_SETTING_NODE_WIDTH, minWidth: 260, defaultHeight: COMIC_SETTING_NODE_HEIGHT };
  if (type === "comicCharacterNode") return { defaultWidth: COMIC_CHARACTER_NODE_WIDTH, minWidth: 220, defaultHeight: COMIC_CHARACTER_NODE_HEIGHT };
  if (type === "comicSegmentNode") return { defaultWidth: COMIC_SEGMENT_NODE_WIDTH, minWidth: 280, defaultHeight: COMIC_SEGMENT_NODE_HEIGHT };
  if (type === "comicDramaEntryNode") return { defaultWidth: COMIC_DRAMA_ENTRY_NODE_WIDTH, minWidth: 280, defaultHeight: COMIC_DRAMA_ENTRY_NODE_HEIGHT };
  return UNKNOWN_LAYOUT;
}

export function nodeRenderedWidth(node: Node): number {
  const definition = getCanvasNodeLayoutDefinition(node.type);
  const width = node.width ?? node.measured?.width;
  return Number.isFinite(width) && width! >= definition.minWidth ? width! : definition.defaultWidth;
}

export function nodeRenderedHeight(node: Node): number {
  const measuredHeight = node.height ?? node.measured?.height;
  if (Number.isFinite(measuredHeight) && measuredHeight! > 0) return measuredHeight!;
  const definition = getCanvasNodeLayoutDefinition(node.type);
  if (definition.defaultHeight) return definition.defaultHeight;
  const image = readNodeImageValue(node);
  return image
    ? imageHeightAtDefaultWidth(image) * nodeRenderedWidth(node) / IMAGE_NODE_WIDTH
    : nodeRenderedWidth(node);
}

function readNodeImageValue(node: Node): Record<string, unknown> | null {
  const image = (node.data as Record<string, unknown> | undefined)?.image;
  return image && typeof image === "object" ? image as Record<string, unknown> : null;
}

function imageHeightAtDefaultWidth(image: Record<string, unknown>): number {
  const width = image.width;
  const height = image.height;
  return typeof width === "number" && width > 0 && typeof height === "number" && height > 0
    ? IMAGE_NODE_WIDTH * height / width
    : IMAGE_NODE_WIDTH;
}
