// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerationJob, VideoGenerationJob } from "@shared/types";
import { HistoryRail } from "@/components/workbench/HistoryRail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("HistoryRail video history", () => {
  it("offers cancellation only for an unsubmitted local queued task and labels unknown history explicitly", () => {
    const cancel = vi.fn(() => true);
    const unknown: GenerationJob = { id: "uncertain", status: "unknown", createdAt: "2026-10-19T00:00:00Z", prompt: "结果待确认",
      input: { workflowMode: "generate", prompt: "结果待确认", model: "fixture", size: "auto", n: 1 }, referenceImagePaths: [], outputImagePaths: [] };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(createElement(HistoryRail, {
      history: [unknown], videoHistory: [], providers: [], thumbnailFor: () => undefined, loadThumbnail: async () => undefined,
      onFocusJob: vi.fn(), onReuseJob: vi.fn(), onClear: async () => undefined, onClose: vi.fn(),
      activeTasks: [
        { id: "queued", boardId: "board", prompt: "排队请求", mode: "generate", requestedCount: 1, startedAt: 0, status: "queued", cancelQueued: cancel },
        { id: "running", boardId: "board", prompt: "已提交请求", mode: "generate", requestedCount: 1, startedAt: 0, status: "running" }
      ]
    })));
    expect(container.textContent).toContain("状态待确认");
    expect(container.textContent).toContain("尚未发送到 Provider");
    expect(container.textContent).toContain("远端取消和停费未确认");
    const buttons = [...container.querySelectorAll("button")].filter((button) => button.textContent === "取消排队");
    expect(buttons).toHaveLength(1);
    act(() => buttons[0].click());
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("shows a failed fal.ai video job with its provider, model, and error", () => {
    const failedJob: VideoGenerationJob = {
      id: "video-job-405",
      status: "failed",
      createdAt: "2026-08-12T12:00:00.000Z",
      completedAt: "2026-08-12T12:00:02.000Z",
      input: {
        prompt: "让画面中的人物自然转身",
        model: "bytedance/seedance-2.0/image-to-video",
        aspectRatio: "16:9",
        resolution: "720p",
        durationSeconds: 5,
        referenceImagePaths: ["/reference.png"]
      },
      providerId: "fal-video",
      providerName: "fal.ai",
      model: "bytedance/seedance-2.0/image-to-video",
      error: "fal.ai 请求失败（HTTP 405）。"
    };

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(createElement(HistoryRail, {
      history: [],
      videoHistory: [failedJob],
      providers: [],
      thumbnailFor: () => undefined,
      loadThumbnail: async () => undefined,
      onFocusJob: vi.fn(),
      onReuseJob: vi.fn(),
      onClear: async () => undefined,
      onClose: vi.fn()
    })));

    expect(container.textContent).toContain("1 条");
    expect(container.textContent).toContain("让画面中的人物自然转身");
    expect(container.textContent).toContain("失败");
    expect(container.textContent).toContain("fal.ai");
    expect(container.textContent).toContain("bytedance/seedance-2.0/image-to-video");
    expect(container.textContent).toContain("fal.ai 请求失败（HTTP 405）。");
  });
});
