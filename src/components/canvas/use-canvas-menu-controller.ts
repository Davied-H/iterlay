import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler
} from "react";
import type {
  Connection,
  Edge,
  EdgeMouseHandler,
  Node,
  NodeMouseHandler,
  ReactFlowProps
} from "@xyflow/react";
import type { CanvasDropPoint } from "./canvas-drop";
import { canvasPortsCompatible, compatibleCanvasTargetTypes } from "./NodeRegistry";
import { pointOnNodeSide, type FreeConnectionDrag } from "./ConnectionController";

const CREATE_MENU_WIDTH = 264;
const CREATE_MENU_HEIGHT = 150;
const CREATE_MENU_LEFT_INSET = 8;
const CREATE_MENU_TOP_INSET = 56;
const CREATABLE_WORKFLOW_TYPES = ["textNode", "generationNode", "videoGenerationNode", "comicSettingNode", "comicCharacterNode", "comicSegmentNode"] as const;

export type CanvasMenuConnectionSide = "top" | "right" | "bottom" | "left";

export interface CanvasNodeCreateMenuSource {
  nodeId: string;
  side: CanvasMenuConnectionSide;
}

interface CanvasNodeCreateMenuState {
  anchor: CanvasDropPoint;
  position: CanvasDropPoint;
  source?: CanvasNodeCreateMenuSource;
}

interface CanvasContextMenuState {
  anchor: CanvasDropPoint;
  target: "node" | "connection";
  id: string;
}

interface CanvasMenuControllerOptions {
  commentMode: boolean;
  allowedCreateTypes?: readonly string[];
  getNodes: () => readonly Node[];
  getCanvasBounds: () => DOMRect | null;
  screenToFlowPosition: (point: CanvasDropPoint) => CanvasDropPoint;
  recordCanvasChange: () => void;
  createWorkflowNode?: (
    type: "text" | "generation" | "video-generation" | "comic-setting" | "comic-character" | "comic-segment-script",
    position: CanvasDropPoint
  ) => string | void;
  connect: (
    connection: Connection,
    options: { recordHistory: false; targetNodeType: string }
  ) => boolean;
  duplicate: (nodes: Node[]) => void;
  deleteTargets: (nodes: Node[], connectionIds: string[]) => unknown;
  notify: (level: "info" | "error", message: string) => void;
}

export interface CanvasNodeCreateMenuViewModel {
  anchor: CanvasDropPoint;
  types: readonly string[];
  title: string;
  onCreate: (type: string) => void;
  onClose: () => void;
}

export interface CanvasContextMenuViewModel {
  anchor: CanvasDropPoint;
  target: "node" | "connection";
  onCopy?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export interface CanvasMenuController {
  nodeCreateMenu: CanvasNodeCreateMenuViewModel | null;
  connectionPreview: FreeConnectionDrag | null;
  contextMenu: CanvasContextMenuViewModel | null;
  openNodeCreateMenu: (
    client: CanvasDropPoint,
    position?: CanvasDropPoint,
    source?: CanvasNodeCreateMenuSource
  ) => void;
  rootHandlers: {
    onDoubleClick: MouseEventHandler<HTMLDivElement>;
  };
  flowHandlers: {
    onNodeContextMenu: NodeMouseHandler<Node>;
    onEdgeContextMenu: EdgeMouseHandler<Edge>;
    onPaneContextMenu: NonNullable<ReactFlowProps<Node, Edge>["onPaneContextMenu"]>;
  };
}

function workflowType(type: string): "text" | "generation" | "video-generation" | "comic-setting" | "comic-character" | "comic-segment-script" | null {
  if (type === "textNode") return "text";
  if (type === "generationNode") return "generation";
  if (type === "videoGenerationNode") return "video-generation";
  if (type === "comicSettingNode") return "comic-setting";
  if (type === "comicCharacterNode") return "comic-character";
  if (type === "comicSegmentNode") return "comic-segment-script";
  return null;
}

function sourceHandle(source: CanvasNodeCreateMenuSource): string {
  return `source-${source.side}`;
}

function compatibleCreateTypes(source: CanvasNodeCreateMenuSource | undefined, nodes: readonly Node[], allowedTypes: readonly string[] = CREATABLE_WORKFLOW_TYPES): string[] {
  if (!source) return CREATABLE_WORKFLOW_TYPES.filter((type) => allowedTypes.includes(type));
  const sourceNode = nodes.find((node) => node.id === source.nodeId);
  if (!sourceNode) return [];
  return compatibleCanvasTargetTypes(sourceNode.type, sourceHandle(source))
    .filter((type) => CREATABLE_WORKFLOW_TYPES.includes(type as typeof CREATABLE_WORKFLOW_TYPES[number]) && allowedTypes.includes(type));
}

export function useCanvasMenuController(options: CanvasMenuControllerOptions): CanvasMenuController {
  const optionsRef = useRef(options);
  const [nodeCreateMenuState, setNodeCreateMenuState] = useState<CanvasNodeCreateMenuState | null>(null);
  const [contextMenuState, setContextMenuState] = useState<CanvasContextMenuState | null>(null);
  optionsRef.current = options;

  const closeNodeCreateMenu = useCallback((): void => setNodeCreateMenuState(null), []);
  const closeContextMenu = useCallback((): void => setContextMenuState(null), []);

  const openNodeCreateMenu = useCallback((
    client: CanvasDropPoint,
    position?: CanvasDropPoint,
    source?: CanvasNodeCreateMenuSource
  ): void => {
    const current = optionsRef.current;
    const bounds = current.getCanvasBounds();
    if (!bounds || !current.createWorkflowNode) return;
    if (source && compatibleCreateTypes(source, current.getNodes(), current.allowedCreateTypes).length === 0) {
      current.notify("info", "当前节点没有可继续连接的节点类型。");
      return;
    }
    setContextMenuState(null);
    setNodeCreateMenuState({
      anchor: {
        x: Math.max(CREATE_MENU_LEFT_INSET, Math.min(
          bounds.width - CREATE_MENU_WIDTH,
          client.x - bounds.left
        )),
        y: Math.max(CREATE_MENU_TOP_INSET, Math.min(
          bounds.height - CREATE_MENU_HEIGHT,
          client.y - bounds.top
        ))
      },
      position: position ?? current.screenToFlowPosition(client),
      source
    });
  }, []);

  const createNodeFromMenu = useCallback((type: string): void => {
    const menu = nodeCreateMenuState;
    const current = optionsRef.current;
    const createType = workflowType(type);
    if (!menu || !createType || !current.createWorkflowNode) return;
    if (menu.source) {
      const sourceNode = current.getNodes().find((node) => node.id === menu.source?.nodeId);
      const targetHandle = type === "videoGenerationNode"
        ? sourceNode?.type === "imageNode" ? "target-start-frame" : "target-video-reference"
        : "target-left";
      if (!sourceNode || !canvasPortsCompatible(
        sourceNode.type,
        sourceHandle(menu.source),
        type,
        targetHandle
      )) {
        current.notify("error", "这个节点不能接收当前连接。");
        return;
      }
    }

    current.recordCanvasChange();
    const id = current.createWorkflowNode(createType, menu.position);
    if (!id || !menu.source) return;
    current.connect({
      source: menu.source.nodeId,
      target: id,
      sourceHandle: sourceHandle(menu.source),
      targetHandle: type === "videoGenerationNode"
          ? current.getNodes().find((node) => node.id === menu.source?.nodeId)?.type === "imageNode"
            ? "target-start-frame"
          : "target-video-reference"
        : "target-left"
    }, {
      recordHistory: false,
      targetNodeType: type
    });
  }, [nodeCreateMenuState]);

  const duplicateContextTarget = useCallback((): void => {
    const menu = contextMenuState;
    if (!menu || menu.target !== "node") return;
    const node = optionsRef.current.getNodes().find((candidate) => candidate.id === menu.id);
    if (node) optionsRef.current.duplicate([node]);
  }, [contextMenuState]);

  const deleteContextTarget = useCallback((): void => {
    const menu = contextMenuState;
    if (!menu) return;
    if (menu.target === "connection") {
      void optionsRef.current.deleteTargets([], [menu.id]);
      return;
    }
    const node = optionsRef.current.getNodes().find((candidate) => candidate.id === menu.id);
    if (node) void optionsRef.current.deleteTargets([node], []);
  }, [contextMenuState]);

  const handleDoubleClick = useCallback<MouseEventHandler<HTMLDivElement>>((event) => {
    if (
      optionsRef.current.commentMode
      || !(event.target instanceof Element)
      || !event.target.classList.contains("react-flow__pane")
    ) return;
    openNodeCreateMenu({ x: event.clientX, y: event.clientY });
  }, [openNodeCreateMenu]);

  const handleNodeContextMenu = useCallback<NodeMouseHandler<Node>>((event, node) => {
    event.preventDefault();
    setNodeCreateMenuState(null);
    setContextMenuState({
      anchor: { x: event.clientX, y: event.clientY },
      target: "node",
      id: node.id
    });
  }, []);

  const handleEdgeContextMenu = useCallback<EdgeMouseHandler<Edge>>((event, edge) => {
    event.preventDefault();
    setNodeCreateMenuState(null);
    if (edge.deletable === false) {
      setContextMenuState(null);
      optionsRef.current.notify("info", "这是漫剧的系统依赖连接，不能单独删除。");
      return;
    }
    setContextMenuState({
      anchor: { x: event.clientX, y: event.clientY },
      target: "connection",
      id: edge.id
    });
  }, []);

  const handlePaneContextMenu = useCallback<NonNullable<ReactFlowProps<Node, Edge>["onPaneContextMenu"]>>((event) => {
    event.preventDefault();
    if (!optionsRef.current.commentMode) {
      openNodeCreateMenu({ x: event.clientX, y: event.clientY });
    }
  }, [openNodeCreateMenu]);

  const nodeCreateMenu = useMemo<CanvasNodeCreateMenuViewModel | null>(() => {
    if (!nodeCreateMenuState) return null;
    return {
      anchor: nodeCreateMenuState.anchor,
      types: compatibleCreateTypes(nodeCreateMenuState.source, options.getNodes(), options.allowedCreateTypes),
      title: nodeCreateMenuState.source ? "创建并连接节点" : "创建节点",
      onCreate: createNodeFromMenu,
      onClose: closeNodeCreateMenu
    };
  }, [closeNodeCreateMenu, createNodeFromMenu, nodeCreateMenuState, options]);

  const contextMenu = useMemo<CanvasContextMenuViewModel | null>(() => {
    if (!contextMenuState) return null;
    return {
      anchor: contextMenuState.anchor,
      target: contextMenuState.target,
      onCopy: contextMenuState.target === "node" ? duplicateContextTarget : undefined,
      onDelete: deleteContextTarget,
      onClose: closeContextMenu
    };
  }, [closeContextMenu, contextMenuState, deleteContextTarget, duplicateContextTarget]);

  const source = nodeCreateMenuState?.source;
  const sourceNode = source ? options.getNodes().find((node) => node.id === source.nodeId) : undefined;
  const bounds = sourceNode ? options.getCanvasBounds() : null;
  const connectionPreview: FreeConnectionDrag | null = source && sourceNode && bounds && nodeCreateMenuState
    ? {
        nodeId: source.nodeId,
        side: source.side,
        start: pointOnNodeSide(sourceNode, source.side),
        startClient: { x: 0, y: 0 },
        // Use the clamped menu location, not the original pointer release position.
        current: options.screenToFlowPosition({
          x: bounds.left + nodeCreateMenuState.anchor.x,
          y: bounds.top + nodeCreateMenuState.anchor.y + CREATE_MENU_TOP_INSET
        }),
        moved: true
      }
    : null;

  return {
    nodeCreateMenu,
    connectionPreview,
    contextMenu,
    openNodeCreateMenu,
    rootHandlers: { onDoubleClick: handleDoubleClick },
    flowHandlers: {
      onNodeContextMenu: handleNodeContextMenu,
      onEdgeContextMenu: handleEdgeContextMenu,
      onPaneContextMenu: handlePaneContextMenu
    }
  };
}
