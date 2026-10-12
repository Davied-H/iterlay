import { useCallback, useRef, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import {
  ReactFlow,
  SelectionMode,
  type Edge,
  type Node,
  type ReactFlowProps
} from "@xyflow/react";
import type { BoardViewport } from "@shared/types";
import { CanvasConnectionEdgeActionsProvider, type CanvasConnectionEdgeActions } from "./canvas-connection-edge-contract";
import { canvasConnectionEdgeTypes } from "./ConnectionController";
import { CanvasSelectionCountContext } from "./ImageNode";
import { canvasNodeTypes } from "./NodeRegistry";
import type { CanvasWheelInteraction } from "./canvas-viewport";
import type { CanvasToolMode } from "./canvas-tool-mode";
import {
  CanvasWheelGestureLock,
  cloneWheelEvent,
  hasLocalWheelScroller,
  isBlockedCanvasWheelTarget
} from "./canvas-wheel-gesture";

const PRO_OPTIONS = { hideAttribution: true };
const EMPTY_CANVAS_VIEWPORT: BoardViewport = { x: 0, y: 0, zoom: 1 };
const MIDDLE_MOUSE_BUTTON = [1];
const PAN_MOUSE_BUTTONS = [0, 1];

interface CanvasSurfaceProps {
  children: ReactNode;
  flowProps: ReactFlowProps<Node, Edge>;
  selectedNodeCount: number;
  connectionActions: CanvasConnectionEdgeActions;
  commentMode: boolean;
  toolMode?: CanvasToolMode;
  initialViewport?: BoardViewport;
  shouldFitInitialView: boolean;
  fitViewOptions: { padding: number; maxZoom: number };
  wheelInteraction: CanvasWheelInteraction;
}

export function CanvasSurface({
  children,
  flowProps,
  selectedNodeCount,
  connectionActions,
  commentMode,
  toolMode = "select",
  initialViewport,
  shouldFitInitialView,
  fitViewOptions,
  wheelInteraction
}: CanvasSurfaceProps): React.ReactElement {
  const wheelGestureLockRef = useRef(new CanvasWheelGestureLock());
  const redirectedWheelEventsRef = useRef(new WeakSet<WheelEvent>());

  const handleWheelCapture = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent;
    if (redirectedWheelEventsRef.current.delete(nativeEvent)) return;
    if (!wheelInteraction.panOnScroll) {
      wheelGestureLockRef.current.reset();
      return;
    }

    const root = event.currentTarget;
    const blockedByCanvasBoundary = isBlockedCanvasWheelTarget(event.target);
    const action = wheelGestureLockRef.current.resolve({
      blockedByCanvasBoundary,
      hasLocalScroller: blockedByCanvasBoundary && hasLocalWheelScroller(
        event.target,
        root.ownerDocument.activeElement,
        root,
        event.deltaX,
        event.deltaY
      ),
      // Pinch and modifier zoom never acquire ownership. When they start over
      // a boundary, the one event is still redirected so XYFlow can zoom it.
      bypassLock: event.ctrlKey || event.metaKey
    });

    if (action === "passthrough") return;

    event.preventDefault();
    event.stopPropagation();
    nativeEvent.stopImmediatePropagation();

    if (action === "redirect-to-canvas") {
      const renderer = root.querySelector<HTMLElement>(".react-flow__renderer");
      if (!renderer) return;
      const redirectedEvent = cloneWheelEvent(nativeEvent);
      redirectedWheelEventsRef.current.add(redirectedEvent);
      renderer.dispatchEvent(redirectedEvent);
    }
  }, [wheelInteraction.panOnScroll]);

  let initialViewProps: Partial<ReactFlowProps<Node, Edge>>;
  if (initialViewport) {
    initialViewProps = { defaultViewport: initialViewport };
  } else if (shouldFitInitialView) {
    initialViewProps = { fitView: true, fitViewOptions };
  } else {
    initialViewProps = { defaultViewport: EMPTY_CANVAS_VIEWPORT };
  }

  return (
    <CanvasSelectionCountContext.Provider value={selectedNodeCount}>
      <CanvasConnectionEdgeActionsProvider actions={connectionActions}>
        <ReactFlow
          {...flowProps}
          {...initialViewProps}
          nodeTypes={canvasNodeTypes}
          edgeTypes={canvasConnectionEdgeTypes}
          proOptions={PRO_OPTIONS}
          minZoom={0.05}
          maxZoom={4}
          nodesConnectable={!commentMode && toolMode === "select"}
          edgesReconnectable={!commentMode && toolMode === "select"}
          connectionRadius={24}
          onlyRenderVisibleElements
          nodesDraggable={!commentMode && toolMode === "select"}
          elementsSelectable={!commentMode && toolMode === "select"}
          deleteKeyCode={null}
          selectionKeyCode={null}
          selectionOnDrag={!commentMode && toolMode === "select"}
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode="Shift"
          panActivationKeyCode="Space"
          panOnDrag={commentMode ? true : toolMode === "pan" ? PAN_MOUSE_BUTTONS : MIDDLE_MOUSE_BUTTON}
          {...wheelInteraction}
          zoomOnPinch
          zoomOnDoubleClick={false}
          className="figma-canvas bg-transparent"
          onWheelCapture={handleWheelCapture}
        >
          {children}
        </ReactFlow>
      </CanvasConnectionEdgeActionsProvider>
    </CanvasSelectionCountContext.Provider>
  );
}
