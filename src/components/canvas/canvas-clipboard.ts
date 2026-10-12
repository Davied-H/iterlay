import { IMAGE_NODE_WIDTH, imageNodeHeight, type GeneratedImage } from "./image-node-model";
import type { CanvasDropPoint } from "./canvas-drop";

export const CANVAS_CLIPBOARD_TYPE = "application/x-iterlay-canvas-nodes";

export interface CanvasClipboardItem {
  image: GeneratedImage;
  position: CanvasDropPoint;
  width?: number;
}

export function extractClipboardImageFiles(
  data: Partial<Pick<DataTransfer, "items" | "files">>
): File[] {
  const itemFiles = Array.from(data.items ?? []).flatMap((item) => {
    if (item.kind !== "file" || !item.type.startsWith("image/")) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  if (itemFiles.length > 0) return itemFiles;
  return Array.from(data.files ?? []).filter((file) => file.type.startsWith("image/"));
}

interface CanvasClipboardPayload {
  version: 1;
  items: CanvasClipboardItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCanvasClipboardItem(value: unknown): value is CanvasClipboardItem {
  if (!isRecord(value) || !isRecord(value.position) || !isRecord(value.image)) return false;
  const { image, position } = value;
  return (
    isFiniteNumber(position.x) &&
    isFiniteNumber(position.y) &&
    (typeof value.width === "undefined" || (isFiniteNumber(value.width) && value.width > 0)) &&
    typeof image.id === "string" &&
    typeof image.path === "string" &&
    typeof image.dataUrl === "string" &&
    typeof image.jobId === "string"
  );
}

/** Serializes copied nodes so another board or application window can restore them. */
export function serializeCanvasClipboardItems(items: CanvasClipboardItem[]): string {
  const payload: CanvasClipboardPayload = { version: 1, items };
  return JSON.stringify(payload);
}

/** Rejects unrelated or malformed custom clipboard data without blocking normal image paste. */
export function parseCanvasClipboardItems(value: string): CanvasClipboardItem[] | null {
  if (!value) return null;
  try {
    const payload: unknown = JSON.parse(value);
    if (
      !isRecord(payload) ||
      payload.version !== 1 ||
      !Array.isArray(payload.items) ||
      payload.items.length === 0 ||
      !payload.items.every(isCanvasClipboardItem)
    ) return null;
    return payload.items;
  } catch {
    return null;
  }
}

export function extractCanvasClipboardItems(
  clipboardData: Pick<DataTransfer, "getData">
): CanvasClipboardItem[] | null {
  return parseCanvasClipboardItems(clipboardData.getData(CANVAS_CLIPBOARD_TYPE));
}

/** Keeps a copied selection's relative layout while centering it beneath the pointer. */
export function placeClipboardItemsAtPoint(
  items: CanvasClipboardItem[],
  point: CanvasDropPoint
): CanvasClipboardItem[] {
  if (items.length === 0) return [];

  const left = Math.min(...items.map((item) => item.position.x));
  const top = Math.min(...items.map((item) => item.position.y));
  const right = Math.max(...items.map((item) => item.position.x + (item.width ?? IMAGE_NODE_WIDTH)));
  const bottom = Math.max(...items.map((item) => {
    const width = item.width ?? IMAGE_NODE_WIDTH;
    return item.position.y + imageNodeHeight(item.image) * width / IMAGE_NODE_WIDTH;
  }));
  const offsetX = point.x - (left + right) / 2;
  const offsetY = point.y - (top + bottom) / 2;

  return items.map((item) => ({
    image: item.image,
    width: item.width,
    position: {
      x: item.position.x + offsetX,
      y: item.position.y + offsetY
    }
  }));
}

/** Creates new board nodes while reusing the same persisted image assets. */
export function duplicateClipboardImages(
  items: CanvasClipboardItem[],
  createId: () => string
): GeneratedImage[] {
  const nextIds = new Map(items.map((item) => [item.image.id, createId()]));

  return items.map(({ image, position, width }) => ({
    ...image,
    id: nextIds.get(image.id)!,
    pending: undefined,
    generationStatus: undefined,
    pendingStartedAt: undefined,
    pendingPrompt: undefined,
    editing: undefined,
    pendingEditCount: undefined,
    queuedEditCount: undefined,
    editingStartedAt: undefined,
    placementAnchorId: undefined,
    placementPosition: position,
    placementWidth: width,
    preserveViewportOnCreate: true,
    selectOnCreate: true,
    versions: image.versions?.map((version) => ({ ...version })),
    derivation: image.derivation
      ? {
          ...image.derivation,
          sourceNodeId: nextIds.get(image.derivation.sourceNodeId) ?? image.derivation.sourceNodeId,
          crop: { ...image.derivation.crop }
        }
      : undefined
  }));
}
