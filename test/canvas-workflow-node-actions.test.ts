// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge, Node } from "@xyflow/react";
import type { BoardGenerationNode, BoardTextNode } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import type { CanvasWorkflowNodeCapability } from "@/components/canvas/use-canvas-node-bindings";
import { useCanvasWorkflowNodeActions } from "@/components/canvas/use-canvas-workflow-node-actions";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasWorkflowNodeCapability | null = null;
let nodes: Node[] = [];
let edges: Edge[] = [];
let workflowNodes: Array<BoardTextNode | BoardGenerationNode> = [];
let onUpdate = vi.fn();
let onRun = vi.fn();
let recordCanvasChange = vi.fn();
let reportCanvasChange = vi.fn();
let notifyError = vi.fn();
let updateNodes = vi.fn((updater: (current: readonly Node[]) => Node[]) => {
  nodes = updater(nodes);
});
let updateEdges = vi.fn((updater: (current: readonly Edge[]) => Edge[]) => {
  edges = updater(edges);
});

function Harness(): React.ReactElement | null {
  latest = useCanvasWorkflowNodeActions({
    workflowNodes,
    getNodes: () => nodes,
    getEdges: () => edges,
    updateNodes,
    updateEdges,
    onUpdate,
    onRun,
    recordCanvasChange,
    reportCanvasChange,
    notifyError,
    createEdgeId: () => "generated-edge"
  });
  return null;
}

async function render(): Promise<void> {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root?.render(createElement(Harness)));
}

function textNode(id: string, text: string): Node {
  return { id, type: "textNode", position: { x: 0, y: 0 }, data: { text } };
}

function generationNode(id: string, prompt: string): Node {
  return {
    id,
    type: "generationNode",
    position: { x: 100, y: 0 },
    height: 320,
    data: { prompt, model: "model", size: "1024x1024", count: 1 }
  };
}

function generationRecord(id: string, prompt = ""): BoardGenerationNode {
  return { id, type: "generation", x: 100, y: 0, prompt, model: "model", size: "1024x1024", count: 1 };
}

function image(id: string): GeneratedImage {
  return { id, path: `${id}.png`, dataUrl: `data:${id}`, jobId: id, width: 100, height: 100 };
}

beforeEach(() => {
  latest = null;
  nodes = [];
  edges = [];
  workflowNodes = [];
  onUpdate = vi.fn();
  onRun = vi.fn(async () => []);
  recordCanvasChange = vi.fn();
  reportCanvasChange = vi.fn();
  notifyError = vi.fn();
  updateNodes = vi.fn((updater: (current: readonly Node[]) => Node[]) => {
    nodes = updater(nodes);
  });
  updateEdges = vi.fn((updater: (current: readonly Edge[]) => Edge[]) => {
    edges = updater(edges);
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("canvas workflow node actions", () => {
  it("patches text and generation nodes immutably and reports height changes", async () => {
    const text = textNode("text", "old");
    const generation = generationNode("generation", "old prompt");
    nodes = [text, generation];
    workflowNodes = [
      { id: "text", type: "text", x: 0, y: 0, text: "old" },
      generationRecord("generation", "old prompt")
    ];
    await render();

    latest!.onBeforeChange?.();
    latest!.onTextChange?.("text", "new");
    latest!.onGenerationChange?.("generation", { prompt: "new prompt", count: 2 });
    latest!.onGenerationHeightChange?.("generation", 420, "manual");

    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(text.data).toEqual({ text: "old" });
    expect(generation.data).toMatchObject({ prompt: "old prompt", count: 1 });
    expect(nodes[0]).not.toBe(text);
    expect(nodes[0].data).toMatchObject({ text: "new" });
    expect(nodes[1]).not.toBe(generation);
    expect(nodes[1]).toMatchObject({ height: 420 });
    expect(nodes[1].data).toMatchObject({ prompt: "new prompt", count: 2, displayHeight: 420, heightMode: "manual" });
    expect(onUpdate).toHaveBeenNthCalledWith(1, "text", { text: "new" });
    expect(onUpdate).toHaveBeenNthCalledWith(2, "generation", { prompt: "new prompt", count: 2 });
    expect(onUpdate).toHaveBeenNthCalledWith(3, "generation", { displayHeight: 420, heightMode: "manual" });
    expect(reportCanvasChange).toHaveBeenCalledOnce();
  });

  it("resolves the just-projected config and adds only unique missing result edges", async () => {
    nodes = [textNode("upstream", "upstream text"), generationNode("generation", "old")];
    workflowNodes = [generationRecord("generation", "old")];
    edges = [
      { id: "reference", source: "upstream", target: "generation", data: { kind: "reference" } },
      { id: "existing-result", source: "generation", target: "existing" }
    ];
    const existing = image("existing");
    const created = image("created");
    onRun.mockResolvedValue([existing, created, created]);
    await render();

    await act(async () => {
      await latest!.onRunGeneration?.("generation", {
        prompt: "new prompt",
        model: "new-model",
        size: "2048x2048",
        count: 2
      });
    });

    expect(onRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: "generation", prompt: "new prompt", model: "new-model", count: 2 }),
      {
        prompt: "new prompt\n\nupstream text",
        images: [],
        sourceNodeIds: ["upstream"]
      }
    );
    expect(nodes[1].data).toMatchObject({ prompt: "new prompt", model: "new-model", count: 2 });
    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(edges).toHaveLength(3);
    expect(edges[2]).toMatchObject({
      id: "generated-edge",
      type: "canvasConnection",
      source: "generation",
      target: "created",
      data: { kind: "visual", label: "生成结果" }
    });
    expect(updateEdges).toHaveBeenCalledOnce();
    expect(reportCanvasChange).toHaveBeenCalledOnce();
  });

  it("keeps an invalid run local and reports the validation error without history", async () => {
    nodes = [generationNode("generation", "old")];
    workflowNodes = [generationRecord("generation", "old")];
    await render();

    await act(async () => {
      await latest!.onRunGeneration?.("generation", {
        prompt: "   ",
        model: "model",
        size: "1024x1024",
        count: 1
      });
    });

    expect(nodes[0].data).toMatchObject({ prompt: "   " });
    expect(notifyError).toHaveBeenCalledWith("请填写提示词，或连接一个有内容的文本节点。");
    expect(recordCanvasChange).not.toHaveBeenCalled();
    expect(onRun).not.toHaveBeenCalled();
    expect(updateEdges).not.toHaveBeenCalled();
    expect(reportCanvasChange).not.toHaveBeenCalled();
  });

  it("does not report when every generated result is already connected", async () => {
    nodes = [generationNode("generation", "prompt")];
    workflowNodes = [generationRecord("generation", "prompt")];
    edges = [{ id: "existing", source: "generation", target: "result" }];
    onRun.mockResolvedValue([image("result")]);
    await render();

    await act(async () => {
      await latest!.onRunGeneration?.("generation", {
        prompt: "prompt",
        model: "model",
        size: "1024x1024",
        count: 1
      });
    });

    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(updateEdges).not.toHaveBeenCalled();
    expect(reportCanvasChange).not.toHaveBeenCalled();
  });

  it("does not add result edges after the source generation node is deleted", async () => {
    nodes = [generationNode("generation", "prompt")];
    workflowNodes = [generationRecord("generation", "prompt")];
    let resolveRun!: (outputs: GeneratedImage[]) => void;
    onRun.mockReturnValue(new Promise<GeneratedImage[]>((resolve) => {
      resolveRun = resolve;
    }));
    await render();

    let run!: Promise<void>;
    await act(async () => {
      run = Promise.resolve(latest!.onRunGeneration!("generation", {
        prompt: "prompt",
        model: "model",
        size: "1024x1024",
        count: 1
      }));
      nodes = [];
      resolveRun([image("result")]);
      await run;
    });

    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(updateEdges).not.toHaveBeenCalled();
    expect(edges).toEqual([]);
    expect(reportCanvasChange).not.toHaveBeenCalled();
  });
});
