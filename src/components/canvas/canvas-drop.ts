const MAX_DROPPED_IMAGE_URLS = 10;

export interface CanvasDropPoint {
  x: number;
  y: number;
}

interface DropDataReader {
  getData(type: string): string;
}

/** A drag only remains inside the drop zone when its next target is one of the zone's descendants. */
export function isDragLeavingDropZone(
  dropZone: Pick<Node, "contains">,
  relatedTarget: EventTarget | null
): boolean {
  return !(relatedTarget instanceof Node) || !dropZone.contains(relatedTarget);
}

function normalizeRemoteUrl(value: string): string | null {
  const trimmed = value.trim().replace(/[),.;，。；]+$/u, "");
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function urlsFromHtml(html: string): string[] {
  if (!html || typeof DOMParser === "undefined") return [];
  const document = new DOMParser().parseFromString(html, "text/html");
  return Array.from(document.querySelectorAll("img"), (image) => image.getAttribute("src") ?? "");
}

function urlsFromText(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"']+/giu) ?? [];
}

/** Extracts the actual dragged image first, then falls back to URI/plain-text links. */
export function extractDroppedImageUrls(data: DropDataReader): string[] {
  const candidates = [
    ...urlsFromHtml(data.getData("text/html")),
    ...data
      .getData("text/uri-list")
      .split(/\r?\n/u)
      .filter((line) => line && !line.startsWith("#")),
    ...urlsFromText(data.getData("text/plain")),
    ...urlsFromText(data.getData("text/x-moz-url"))
  ];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = normalizeRemoteUrl(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
    if (urls.length >= MAX_DROPPED_IMAGE_URLS) break;
  }
  return urls;
}

/** Returns the node's top-left coordinate so its visual center lands under the pointer. */
export function centerNodeAtDrop(
  point: CanvasDropPoint,
  nodeWidth: number,
  naturalWidth?: number,
  naturalHeight?: number
): CanvasDropPoint {
  const nodeHeight =
    naturalWidth && naturalHeight ? (nodeWidth * naturalHeight) / naturalWidth : nodeWidth;
  return {
    x: point.x - nodeWidth / 2,
    y: point.y - nodeHeight / 2
  };
}
