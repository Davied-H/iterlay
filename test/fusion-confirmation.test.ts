// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n";
import { FusionPromptConfirmation } from "../src/components/workbench/FusionPromptConfirmation";
import { PromptFusionDock } from "../src/components/workbench/PromptFusionDock";
import type { AiAssistantInteractionState } from "../src/components/assistant/AiAssistant";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const state: AiAssistantInteractionState = {
  id: "proposal",
  interaction: { type: "confirm", title: "应用 AI 助手的提示词？", confirmLabel: "应用提示词", cancelLabel: "暂不应用" },
  confirmationPreview: { title: "将应用的提示词", items: [{ value: "黑沙滩、银色潮汐与冷月光。" }] },
  canGenerateImmediately: true
};

afterEach(() => { vi.restoreAllMocks(); });
beforeEach(() => { window.localStorage.setItem("iterlay:language", "zh-CN"); });

describe("Fusion confirmation composer", () => {
  it("animates between measured surface heights and cancels on unmount", async () => {
    const container = document.createElement("div"), root = createRoot(container);
    const cancel = vi.fn(), animate = vi.fn(() => ({ cancel, playState: "finished" }));
    const previousAnimate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { height: this.querySelector("[data-proposal]") ? 320 : 120 } as DOMRect;
    });
    const props = {
      open: true, busy: false, inputDisabled: false, assistant: null, value: "", directValue: "",
      contextImages: [], controls: null, directEditor: null, directAction: null,
      onOpenChange: vi.fn(), onValueChange: vi.fn(), onDirectValueChange: vi.fn(), onPromptContextChange: vi.fn(),
      onSubmit: vi.fn(), onStop: vi.fn(), onPasteImages: vi.fn(), onPasteCanvasReferences: vi.fn()
    };
    try {
      await act(async () => root.render(createElement(PromptFusionDock, props)));
      await act(async () => root.render(createElement(PromptFusionDock, {
        ...props, confirmationId: "test", confirmation: createElement("div", { "data-proposal": "" }, "prompt")
      })));
      expect(animate).toHaveBeenCalledWith([{ height: "120px" }, { height: "320px" }], expect.objectContaining({ duration: 280 }));
      await act(async () => root.render(createElement(PromptFusionDock, props)));
      expect(animate).toHaveBeenCalledWith([{ height: "320px" }, { height: "120px" }], expect.objectContaining({ duration: 220 }));
    } finally {
      await act(async () => root.unmount());
      HTMLElement.prototype.animate = previousAnimate;
    }
    expect(cancel).toHaveBeenCalled();
  });
  it.each(["apply", "generate", "dismiss"] as const)("replaces the composer and restores its draft and focus after %s", async (action) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const invoked = vi.fn();
    function Harness(): React.ReactElement {
      const [pending, setPending] = useState(false);
      const finish = () => { invoked(); setPending(false); };
      return createElement(I18nProvider, null,
        createElement("button", { onClick: () => setPending(true), "data-show": "" }, "show"),
        createElement(PromptFusionDock, {
          open: true, busy: false, inputDisabled: pending, assistant: null, value: "尚未发送的草稿",
          directValue: "", contextImages: [], controls: null, directEditor: null, directAction: null,
          onOpenChange: vi.fn(), onValueChange: vi.fn(), onDirectValueChange: vi.fn(), onPromptContextChange: vi.fn(),
          onSubmit: vi.fn(), onStop: vi.fn(), onPasteImages: vi.fn(), onPasteCanvasReferences: vi.fn(),
          confirmationId: pending ? state.id : undefined,
          confirmation: pending ? createElement(FusionPromptConfirmation, {
            state, disabled: false, onApply: finish, onGenerate: finish, onDismiss: finish, onRefine: vi.fn()
          }) : null
        })
      );
    }
    try {
      await act(async () => root.render(createElement(Harness)));
      const original = container.querySelector<HTMLDivElement>(".prompt-fusion-original")!;
      const field = original.querySelector("textarea")!;
      field.focus();
      await act(async () => container.querySelector<HTMLButtonElement>("[data-show]")!.click());
      expect(original.hidden).toBe(true);
      expect(original.hasAttribute("inert")).toBe(true);
      expect(original.getAttribute("aria-hidden")).toBe("true");
      expect(field.value).toBe("尚未发送的草稿");
      expect(container.querySelectorAll(".fusion-confirmation")).toHaveLength(1);
      const label = { apply: "应用提示词", generate: "应用并生成", dismiss: "暂不应用" }[action];
      const button = [...container.querySelectorAll<HTMLButtonElement>(".fusion-confirmation button")].find((item) => item.textContent === label)!;
      button.focus();
      await act(async () => button.click());
      expect(invoked).toHaveBeenCalledOnce();
      expect(original.hidden).toBe(false);
      expect(original.hasAttribute("inert")).toBe(false);
      expect(container.querySelector(".fusion-confirmation")).toBeNull();
      expect(field.value).toBe("尚未发送的草稿");
      expect(document.activeElement).toBe(field);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("submits only nonempty refinement, ignores IME Enter and prevents duplicate actions", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const refine = vi.fn(), generate = vi.fn();
    try {
      await act(async () => root.render(createElement(I18nProvider, null, createElement(FusionPromptConfirmation, {
        state, disabled: false, onApply: vi.fn(), onGenerate: generate, onDismiss: vi.fn(), onRefine: refine
      }))));
      const form = container.querySelector("form")!;
      const field = container.querySelector("textarea")!;
      expect(form.hidden).toBe(true);
      const edit = container.querySelector<HTMLButtonElement>("[aria-controls]")!;
      await act(async () => edit.click());
      expect(form.hidden).toBe(false);
      await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(refine).not.toHaveBeenCalled();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
        setter.call(field, "  让月光更冷  ");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })));
      expect(refine).not.toHaveBeenCalled();
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(refine).toHaveBeenCalledOnce();
      expect(refine).toHaveBeenCalledWith("让月光更冷");
      await act(async () => edit.click());
      expect(form.hidden).toBe(true);
      expect(form.hasAttribute("inert")).toBe(true);
      await act(async () => edit.click());
      expect(field.value).toBe("  让月光更冷  ");
      const generateButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "应用并生成")!;
      await act(async () => generateButton.click());
      expect(generate).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); }
  });

  it("allows dismissal after a no-op confirm handler leaves the proposal mounted", async () => {
    const container = document.createElement("div"), root = createRoot(container);
    const dismiss = vi.fn();
    try {
      await act(async () => root.render(createElement(I18nProvider, null, createElement(FusionPromptConfirmation, {
        state: { ...state, canGenerateImmediately: false }, disabled: false,
        onApply: vi.fn(), onGenerate: vi.fn(), onDismiss: dismiss, onRefine: vi.fn()
      }))));
      const findButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === label)!;
      await act(async () => findButton("应用提示词").click());
      await act(async () => findButton("暂不应用").click());
      expect(dismiss).toHaveBeenCalledOnce();
      expect(container.querySelector("textarea")?.placeholder).toBe("补充要求，继续让 AI 完善…");
    } finally { await act(async () => root.unmount()); }
  });

  it("does not invent a generation action for agent-only confirmations", async () => {
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(createElement(I18nProvider, null, createElement(FusionPromptConfirmation, {
        state: { ...state, canGenerateImmediately: false }, disabled: true,
        onApply: vi.fn(), onGenerate: vi.fn(), onDismiss: vi.fn(), onRefine: vi.fn()
      }))));
      expect(container.textContent).not.toContain("应用并生成");
      expect([...container.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
      expect(container.querySelector("textarea")?.disabled).toBe(true);
    } finally { await act(async () => root.unmount()); }
  });
});
