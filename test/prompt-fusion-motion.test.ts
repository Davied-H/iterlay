// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PromptFusionDock } from "../src/components/workbench/PromptFusionDock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function fixture(reduced = false) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalAnimate = HTMLElement.prototype.animate;
  const originalMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: reduced }) });
  let visibleHeight: number | undefined;
  const records: Array<{ target: HTMLElement; frames: Keyframe[]; animation: { playState: string; onfinish: (() => void) | null; cancel: ReturnType<typeof vi.fn> } }> = [];
  HTMLElement.prototype.animate = function (frames) {
    const animation = { playState: "running", onfinish: null as (() => void) | null, cancel: vi.fn(() => {
      animation.playState = "idle";
      if (this.classList.contains("prompt-fusion")) visibleHeight = undefined;
    }) };
    records.push({ target: this, frames: frames as Keyframe[], animation });
    return animation as unknown as Animation;
  };
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains("prompt-fusion")
      ? visibleHeight ?? (this.dataset.fusionExpanded === "true" ? 560 : 150)
      : this.classList.contains("prompt-fusion-conversation") ? 410 : 150;
    return new DOMRect(100, 900 - height, 560, height);
  });
  function Harness() {
    const [open, setOpen] = useState(false);
    return createElement(PromptFusionDock, {
      open, onOpenChange: setOpen, busy: false, inputDisabled: false,
      assistant: createElement("p", null, "保留会话"), value: "AI 草稿", directValue: "普通草稿", contextImages: [],
      controls: null, directEditor: null, directAction: null,
      onValueChange: vi.fn(), onDirectValueChange: vi.fn(), onPromptContextChange: vi.fn(), onSubmit: vi.fn(),
      onStop: vi.fn(), onPasteImages: vi.fn(), onPasteCanvasReferences: vi.fn()
    });
  }
  await act(async () => root.render(createElement(Harness)));
  return {
    container, records, toggle: async () => { await act(async () => container.querySelector<HTMLButtonElement>(".prompt-fusion-expand-handle")!.click()); },
    sample: (height: number) => { visibleHeight = height; },
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove(); bounds.mockRestore(); HTMLElement.prototype.animate = originalAnimate;
      if (originalMedia) Object.defineProperty(window, "matchMedia", originalMedia);
      else Reflect.deleteProperty(window, "matchMedia");
    }
  };
}

describe("assistant dock motion", () => {
  it("reverses from the visible height and hides the exiting conversation only when collapse finishes", async () => {
    const f = await fixture();
    try {
      await f.toggle();
      const opening = f.records.find(({ target }) => target.classList.contains("prompt-fusion"))!;
      expect(opening.frames).toEqual([{ height: "150px" }, { height: "560px" }]);
      f.sample(315);
      await f.toggle();
      const closing = f.records.filter(({ target }) => target.classList.contains("prompt-fusion")).at(-1)!;
      expect(opening.animation.cancel).toHaveBeenCalled();
      expect(closing.frames).toEqual([{ height: "315px" }, { height: "150px" }]);
      const conversation = f.container.querySelector<HTMLElement>(".prompt-fusion-conversation")!;
      expect(conversation.hidden).toBe(false);
      expect(conversation.getAttribute("aria-hidden")).toBe("true");
      expect(conversation.hasAttribute("inert")).toBe(true);
      await act(async () => opening.animation.onfinish?.());
      expect(conversation.hidden).toBe(false);
      closing.animation.playState = "finished";
      await act(async () => closing.animation.onfinish?.());
      expect(conversation.hidden).toBe(true);
      expect(f.container.querySelector(".prompt-fusion")?.hasAttribute("data-fusion-transition")).toBe(false);
      expect(f.container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("AI 草稿");
    } finally { await f.cleanup(); }
  });

  it("switches immediately and leaves no exiting content when reduced motion is enabled", async () => {
    const f = await fixture(true);
    try {
      await f.toggle();
      expect(f.container.querySelector<HTMLElement>(".prompt-fusion-conversation")?.hidden).toBe(false);
      await f.toggle();
      expect(f.container.querySelector<HTMLElement>(".prompt-fusion-conversation")?.hidden).toBe(true);
      expect(f.records).toHaveLength(0);
    } finally { await f.cleanup(); }
  });
});
