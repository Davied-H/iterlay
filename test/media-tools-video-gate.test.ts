// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoSequenceEditor } from "@/components/video-sequence/VideoSequenceEditor";
import type { VideoSequence, VideoSequenceEditorProps } from "@/components/video-sequence/types";

vi.mock("@/components/assistant/AiAssistant", () => ({ AiAssistant: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const sequence: VideoSequence = {
  id: "sequence", boardId: "board", name: "镜头序列", revision: 1, updatedAt: "2026-10-15T00:00:00Z",
  defaults: { model: "test-model", aspectRatio: "16:9", resolution: "720p", fps: 24, durationSeconds: 5, generateAudio: false, watermark: false },
  keyframes: [{ id: "a", order: 0, imagePath: "a.png" }, { id: "b", order: 1, imagePath: "b.png" }],
  segments: [{ id: "segment", order: 0, fromKeyframeId: "a", toKeyframeId: "b", prompt: "平移镜头", trimInMs: 0, state: "configured", versions: [] }]
};

async function render(prepare: () => Promise<boolean>): Promise<VideoSequenceEditorProps> {
  const props: VideoSequenceEditorProps = {
    sequence, mediaUrls: {}, providers: [], onPrepareGeneration: prepare,
    onChange: vi.fn(), onGenerateSegment: vi.fn(), onGenerateBatch: vi.fn(),
    onSaveTemplate: vi.fn(), onApplyTemplate: vi.fn(), onExport: vi.fn(), onClose: vi.fn()
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(VideoSequenceEditor, props)));
  return props;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("video editor tools gate", () => {
  it("prepares tools before opening the generation cost confirmation", async () => {
    let finishPreparation!: (ready: boolean) => void;
    const prepare = vi.fn(() => new Promise<boolean>((resolve) => { finishPreparation = resolve; }));
    const props = await render(prepare);
    await act(async () => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("生成待更新片段"));
      button!.click();
    });
    expect(prepare).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(props.onGenerateBatch).not.toHaveBeenCalled();
    await act(async () => finishPreparation(true));
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("确认批量生成");
    expect(props.onGenerateBatch).not.toHaveBeenCalled();
  });

  it("does not show a fee dialog or submit a task after the tools download is declined", async () => {
    const props = await render(vi.fn(async () => false));
    await act(async () => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent === "重新生成此片段");
      button!.click();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(props.onGenerateSegment).not.toHaveBeenCalled();
    expect(props.onGenerateBatch).not.toHaveBeenCalled();
  });
});
