import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { CanvasClipboardItem } from "./canvas-clipboard";
import type { CanvasDropPoint } from "./canvas-drop";
import { nodeRenderedHeight, nodeRenderedWidth } from "./canvas-node-layout";
import {
  deriveCanvasSelection,
  type CanvasSelectionModel
} from "./canvas-selection-model";
import type { GenerationNodeConfig } from "./GenerationNode";
import type { GeneratedImage } from "./image-node-model";
import type { ImageNodeData } from "./ImageNode";
import { arrangeSelection, type SelectionLayoutMode } from "./selection-layout";
import type { TextNodeData } from "./TextNode";

const DUPLICATE_OFFSET = 24;
const SELECTION_LAYOUT_GAP = 40;

function defaultCreateEdgeId(): string {
  return crypto.randomUUID();
}

type NodeUpdater = (current: readonly Node[]) => Node[];
type EdgeUpdater = (current: readonly Edge[]) => Edge[];

export interface CanvasSelectionImageActions {
  duplicateImages: (items: CanvasClipboardItem[], action: "duplicate") => void;
  requestDeleteImages?: (ids: string[]) => Promise<boolean> | boolean | void;
  useReferences: (images: GeneratedImage[]) => Promise<void> | void;
  downloadImages: (images: GeneratedImage[]) => Promise<void> | void;
  exportWechatImages?: (images: GeneratedImage[]) => void;
  canAddReferences: boolean;
}

export interface CanvasSelectionWorkflowActions {
  createNode?: (
    type: "canvas" | "text" | "generation" | "video-generation",
    position: CanvasDropPoint,
    initial?: { code?: string; framework?: "html" | "react" | "vue"; text?: string; prompt?: string; model?: string; size?: string; count?: number }
  ) => string | void;
  requestDeleteNodes?: (ids: string[]) => Promise<boolean> | boolean | void;
  deleteNodes?: (ids: string[]) => Promise<void> | void;
}

export interface CanvasSelectionActionsOptions {
  nodes: readonly Node[];
  referencedNodeIds: ReadonlySet<string>;
  getNodes: () => Node[];
  getEdges: () => Edge[];
  updateNodes: (updater: NodeUpdater) => void;
  updateEdges: (updater: EdgeUpdater) => void;
  recordCanvasChange: () => void;
  reportCanvasChange: () => void;
  imageActions: CanvasSelectionImageActions;
  workflowActions: CanvasSelectionWorkflowActions;
  createEdgeId?: () => string;
}

export interface CanvasSelectionActionsController {
  selection: CanvasSelectionModel;
  isAddingReferences: boolean;
  isDownloading: boolean;
  duplicateNodes: (nodes: readonly Node[]) => void;
  duplicateSelection: () => void;
  arrangeSelectedNodes: (mode: SelectionLayoutMode) => void;
  deleteNodes: (nodes: readonly Node[], selectedConnectionIds?: readonly string[]) => Promise<boolean>;
  useSelectedReferences: () => Promise<boolean>;
  downloadSelectedImages: () => Promise<boolean>;
  exportWechatSelectedImages: () => boolean;
}

export function useCanvasSelectionActions({
  nodes,
  referencedNodeIds,
  getNodes,
  getEdges,
  updateNodes,
  updateEdges,
  recordCanvasChange,
  reportCanvasChange,
  imageActions,
  workflowActions,
  createEdgeId = defaultCreateEdgeId
}: CanvasSelectionActionsOptions): CanvasSelectionActionsController {
  const [isAddingReferences, setIsAddingReferences] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const addingReferencesRef = useRef(false);
  const downloadingRef = useRef(false);
  const mountedRef = useRef(true);
  const selection = useMemo(
    () => deriveCanvasSelection(nodes, referencedNodeIds),
    [nodes, referencedNodeIds]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const duplicateNodes = useCallback((sourceNodes: readonly Node[]): void => {
    const imageItems = sourceNodes.flatMap((node) => {
      const image = readImage(node);
      if (!image || image.pending) return [];
      return [{
        image,
        width: nodeRenderedWidth(node),
        position: {
          x: node.position.x + DUPLICATE_OFFSET,
          y: node.position.y + DUPLICATE_OFFSET
        }
      }];
    });
    const workflowNodes = sourceNodes.filter(isDuplicableWorkflowNode);
    if (imageItems.length === 0 && workflowNodes.length === 0) return;
    recordCanvasChange();
    if (imageItems.length > 0) imageActions.duplicateImages(imageItems, "duplicate");

    const duplicatedIds = new Map<string, string>();
    for (const node of workflowNodes) {
      const position = {
        x: node.position.x + DUPLICATE_OFFSET,
        y: node.position.y + DUPLICATE_OFFSET
      };
      const createdId = node.type === "codeCanvasNode"
        ? workflowActions.createNode?.("canvas", position, { code: node.data.code as string, framework: node.data.framework as "html" | "react" | "vue" })
        : node.type === "textNode"
        ? workflowActions.createNode?.("text", position, {
            text: (node.data as unknown as TextNodeData).text
          })
        : node.type === "videoGenerationNode"
          ? workflowActions.createNode?.(
              "video-generation",
              position,
              node.data as unknown as GenerationNodeConfig
            )
          : workflowActions.createNode?.(
            "generation",
            position,
            node.data as unknown as GenerationNodeConfig
          );
      if (createdId) duplicatedIds.set(node.id, createdId);
    }
    if (duplicatedIds.size < 2) return;

    const internalConnections = getEdges().flatMap((edge) => {
      const source = duplicatedIds.get(edge.source);
      const target = duplicatedIds.get(edge.target);
      if (!source || !target) return [];
      return [{ ...edge, id: createEdgeId(), source, target, selected: false }];
    });
    if (internalConnections.length === 0) return;
    updateEdges((current) => [...current, ...internalConnections]);
    reportCanvasChange();
  }, [createEdgeId, getEdges, imageActions, recordCanvasChange, reportCanvasChange, updateEdges, workflowActions]);

  const duplicateSelection = useCallback((): void => {
    duplicateNodes(getNodes().filter((node) => node.selected));
  }, [duplicateNodes, getNodes]);

  const arrangeSelectedNodes = useCallback((mode: SelectionLayoutMode): void => {
    const selected = getNodes().filter((node) => node.selected && node.type === "imageNode");
    const positions = arrangeSelection(
      selected.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: nodeRenderedWidth(node),
        height: nodeRenderedHeight(node)
      })),
      mode,
      SELECTION_LAYOUT_GAP
    );
    if (positions.size === 0) return;
    recordCanvasChange();
    updateNodes((current) => current.map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, position } : node;
    }));
    reportCanvasChange();
  }, [getNodes, recordCanvasChange, reportCanvasChange, updateNodes]);

  const deleteNodes = useCallback(async (
    targetNodes: readonly Node[],
    selectedConnectionIds: readonly string[] = []
  ): Promise<boolean> => {
    if (targetNodes.length === 0 && selectedConnectionIds.length === 0) return false;
    const imageIds = targetNodes.filter((node) => node.type === "imageNode").map((node) => node.id);
    const workflowIds = targetNodes.filter(isPersistedWorkflowNode).map((node) => node.id);
    if (imageIds.length > 0) {
      const confirmed = await imageActions.requestDeleteImages?.(imageIds);
      if (confirmed === false) return false;
    }
    if (workflowIds.length > 0) {
      const confirmed = await workflowActions.requestDeleteNodes?.(workflowIds);
      if (confirmed === false) return false;
    }
    if (imageIds.length === 0) recordCanvasChange();
    if (workflowIds.length > 0) await workflowActions.deleteNodes?.(workflowIds);
    const deletedNodeIds = new Set([...imageIds, ...workflowIds]);
    const deletedConnectionIds = new Set(selectedConnectionIds);
    updateEdges((current) => current.filter((edge) =>
      !deletedNodeIds.has(edge.source) &&
      !deletedNodeIds.has(edge.target) &&
      !deletedConnectionIds.has(edge.id)
    ));
    reportCanvasChange();
    return true;
  }, [imageActions, recordCanvasChange, reportCanvasChange, updateEdges, workflowActions]);

  const useSelectedReferences = useCallback(async (): Promise<boolean> => {
    if (addingReferencesRef.current || !imageActions.canAddReferences) return false;
    const images = selectedImages(getNodes(), (image) => !image.pending);
    if (images.length === 0) return false;
    addingReferencesRef.current = true;
    setIsAddingReferences(true);
    try {
      await imageActions.useReferences(images);
      return true;
    } finally {
      addingReferencesRef.current = false;
      if (mountedRef.current) setIsAddingReferences(false);
    }
  }, [getNodes, imageActions]);

  const downloadSelectedImages = useCallback(async (): Promise<boolean> => {
    if (downloadingRef.current) return false;
    const images = selectedImages(getNodes(), (image) => !image.pending && Boolean(image.path));
    if (images.length === 0) return false;
    downloadingRef.current = true;
    setIsDownloading(true);
    try {
      await imageActions.downloadImages(images);
      return true;
    } finally {
      downloadingRef.current = false;
      if (mountedRef.current) setIsDownloading(false);
    }
  }, [getNodes, imageActions]);

  const exportWechatSelectedImages = useCallback((): boolean => {
    const images = selectedImages(getNodes(), (image) => !image.pending && Boolean(image.path));
    if (images.length === 0 || !imageActions.exportWechatImages) return false;
    imageActions.exportWechatImages(images);
    return true;
  }, [getNodes, imageActions]);

  return {
    selection,
    isAddingReferences,
    isDownloading,
    duplicateNodes,
    duplicateSelection,
    arrangeSelectedNodes,
    deleteNodes,
    useSelectedReferences,
    downloadSelectedImages,
    exportWechatSelectedImages
  };
}

function isDuplicableWorkflowNode(node: Node): boolean {
  return node.type === "codeCanvasNode" || node.type === "textNode" || node.type === "generationNode" || node.type === "videoGenerationNode";
}

function isPersistedWorkflowNode(node: Node): boolean {
  return isDuplicableWorkflowNode(node)
    || node.type === "videoNode"
    || node.type === "comicDramaEntryNode";
}

function readImage(node: Node): GeneratedImage | null {
  if (node.type !== "imageNode") return null;
  return (node.data as Partial<ImageNodeData> | undefined)?.image ?? null;
}

function selectedImages(
  nodes: readonly Node[],
  predicate: (image: GeneratedImage) => boolean
): GeneratedImage[] {
  return nodes.flatMap((node) => {
    if (!node.selected) return [];
    const image = readImage(node);
    return image && predicate(image) ? [image] : [];
  });
}
