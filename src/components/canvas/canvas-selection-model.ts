import type { Node } from "@xyflow/react";
import type { GeneratedImage } from "./image-node-model";
import type { ImageNodeData } from "./ImageNode";

export interface CanvasSelectionModel {
  selectedNodes: Node[];
  selectedImageNodes: Node[];
  selectedReadyCount: number;
  selectedReferenceCandidateCount: number;
  selectedDownloadableCount: number;
  selectedShareableImages: GeneratedImage[];
}

export function deriveCanvasSelection(
  nodes: readonly Node[],
  referencedNodeIds: ReadonlySet<string>
): CanvasSelectionModel {
  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedImageNodes = selectedNodes.filter(isImageCanvasNode);
  let selectedReadyCount = 0;
  let selectedReferenceCandidateCount = 0;
  let selectedDownloadableCount = 0;
  const selectedShareableImages: GeneratedImage[] = [];

  for (const node of selectedImageNodes) {
    const image = readNodeImage(node);
    if (!image || image.pending) continue;
    selectedReadyCount += 1;
    if (!referencedNodeIds.has(node.id)) selectedReferenceCandidateCount += 1;
    if (!image.path) continue;
    selectedDownloadableCount += 1;
    selectedShareableImages.push(image);
  }

  return {
    selectedNodes,
    selectedImageNodes,
    selectedReadyCount,
    selectedReferenceCandidateCount,
    selectedDownloadableCount,
    selectedShareableImages
  };
}

function isImageCanvasNode(node: Node): boolean {
  return node.type === "imageNode";
}

function readNodeImage(node: Node): GeneratedImage | null {
  const image = (node.data as Partial<ImageNodeData> | undefined)?.image;
  return image ?? null;
}
