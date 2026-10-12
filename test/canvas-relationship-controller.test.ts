// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import {
  connectionIdsInBounds,
  useCanvasRelationshipController,
  type CanvasRelationshipController
} from "@/components/canvas/use-canvas-relationship-controller";

function node(id: string, x: number, selected = false): Node {
  return {
    id,
    type: "textNode",
    position: { x, y: 0 },
    width: 320,
    height: 100,
    selected,
    data: {}
  };
}

function edge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: "source-right",
    targetHandle: "target-left",
    data: {
      sourceAnchor: { side: "right", ratio: 0.5, mode: "auto" },
      targetAnchor: { side: "left", ratio: 0.5, mode: "auto" }
    }
  };
}

function relationshipElement(kind: "node" | "edge", id: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = `react-flow__${kind}`;
  element.dataset.id = id;
  return element;
}

function pointerEvent(type: string, x: number, y: number, pointerId = 1): MouseEvent {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

function createHarness(hoverHighlightEnabled = true) {
  const container = document.createElement("div");
  const pane = document.createElement("div");
  pane.className = "react-flow__pane";
  container.append(
    pane,
    relationshipElement("node", "a"),
    relationshipElement("node", "b"),
    relationshipElement("node", "c"),
    relationshipElement("edge", "ab"),
    relationshipElement("edge", "bc")
  );
  document.body.append(container);
  const mountPoint = document.createElement("div");
  document.body.append(mountPoint);
  const containerRef: { current: HTMLElement | null } = { current: container };
  let nodes = [node("a", 0), node("b", 500, true), node("c", 1000)];
  let edges = [edge("ab", "a", "b"), edge("bc", "b", "c")];
  let commentMode = false;
  const updateEdges = vi.fn((updater: (current: readonly Edge[]) => Edge[]) => {
    edges = updater(edges);
  });
  let controller: CanvasRelationshipController | null = null;
  function Harness(): null {
    controller = useCanvasRelationshipController({
      containerRef,
      getNodes: () => nodes,
      getEdges: () => edges,
      updateEdges,
      screenToFlowPosition: (point) => point,
      commentMode,
      hoverHighlightEnabled
    });
    return null;
  }
  const root = createRoot(mountPoint);
  act(() => root.render(createElement(Harness)));
  return {
    container,
    containerRef,
    pane,
    root,
    updateEdges,
    get controller() { return controller!; },
    get nodes() { return nodes; },
    get edges() { return edges; },
    setNodes(next: Node[]) { nodes = next; },
    setEdges(next: Edge[]) { edges = next; },
    setCommentMode(next: boolean) { commentMode = next; },
    rerender() {
      act(() => root.render(createElement(Harness)));
    }
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("canvas relationship controller", () => {
  it("keeps selection highlighting but ignores hover when the preference is off", () => {
    const harness = createHarness(false);
    const highlightedIds = (): string[] => [...harness.container.querySelectorAll(".canvas-relationship-highlighted")]
      .map((element) => element.getAttribute("data-id") ?? "");

    expect(highlightedIds()).toEqual(["a", "b", "c", "ab", "bc"]);
    act(() => harness.controller.onNodeMouseEnter({} as never, harness.nodes[0]));
    expect(highlightedIds()).toEqual(["a", "b", "c", "ab", "bc"]);
    act(() => harness.controller.onNodeMouseLeave({} as never, harness.nodes[0]));
    expect(highlightedIds()).toEqual(["a", "b", "c", "ab", "bc"]);
    act(() => harness.root.unmount());
  });

  it("highlights the selected relationship and lets hover temporarily take ownership", () => {
    const harness = createHarness();
    const highlightedIds = (): string[] => [...harness.container.querySelectorAll(".canvas-relationship-highlighted")]
      .map((element) => element.getAttribute("data-id") ?? "");

    expect(harness.controller.selectedRelationshipNodeId).toBe("b");
    expect(harness.container.classList.contains("canvas-relationship-active")).toBe(true);
    expect(highlightedIds()).toEqual(["a", "b", "c", "ab", "bc"]);

    act(() => harness.controller.onNodeMouseEnter({} as never, harness.nodes[0]));
    expect(highlightedIds()).toEqual(["a", "b", "ab"]);
    act(() => harness.controller.onNodeMouseLeave({} as never, harness.nodes[0]));
    expect(highlightedIds()).toEqual(["a", "b", "c", "ab", "bc"]);

    harness.containerRef.current = null;
    act(() => harness.root.unmount());
    expect(harness.container.classList.contains("canvas-relationship-active")).toBe(false);
    expect(highlightedIds()).toEqual([]);
  });

  it("reapplies highlights when selection or connection topology changes", () => {
    const harness = createHarness();
    harness.setNodes(harness.nodes.map((item) => ({ ...item, selected: item.id === "a" })));
    harness.setEdges([edge("bc", "b", "c")]);
    harness.rerender();

    expect(harness.controller.selectedRelationshipNodeId).toBe("a");
    expect(harness.container.classList.contains("canvas-relationship-active")).toBe(true);
    expect([...harness.container.querySelectorAll(".canvas-relationship-highlighted")]
      .map((element) => element.getAttribute("data-id"))).toEqual(["a"]);
    act(() => harness.root.unmount());
  });

  it("gives a changed selection ownership when the previous hover misses mouseleave", () => {
    const harness = createHarness();
    const highlightedIds = (): string[] => [...harness.container.querySelectorAll(".canvas-relationship-highlighted")]
      .map((element) => element.getAttribute("data-id") ?? "");

    act(() => harness.controller.onNodeMouseEnter({} as never, harness.nodes[0]));
    expect(highlightedIds()).toEqual(["a", "b", "ab"]);

    harness.setNodes(harness.nodes.map((item) => ({ ...item, selected: item.id === "c" })));
    harness.rerender();

    expect(harness.controller.selectedRelationshipNodeId).toBe("c");
    expect(highlightedIds()).toEqual(["b", "c", "bc"]);

    act(() => harness.controller.onNodeMouseEnter({} as never, harness.nodes[0]));
    expect(highlightedIds()).toEqual(["a", "b", "ab"]);
    act(() => harness.controller.onNodeMouseLeave({} as never, harness.nodes[0]));
    expect(highlightedIds()).toEqual(["b", "c", "bc"]);
    act(() => harness.root.unmount());
  });

  it("selects connections intersecting a pane drag and ignores short or commented gestures", () => {
    const harness = createHarness();
    const event = {
      button: 0,
      isPrimary: true,
      target: harness.pane,
      currentTarget: harness.container,
      clientX: 300,
      clientY: 40,
      pointerId: 1,
      preventDefault: vi.fn()
    };
    act(() => {
      harness.controller.onCanvasPointerDownCapture(event as never);
      window.dispatchEvent(pointerEvent("pointermove", 510, 60));
      window.dispatchEvent(pointerEvent("pointerup", 510, 60));
    });
    expect(harness.edges.map((item) => Boolean(item.selected))).toEqual([true, false]);
    expect(harness.updateEdges).toHaveBeenCalledOnce();

    act(() => {
      harness.controller.onCanvasPointerDownCapture(event as never);
      window.dispatchEvent(pointerEvent("pointermove", 1100, 60));
    });
    harness.setCommentMode(true);
    harness.rerender();
    window.dispatchEvent(pointerEvent("pointerup", 1100, 60));
    expect(harness.updateEdges).toHaveBeenCalledOnce();

    act(() => {
      harness.controller.onCanvasPointerDownCapture(event as never);
      window.dispatchEvent(pointerEvent("pointermove", 1100, 60));
      window.dispatchEvent(pointerEvent("pointerup", 1100, 60));
    });
    expect(harness.updateEdges).toHaveBeenCalledOnce();
    act(() => harness.root.unmount());
  });

  it("removes an active pointer session on unmount", () => {
    const harness = createHarness();
    harness.controller.onCanvasPointerDownCapture({
      button: 0,
      isPrimary: true,
      target: harness.pane,
      currentTarget: harness.container,
      clientX: 300,
      clientY: 40,
      pointerId: 7,
      preventDefault: vi.fn()
    } as never);
    act(() => harness.root.unmount());
    window.dispatchEvent(pointerEvent("pointermove", 510, 60, 7));
    window.dispatchEvent(pointerEvent("pointerup", 510, 60, 7));

    expect(harness.updateEdges).not.toHaveBeenCalled();
  });
});

describe("connection bounds", () => {
  it("handles reverse drags and skips connections with missing endpoints", () => {
    const nodes = [node("a", 0), node("b", 500), node("c", 1000)];
    const ids = connectionIdsInBounds(
      nodes,
      [edge("ab", "a", "b"), edge("missing", "a", "unknown"), edge("bc", "b", "c")],
      { x: 510, y: 60 },
      { x: 300, y: 40 }
    );
    expect([...ids]).toEqual(["ab"]);
  });
});
