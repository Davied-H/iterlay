// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlow, type Node } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";
import { GenerationNode, type GenerationNodeData } from "@/components/canvas/GenerationNode";
import { TextNode, type TextNodeData } from "@/components/canvas/TextNode";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderNode(node: Node, nodeTypes: Record<string, typeof TextNode | typeof GenerationNode>): void {
  container = document.createElement("div");
  container.style.width = "800px";
  container.style.height = "600px";
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ReactFlow, { nodes: [node], edges: [], nodeTypes }));
  });
}

function setScrollable(element: HTMLTextAreaElement, scrollable: boolean): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: scrollable ? 180 : 100 }
  });
}

describe("canvas node wheel boundaries", () => {
  it("lets the canvas own wheel gestures over a short text editor", () => {
    const data: TextNodeData = { text: "短文本" };
    renderNode({ id: "text-1", type: "textNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { textNode: TextNode });

    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="文本内容"]')!;
    setScrollable(textarea, false);
    act(() => textarea.focus());

    expect(textarea.classList.contains("nowheel")).toBe(false);
    expect(textarea.classList.contains("nopan")).toBe(false);
  });

  it("only gives a focused, overflowing text editor wheel ownership", () => {
    const data: TextNodeData = { text: "长文本" };
    renderNode({ id: "text-1", type: "textNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { textNode: TextNode });

    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="文本内容"]')!;
    setScrollable(textarea, true);
    expect(textarea.classList.contains("nowheel")).toBe(false);

    act(() => textarea.focus());
    expect(textarea.classList.contains("nowheel")).toBe(true);
    expect(textarea.classList.contains("nopan")).toBe(true);

    act(() => textarea.blur());
    expect(textarea.classList.contains("nowheel")).toBe(false);
    expect(textarea.classList.contains("nopan")).toBe(false);
  });

  it("does not block wheel gestures across the generation card body", () => {
    const data: GenerationNodeData = {
      prompt: "生成海报",
      model: "gpt-image-1",
      size: "1024x1024",
      count: 1
    };
    renderNode({ id: "generation-1", type: "generationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { generationNode: GenerationNode });

    const body = document.querySelector<HTMLElement>(".canvas-generation-body")!;
    const footer = document.querySelector<HTMLElement>(".canvas-generation-footer")!;
    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="生成提示词"]')!;
    expect(body.classList.contains("nowheel")).toBe(false);
    expect(body.classList.contains("nopan")).toBe(false);
    expect(footer.classList.contains("nopan")).toBe(false);

    setScrollable(textarea, true);
    act(() => textarea.focus());
    expect(textarea.classList.contains("nowheel")).toBe(true);
    expect(textarea.classList.contains("nopan")).toBe(true);

    act(() => textarea.blur());
    expect(textarea.classList.contains("nowheel")).toBe(false);
    expect(textarea.classList.contains("nopan")).toBe(false);
  });
});
