// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasShortcutSnapshot } from "@/components/canvas/canvas-shortcut-plan";
import {
  useCanvasShortcutController,
  type CanvasCommandApi
} from "@/components/canvas/use-canvas-shortcut-controller";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Harness({ getSnapshot, commandApi }: {
  getSnapshot: () => CanvasShortcutSnapshot;
  commandApi: CanvasCommandApi;
}): null {
  useCanvasShortcutController({ getSnapshot, commandApi });
  return null;
}

function snapshot(overrides: Partial<CanvasShortcutSnapshot> = {}): CanvasShortcutSnapshot {
  return {
    enabled: true,
    commentMode: false,
    gestureActive: false,
    canAddReferences: true,
    availableAssetActions: new Set([
      "edit",
      "slice",
      "view-details",
      "save-as-template",
      "export-wechat",
      "quick-share",
      "remove-background",
      "switch-version"
    ]),
    nodes: [],
    edges: [],
    ...overrides
  };
}

async function renderHarness(
  getSnapshot: () => CanvasShortcutSnapshot,
  commandApi: CanvasCommandApi
): Promise<void> {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root?.render(createElement(Harness, { getSnapshot, commandApi })));
}

function keydown(key: string, options: KeyboardEventInit = {}, target: EventTarget = window): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  act(() => target.dispatchEvent(event));
  return event;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

describe("canvas shortcut controller", () => {
  it("executes planned commands and prevents handled events", async () => {
    const execute = vi.fn();
    const getSnapshot = vi.fn(() => snapshot());
    await renderHarness(getSnapshot, { execute, reject: vi.fn() });

    const event = keydown("a", { metaKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(getSnapshot).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ type: "select-all" }, expect.objectContaining({ enabled: true }));
  });

  it("routes rejection messages without claiming native-owned keys", async () => {
    const reject = vi.fn();
    await renderHarness(() => snapshot(), { execute: vi.fn(), reject });

    const event = keydown("2", { shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(reject).toHaveBeenCalledWith("请先选择要查看的图片");
  });

  it("ignores editable targets, composing input, repeats, and disabled snapshots", async () => {
    const execute = vi.fn();
    const reject = vi.fn();
    let current = snapshot();
    await renderHarness(() => current, { execute, reject });
    const input = document.createElement("input");
    document.body.append(input);

    keydown("a", { metaKey: true }, input);
    keydown("a", { metaKey: true, isComposing: true });
    keydown("a", { metaKey: true, repeat: true });
    current = snapshot({ enabled: false });
    keydown("a", { metaKey: true });

    expect(execute).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    input.remove();
  });

  it("uses the latest snapshot getter and command API without reinstalling the listener", async () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const firstExecute = vi.fn();
    const nextExecute = vi.fn();
    await renderHarness(() => snapshot({ enabled: false }), { execute: firstExecute, reject: vi.fn() });
    await renderHarness(() => snapshot(), { execute: nextExecute, reject: vi.fn() });

    keydown("a", { ctrlKey: true });

    expect(firstExecute).not.toHaveBeenCalled();
    expect(nextExecute).toHaveBeenCalledOnce();
    expect(addListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
  });

  it("removes its keydown listener on unmount", async () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const execute = vi.fn();
    await renderHarness(() => snapshot(), { execute, reject: vi.fn() });

    await act(async () => root?.unmount());
    root = null;
    keydown("a", { metaKey: true });

    expect(execute).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});
