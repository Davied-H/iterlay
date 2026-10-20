import type { Edge, Node } from "@xyflow/react";
import { resolveConnectionEscapeAction } from "./connection-interaction";
import type { GeneratedImage } from "./image-node-model";
import { resolveCanvasShortcut } from "./canvas-shortcuts";

export interface CanvasShortcutSnapshot {
  enabled: boolean;
  commentMode: boolean;
  gestureActive: boolean;
  canAddReferences: boolean;
  availableCreateTypes?: readonly CanvasCreateNodeType[];
  availableAssetActions: ReadonlySet<CanvasOptionalAssetShortcut>;
  nodes: readonly Node[];
  edges: readonly Edge[];
}

export type CanvasOptionalAssetShortcut =
  | "edit"
  | "slice"
  | "view-details"
  | "save-as-template"
  | "export-wechat"
  | "quick-share"
  | "remove-background"
  | "switch-version";

export type CanvasCreateNodeType = "generation" | "video-generation" | "text";

export type CanvasShortcutCommand =
  | { type: "create-node"; nodeType: CanvasCreateNodeType }
  | { type: "delete"; nodes: Node[]; connectionIds: string[] }
  | { type: "clear-selection" }
  | { type: "exit-canvas" }
  | { type: "select-all" }
  | { type: "undo" | "redo" }
  | { type: "show-shortcuts" }
  | { type: "focus-prompt" }
  | { type: "fit-canvas" }
  | { type: "fit-selection"; nodes: Node[] }
  | { type: "duplicate"; nodes: Node[] }
  | { type: "copy-original"; image: GeneratedImage }
  | { type: "reference" }
  | {
      type:
        | "edit"
        | "slice"
        | "view-details"
        | "save-as-template"
        | "export-wechat"
        | "quick-share"
        | "download-original"
        | "remove-background";
      image: GeneratedImage;
    }
  | { type: "switch-version"; imageId: string; index: number };

export type CanvasShortcutPlan =
  | { type: "ignore" }
  | { type: "defer" }
  | { type: "reject"; message: string; preventDefault: boolean }
  | { type: "command"; command: CanvasShortcutCommand; preventDefault: true };

export interface CanvasShortcutKeyInput {
  key: string;
  commandKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  repeat: boolean;
  editableTarget: boolean;
}

export interface CanvasDeleteShortcutTargets {
  nodes: Node[];
  connectionIds: string[];
}

export function resolveCanvasDeleteShortcut(
  event: Pick<KeyboardEvent, "key" | "defaultPrevented" | "isComposing" | "repeat">,
  options: {
    enabled: boolean;
    commentMode: boolean;
    editableTarget: boolean;
    nodes: readonly Node[];
    edges: readonly Edge[];
  }
): CanvasDeleteShortcutTargets | null {
  if (
    !options.enabled
    || options.commentMode
    || event.defaultPrevented
    || event.isComposing
    || event.repeat
    || options.editableTarget
    || (event.key !== "Delete" && event.key !== "Backspace")
  ) return null;
  const nodes = options.nodes.filter((node) => node.selected);
  const connectionIds = options.edges
    .filter((edge) => edge.selected && edge.deletable !== false)
    .map((edge) => edge.id);
  return nodes.length > 0 || connectionIds.length > 0 ? { nodes, connectionIds } : null;
}

const SINGLE_IMAGE_ACTIONS = new Set<Extract<CanvasShortcutCommand, { image: GeneratedImage }>["type"]>([
  "edit",
  "slice",
  "view-details",
  "save-as-template",
  "export-wechat",
  "quick-share",
  "download-original",
  "remove-background"
]);
const COMMENT_MODE_SAFE_ACTIONS = new Set([
  "show-shortcuts",
  "focus-prompt",
  "fit-canvas",
  "fit-selection"
]);

function optionalAssetShortcut(action: string): CanvasOptionalAssetShortcut | null {
  if (action === "edit" || action === "slice" || action === "view-details" ||
    action === "save-as-template" || action === "export-wechat" || action === "quick-share" ||
    action === "remove-background") return action;
  if (action === "previous-version" || action === "next-version") return "switch-version";
  return null;
}

function selectedImage(node: Node): GeneratedImage | null {
  if (node.type !== "imageNode") return null;
  const image = (node.data as { image?: GeneratedImage }).image;
  return image ?? null;
}

function command(command: CanvasShortcutCommand): CanvasShortcutPlan {
  return { type: "command", command, preventDefault: true };
}

function reject(message: string, preventDefault = false): CanvasShortcutPlan {
  return { type: "reject", message, preventDefault };
}

function planDelete(
  input: CanvasShortcutKeyInput,
  snapshot: CanvasShortcutSnapshot
): CanvasShortcutPlan | null {
  const targets = resolveCanvasDeleteShortcut(input, {
    enabled: snapshot.enabled,
    commentMode: snapshot.commentMode,
    editableTarget: input.editableTarget,
    nodes: snapshot.nodes,
    edges: snapshot.edges
  });
  return targets ? command({ type: "delete", ...targets }) : null;
}

function planSingleImageAction(
  action: Extract<CanvasShortcutCommand, { image: GeneratedImage }>["type"],
  image: GeneratedImage
): CanvasShortcutPlan {
  if (image.pending) return reject("图片生成完成后才能执行此操作");

  if (action === "slice" && (!image.path || !image.width || !image.height)) {
    return reject("这张图片暂时不能切图");
  }
  if (action === "save-as-template" && !image.path && !image.dataUrl) {
    return reject("这张图片暂时不能沉淀为模板");
  }
  if (action === "export-wechat" && !image.path) {
    return reject("这张图片暂时不能导出为微信表情");
  }
  if (action === "quick-share" && !image.path) {
    return reject("这张图片暂时不能分享");
  }
  if (action === "download-original" && !image.path) {
    return reject("这张图片暂时不能下载");
  }
  if (action === "remove-background" && !image.path) {
    return reject("这张图片暂时不能去除背景");
  }
  return command({ type: action, image });
}

/** Plans a key press without mutating React Flow state or invoking product callbacks. */
export function planCanvasShortcut(
  input: CanvasShortcutKeyInput,
  snapshot: CanvasShortcutSnapshot
): CanvasShortcutPlan {
  const deletePlan = planDelete(input, snapshot);
  if (deletePlan) return deletePlan;

  if (
    !snapshot.enabled
    || input.defaultPrevented
    || input.isComposing
    || input.repeat
    || input.editableTarget
  ) return { type: "ignore" };

  const selected = snapshot.nodes.filter((node) => node.selected);
  const hasSelectedConnections = snapshot.edges.some((edge) => edge.selected);
  if (input.key === "Escape") {
    const escapeAction = resolveConnectionEscapeAction({
      gestureActive: snapshot.gestureActive,
      hasSelection: selected.length > 0 || hasSelectedConnections
    });
    if (escapeAction === "defer-to-gesture") return { type: "defer" };
    return command({ type: escapeAction === "clear-selection" ? "clear-selection" : "exit-canvas" });
  }

  const action = resolveCanvasShortcut(input);
  if (!action) return { type: "ignore" };
  if (snapshot.commentMode && !COMMENT_MODE_SAFE_ACTIONS.has(action)) return { type: "ignore" };
  const optionalAssetAction = optionalAssetShortcut(action);
  if (optionalAssetAction && !snapshot.availableAssetActions.has(optionalAssetAction)) {
    return { type: "ignore" };
  }

  if (action === "create-image" || action === "create-video" || action === "create-text") {
    if (snapshot.gestureActive) return { type: "ignore" };
    const nodeType = action === "create-image" ? "generation" : action === "create-video" ? "video-generation" : "text";
    return snapshot.availableCreateTypes?.includes(nodeType)
      ? command({ type: "create-node", nodeType })
      : { type: "ignore" };
  }

  if (action === "select-all") return command({ type: "select-all" });
  if (action === "undo" || action === "redo") return command({ type: action });
  if (action === "show-shortcuts") return command({ type: "show-shortcuts" });
  if (action === "focus-prompt") return command({ type: "focus-prompt" });
  if (action === "fit-canvas") return command({ type: "fit-canvas" });
  if (action === "fit-selection") {
    return selected.length > 0
      ? command({ type: "fit-selection", nodes: selected })
      : reject("请先选择要查看的图片");
  }
  if (action === "duplicate") {
    return selected.length > 0 ? command({ type: "duplicate", nodes: selected }) : { type: "ignore" };
  }

  const selectedImages = selected.flatMap((node) => {
    const image = selectedImage(node);
    return image ? [image] : [];
  });
  if (action === "copy-original") {
    if (selectedImages.length !== 1) {
      return reject(
        selectedImages.length === 0 ? "请先选择一张图片" : "复制原图一次只能处理一张图片",
        true
      );
    }
    const image = selectedImages[0];
    if (image.pending || !image.dataUrl) return reject("图片生成完成后才能复制原图", true);
    return command({ type: "copy-original", image });
  }

  if (action === "reference") {
    if (selected.length === 0) return reject("请先选择要加入参考的图片");
    if (!snapshot.canAddReferences) return reject("参考图已达 4 张上限", true);
    return command({ type: "reference" });
  }

  if (SINGLE_IMAGE_ACTIONS.has(action as Extract<CanvasShortcutCommand, { image: GeneratedImage }>["type"])) {
    if (selectedImages.length !== 1) {
      return reject(selectedImages.length === 0 ? "请先选择一张图片" : "这个操作一次只能处理一张图片");
    }
    return planSingleImageAction(
      action as Extract<CanvasShortcutCommand, { image: GeneratedImage }>["type"],
      selectedImages[0]
    );
  }

  if (action === "previous-version" || action === "next-version") {
    if (selectedImages.length !== 1) return { type: "ignore" };
    const image = selectedImages[0];
    if (image.pending) return reject("图片生成完成后才能执行此操作");
    const versions = image.versions ?? [];
    if (versions.length < 2) return { type: "ignore" };
    const current = image.activeVersion ?? versions.length - 1;
    const index = current + (action === "previous-version" ? -1 : 1);
    if (index < 0 || index >= versions.length) return { type: "ignore" };
    return command({ type: "switch-version", imageId: image.id, index });
  }

  return { type: "ignore" };
}
