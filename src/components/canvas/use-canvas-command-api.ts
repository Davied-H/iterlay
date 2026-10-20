import { useMemo, useRef } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { CopyImageFormat } from "@shared/types";
import { canvasSelectionSnapshot, type CanvasSelectionSnapshot } from "./canvas-history";
import type { GeneratedImage } from "./image-node-model";
import type {
  CanvasCreateNodeType,
  CanvasShortcutCommand,
  CanvasShortcutSnapshot
} from "./canvas-shortcut-plan";
import type { CanvasCommandApi } from "./use-canvas-shortcut-controller";

type NodeUpdater = (current: readonly Node[]) => Node[];
type EdgeUpdater = (current: readonly Edge[]) => Edge[];

export interface CanvasCommandSelectionCapabilities {
  updateNodes: (updater: NodeUpdater) => void;
  updateEdges: (updater: EdgeUpdater) => void;
  deleteTargets: (nodes: Node[], connectionIds: string[]) => unknown;
  duplicateNodes: (nodes: Node[]) => void;
  useSelectedReferences: () => unknown;
  exportWechatSelectedImages: () => void;
}

export interface CanvasCommandHistoryCapabilities {
  undo?: (snapshot: CanvasSelectionSnapshot) => void;
  redo?: (snapshot: CanvasSelectionSnapshot) => void;
}

export interface CanvasCommandViewportCapabilities {
  fitCanvas: () => void;
  fitSelection: (nodes: Node[]) => void;
}

export interface CanvasCommandAssetCapabilities {
  copyImage: (dataUrl: string, format: CopyImageFormat) => Promise<void>;
  copyImageFormat: CopyImageFormat;
  notifyImageCopied: () => void;
  notifyImageCopyFailed: () => void;
  editImage?: (image: GeneratedImage) => void;
  sliceImage?: (image: GeneratedImage) => void;
  viewImageDetails?: (image: GeneratedImage) => void;
  saveAsTemplate?: (image: GeneratedImage) => void;
  quickShareImage?: (images: GeneratedImage[]) => void;
  downloadOriginal: (path: string) => unknown;
  removeBackground?: (image: GeneratedImage) => unknown;
  switchVersion?: (imageId: string, index: number) => void;
}

export interface CanvasCommandShellCapabilities {
  reject: (message: string) => void;
  exitCanvas?: () => void;
  openShortcutHelp?: () => void;
  focusPrompt: () => void;
}

export interface CanvasCommandApiOptions {
  createNode?: (type: CanvasCreateNodeType) => void;
  selection: CanvasCommandSelectionCapabilities;
  history: CanvasCommandHistoryCapabilities;
  viewport: CanvasCommandViewportCapabilities;
  assets: CanvasCommandAssetCapabilities;
  shell: CanvasCommandShellCapabilities;
}

function clearSelection(options: CanvasCommandApiOptions): void {
  options.selection.updateNodes((current) => current.map((node) => (
    node.selected ? { ...node, selected: false } : node
  )));
  options.selection.updateEdges((current) => current.map((edge) => (
    edge.selected ? { ...edge, selected: false } : edge
  )));
}

function selectAll(options: CanvasCommandApiOptions): void {
  options.selection.updateNodes((current) => current.map((node) => (
    node.selected ? node : { ...node, selected: true }
  )));
}

function runHistoryCommand(
  command: Extract<CanvasShortcutCommand, { type: "undo" | "redo" }>,
  snapshot: CanvasShortcutSnapshot,
  history: CanvasCommandHistoryCapabilities
): void {
  const current = canvasSelectionSnapshot([...snapshot.nodes], [...snapshot.edges]);
  if (command.type === "undo") history.undo?.(current);
  else history.redo?.(current);
}

function copyOriginalImage(image: GeneratedImage, assets: CanvasCommandAssetCapabilities): void {
  void assets.copyImage(image.dataUrl, assets.copyImageFormat)
    .then(assets.notifyImageCopied)
    .catch(assets.notifyImageCopyFailed);
}

function executeCanvasCommand(
  command: CanvasShortcutCommand,
  snapshot: CanvasShortcutSnapshot,
  options: CanvasCommandApiOptions
): void {
  switch (command.type) {
    case "create-node":
      options.createNode?.(command.nodeType);
      return;
    case "delete":
      void options.selection.deleteTargets(command.nodes, command.connectionIds);
      return;
    case "clear-selection":
      clearSelection(options);
      return;
    case "exit-canvas":
      options.shell.exitCanvas?.();
      return;
    case "select-all":
      selectAll(options);
      return;
    case "undo":
    case "redo":
      runHistoryCommand(command, snapshot, options.history);
      return;
    case "show-shortcuts":
      options.shell.openShortcutHelp?.();
      return;
    case "focus-prompt":
      options.shell.focusPrompt();
      return;
    case "fit-canvas":
      options.viewport.fitCanvas();
      return;
    case "fit-selection":
      options.viewport.fitSelection(command.nodes);
      return;
    case "duplicate":
      options.selection.duplicateNodes(command.nodes);
      return;
    case "copy-original":
      copyOriginalImage(command.image, options.assets);
      return;
    case "reference":
      void options.selection.useSelectedReferences();
      return;
    case "edit":
      options.assets.editImage?.(command.image);
      return;
    case "slice":
      options.assets.sliceImage?.(command.image);
      return;
    case "view-details":
      options.assets.viewImageDetails?.(command.image);
      return;
    case "save-as-template":
      options.assets.saveAsTemplate?.(command.image);
      return;
    case "export-wechat":
      options.selection.exportWechatSelectedImages();
      return;
    case "quick-share":
      options.assets.quickShareImage?.([command.image]);
      return;
    case "download-original":
      void options.assets.downloadOriginal(command.image.path);
      return;
    case "remove-background":
      void options.assets.removeBackground?.(command.image);
      return;
    case "switch-version":
      options.assets.switchVersion?.(command.imageId, command.index);
  }
}

export function useCanvasCommandApi(options: CanvasCommandApiOptions): CanvasCommandApi {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  return useMemo(() => ({
    execute(command: CanvasShortcutCommand, snapshot: CanvasShortcutSnapshot): void {
      executeCanvasCommand(command, snapshot, optionsRef.current);
    },
    reject(message: string): void {
      optionsRef.current.shell.reject(message);
    }
  }), []);
}
