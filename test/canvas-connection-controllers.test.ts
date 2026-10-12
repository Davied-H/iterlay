// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactFlowProvider, useStoreApi, type Edge, type Node } from "@xyflow/react";

import { useCanvasConnectionEdgeActions } from "@/components/canvas/use-canvas-connection-edge-actions";
import { useCanvasConnectionPresentation } from "@/components/canvas/use-canvas-connection-presentation";
import { useCanvasConnectionMutations } from "@/components/canvas/use-canvas-connection-mutations";
import {
  resolveVideoGenerationSemanticSnap,
  useFreeConnectionGesture
} from "@/components/canvas/use-free-connection-gesture";
import type { CanvasConnectionTransaction } from "@/components/canvas/canvas-connection-edge-contract";

function node(id: string, type: string, x: number): Node {
  return {
    id,
    type,
    position: { x, y: 0 },
    width: 264,
    height: 160,
    data: {}
  };
}

function videoGenerationNode(id = "video-generation", x = 500): Node {
  return {
    id,
    type: "videoGenerationNode",
    position: { x, y: 0 },
    width: 340,
    height: 596,
    data: {}
  };
}

function createEdgeStore(initial: Edge[]) {
  const ref = { current: initial };
  const set = (update: Edge[] | ((current: Edge[]) => Edge[])): void => {
    ref.current = typeof update === "function" ? update(ref.current) : update;
  };
  return { ref, set };
}

function mountHook(render: () => ReactElement | null): { root: Root; container: HTMLDivElement } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(render()));
  return { root, container };
}

function pointerEvent(
  type: string,
  clientX: number,
  clientY: number,
  pointerId = 1
): globalThis.PointerEvent {
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event as globalThis.PointerEvent;
}

let pendingFrames = new Map<number, FrameRequestCallback>();

function flushGestureFrames(): void {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  for (const callback of callbacks) callback(0);
}

beforeEach(() => {
  let frameId = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pendingFrames = new Map();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = ++frameId;
    pendingFrames.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => pendingFrames.delete(id)));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("free connection gesture lifecycle", () => {
  it.each([
    { sourceType: "imageNode", y: 126, handleId: "target-start-frame" },
    { sourceType: "imageNode", y: 169, handleId: "target-end-frame" },
    { sourceType: "imageNode", y: 212, handleId: "target-reference" },
    { sourceType: "videoNode", y: 255, handleId: "target-video-reference" }
  ])("resolves $sourceType to the exact $handleId semantic handle", ({ sourceType, y, handleId }) => {
    const target = videoGenerationNode();
    const result = resolveVideoGenerationSemanticSnap(
      { x: 500, y },
      node("source", sourceType, 0),
      "right",
      target,
      36
    );

    expect(result).toEqual({
      handleId,
      ratio: y / 596,
      point: { x: 500, y }
    });
  });

  it("only lets text snap to the semantic reference handle", () => {
    const target = videoGenerationNode();
    const source = node("source", "textNode", 0);

    expect(resolveVideoGenerationSemanticSnap(
      { x: 500, y: 212 }, source, "right", target, 36
    )?.handleId).toBe("target-reference");
    expect(resolveVideoGenerationSemanticSnap(
      { x: 500, y: 126 }, source, "right", target, 36
    )).toBeUndefined();
  });

  it("does not force a semantic snap beyond the distance threshold", () => {
    expect(resolveVideoGenerationSemanticSnap(
      { x: 450, y: 126 },
      node("source", "imageNode", 0),
      "right",
      videoGenerationNode(),
      36
    )).toBeUndefined();
  });

  it.each([100, 500, 1_000])("keeps presentation identity stable on the same snap target across %i nodes", (count) => {
    const nodesRef = {
      current: [
        node("source", "imageNode", 0),
        node("target", "imageNode", 500),
        ...Array.from({ length: count - 2 }, (_, index) => (
          node("distant-" + index, "imageNode", 2_000 + index * 400)
        ))
      ]
    };
    let controller: ReturnType<typeof useFreeConnectionGesture> | null = null;
    function Harness(): null {
      controller = useFreeConnectionGesture({
        nodesRef,
        screenToFlowPosition: (point) => point,
        getZoom: () => 1,
        connect: vi.fn(() => true),
        openNodeCreateMenu: vi.fn()
      });
      return null;
    }
    const mounted = mountHook(() => createElement(Harness));

    act(() => {
      controller!.onHandlePointerDown("source", "right", 264, 80, 1);
      window.dispatchEvent(pointerEvent("pointermove", 486, 60));
      flushGestureFrames();
    });
    const firstPresentation = controller!.presentation;
    const firstDrag = controller!.drag;
    expect(firstPresentation.size).toBe(count - 1);
    expect(firstPresentation.get("target")?.connectionSnapTargetHandle).toBe("target-left");

    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", 486, 100));
      flushGestureFrames();
    });

    expect(controller!.presentation).toBe(firstPresentation);
    expect(controller!.drag).not.toBe(firstDrag);
    expect(controller!.drag?.current).toEqual({ x: 500, y: 100 });
    act(() => mounted.root.unmount());
  });

  it("commits a drag to the exact semantic target handle with a pinned anchor", () => {
    const nodesRef = {
      current: [node("source", "imageNode", 0), videoGenerationNode("target")]
    };
    const connect = vi.fn(() => true);
    let controller: ReturnType<typeof useFreeConnectionGesture> | null = null;
    function Harness(): null {
      controller = useFreeConnectionGesture({
        nodesRef,
        screenToFlowPosition: (point) => point,
        getZoom: () => 1,
        connect,
        openNodeCreateMenu: vi.fn()
      });
      return null;
    }
    const mounted = mountHook(() => createElement(Harness));

    act(() => {
      controller!.onHandlePointerDown("source", "right", 264, 80, 1);
      window.dispatchEvent(pointerEvent("pointermove", 500, 126));
      window.dispatchEvent(pointerEvent("pointerup", 500, 126));
    });

    expect(connect).toHaveBeenCalledWith(
      {
        source: "source",
        target: "target",
        sourceHandle: "source-right",
        targetHandle: "target-start-frame"
      },
      {
        sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
        targetAnchor: { side: "left", ratio: 126 / 596, mode: "pinned" }
      }
    );
    act(() => mounted.root.unmount());
  });

  it.each([
    { targetType: "imageNode", targetAnchorMode: "pinned" },
    { targetType: "generationNode", targetAnchorMode: "auto" }
  ] as const)("commits a snapped drag to $targetType with a $targetAnchorMode target anchor", ({
    targetType,
    targetAnchorMode
  }) => {
    const nodesRef = {
      current: [node("source", "imageNode", 0), node("target", targetType, 500)]
    };
    const connect = vi.fn(() => true);
    const openNodeCreateMenu = vi.fn();
    let controller: ReturnType<typeof useFreeConnectionGesture> | null = null;
    function Harness(): null {
      controller = useFreeConnectionGesture({
        nodesRef,
        screenToFlowPosition: (point) => point,
        getZoom: () => 1,
        connect,
        openNodeCreateMenu
      });
      return null;
    }
    const mounted = mountHook(() => createElement(Harness));

    act(() => {
      controller!.onHandlePointerDown("source", "right", 264, 80, 1);
      window.dispatchEvent(pointerEvent("pointermove", 486, 60));
      window.dispatchEvent(pointerEvent("pointerup", 486, 60));
    });

    expect(connect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith(
      {
        source: "source",
        target: "target",
        sourceHandle: "source-right",
        targetHandle: "target-left"
      },
      {
        sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
        targetAnchor: { side: "left", ratio: 0.375, mode: targetAnchorMode }
      }
    );
    expect(openNodeCreateMenu).not.toHaveBeenCalled();
    expect(controller!.drag).toBeNull();
    act(() => mounted.root.unmount());
  });

  it("cancels pointer cancellation and removes listeners on unmount", () => {
    const nodesRef = {
      current: [node("source", "imageNode", 0), node("target", "imageNode", 500)]
    };
    const connect = vi.fn(() => true);
    const openNodeCreateMenu = vi.fn();
    let controller: ReturnType<typeof useFreeConnectionGesture> | null = null;
    function Harness(): null {
      controller = useFreeConnectionGesture({
        nodesRef,
        screenToFlowPosition: (point) => point,
        getZoom: () => 1,
        connect,
        openNodeCreateMenu
      });
      return null;
    }
    const first = mountHook(() => createElement(Harness));

    act(() => {
      controller!.onHandlePointerDown("source", "right", 264, 80, 1);
      window.dispatchEvent(pointerEvent("pointermove", 486, 80));
      window.dispatchEvent(pointerEvent("pointercancel", 486, 80));
    });
    expect(connect).not.toHaveBeenCalled();
    expect(controller!.drag).toBeNull();

    act(() => {
      controller!.onHandlePointerDown("source", "right", 264, 80, 1);
      first.root.unmount();
    });
    window.dispatchEvent(pointerEvent("pointerup", 486, 80));
    expect(connect).not.toHaveBeenCalled();
  });

  it("ignores unrelated pointers and only commits the initiating pointer", () => {
    const nodesRef = {
      current: [node("source", "imageNode", 0), node("target", "imageNode", 500)]
    };
    const connect = vi.fn(() => true);
    let controller: ReturnType<typeof useFreeConnectionGesture> | null = null;
    function Harness(): null {
      controller = useFreeConnectionGesture({
        nodesRef,
        screenToFlowPosition: (point) => point,
        getZoom: () => 1,
        connect,
        openNodeCreateMenu: vi.fn()
      });
      return null;
    }
    const mounted = mountHook(() => createElement(Harness));

    act(() => {
      controller!.onHandlePointerDown("source", "right", 264, 80, 7);
      window.dispatchEvent(pointerEvent("pointermove", 486, 80, 8));
      window.dispatchEvent(pointerEvent("pointerup", 486, 80, 8));
      window.dispatchEvent(pointerEvent("pointercancel", 486, 80, 8));
    });
    expect(connect).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", 486, 80, 7));
      window.dispatchEvent(pointerEvent("pointerup", 486, 80, 7));
    });
    expect(connect).toHaveBeenCalledOnce();
    act(() => mounted.root.unmount());
  });

  it.each(["blur", "visibilitychange"])("cancels on %s without committing", (reason) => {
    const nodesRef = {
      current: [node("source", "imageNode", 0), node("target", "imageNode", 500)]
    };
    const connect = vi.fn(() => true);
    const openNodeCreateMenu = vi.fn();
    let controller: ReturnType<typeof useFreeConnectionGesture> | null = null;
    function Harness(): null {
      controller = useFreeConnectionGesture({
        nodesRef,
        screenToFlowPosition: (point) => point,
        getZoom: () => 1,
        connect,
        openNodeCreateMenu
      });
      return null;
    }
    const mounted = mountHook(() => createElement(Harness));

    act(() => {
      controller!.onHandlePointerDown("source", "right", 264, 80, 1);
      window.dispatchEvent(pointerEvent("pointermove", 486, 80));
      if (reason === "blur") {
        window.dispatchEvent(new Event("blur"));
      } else {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      }
      window.dispatchEvent(pointerEvent("pointerup", 486, 80));
    });

    expect(connect).not.toHaveBeenCalled();
    expect(openNodeCreateMenu).not.toHaveBeenCalled();
    expect(controller!.drag).toBeNull();
    act(() => mounted.root.unmount());
  });
});

describe("canvas connection presentation lifecycle", () => {
  it("holds settled routes across exact zoom updates while moving and refreshes on move end", () => {
    const nodes = [
      node("source-a", "imageNode", 0),
      node("source-b", "imageNode", 100),
      node("target", "generationNode", 500)
    ];
    const edges: Edge[] = ["a", "b"].map((suffix) => ({
      id: "edge-" + suffix,
      source: "source-" + suffix,
      target: "target",
      sourceHandle: "source-right",
      targetHandle: "target-left",
      data: {
        kind: "reference",
        sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
        targetAnchor: { side: "left", ratio: 0.5, mode: "auto" },
        routing: { mode: "auto", kind: "curved", waypoints: [] }
      }
    }));
    const edgesRef = { current: edges };
    const draggingNodeIds = new Set<string>();
    let current: ReturnType<typeof useCanvasConnectionPresentation> | null = null;
    let flowStore: ReturnType<typeof useStoreApi> | null = null;

    function Harness({ viewportMoving }: { viewportMoving: boolean }): null {
      flowStore = useStoreApi();
      current = useCanvasConnectionPresentation({
        nodes,
        edges,
        edgesRef,
        setEdges: vi.fn(),
        draggingNodeIds,
        viewportMoving,
        scheduleCanvasReport: vi.fn()
      });
      return null;
    }

    const mounted = mountHook(() => createElement(
      ReactFlowProvider,
      null,
      createElement(Harness, { viewportMoving: false })
    ));
    const settledDescriptors = current!.descriptors;
    const settledRenderedEdges = current!.renderedEdges;
    const settledTargetY = settledDescriptors.map((descriptor) => descriptor.target.y);

    act(() => mounted.root.render(createElement(
      ReactFlowProvider,
      null,
      createElement(Harness, { viewportMoving: true })
    )));
    act(() => flowStore!.setState({ transform: [0, 0, 2] }));

    expect(current!.descriptors).toBe(settledDescriptors);
    expect(current!.renderedEdges).toBe(settledRenderedEdges);

    act(() => mounted.root.render(createElement(
      ReactFlowProvider,
      null,
      createElement(Harness, { viewportMoving: false })
    )));

    expect(current!.descriptors).not.toBe(settledDescriptors);
    expect(current!.renderedEdges).not.toBe(settledRenderedEdges);
    expect(current!.descriptors.map((descriptor) => descriptor.target.y)).not.toEqual(settledTargetY);
    act(() => mounted.root.unmount());
  });
});

describe("canvas connection controllers", () => {
  it("records and reports a connection once, including pending targets", () => {
    const nodesRef = {
      current: [
        node("source", "imageNode", 0),
        node("target", "imageNode", 500),
        node("incompatible", "textNode", 800)
      ]
    };
    const store = createEdgeStore([]);
    const recordCanvasChange = vi.fn();
    const scheduleCanvasReport = vi.fn();
    const onInvalidConnection = vi.fn();
    let mutations: ReturnType<typeof useCanvasConnectionMutations> | null = null;
    function Harness(): null {
      mutations = useCanvasConnectionMutations({
        nodesRef,
        edgesRef: store.ref,
        setEdges: store.set,
        recordCanvasChange,
        scheduleCanvasReport,
        onInvalidConnection
      });
      return null;
    }
    const mounted = mountHook(() => createElement(Harness));

    act(() => {
      mutations!.connect({
        source: "source",
        target: "target",
        sourceHandle: "source-right",
        targetHandle: "target-left"
      });
      mutations!.connect({
        source: "source",
        target: "pending",
        sourceHandle: "source-bottom",
        targetHandle: "target-left"
      }, { targetNodeType: "generationNode", recordHistory: false });
      mutations!.connect({
        source: "source",
        target: "incompatible",
        sourceHandle: "source-right",
        targetHandle: "target-left"
      });
      mutations!.connect({
        source: "source",
        target: "target",
        sourceHandle: "source-right",
        targetHandle: "target-left"
      });
    });

    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(scheduleCanvasReport).toHaveBeenCalledTimes(2);
    expect(onInvalidConnection).toHaveBeenCalledOnce();
    expect(store.ref.current).toHaveLength(2);
    expect(store.ref.current[1].data).toMatchObject({
      kind: "reference",
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    });
    act(() => mounted.root.unmount());
  });

  it("does not record or report unchanged and duplicate reconnects", () => {
    const nodesRef = {
      current: [
        node("source", "imageNode", 0),
        node("target", "imageNode", 500),
        node("other", "imageNode", 800)
      ]
    };
    const original: Edge = {
      id: "original",
      source: "source",
      target: "target",
      sourceHandle: "source-right",
      targetHandle: "target-left"
    };
    const duplicate: Edge = {
      id: "duplicate",
      source: "source",
      target: "other",
      sourceHandle: "source-bottom",
      targetHandle: "target-top"
    };
    const store = createEdgeStore([original, duplicate]);
    const recordCanvasChange = vi.fn();
    const scheduleCanvasReport = vi.fn();
    let mutations: ReturnType<typeof useCanvasConnectionMutations> | null = null;
    function Harness(): null {
      mutations = useCanvasConnectionMutations({
        nodesRef,
        edgesRef: store.ref,
        setEdges: store.set,
        recordCanvasChange,
        scheduleCanvasReport,
        onInvalidConnection: vi.fn()
      });
      return null;
    }
    const mounted = mountHook(() => createElement(Harness));

    act(() => {
      mutations!.onReconnect(original, {
        source: "source",
        target: "target",
        sourceHandle: "source-right",
        targetHandle: "target-left"
      });
      mutations!.onReconnect(original, {
        source: "source",
        target: "other",
        sourceHandle: "source-bottom",
        targetHandle: "target-top"
      });
    });

    expect(recordCanvasChange).not.toHaveBeenCalled();
    expect(scheduleCanvasReport).not.toHaveBeenCalled();
    expect(store.ref.current).toEqual([original, duplicate]);
    act(() => mounted.root.unmount());
  });

  it("keeps transaction previews ephemeral and commits history exactly once", () => {
    const before = {
      sourceAnchor: { side: "right" as const, ratio: 0.5, mode: "auto" as const },
      targetAnchor: { side: "left" as const, ratio: 0.5, mode: "auto" as const },
      labelAnchor: { progress: 0.5 },
      routing: { mode: "auto" as const, kind: "curved" as const, waypoints: [] }
    };
    const after = {
      ...before,
      targetAnchor: { ...before.targetAnchor, ratio: 0.8 }
    };
    const transaction: CanvasConnectionTransaction = {
      edgeId: "edge",
      kind: "endpoint",
      before,
      after
    };
    const nodesRef = { current: [node("source", "imageNode", 0), node("target", "imageNode", 500)] };
    const store = createEdgeStore([{
      id: "edge",
      source: "source",
      target: "target",
      data: before
    }]);
    const onBeforeCanvasChange = vi.fn();
    const recordCanvasChange = vi.fn();
    const scheduleCanvasReport = vi.fn();
    let controller: ReturnType<typeof useCanvasConnectionEdgeActions> | null = null;
    function Harness(): null {
      controller = useCanvasConnectionEdgeActions({
        nodesRef,
        edgesRef: store.ref,
        setEdges: store.set,
        recordCanvasChange,
        scheduleCanvasReport,
        onBeforeCanvasChange
      });
      return null;
    }
    const mounted = mountHook(() => createElement(Harness));

    act(() => {
      controller!.actions.begin(transaction);
      controller!.actions.change(transaction);
    });
    expect(controller!.hasActiveTransaction()).toBe(true);
    expect(store.ref.current[0].data?.targetAnchor).toMatchObject({ ratio: 0.8 });
    expect(onBeforeCanvasChange).not.toHaveBeenCalled();
    expect(scheduleCanvasReport).not.toHaveBeenCalled();

    act(() => controller!.actions.commit(transaction));
    expect(controller!.hasActiveTransaction()).toBe(false);
    expect(onBeforeCanvasChange).toHaveBeenCalledOnce();
    expect(recordCanvasChange).not.toHaveBeenCalled();
    expect(scheduleCanvasReport).toHaveBeenCalledOnce();
    act(() => mounted.root.unmount());
  });

  it("restores a cancelled transaction without history or persistence", () => {
    const before = {
      sourceAnchor: { side: "right" as const, ratio: 0.5, mode: "auto" as const },
      targetAnchor: { side: "left" as const, ratio: 0.5, mode: "auto" as const },
      labelAnchor: { progress: 0.5 },
      routing: { mode: "auto" as const, kind: "curved" as const, waypoints: [] }
    };
    const transaction: CanvasConnectionTransaction = {
      edgeId: "edge",
      kind: "endpoint",
      before,
      after: { ...before, targetAnchor: { ...before.targetAnchor, ratio: 0.8 } }
    };
    const nodesRef = { current: [node("source", "imageNode", 0), node("target", "imageNode", 500)] };
    const store = createEdgeStore([{ id: "edge", source: "source", target: "target", data: before }]);
    const onBeforeCanvasChange = vi.fn();
    const scheduleCanvasReport = vi.fn();
    let controller: ReturnType<typeof useCanvasConnectionEdgeActions> | null = null;
    function Harness(): null {
      controller = useCanvasConnectionEdgeActions({
        nodesRef,
        edgesRef: store.ref,
        setEdges: store.set,
        recordCanvasChange: vi.fn(),
        scheduleCanvasReport,
        onBeforeCanvasChange
      });
      return null;
    }
    const mounted = mountHook(() => createElement(Harness));

    act(() => {
      controller!.actions.begin(transaction);
      controller!.actions.change(transaction);
      controller!.actions.cancel(transaction);
    });

    expect(store.ref.current[0].data?.targetAnchor).toMatchObject({ ratio: 0.5 });
    expect(controller!.hasActiveTransaction()).toBe(false);
    expect(onBeforeCanvasChange).not.toHaveBeenCalled();
    expect(scheduleCanvasReport).not.toHaveBeenCalled();
    act(() => mounted.root.unmount());
  });
});
