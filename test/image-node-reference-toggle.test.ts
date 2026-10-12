// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlow, type Node } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { ImageNode, type GeneratedImage, type ImageNodeData } from "../src/components/canvas/ImageNode";
import { TooltipProvider } from "../src/components/ui/tooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
// React Flow reads the viewport's Y scale during its animation-frame update.
Object.defineProperty(window, "DOMMatrixReadOnly", {
  configurable: true,
  value: class {
    readonly m22: number;

    constructor(transform: string) {
      const scale = /scale\(([^)]+)\)/.exec(transform);
      this.m22 = scale ? Number(scale[1]) : 1;
    }
  }
});

function referenceNode(onUseReference: (image: GeneratedImage) => void): Node {
  const image: GeneratedImage = {
    id: "image-1",
    path: "/tmp/image-1.png",
    dataUrl: "data:image/png;base64,AAAA",
    jobId: "job-1",
    width: 400,
    height: 400
  };
  const data: ImageNodeData = {
    image,
    onCopy: vi.fn(),
    onSave: vi.fn(),
    onUseReference,
    isReference: true,
    canAddReference: false
  };
  return {
    id: image.id,
    type: "imageNode",
    position: { x: 200, y: 200 },
    selected: true,
    data: data as unknown as Record<string, unknown>
  };
}

function pendingNode(): Node {
  const image: GeneratedImage = {
    id: "pending-image",
    path: "",
    dataUrl: "",
    jobId: "",
    pending: true,
    generationStatus: "running",
    pendingPrompt: "保留两个产品主体，使用像素风格，并把两张参考图的构图合并到同一画面。".repeat(8),
    pendingReferenceImages: [
      { name: "产品正面", dataUrl: "data:image/png;base64,RlJPTlQ=" },
      { name: "产品侧面", dataUrl: "data:image/png;base64,U0lERQ==" }
    ],
    width: 512,
    height: 512
  };
  const data: ImageNodeData = {
    image,
    onCopy: vi.fn(),
    onSave: vi.fn(),
    onUseReference: vi.fn()
  };
  return {
    id: image.id,
    type: "imageNode",
    position: { x: 200, y: 200 },
    data: data as unknown as Record<string, unknown>
  };
}

describe("image node reference toggle", () => {
  it("allows an existing reference to be removed even when the reference limit is reached", async () => {
    const container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    document.body.append(container);
    const root = createRoot(container);
    const onUseReference = vi.fn();

    await act(async () => {
      root.render(createElement(
        TooltipProvider,
        null,
        createElement(ReactFlow, {
          nodes: [referenceNode(onUseReference)],
          edges: [],
          nodeTypes: { imageNode: ImageNode }
        })
      ));
    });

    const toggle = document.body.querySelector<HTMLButtonElement>('[aria-label="取消参考图"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.disabled).toBe(false);
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => toggle?.click());
    expect(onUseReference).toHaveBeenCalledOnce();
    expect(onUseReference).toHaveBeenCalledWith(expect.objectContaining({ id: "image-1" }));

    await act(async () => root.unmount());
    container.remove();
  });

  it("shows references and expands a five-line pending prompt into a scrollable overlay", async () => {
    const clientHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
    const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(240);
    const container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(
        TooltipProvider,
        null,
        createElement(ReactFlow, {
          nodes: [pendingNode()],
          edges: [],
          nodeTypes: { imageNode: ImageNode }
        })
      ));
    });

    expect(container.querySelector(".line-clamp-5")).not.toBeNull();
    expect(container.querySelector('img[alt="产品正面"]')).not.toBeNull();
    expect(container.querySelector('img[alt="产品侧面"]')).not.toBeNull();
    const expandButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("查看更多"));
    expect(expandButton).toBeDefined();

    await act(async () => expandButton!.click());
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    expect(container.querySelector(".line-clamp-5")).toBeNull();
    expect(container.querySelector(".overflow-y-auto.overscroll-contain")).not.toBeNull();
    expect(container.textContent).toContain("收起");

    await act(async () => root.unmount());
    container.remove();
    clientHeight.mockRestore();
    scrollHeight.mockRestore();
  });
});
