// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VideoGenerationJob } from "@shared/types";
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
