// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWindowSave } from "../src/features/boards/use-window-save";

const api = vi.hoisted(() => ({
  onWindowSaveRequest: vi.fn(() => vi.fn()), windowRendererReady: vi.fn(), completeWindowSave: vi.fn()
}));
vi.mock("../src/lib/image-workbench-api", () => ({
  hasImageWorkbenchApi: () => true, getImageWorkbenchApi: () => api
}));

let root: Root;
let container: HTMLDivElement;
function SaveHarness({ flush }: { flush: () => Promise<void> }): null {
  useWindowSave(flush);
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete document.documentElement.dataset.workbenchConnection;
  delete document.documentElement.dataset.boardSaveState;
  vi.unstubAllGlobals();
});

describe("browser window save lifecycle", () => {
  it("warns only for unsaved browser changes and flushes before backend reload", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    document.documentElement.dataset.workbenchConnection = "connected";
    await act(async () => root.render(createElement(SaveHarness, { flush })));
    expect(api.windowRendererReady).toHaveBeenCalledOnce();
    document.documentElement.dataset.boardSaveState = "pending";
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    expect(flush).toHaveBeenCalledOnce();
    document.documentElement.dataset.boardSaveState = "saved";
    const saved = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
    expect(flush).toHaveBeenCalledOnce();
    const waitUntil = vi.fn();
    window.dispatchEvent(new CustomEvent("iterlay:browser-workbench-before-reload", { detail: { waitUntil } }));
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("keeps native Electron close handling free of browser unload prompts", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    document.documentElement.dataset.boardSaveState = "pending";
    await act(async () => root.render(createElement(SaveHarness, { flush })));
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(false);
    expect(flush).not.toHaveBeenCalled();
    expect(api.onWindowSaveRequest).toHaveBeenCalledOnce();
  });
});
