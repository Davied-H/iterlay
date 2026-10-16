// @vitest-environment jsdom
import { act, createElement, createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PromptFusionDock } from "../src/components/workbench/PromptFusionDock";
import { CANVAS_CLIPBOARD_TYPE } from "../src/components/canvas/canvas-clipboard";
import { AssistantToolGroup } from "../src/components/assistant/AssistantMessageDetails";
import { ASSISTANT_WIDTH_KEY, ASSISTANT_WIDTHS, readAssistantWidth, setAssistantWidth } from "../src/lib/assistant-width";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("production prompt fusion", () => {
  it("uses the same centered button to expand and collapse the conversation", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    function Harness() {
      const [open, setOpen] = useState(false);
      return createElement(PromptFusionDock, {
        open, onOpenChange: setOpen, busy: false, inputDisabled: false,
        assistant: createElement("p", null, "对话内容"), value: "", directValue: "", contextImages: [],
        controls: null, directEditor: null, directAction: null,
        onValueChange: vi.fn(), onDirectValueChange: vi.fn(), onPromptContextChange: vi.fn(),
        onSubmit: vi.fn(), onStop: vi.fn(), onPasteImages: vi.fn(), onPasteCanvasReferences: vi.fn()
      });
    }
    try {
      await act(async () => root.render(createElement(Harness)));
      const button = container.querySelector<HTMLButtonElement>(".prompt-fusion-expand-handle")!;
      expect(button.getAttribute("aria-expanded")).toBe("false");
      await act(async () => button.click());
      expect(container.querySelector(".prompt-fusion-expand-handle")).toBe(button);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(button.getAttribute("aria-label")).toBe("收起创作助手");
      await act(async () => button.click());
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector(".prompt-fusion-conversation")?.hasAttribute("hidden")).toBe(true);
    } finally { await act(async () => root.unmount()); }
  });

  it("shows corner resize handles only for an expanded floating conversation", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onPointerDown = vi.fn();
    const resizePointerHandlers = {
      onPointerDown, onPointerMove: vi.fn(), onPointerUp: vi.fn(), onPointerCancel: vi.fn()
    };
    const render = async (open: boolean, dockSide: "right" | null = null) => {
      await act(async () => root.render(createElement(PromptFusionDock, {
        open, dockSide, resizePointerHandlers, busy: false, inputDisabled: false,
        assistant: null, value: "", directValue: "", contextImages: [],
        controls: null, directEditor: null, directAction: null,
        onOpenChange: vi.fn(), onValueChange: vi.fn(), onDirectValueChange: vi.fn(),
        onPromptContextChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn(),
        onPasteImages: vi.fn(), onPasteCanvasReferences: vi.fn()
      })));
    };
    try {
      await render(true);
      expect(container.querySelectorAll("[data-assistant-resize-handle]")).toHaveLength(4);
      const handle = container.querySelector<HTMLButtonElement>('[data-corner="se"]')!;
      expect(handle.getAttribute("aria-label")).toBe("调整助手大小");
      await act(async () => handle.dispatchEvent(new Event("pointerdown", { bubbles: true })));
      expect(onPointerDown).toHaveBeenCalledWith("se", expect.anything());
      await render(false);
      expect(container.querySelectorAll("[data-assistant-resize-handle]")).toHaveLength(0);
      await render(true, "right");
      expect(container.querySelectorAll("[data-assistant-resize-handle]")).toHaveLength(0);
      expect(container.querySelector(".prompt-fusion-expand-handle")).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("expands on send and collapses outside without hiding the composer or stopping replies", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const send = vi.fn(), stop = vi.fn();
    function Harness(): React.ReactElement {
      const [open, setOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      return createElement(PromptFusionDock, {
        open, busy, onOpenChange: setOpen, inputDisabled: false,
        value: "hello", directValue: "", assistant: null, contextImages: [],
        controls: null, directEditor: null, directAction: null,
        onValueChange: vi.fn(), onDirectValueChange: vi.fn(), onPromptContextChange: vi.fn(),
        onSubmit: () => { send(); setBusy(true); }, onStop: () => { stop(); setBusy(false); },
        onPasteImages: vi.fn(), onPasteCanvasReferences: vi.fn()
      });
    }
    const pointer = (element: Element) => element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const expanded = () => container.querySelector(".prompt-fusion")?.getAttribute("data-fusion-expanded");
    try {
      await act(async () => root.render(createElement(Harness)));
      await act(async () => container.querySelector<HTMLButtonElement>(".prompt-fusion-send")!.click());
      expect(expanded()).toBe("true");
      expect(send).toHaveBeenCalledOnce();
      await act(async () => pointer(container.querySelector("textarea")!));
      expect(expanded()).toBe("true");
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      document.body.append(menu);
      await act(async () => pointer(menu));
      expect(expanded()).toBe("true");
      menu.remove();
      await act(async () => pointer(document.body));
      expect(expanded()).toBe("false");
      expect(container.querySelector("textarea")?.value).toBe("hello");
      expect(stop).not.toHaveBeenCalled();
      await act(async () => container.querySelector<HTMLButtonElement>(".prompt-fusion-send")!.click());
      expect(expanded()).toBe("false");
      expect(stop).toHaveBeenCalledOnce();
      await act(async () => container.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
      expect(expanded()).toBe("true");
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("references copied canvas images before files and preserves normal paste fallbacks", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const references = vi.fn(), files = vi.fn(), change = vi.fn();
    const images = ["first", "second"].map((id) => ({ id, path: `${id}.png`, dataUrl: `data:image/png;base64,${id}`, jobId: "job" }));
    const imageFile = new File(["image"], "pasted.png", { type: "image/png" });
    const paste = async (payload: string, imageFiles: File[] = []) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: {
        getData: (type: string) => type === CANVAS_CLIPBOARD_TYPE ? payload : "plain text",
        items: [], files: imageFiles
      } });
      await act(async () => container.querySelector("textarea")!.dispatchEvent(event));
      return event;
    };
    try {
      await act(async () => root.render(createElement(PromptFusionDock, {
        open: true, busy: false, inputDisabled: false, assistant: null,
        value: "existing draft", directValue: "", contextImages: [],
        controls: null, directEditor: null, directAction: null,
        onOpenChange: vi.fn(), onValueChange: change, onDirectValueChange: vi.fn(),
        onPromptContextChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn(),
        onPasteImages: files, onPasteCanvasReferences: references
      })));
      container.querySelector("textarea")!.focus();
      expect(document.activeElement).toBe(container.querySelector("textarea"));
      const event = await paste(JSON.stringify({
        version: 1, items: images.map((image) => ({ image, position: { x: 0, y: 0 } }))
      }), [imageFile]);
      expect(event.defaultPrevented).toBe(true);
      expect(references).toHaveBeenCalledTimes(1);
      expect(references).toHaveBeenCalledWith(images);
      expect(files).not.toHaveBeenCalled();
      expect(change).not.toHaveBeenCalled();
      expect(container.querySelector("textarea")!.value).toBe("existing draft");
      expect((await paste("invalid", [imageFile])).defaultPrevented).toBe(true);
      expect(files).toHaveBeenCalledTimes(1);
      expect(files).toHaveBeenCalledWith([imageFile]);
      expect((await paste("")).defaultPrevented).toBe(false);
      expect((await paste("invalid")).defaultPrevented).toBe(false);
      expect(references).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("shares the movable panel ref and preserves its contents while the sidebar is collapsed", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const panelRef = createRef<HTMLDivElement>();
    const drag = vi.fn();
    const props = {
      panelRef, dockSide: "left" as const, panelStyle: { width: 360 },
      open: true, busy: false, inputDisabled: false,
      assistant: createElement("p", null, "保留对话"), value: "保留草稿", directValue: "",
      contextImages: [], controls: null, directEditor: null, directAction: null,
      onOpenChange: vi.fn(), onValueChange: vi.fn(), onDirectValueChange: vi.fn(),
      onPromptContextChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn(), onPasteImages: vi.fn(),
      onPasteCanvasReferences: vi.fn(),
      headerPointerHandlers: { onPointerDown: drag }
    };
    try {
      await act(async () => root.render(createElement(PromptFusionDock, props)));
      const panel = panelRef.current!;
      expect(panel).toBe(container.querySelector(".prompt-fusion"));
      expect(panel.dataset.assistantDockSide).toBe("left");
      expect(panel.style.width).toBe("360px");
      await act(async () => root.render(createElement(PromptFusionDock, { ...props, collapsed: true })));
      expect(panel.hasAttribute("inert")).toBe(true);
      expect(panel.getAttribute("aria-hidden")).toBe("true");
      expect(panel.querySelector("textarea")?.value).toBe("保留草稿");
      await act(async () => root.render(createElement(PromptFusionDock, { ...props, open: false })));
      expect(panel.hasAttribute("inert")).toBe(false);
      expect(panel.querySelector(".prompt-fusion-collapsed")).toBeNull();
      expect(panel.textContent).toContain("保留对话");
    } finally { await act(async () => root.unmount()); }
  });

  it("defaults to medium, validates saved widths and persists all four sizes", () => {
    localStorage.removeItem(ASSISTANT_WIDTH_KEY);
    expect(readAssistantWidth()).toBe("medium");
    localStorage.setItem(ASSISTANT_WIDTH_KEY, "invalid");
    expect(readAssistantWidth()).toBe("medium");
    for (const size of Object.keys(ASSISTANT_WIDTHS) as (keyof typeof ASSISTANT_WIDTHS)[]) {
      setAssistantWidth(size);
      expect(readAssistantWidth()).toBe(size);
      expect(localStorage.getItem(ASSISTANT_WIDTH_KEY)).toBe(size);
    }
    expect(Object.values(ASSISTANT_WIDTHS)).toEqual([460, 560, 660, 760]);
    localStorage.removeItem(ASSISTANT_WIDTH_KEY);
  });

  it("keeps drag completion handlers on the panel after the direct-mode sidebar header disappears", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const move = vi.fn(), up = vi.fn(), cancel = vi.fn();
    const props = {
      open: false, busy: false, inputDisabled: false, assistant: null,
      value: "", directValue: "", contextImages: [],
      controls: null, directEditor: null, directAction: null,
      onOpenChange: vi.fn(), onValueChange: vi.fn(), onDirectValueChange: vi.fn(),
      onPromptContextChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn(),
      onPasteImages: vi.fn(), onPasteCanvasReferences: vi.fn(),
      headerPointerHandlers: { onPointerMove: move, onPointerUp: up, onPointerCancel: cancel }
    };
    try {
      await act(async () => root.render(createElement(PromptFusionDock, { ...props, dockSide: "right" })));
      await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
      expect(container.querySelector(".prompt-fusion-collapsed")).toBeNull();
      const panel = container.querySelector(".prompt-fusion")!;
      await act(async () => root.render(createElement(PromptFusionDock, { ...props, dockSide: "right", dragging: true })));
      expect(container.querySelector(".prompt-fusion-collapsed")).toBeNull();
      expect(container.querySelector(".prompt-fusion")).toBe(panel);
      for (const type of ["pointermove", "pointerup", "pointercancel"]) {
        await act(async () => panel.dispatchEvent(new Event(type, { bubbles: true })));
      }
      expect(move).toHaveBeenCalledOnce();
      expect(up).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); }
  });

  it("transfers the final prompt, collapses and restores chat without sending", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const submit = vi.fn(), context = vi.fn();
    function Harness(): React.ReactElement {
      const [open, setOpen] = useState(true);
      const [direct, setDirect] = useState("");
      return createElement(PromptFusionDock, {
        open, onOpenChange: setOpen, busy: false, inputDisabled: false,
        assistant: createElement("p", null, "AI 对话"), value: "未发送的草稿", directValue: direct, latestPrompt: "最终提示词",
        onValueChange: vi.fn(), onDirectValueChange: setDirect, onPromptContextChange: context,
        contextImages: [], controls: null, directEditor: createElement("p", { "data-direct": "" }, direct), directAction: createElement("button", null, "生成"),
        onSubmit: submit, onStop: vi.fn(), onPasteImages: vi.fn(), onPasteCanvasReferences: vi.fn()
      });
    }
    try {
      await act(async () => root.render(createElement(Harness)));
      expect(container.querySelector<HTMLElement>(".prompt-fusion")?.style.getPropertyValue("--assistant-width")).toBe("560px");
      expect(container.textContent).not.toContain("Shift + Enter");
      await act(async () => setAssistantWidth("small"));
      expect(container.querySelector<HTMLElement>(".prompt-fusion")?.style.getPropertyValue("--assistant-width")).toBe("460px");
      await act(async () => setAssistantWidth("medium"));
      const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;
      expect(toggle().getAttribute("aria-checked")).toBe("true");
      await act(async () => toggle().click());
      expect(toggle().getAttribute("aria-checked")).toBe("false");
      expect(container.querySelector("[data-fusion-expanded=false]")).not.toBeNull();
      expect(container.querySelector(".prompt-fusion-collapsed")).toBeNull();
      expect(container.querySelector("[data-direct]")?.textContent).toBe("最终提示词");
      await act(async () => toggle().click());
      expect(context).toHaveBeenCalledWith("最终提示词");
      expect(container.querySelector("textarea")?.value).toBe("未发送的草稿");
      expect(submit).not.toHaveBeenCalled();
      expect(container.querySelector(".prompt-fusion-surface")).not.toBeNull();
    } finally { await act(async () => root.unmount()); }
  });

  it("preserves two-level expansion across tool updates", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(AssistantToolGroup, { calls: [{ id: "t", name: "inspect", status: "running" }] })));
      const group = container.querySelector<HTMLDetailsElement>(".assistant-tool-group")!;
      const tool = container.querySelector<HTMLDetailsElement>(".assistant-tool")!;
      expect(group.open).toBe(false);
      expect(tool.open).toBe(false);
      group.open = true; tool.open = true;
      await act(async () => root.render(createElement(AssistantToolGroup, { calls: [{ id: "t", name: "inspect", status: "completed", output: "done" }] })));
      expect(container.querySelector<HTMLDetailsElement>(".assistant-tool-group")?.open).toBe(true);
      expect(container.querySelector<HTMLDetailsElement>(".assistant-tool")?.open).toBe(true);
      expect(container.textContent).toContain("done");
    } finally { await act(async () => root.unmount()); }
  });
});
