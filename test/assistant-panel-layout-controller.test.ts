// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAssistantPanelLayout } from "../src/features/assistant/use-assistant-panel-layout";
import { ASSISTANT_PANEL_SIZE_STORAGE_KEY } from "../src/lib/assistant-panel-size";
import { ASSISTANT_DOCK_LAYOUT_STORAGE_KEY } from "../src/lib/assistant-panel-docking";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
async function setup() {
  let layout!: ReturnType<typeof useAssistantPanelLayout>;
  const onChange = vi.fn(async () => null);
  const root = createRoot(document.createElement("div"));
  function Harness({ boardId }: { boardId: string }) {
    const [open, setOpen] = useState(false);
    layout = useAssistantPanelLayout({ boardId, assistantSurface: "canvas-prompt", assistantAvailable: true, assistantOpen: open, setAssistantOpen: setOpen, rightRailOpen: false, onAssistantDockLayoutChange: onChange });
    return createElement("div", { ref: layout.assistantPanelRef });
  }
  const render = async (boardId: string) => { await act(async () => root.render(createElement(Harness, { boardId }))); };
  await render("one");
  vi.spyOn(layout.assistantPanelRef.current!, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 400, 400));
  const target = document.createElement("button");
  target.setPointerCapture = vi.fn(); target.hasPointerCapture = () => true; target.releasePointerCapture = vi.fn();
  const event = (x: number, y: number, id = 1) => ({ button: 0, isPrimary: true, pointerId: id, clientX: x, clientY: y, currentTarget: target, target, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as React.PointerEvent<HTMLButtonElement>;
  return { layout: () => layout, render, onChange, event, target, unmount: async () => { await act(async () => root.unmount()); } };
}
describe("assistant panel layout controller", () => {
  it("resizes the floating panel, persists its dimensions, and releases pointer capture", async () => {
    const harness = await setup();
    try {
      await act(async () => harness.layout().startAssistantResize("se", harness.event(500, 500)));
      await act(async () => harness.layout().resizeAssistant(harness.event(550, 530)));
      expect(harness.layout().assistantSize).toEqual({ width: 450, height: 430 });
      await act(async () => harness.layout().endAssistantResize(harness.event(550, 530)));
      expect(JSON.parse(localStorage.getItem(ASSISTANT_PANEL_SIZE_STORAGE_KEY)!)).toEqual({ width: 450, height: 430 });
      expect(harness.target.releasePointerCapture).toHaveBeenCalledWith(1);
    } finally { await harness.unmount(); }
  });
  it("invalidates an unfinished resize when switching boards", async () => {
    const harness = await setup();
    try {
      await act(async () => harness.layout().startAssistantResize("se", harness.event(500, 500)));
      await harness.render("two");
      await act(async () => harness.layout().resizeAssistant(harness.event(600, 600)));
      expect(harness.layout().assistantSize).toBeNull();
      expect(harness.layout().fusionAnchor).toBeNull();
    } finally { await harness.unmount(); }
  });
  it("restores dock preferences and preserves keyboard resizing, collapse and expand callbacks", async () => {
    localStorage.setItem(ASSISTANT_DOCK_LAYOUT_STORAGE_KEY, JSON.stringify({ side: "left", width: 360 }));
    const harness = await setup();
    try {
      expect(harness.layout().assistantDockSide).toBe("left");
      await act(async () => harness.layout().handleAssistantDockResizeKeyDown({ key: "ArrowRight", shiftKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLButtonElement>));
      expect(harness.layout().assistantDockWidth).toBe(376);
      expect(harness.onChange).toHaveBeenLastCalledWith({ side: "left", width: 376 });
      await act(async () => harness.layout().collapseDockedAssistant({ detail: 1, currentTarget: harness.target } as unknown as React.MouseEvent<HTMLButtonElement>));
      expect(harness.layout().assistantDockCollapsed).toBe(true);
      expect(harness.onChange).toHaveBeenLastCalledWith(null);
      await act(async () => harness.layout().expandDockedAssistant());
      expect(harness.layout().assistantDockCollapsed).toBe(false);
      expect(harness.onChange).toHaveBeenLastCalledWith({ side: "left", width: 376 });
    } finally { await harness.unmount(); }
    expect(harness.onChange).toHaveBeenLastCalledWith(null);
  });
});
