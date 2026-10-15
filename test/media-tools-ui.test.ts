// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaToolsState } from "@shared/media-tools";
import { MediaToolsDialog } from "@/features/media-tools/MediaToolsDialog";
import { useMediaTools, type MediaToolsApi } from "@/features/media-tools/use-media-tools";
import { I18nProvider } from "@/i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const missing: MediaToolsState = { status: "missing", version: "test-tools-r1", downloadBytes: 8_388_608, transferredBytes: 0 };
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: ReturnType<typeof useMediaTools> | null = null;
let state: MediaToolsState;
let listener: ((state: MediaToolsState) => void) | undefined;
let api: MediaToolsApi;
let unsubscribe: ReturnType<typeof vi.fn>;

function Harness(): React.ReactElement {
  const tools = useMediaTools(api);
  latest = tools;
  return createElement(MediaToolsDialog, {
    open: tools.dialogOpen,
    state: tools.state,
    starting: tools.starting,
    error: tools.error,
    onConfirm: () => { void tools.confirmInstall(); },
    onCancel: tools.cancel
  });
}

async function render(): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(I18nProvider, null, createElement(Harness))));
}

async function requestTools(): Promise<{ result: Promise<boolean> }> {
  let result!: Promise<boolean>;
  await act(async () => { result = latest!.ensureMediaToolsReady(); });
  return { result };
}

async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent === label);
  expect(button, `button ${label}`).toBeDefined();
  await act(async () => button!.click());
}

beforeEach(() => {
  latest = null;
  state = { ...missing };
  listener = undefined;
  unsubscribe = vi.fn();
  window.localStorage.setItem("iterlay:language", "zh-CN");
  api = {
    getMediaToolsState: vi.fn(async () => state),
    installMediaTools: vi.fn(async (): Promise<MediaToolsState> => ({ ...state, status: "ready" })),
    cancelMediaToolsDownload: vi.fn(async () => undefined),
    onMediaToolsState: vi.fn((callback) => { listener = callback; return unsubscribe; })
  };
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("video tools consent and progress", () => {
  it("only probes locally on startup and waits for explicit consent before installing", async () => {
    await render();
    expect(api.getMediaToolsState).toHaveBeenCalledOnce();
    expect(api.installMediaTools).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    const { result } = await requestTools();
    expect(document.body.textContent).toContain("需要下载视频组件");
    expect(document.body.textContent).toContain("8.0 MiB");
    expect(api.installMediaTools).not.toHaveBeenCalled();
    await click("暂不下载");
    await expect(result).resolves.toBe(false);
    expect(api.installMediaTools).not.toHaveBeenCalled();
    expect(api.cancelMediaToolsDownload).not.toHaveBeenCalled();
  });

  it("continues once after consent and shares a pending request within the window", async () => {
    await render();
    const { result } = await requestTools();
    const same = latest!.ensureMediaToolsReady();
    expect(same).toBe(result);
    await click("下载并继续");
    await expect(result).resolves.toBe(true);
    expect(api.installMediaTools).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders shared-window download progress and lets a waiting operation cancel", async () => {
    await render();
    const { result } = await requestTools();
    await act(async () => listener?.({ ...missing, status: "downloading", transferredBytes: 4_194_304 }));
    expect(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("50");
    expect(document.body.textContent).toContain("4.0 MiB / 8.0 MiB");
    await click("取消下载");
    await expect(result).resolves.toBe(false);
    expect(api.cancelMediaToolsDownload).toHaveBeenCalledOnce();
    expect(api.installMediaTools).not.toHaveBeenCalled();
  });

  it("shows failures with retry and keeps the operation waiting until success", async () => {
    vi.mocked(api.installMediaTools).mockRejectedValueOnce(new Error("网络连接中断"));
    await render();
    const { result } = await requestTools();
    let settled = false;
    void result.then(() => { settled = true; });
    await click("下载并继续");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("网络连接中断");
    expect(settled).toBe(false);
    await click("重试下载");
    await expect(result).resolves.toBe(true);
    expect(api.installMediaTools).toHaveBeenCalledTimes(2);
  });

  it("does not resume a cancelled operation when an in-flight install finishes later", async () => {
    let resolveInstall!: (state: MediaToolsState) => void;
    vi.mocked(api.installMediaTools).mockReturnValue(new Promise((resolve) => { resolveInstall = resolve; }));
    await render();
    const { result } = await requestTools();
    await click("下载并继续");
    await click("取消下载");
    await expect(result).resolves.toBe(false);
    await act(async () => resolveInstall({ ...missing, status: "ready" }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(latest!.state?.status).toBe("missing");
  });

  it("reuses ready tools without showing a dialog or downloading again", async () => {
    state = { ...missing, status: "ready" };
    await render();
    const { result } = await requestTools();
    await expect(result).resolves.toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(api.installMediaTools).not.toHaveBeenCalled();
  });

  it("does not replace a newer completion event with an older status response", async () => {
    await render();
    let finishSnapshot!: (state: MediaToolsState) => void;
    vi.mocked(api.getMediaToolsState).mockReturnValueOnce(new Promise((resolve) => { finishSnapshot = resolve; }));
    const { result } = await requestTools();
    await act(async () => listener?.({ ...missing, status: "ready" }));
    await expect(result).resolves.toBe(true);
    await act(async () => finishSnapshot({ ...missing }));
    expect(latest!.state?.status).toBe("ready");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("accepts completion from another window and cleans up pending work on unmount", async () => {
    await render();
    const first = await requestTools();
    await act(async () => listener?.({ ...missing, status: "ready" }));
    await expect(first.result).resolves.toBe(true);
    state = { ...missing };
    await act(async () => listener?.(state));
    const second = await requestTools();
    await act(async () => root?.unmount());
    root = null;
    await expect(second.result).resolves.toBe(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(api.cancelMediaToolsDownload).not.toHaveBeenCalled();
  });
});
