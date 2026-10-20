// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlow, type Node, type NodeTypes } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoGenerationNode, type VideoGenerationNodeData } from "@/components/canvas/VideoGenerationNode";
import {
  isVideoControlPointer,
  resolveVideoInteractionPresentation,
  resolveVideoPreload,
  VideoNode,
  type VideoNodeData
} from "@/components/canvas/VideoNode";
import { videoAspectRatio } from "@/components/canvas/video-node-model";
import { NODE_INPUT_COMMIT_DELAY_MS } from "@/components/canvas/use-debounced-node-commit";

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

function renderCanvasNode(node: Node, nodeTypes: NodeTypes): void {
  container = document.createElement("div");
  container.style.width = "900px";
  container.style.height = "760px";
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(ReactFlow, { nodes: [node], edges: [], nodeTypes })));
}

function buttonByLabel(label: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

async function openVideoModelMenu(): Promise<void> {
  await act(async () => {
    buttonByLabel("选择视频模型").dispatchEvent(new MouseEvent("pointerdown", {
      bubbles: true,
      button: 0
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function openVideoProviderSubmenu(providerName: string): Promise<HTMLButtonElement[]> {
  const provider = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((item) => item.textContent?.includes(providerName));
  expect(provider).toBeDefined();
  provider!.focus();
  await act(async () => {
    provider!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(`[aria-label="${providerName}的视频模型"] [role="menuitem"]`)
  );
}

describe("video canvas node UI", () => {
  it.each(["draft", "failed"] as const)("blocks blank HappyHorse descriptions with a first frame in %s state", async (status) => {
    const onRun = vi.fn();
    const onRetry = vi.fn();
    const data: VideoGenerationNodeData = {
      prompt: "  ", model: "alibaba/happyhorse-1.1", providerId: "openrouter",
      providerOptions: [{ id: "openrouter", type: "openrouter", name: "OpenRouter",
        model: "alibaba/happyhorse-1.1", baseUrl: "https://openrouter.ai/api" }],
      duration: 5, aspectRatio: "16:9", resolution: "720p", generateAudio: false,
      status, onRun, onRetry,
      startFrame: { id: "first", jobId: "first-job", path: "/first.png", dataUrl: "data:image/png;base64,AA==" }
    };
    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 },
      data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });
    const run = document.querySelector<HTMLButtonElement>(".canvas-generation-run")!;
    const prompt = document.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(run.disabled).toBe(true);
    expect(prompt.getAttribute("aria-required")).toBe("true");
    expect(document.body.textContent).toContain("当前模型需要视频描述");
    expect(prompt.getAttribute("aria-invalid")).toBeNull();
    const hint = document.getElementById(prompt.getAttribute("aria-describedby")!);
    expect(hint?.closest("footer")).not.toBeNull();
    expect(hint?.textContent).toContain("先填写视频描述");
    expect(hint?.getAttribute("role")).not.toBe("alert");
    expect(document.querySelector(".video-generation-prompt-section [role='alert']")).toBeNull();
    await act(async () => {
      run.click();
      prompt.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
    });
    expect(onRun).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(prompt, "镜头缓慢推进");
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(run.disabled).toBe(false);
    expect(document.querySelector(".video-generation-prompt-hint")).toBeNull();
    await act(async () => run.click());
    expect(status === "failed" ? onRetry : onRun).toHaveBeenCalledWith("generator", expect.objectContaining({ prompt: "镜头缓慢推进" }));
  });

  it("uses catalog parameter choices and repairs incompatible saved Veo settings before retry", async () => {
    const onChange = vi.fn();
    const onRetry = vi.fn();
    const data: VideoGenerationNodeData = {
      prompt: "海边日落", providerId: "openrouter", model: "google/veo-3.1-fast",
      duration: 10, aspectRatio: "1:1", resolution: "480p", generateAudio: true,
      status: "failed", onChange, onRetry,
      providerOptions: [{
        id: "openrouter", type: "openrouter", name: "OpenRouter", model: "google/veo-3.1-fast",
        models: ["google/veo-3.1-fast"], baseUrl: "https://openrouter.ai/api",
        modelOptions: [{ id: "google/veo-3.1-fast", supportedDurations: [4, 6, 8],
          supportedRatios: ["16:9", "9:16"], supportedResolutions: ["720p", "1080p", "4K"] }]
      }]
    };
    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 },
      data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });
    expect(document.body.textContent).toContain("4s");
    expect(document.body.textContent).toContain("6s");
    expect(document.body.textContent).toContain("8s");
    expect(document.body.textContent).not.toContain("10s");
    expect(document.body.textContent).not.toContain("480p");
    expect(onChange).toHaveBeenCalledWith("generator", expect.objectContaining({
      duration: 8, aspectRatio: "16:9", resolution: "720p"
    }));
    const retry = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("重试"));
    await act(async () => retry!.click());
    expect(onRetry).toHaveBeenCalledWith("generator", expect.objectContaining({ duration: 8, aspectRatio: "16:9", resolution: "720p" }));
  });

  it("reveals semantic video targets while an image connection is active", () => {
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "",
      model: "seedance",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: false,
      connectionTargetActive: true,
      compatibleConnectionHandles: [
        "target-start-frame",
        "target-end-frame",
        "target-reference"
      ],
      connectionSnapTargetHandle: "target-end-frame"
    };

    renderCanvasNode({
      id: "generator",
      type: "videoGenerationNode",
      position: { x: 0, y: 0 },
      data: data as unknown as Record<string, unknown>
    }, { videoGenerationNode: VideoGenerationNode });

    const node = document.querySelector("[data-video-generation-node]");
    expect(node?.getAttribute("data-connection-target-active")).toBe("true");
    expect(node?.getAttribute("data-connection-snap-target")).toBe("target-end-frame");
    expect(document.querySelector(".video-generation-port-label--start")?.textContent).toBe("首帧");
    expect(document.querySelector(".video-generation-port-label--end")?.textContent).toBe("尾帧");
    expect(document.querySelector(".video-generation-port-label--reference")?.textContent).toBe("参考图");
    expect(document.querySelector(".video-generation-port-label--end")?.classList.contains("is-snapped")).toBe(true);
    expect(document.querySelector(".video-generation-port-label--video-reference")?.classList.contains("is-compatible")).toBe(false);
  });

  it("distinguishes local downloading from upstream generation", () => {
    renderCanvasNode({
      id: "video",
      type: "videoNode",
      position: { x: 0, y: 0 },
      data: {
        video: {
          id: "video",
          path: "",
          dataUrl: "",
          status: "post_processing"
        }
      }
    }, { videoNode: VideoNode });

    expect(document.querySelector('[role="status"]')?.textContent).toContain("下载中");
    expect(document.querySelector(".video-node-placeholder")?.textContent).toContain("视频已生成，正在下载到本机");
  });

  it("keeps the video body draggable while reserving the bottom controls", () => {
    const rect = { top: 100, bottom: 300, height: 200 } as DOMRect;
    expect(isVideoControlPointer(200, rect)).toBe(false);
    expect(isVideoControlPointer(247, rect)).toBe(false);
    expect(isVideoControlPointer(248, rect)).toBe(true);
    expect(isVideoControlPointer(300, rect)).toBe(true);
  });

  it("uses a lightweight poster-only presentation while dragging", () => {
    expect(resolveVideoInteractionPresentation(true, true, true)).toEqual({
      showToolbar: false,
      showNativeControls: false
    });

    renderCanvasNode({
      id: "video",
      type: "videoNode",
      position: { x: 0, y: 0 },
      selected: true,
      data: {
        video: {
          id: "video",
          path: "/video.mp4",
          dataUrl: "video:source",
          posterDataUrl: "image:poster",
          status: "completed"
        }
      }
    }, { videoNode: VideoNode });

    expect(document.querySelector<HTMLVideoElement>("[data-video-node] video")?.controls).toBe(false);
    expect(document.querySelector<HTMLImageElement>(".video-node-drag-poster")?.src).toBe("image:poster");
  });

  it("preloads video metadata only for selected, interactive, or playing nodes", () => {
    expect(resolveVideoPreload(false, false, false, false)).toBe("none");
    expect(resolveVideoPreload(true, false, false, false)).toBe("metadata");
    expect(resolveVideoPreload(false, true, false, false)).toBe("metadata");
    expect(resolveVideoPreload(false, false, false, true)).toBe("metadata");
  });

  it("uses the requested aspect ratio when decoded video dimensions are unavailable", () => {
    expect(videoAspectRatio({ aspectRatio: "1:1" })).toBe(1);
    expect(videoAspectRatio({ width: 1280, height: 720, aspectRatio: "1:1" })).toBeCloseTo(16 / 9);
    expect(videoAspectRatio({ aspectRatio: "9:16" })).toBeCloseTo(9 / 16);
    expect(videoAspectRatio({ aspectRatio: "invalid" })).toBeCloseTo(16 / 9);
  });

  it("selects and persists the aspect ratio inferred from the connected frame", () => {
    const onChange = vi.fn();
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "自然过渡",
      model: "seedance",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: false,
      startFrame: {
        id: "square-start",
        path: "/square.png",
        dataUrl: "image:square",
        jobId: "job-square",
        width: 1024,
        height: 1024
      },
      onChange
    };

    renderCanvasNode({
      id: "generator",
      type: "videoGenerationNode",
      position: { x: 0, y: 0 },
      data: data as unknown as Record<string, unknown>
    }, { videoGenerationNode: VideoGenerationNode });

    expect(document.querySelector<HTMLInputElement>('input[aria-label="画幅"]')?.value).toBe("1:1");
    expect(onChange).toHaveBeenCalledWith("generator", { aspectRatio: "1:1" });
  });

  it("opens the connected frame in the image preview", async () => {
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "自然过渡",
      model: "seedance",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: false,
      startFrame: {
        id: "preview-start",
        path: "",
        dataUrl: "data:image/png;base64,cHJldmlldw==",
        jobId: "job-preview",
        width: 1024,
        height: 1024
      }
    };

    renderCanvasNode({
      id: "generator",
      type: "videoGenerationNode",
      position: { x: 0, y: 0 },
      data: data as unknown as Record<string, unknown>
    }, { videoGenerationNode: VideoGenerationNode });

    const previewButton = buttonByLabel("预览首帧预览");
    expect(previewButton).toBeTruthy();

    await act(async () => previewButton.click());

    expect(document.querySelector('img[alt="首帧预览"]')).toBeTruthy();
    expect(buttonByLabel("关闭图片预览")).toBeTruthy();
    expect(document.querySelector("aside")).toBeNull();
    expect(buttonByLabel("图片信息")).toBeNull();
  });

  it("blocks comic first-last generation when model capability is unknown", () => {
    const data: VideoGenerationNodeData = {
      mode: "generate", prompt: "自然过渡", providerId: "provider", model: "opaque-model",
      providerOptions: [{ id: "provider", name: "自定义服务", type: "openrouter", baseUrl: "https://example.test", model: "opaque-model" }],
      requiresFirstLastFrame: true, duration: 5, aspectRatio: "16:9", resolution: "720p", generateAudio: false,
      startFrame: { id: "first", path: "/first.png", dataUrl: "image:first", jobId: "first" },
      endFrame: { id: "last", path: "/last.png", dataUrl: "image:last", jobId: "last" }
    };
    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("能力未知");
    expect(document.querySelector<HTMLButtonElement>(".canvas-generation-run")?.disabled).toBe(true);
  });

  it("shows mode, video reference port, and audio attachment actions", () => {
    const onChooseAudio = vi.fn();
    const onRemoveAudio = vi.fn();
    const data: VideoGenerationNodeData = {
      mode: "remix",
      prompt: "保持主体并改变镜头运动",
      providerId: "ark-video",
      sourceVideoPath: "/source.mp4",
      model: "seedance",
      providerOptions: [
        { id: "ark-video", name: "火山方舟", type: "ark", baseUrl: "https://ark.example", model: "seedance" }
      ],
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: true,
      referenceVideos: [{ id: "source", name: "source.mp4", path: "/source.mp4", durationMs: 8_000 }],
      referenceAudios: [{ id: "voice", name: "voice.wav", path: "/voice.wav", durationMs: 3_000 }],
      onChooseAudio,
      onRemoveAudio
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });

    expect(document.querySelector<HTMLButtonElement>('.video-generation-mode button[aria-pressed="true"]')?.textContent).toBe("改编");
    expect(document.querySelector(".video-generation-mode-detail")?.textContent).toContain("结果保存为原视频的新版本");
    expect(document.querySelector('.video-generation-port--video-reference')).not.toBeNull();
    expect(document.querySelector('.video-generation-video-reference')?.textContent).toContain("source.mp4");
    expect(document.querySelector('.video-generation-video-reference')?.textContent).toContain("源视频");
    expect(document.querySelector('.video-generation-audio-chip')?.textContent).toContain("voice.wav");
    expect(document.querySelector<HTMLButtonElement>(".canvas-generation-run")?.textContent).toContain("生成新版本");

    act(() => buttonByLabel("移除参考音频 voice.wav").click());
    act(() => document.querySelector<HTMLButtonElement>(".video-generation-audio-add")?.click());

    expect(onRemoveAudio).toHaveBeenCalledWith("generator", data.referenceAudios?.[0]);
    expect(onChooseAudio).toHaveBeenCalledWith("generator");
  });

  it("exposes extend, remix, version switching, and accessible two-version comparison", async () => {
    const versions = [
      { id: "v1", path: "/v1.mp4", dataUrl: "video:v1", durationMs: 5_000, version: 1 },
      { id: "v2", path: "/v2.mp4", dataUrl: "video:v2", durationMs: 7_000, version: 2 }
    ];
    const onExtend = vi.fn();
    const onRemix = vi.fn();
    const onSelectVersion = vi.fn();
    const onCompareVersions = vi.fn();
    const data: VideoNodeData = {
      video: versions[1],
      versions,
      activeVersionIndex: 1,
      onExtend,
      onRemix,
      onSelectVersion,
      onCompareVersions
    };

    renderCanvasNode({ id: "video", type: "videoNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoNode: VideoNode });

    expect(document.querySelector(".video-node-header")).toBeNull();
    expect(document.querySelector(".video-node-footer")).toBeNull();
    expect(document.querySelector('[role="toolbar"][aria-label="视频操作"]')).toBeNull();
    expect(document.querySelector<HTMLVideoElement>("[data-video-node] video")?.controls).toBe(false);
    expect(document.querySelector<HTMLVideoElement>("[data-video-node] video")?.preload).toBe("none");
    act(() => {
      document.querySelector("[data-video-node]")?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });
    expect(document.querySelector('[role="toolbar"][aria-label="视频操作"]')?.textContent).toContain("0:07");
    expect(document.querySelector<HTMLVideoElement>("[data-video-node] video")?.controls).toBe(true);
    expect(document.querySelector<HTMLVideoElement>("[data-video-node] video")?.preload).toBe("metadata");
    act(() => buttonByLabel("继续视频").click());
    act(() => buttonByLabel("改编视频").click());
    expect(onExtend).toHaveBeenCalledWith(versions[1]);
    expect(onRemix).toHaveBeenCalledWith(versions[1]);

    await act(async () => buttonByLabel("选择视频版本，当前版本 2").click());
    const options = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    expect(options).toHaveLength(2);
    act(() => options[0].click());
    expect(onSelectVersion).toHaveBeenCalledWith(versions[0], 0);

    await act(async () => buttonByLabel("选择视频版本，当前版本 2").click());
    const compareButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "比较")!;
    act(() => compareButton.click());
    expect(onCompareVersions).toHaveBeenCalledWith(versions[0], versions[1]);
    expect(document.querySelector('[aria-label="对比版本 A"]')).toBeNull();
    expect(document.querySelector('[aria-label="对比版本 B"]')).toBeNull();
  });

  it("lets users choose remix or extend before connecting a source video", () => {
    const data: VideoGenerationNodeData = {
      mode: "generate",
      advancedVideoModesEnabled: true,
      prompt: "镜头向前推进",
      providerId: "ark-video",
      model: "seedance",
      providerOptions: [
        { id: "ark-video", name: "火山方舟", type: "ark", baseUrl: "https://ark.example", model: "seedance" }
      ],
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: false
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });

    const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".video-generation-mode button"));
    expect(modeButtons.map((button) => button.textContent)).toEqual(["新建", "改编", "继续"]);
    expect(modeButtons[0].disabled).toBe(false);
    expect(modeButtons[1].disabled).toBe(false);
    expect(modeButtons[1].title).toContain("连接一个源视频");
    expect(modeButtons[2].disabled).toBe(false);
    expect(document.querySelector(".video-generation-mode-detail")?.textContent).toContain("创建一个全新视频");
    expect(document.querySelector(".video-generation-prompt-section label")?.textContent).toBe("视频描述");

    act(() => modeButtons[1].click());
    expect(document.querySelector(".video-generation-mode-detail")?.textContent).toContain("请连接一个源视频");
    expect(document.querySelector(".video-generation-prompt-section label")?.textContent).toBe("改编要求");
    expect(document.querySelector<HTMLButtonElement>(".canvas-generation-run")?.disabled).toBe(true);
  });

  it("hides advanced video modes by default", () => {
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "镜头向前推进",
      providerId: "ark-video",
      model: "seedance",
      providerOptions: [
        { id: "ark-video", name: "火山方舟", type: "ark", baseUrl: "https://ark.example", model: "seedance" }
      ],
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: false
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });

    expect(document.querySelector(".video-generation-mode")).toBeNull();
    expect(document.querySelector(".video-generation-mode-detail")).toBeNull();
    expect(document.querySelector("[data-video-generation-node]")?.getAttribute("data-advanced-video-modes")).toBe("false");
    expect(document.querySelector(".video-generation-prompt-section label")?.textContent).toBe("视频描述");
  });

  it("accepts a connected video as the source for remix", () => {
    const data: VideoGenerationNodeData = {
      mode: "remix",
      prompt: "改成夜景",
      providerId: "ark-video",
      model: "seedance",
      providerOptions: [
        { id: "ark-video", name: "火山方舟", type: "ark", baseUrl: "https://ark.example", model: "seedance" }
      ],
      referenceVideos: [{ id: "connected", name: "connected.mp4", path: "/connected.mp4" }],
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: false
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });

    expect(document.querySelector(".video-generation-mode-detail")?.textContent).toContain("结果保存为原视频的新版本");
    expect(document.querySelector(".video-generation-video-reference small")?.textContent).toContain("源视频");
    expect(document.querySelector<HTMLButtonElement>(".canvas-generation-run")?.disabled).toBe(false);
  });

  it("explains when the selected provider cannot remix a source video", () => {
    const data: VideoGenerationNodeData = {
      mode: "remix",
      prompt: "改成夜景",
      providerId: "official-video",
      sourceVideoPath: "/source.mp4",
      model: "官方视频模型",
      providerOptions: [
        { id: "official-video", name: "Iterlay 官方", type: "official", baseUrl: "", model: "官方视频模型" }
      ],
      referenceVideos: [{ id: "source", name: "source.mp4", path: "/source.mp4" }],
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: false
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });

    expect(document.querySelector(".video-generation-mode-detail")?.textContent).toContain("Iterlay 官方暂不支持改编视频");
    expect(document.querySelector<HTMLButtonElement>(".canvas-generation-run")?.disabled).toBe(true);
  });

  it("blocks generation when semantic image references exceed the provider limit", () => {
    const onRun = vi.fn();
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "多参考视频",
      model: "seedance",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: true,
      referenceImages: Array.from({ length: 10 }, (_, index) => ({
        id: `reference-${index}`,
        path: `/reference-${index}.png`,
        dataUrl: `image:${index}`,
        jobId: `job-${index}`
      })),
      onRun
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("最多接收 9 张参考图");
    expect(document.querySelector<HTMLButtonElement>(".canvas-generation-run")?.disabled).toBe(true);
  });

  it("selects a configured video provider and model atomically", async () => {
    const onChange = vi.fn();
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "镜头向前推进",
      providerId: "ark-video",
      model: "doubao-seedance-1-5-pro-250528",
      providerOptions: [
        { id: "official-video", name: "Iterlay 官方", type: "official", baseUrl: "", model: "官方视频模型" },
        { id: "ark-video", name: "火山方舟", type: "ark", baseUrl: "https://ark.example", model: "doubao-seedance-1-5-pro-250528", models: ["doubao-seedance-1-5-pro-250528", "doubao-seedance-2-0-pro"] },
        { id: "fal-video", name: "fal.ai 视频", type: "fal", baseUrl: "https://queue.fal.run", model: "fal-ai/kling-video/v2.1/standard/text-to-video" }
      ],
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: true,
      onChange
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });

    expect(document.querySelector('input[aria-label="视频生成模型"]')).toBeNull();
    await openVideoModelMenu();
    let options = await openVideoProviderSubmenu("火山方舟");
    expect(options).toHaveLength(2);
    expect(options[0].querySelector("svg")).not.toBeNull();

    await act(async () => {
      options[1].click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, NODE_INPUT_COMMIT_DELAY_MS + 50)));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("generator", expect.objectContaining({
      providerId: "ark-video",
      model: "doubao-seedance-2-0-pro"
    }));
    expect(buttonByLabel("选择视频模型").textContent).toContain("doubao-seedance-2-0-pro");

    await openVideoModelMenu();
    options = await openVideoProviderSubmenu("fal.ai 视频");
    await act(async () => {
      options[0].click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, NODE_INPUT_COMMIT_DELAY_MS + 50)));
    expect(onChange).toHaveBeenLastCalledWith("generator", expect.objectContaining({
      providerId: "fal-video",
      model: "fal-ai/kling-video/v2.1/standard/text-to-video"
    }));
  });

  it("shows the remaining gold beans and official video rate", async () => {
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "镜头向前推进",
      providerId: "official-video",
      model: "官方视频模型",
      providerOptions: [
        { id: "official-video", name: "Iterlay 官方", type: "official", baseUrl: "", model: "官方视频模型" },
        { id: "ark-video", name: "火山方舟", type: "ark", baseUrl: "https://ark.example", model: "seedance" }
      ],
      goldBeanBalance: 995_918,
      goldBeanLoading: false,
      videoGoldBeanCostPerSecond: 2,
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: true
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });
    await openVideoModelMenu();

    const officialProvider = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("Iterlay 官方"));
    expect(officialProvider?.textContent).toContain("余额 995918");
    const options = await openVideoProviderSubmenu("Iterlay 官方");
    expect(options[0].textContent).toContain("2 金豆/秒");
  });

  it("marks a removed model as unavailable without silently changing providers", async () => {
    const onChange = vi.fn();
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "镜头向前推进",
      providerId: "ark-video",
      model: "removed-model",
      providerOptions: [
        { id: "ark-video", name: "名字很长的火山方舟视频供应商", type: "ark", baseUrl: "https://ark.example", model: "seedance-current", models: ["seedance-current"] }
      ],
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: true,
      onChange
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });

    expect(buttonByLabel("选择视频模型").textContent).toContain("模型不可用");
    expect(document.querySelector<HTMLButtonElement>(".canvas-generation-run")?.disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();

    await openVideoModelMenu();
    expect(Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .some((item) => item.textContent?.includes("名字很长的火山方舟视频供应商"))).toBe(true);
  });

  it("marks a removed video connection as unavailable and blocks generation", () => {
    const onRun = vi.fn();
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "镜头向前推进",
      providerId: "removed-video",
      model: "removed/model",
      providerOptions: [
        { id: "official-video", name: "Iterlay 官方", type: "official", baseUrl: "", model: "官方视频模型" }
      ],
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: true,
      onRun
    };

    renderCanvasNode({ id: "generator", type: "videoGenerationNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoGenerationNode: VideoGenerationNode });

    expect(buttonByLabel("选择视频模型").textContent).toContain("连接不可用");
    expect(document.querySelector<HTMLButtonElement>(".canvas-generation-run")?.disabled).toBe(true);
  });

  it("toggles generated audio without a composed-ref update loop", async () => {
    const onChange = vi.fn();
    const data: VideoGenerationNodeData = {
      mode: "generate",
      prompt: "镜头向前推进",
      providerId: "ark-video",
      model: "seedance",
      providerOptions: [
        { id: "ark-video", name: "火山方舟", type: "ark", baseUrl: "https://ark.example", model: "seedance" }
      ],
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      generateAudio: false,
      onChange
    };

    renderCanvasNode({
      id: "generator",
      type: "videoGenerationNode",
      position: { x: 0, y: 0 },
      data: data as unknown as Record<string, unknown>
    }, { videoGenerationNode: VideoGenerationNode });

    const audioSwitch = document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="生成声音"]')!;
    expect(audioSwitch.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      audioSwitch.click();
      await new Promise((resolve) => window.setTimeout(resolve, NODE_INPUT_COMMIT_DELAY_MS + 50));
    });

    expect(audioSwitch.getAttribute("aria-checked")).toBe("true");
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("generator", expect.objectContaining({ generateAudio: true }));
  });

  it("toggles native video mute with the M key", () => {
    const data: VideoNodeData = {
      video: { id: "video", path: "/video.mp4", dataUrl: "video:test" }
    };
    renderCanvasNode({ id: "video", type: "videoNode", position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }, { videoNode: VideoNode });
    const player = document.querySelector<HTMLVideoElement>("video")!;

    act(() => player.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true })));

    expect(player.muted).toBe(true);
  });
});
