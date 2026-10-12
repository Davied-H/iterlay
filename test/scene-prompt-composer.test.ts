// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ScenePromptComposer } from "../src/components/workbench/ScenePromptComposer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("scene prompt composer control", () => {
  it("keeps prompt, references and actions in one composer", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSubmit = vi.fn();
    const onRemoveReference = vi.fn();

    await act(async () => {
      root.render(createElement(TooltipProvider, null, createElement(ScenePromptComposer, {
        value: "高级球鞋",
        placeholder: "描述本次内容",
        references: [{
          payload: { id: "reference-1", name: "球鞋参考图" },
          previewUrl: "data:image/png;base64,AAAA"
        }],
        referenceLimit: 4,
        canOptimize: true,
        composing: false,
        hasGeneratedPrompt: false,
        referencesUnsupported: false,
        onValueChange: vi.fn(),
        onAddReferences: vi.fn(),
        onRemoveReference,
        onOpenSettings: vi.fn(),
        onSubmit
      })));
    });

    const composer = container.querySelector<HTMLElement>("[data-scene-prompt-composer]");
    expect(composer?.querySelector<HTMLTextAreaElement>('[aria-label="本次生成需求"]')?.value).toBe("高级球鞋");
    expect(composer?.querySelector('img[alt="球鞋参考图"]')).not.toBeNull();
    expect(composer?.textContent).toContain("参考图 1/4");

    await act(async () => {
      composer?.querySelector<HTMLButtonElement>('[aria-label="发送给 AI 助手"]')?.click();
    });
    expect(onSubmit).toHaveBeenCalledOnce();

    await act(async () => {
      composer?.querySelector<HTMLButtonElement>('[aria-label="移除参考图 球鞋参考图"]')?.click();
    });
    expect(onRemoveReference).toHaveBeenCalledWith("reference-1");

    await act(async () => root.unmount());
    container.remove();
  });

  it("submits with Enter and preserves Shift+Enter for a newline", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(createElement(TooltipProvider, null, createElement(ScenePromptComposer, {
        value: "高级球鞋",
        placeholder: "描述本次内容",
        references: [],
        referenceLimit: 4,
        canOptimize: true,
        composing: false,
        hasGeneratedPrompt: true,
        referencesUnsupported: false,
        onValueChange: vi.fn(),
        onAddReferences: vi.fn(),
        onRemoveReference: vi.fn(),
        onOpenSettings: vi.fn(),
        onSubmit
      })));
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('[aria-label="本次生成需求"]');
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => {
      textarea?.dispatchEvent(enterEvent);
    });

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledOnce();

    const newlineEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    await act(async () => {
      textarea?.dispatchEvent(newlineEvent);
    });

    expect(newlineEvent.defaultPrevented).toBe(false);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(container.querySelector('[aria-label="更新 AI 助手"]')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("allows submitting a request with only reference images", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(createElement(TooltipProvider, null, createElement(ScenePromptComposer, {
        value: "",
        placeholder: "描述本次内容",
        references: [{
          payload: { id: "reference-1", name: "球鞋参考图" },
          previewUrl: "data:image/png;base64,AAAA"
        }],
        referenceLimit: 4,
        canOptimize: true,
        composing: false,
        hasGeneratedPrompt: false,
        referencesUnsupported: false,
        onValueChange: vi.fn(),
        onAddReferences: vi.fn(),
        onRemoveReference: vi.fn(),
        onOpenSettings: vi.fn(),
        onSubmit
      })));
    });

    const submitButton = container.querySelector<HTMLButtonElement>('[aria-label="发送给 AI 助手"]');
    expect(submitButton?.disabled).toBe(false);
    await act(async () => submitButton?.click());
    expect(onSubmit).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    container.remove();
  });
});
