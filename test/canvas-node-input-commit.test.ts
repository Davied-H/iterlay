// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlow, type Node } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationNode, type GenerationNodeData } from "@/components/canvas/GenerationNode";
import { VideoGenerationNode, type VideoGenerationNodeData } from "@/components/canvas/VideoGenerationNode";
import { CodeCanvasNode } from "@/components/code-canvas/CodeCanvasNode";
import { CANVAS_EDITOR_FLUSH_EVENT } from "@shared/types";
import { DEFAULT_VIDEO_PROVIDER_CONFIG } from "@shared/types";
import { TEXT_NODE_MAX_LENGTH, TextNode, type TextNodeData } from "@/components/canvas/TextNode";
import { NODE_INPUT_COMMIT_DELAY_MS } from "@/components/canvas/use-debounced-node-commit";
import { DialogShell } from "@/components/video-sequence/VideoSequenceEditor";

vi.mock("@/components/code-canvas/CodeEditor", () => ({
  default: (props: { code: string; onChange: (code: string) => void; onCommit: () => void }) => createElement("textarea", {
    "aria-label": "Canvas 代码", value: props.code,
    onChange: (event: { target: { value: string } }) => props.onChange(event.target.value), onBlur: props.onCommit
  })
}));

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
  vi.useRealTimers();
});

function renderNode(node: Node, nodeTypes: Record<string, typeof CodeCanvasNode | typeof TextNode | typeof GenerationNode | typeof VideoGenerationNode>): void {
  container = document.createElement("div");
  container.style.width = "800px";
  container.style.height = "600px";
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ReactFlow, { nodes: [node], edges: [], nodeTypes }));
  });
}

function enterValue(element: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function videoData(overrides: Partial<VideoGenerationNodeData> = {}): VideoGenerationNodeData {
  return {
    prompt: "", model: DEFAULT_VIDEO_PROVIDER_CONFIG.model,
    providerId: DEFAULT_VIDEO_PROVIDER_CONFIG.id, providerOptions: [DEFAULT_VIDEO_PROVIDER_CONFIG],
    duration: 5, aspectRatio: "16:9", resolution: "720p", generateAudio: false,
    ...overrides
  };
}

function videoNode(data: VideoGenerationNodeData): Node {
  return { id: "video-1", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> };
}

describe("canvas node input commits", () => {
  it("flushes pending Canvas code before a workspace save without losing the edit to callback replacement", async () => {
    vi.useFakeTimers();
    const original = vi.fn();
    const replacement = vi.fn();
    const node: Node = { id: "canvas-1", type: "codeCanvasNode", position: { x: 0, y: 0 }, data: { code: "before", framework: "html", onChange: original } };
    await act(async () => { renderNode(node, { codeCanvasNode: CodeCanvasNode }); });
    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="Canvas 代码"]')!;
    act(() => enterValue(textarea, "latest manual code"));
    expect(original).not.toHaveBeenCalled();
    act(() => root?.render(createElement(ReactFlow, { nodes: [{ ...node, data: { ...node.data, onChange: replacement } }], edges: [], nodeTypes: { codeCanvasNode: CodeCanvasNode } })));
    act(() => window.dispatchEvent(new Event(CANVAS_EDITOR_FLUSH_EVENT)));
    expect(replacement).toHaveBeenCalledWith("canvas-1", { code: "latest manual code" });
    expect(original).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(replacement).toHaveBeenCalledTimes(1);
  });

  it("preserves a pending video prompt when the canvas replaces callbacks", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const replacement = vi.fn();
    const data = videoData({ onChange });
    const node = videoNode(data);
    const nodeTypes = { videoGenerationNode: VideoGenerationNode };
    renderNode(node, nodeTypes);
    const textarea = document.querySelector<HTMLTextAreaElement>("#video-prompt-video-1")!;
    act(() => enterValue(textarea, "镜头缓慢向前移动"));
    expect(textarea.value).toBe("镜头缓慢向前移动");
    expect(onChange).not.toHaveBeenCalled();
    act(() => root?.render(createElement(ReactFlow, {
      nodes: [{ ...node, data: { ...data, onChange: replacement } }], edges: [], nodeTypes
    })));
    expect(textarea.value).toBe("镜头缓慢向前移动");
    act(() => vi.advanceTimersByTime(NODE_INPUT_COMMIT_DELAY_MS));
    expect(replacement).toHaveBeenCalledWith("video-1", expect.objectContaining({ prompt: "镜头缓慢向前移动" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps rapid video typing local and commits only the final value", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    renderNode(videoNode(videoData({ onChange })), { videoGenerationNode: VideoGenerationNode });
    const textarea = document.querySelector<HTMLTextAreaElement>("#video-prompt-video-1")!;
    for (const value of ["镜", "镜头", "镜头推进"]) {
      act(() => enterValue(textarea, value));
      expect(textarea.value).toBe(value);
      act(() => vi.advanceTimersByTime(100));
      expect(onChange).not.toHaveBeenCalled();
    }
    act(() => vi.advanceTimersByTime(NODE_INPUT_COMMIT_DELAY_MS));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("video-1", expect.objectContaining({ prompt: "镜头推进" }));
  });

  it("flushes the newest video draft when generating before debounce completes", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onRun = vi.fn();
    renderNode(videoNode(videoData({ onChange, onRun })), { videoGenerationNode: VideoGenerationNode });
    const textarea = document.querySelector<HTMLTextAreaElement>("#video-prompt-video-1")!;
    act(() => enterValue(textarea, "最新的视频描述"));
    act(() => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })));
    const expected = expect.objectContaining({ prompt: "最新的视频描述" });
    expect(onChange).toHaveBeenCalledWith("video-1", expected);
    expect(onRun).toHaveBeenCalledWith("video-1", expected);
  });

  it("does not generate while confirming Chinese IME text", () => {
    const onRun = vi.fn();
    renderNode(videoNode(videoData({ prompt: "镜头", onRun })), { videoGenerationNode: VideoGenerationNode });
    const textarea = document.querySelector<HTMLTextAreaElement>("#video-prompt-video-1")!;
    act(() => textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    act(() => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })));
    expect(onRun).not.toHaveBeenCalled();
    act(() => textarea.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
    act(() => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })));
    expect(onRun).toHaveBeenCalledOnce();
  });

  it("still applies an external video prompt edit and cancels the obsolete local commit", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const data = videoData({ onChange });
    const nodeTypes = { videoGenerationNode: VideoGenerationNode };
    renderNode(videoNode(data), nodeTypes);
    const textarea = document.querySelector<HTMLTextAreaElement>("#video-prompt-video-1")!;
    act(() => enterValue(textarea, "尚未提交"));
    act(() => root?.render(createElement(ReactFlow, {
      nodes: [videoNode({ ...data, prompt: "助手更新的视频描述" })], edges: [], nodeTypes
    })));
    expect(textarea.value).toBe("助手更新的视频描述");
    act(() => vi.advanceTimersByTime(NODE_INPUT_COMMIT_DELAY_MS));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not create history when an input is only focused and blurred", () => {
    const onBeforeChange = vi.fn();
    const onChange = vi.fn();
    const data: TextNodeData = { text: "未修改", onBeforeChange, onChange };
    renderNode({ id: "text-1", type: "textNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { textNode: TextNode });

    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="文本内容"]')!;
    act(() => {
      textarea.focus();
      textarea.blur();
    });

    expect(onBeforeChange).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("records history once for all changes in one focus session", () => {
    vi.useFakeTimers();
    const onBeforeChange = vi.fn();
    const data: TextNodeData = { text: "", onBeforeChange, onChange: vi.fn() };
    renderNode({ id: "text-1", type: "textNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { textNode: TextNode });

    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="文本内容"]')!;
    act(() => {
      textarea.focus();
      enterValue(textarea, "一");
      enterValue(textarea, "一次会话");
    });
    expect(onBeforeChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersToNextFrame());
    expect(onBeforeChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersToNextFrame());
    expect(onBeforeChange).toHaveBeenCalledOnce();

    act(() => textarea.blur());
    act(() => {
      textarea.focus();
      enterValue(textarea, "第二次会话");
    });
    expect(onBeforeChange).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersToNextFrame());
    act(() => vi.advanceTimersToNextFrame());
    expect(onBeforeChange).toHaveBeenCalledTimes(2);
  });

  it("records history before an immediate blur commit", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const data: TextNodeData = {
      text: "",
      onBeforeChange: () => calls.push("history"),
      onChange: () => calls.push("commit")
    };
    renderNode({ id: "text-1", type: "textNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { textNode: TextNode });

    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="文本内容"]')!;
    act(() => {
      textarea.focus();
      enterValue(textarea, "立即失焦");
    });
    expect(calls).toEqual([]);

    act(() => textarea.blur());
    expect(calls).toEqual(["history", "commit"]);
    act(() => vi.advanceTimersByTime(NODE_INPUT_COMMIT_DELAY_MS));
    expect(calls).toEqual(["history", "commit"]);
  });

  it("keeps text keystrokes local and commits after the debounce window", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const data: TextNodeData = { text: "", onChange };
    renderNode({ id: "text-1", type: "textNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { textNode: TextNode });

    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="文本内容"]');
    expect(textarea).not.toBeNull();
    act(() => enterValue(textarea!, "最新草稿"));
    expect(onChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(NODE_INPUT_COMMIT_DELAY_MS - 1));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("text-1", "最新草稿");
  });

  it("exposes the focused-writing limit and autosave metadata", () => {
    const data: TextNodeData = { text: "长文本" };
    renderNode({ id: "text-1", type: "textNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { textNode: TextNode });

    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="文本内容"]');
    expect(textarea?.maxLength).toBe(TEXT_NODE_MAX_LENGTH);
    expect(document.querySelector(".canvas-workflow-node__meta")?.textContent).toContain("自动保存");
    expect(document.querySelector(".canvas-workflow-node__count")?.textContent).toContain(`3 / ${TEXT_NODE_MAX_LENGTH}`);
  });

  it("flushes the latest generation config before running", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onRun = vi.fn();
    const data: GenerationNodeData = {
      prompt: "旧提示词",
      model: "gpt-image-1",
      size: "1024x1024",
      count: 1,
      onChange,
      onRun
    };
    renderNode({ id: "generation-1", type: "generationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { generationNode: GenerationNode });

    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="生成提示词"]');
    const runButton = document.querySelector<HTMLButtonElement>('[aria-label="运行生成节点"]');
    act(() => enterValue(textarea!, "刚输入的提示词"));
    expect(onChange).not.toHaveBeenCalled();

    act(() => runButton?.click());
    const expected = expect.objectContaining({ prompt: "刚输入的提示词" });
    expect(onChange).toHaveBeenCalledWith("generation-1", expected);
    expect(onRun).toHaveBeenCalledWith("generation-1", expected);
  });

  it("traps sequence dialog focus, closes on Escape, and restores the opener", async () => {
    const opener = document.createElement("button"); opener.textContent = "打开"; document.body.append(opener); opener.focus();
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    const onClose = vi.fn();
    await act(async () => { root?.render(createElement(DialogShell, { open: true, title: "确认", icon: createElement("span"), onClose }, createElement("div", null, createElement("button", { id: "first" }, "第一个"), createElement("button", { id: "last" }, "最后一个")))); await new Promise((resolve) => requestAnimationFrame(resolve)); });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("关闭");
    document.querySelector<HTMLButtonElement>("#last")?.focus();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("关闭");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root?.unmount()); root = null;
    expect(document.activeElement).toBe(opener); opener.remove();
  });

  it("requires explicit adoption for a comic frame result", () => {
    const onAdopt = vi.fn();
    const data: GenerationNodeData = { prompt: "首帧", model: "gpt-image-1", size: "1024x1024", count: 1, comicFrameRole: "first-frame", latestGenerationId: "job-v2", lastGenerationId: "job-v1", onAdopt };
    renderNode({ id: "generation-1", type: "generationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { generationNode: GenerationNode });
    const adopt = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("采用此版本"));
    expect(adopt).toBeDefined();
    act(() => adopt?.click());
    expect(onAdopt).toHaveBeenCalledWith("generation-1", "job-v2");
  });

  it("routes pasted clipboard images to generation references without changing prompt text", () => {
    const onPasteReferenceImages = vi.fn();
    const data: GenerationNodeData = {
      prompt: "保留的提示词",
      model: "gpt-image-1",
      size: "1024x1024",
      count: 1,
      onPasteReferenceImages
    };
    renderNode({ id: "generation-1", type: "generationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { generationNode: GenerationNode });
    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="生成提示词"]')!;
    const file = new File(["image"], "clipboard.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [{ kind: "file", type: file.type, getAsFile: () => file }],
        files: []
      }
    });

    act(() => textarea.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(onPasteReferenceImages).toHaveBeenCalledWith("generation-1", [file]);
    expect(textarea.value).toBe("保留的提示词");
  });

  it("keeps selected node handles discoverable and supports keyboard connection creation", () => {
    const onConnectionHandlePointerDown = vi.fn();
    const data: TextNodeData = { text: "", onConnectionHandlePointerDown };
    renderNode({
      id: "text-1",
      type: "textNode",
      position: { x: 0, y: 0 },
      selected: true,
      data: data as unknown as Record<string, unknown>
    }, { textNode: TextNode });

    expect(document.querySelector('[data-text-node]')?.getAttribute("data-selected")).toBe("true");
    const connectionButton = document.querySelector<HTMLButtonElement>('[aria-label="从右侧创建连接"]');
    expect(connectionButton).not.toBeNull();
    act(() => connectionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    expect(onConnectionHandlePointerDown).toHaveBeenCalledWith("text-1", "right", 0, 0, null);
  });

  it("announces generation progress and exposes the AI semantic state", () => {
    const data: GenerationNodeData = {
      prompt: "生成海报",
      model: "gpt-image-1",
      size: "1024x1024",
      count: 1,
      status: "running"
    };
    renderNode({ id: "generation-1", type: "generationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { generationNode: GenerationNode });

    const status = document.querySelector<HTMLElement>('[data-generation-node-status="running"]');
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toContain("生成中");
  });

  it("renders real upstream context inside the generation composer", () => {
    const data: GenerationNodeData = {
      prompt: "补充本次变化",
      model: "gpt-image-1",
      size: "1024x1024",
      count: 1,
      upstreamPrompt: "上游文本提示词",
      referenceImages: [{
        id: "reference-1",
        path: "/tmp/reference.png",
        dataUrl: "data:image/png;base64,AA==",
        jobId: "job-reference-1"
      }]
    };
    renderNode({ id: "generation-1", type: "generationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { generationNode: GenerationNode });

    expect(document.querySelector(".canvas-generation-reference")?.textContent).toContain("上游文本提示词");
    expect(document.querySelectorAll(".canvas-generation-thumb")).toHaveLength(1);
    expect(document.querySelector(".canvas-generation-summary")?.textContent).toBe("1 条引用 · 1 张参考图");
  });
});
