import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  appHandlers: new Map<string, (...args: unknown[]) => void>(),
  ipcHandlers: new Map<string, (...args: unknown[]) => void>(),
  windows: [] as unknown[],
  quit: vi.fn(),
  showMessageBox: vi.fn(async () => ({ response: 1 }))
}));

vi.mock("electron", () => ({
  app: {
    on: (name: string, listener: (...args: unknown[]) => void) => electron.appHandlers.set(name, listener),
    quit: electron.quit
  },
  BrowserWindow: { getAllWindows: () => electron.windows },
  ipcMain: { on: (name: string, listener: (...args: unknown[]) => void) => electron.ipcHandlers.set(name, listener) },
  dialog: { showMessageBox: electron.showMessageBox }
}));

import { installWindowLifecycle } from "../electron/window-lifecycle.js";

class TestWindow {
  readonly handlers = new Map<string, (...args: unknown[]) => void>();
  readonly frame = {};
  readonly webContents = { id: 1, mainFrame: this.frame, on: vi.fn(), send: vi.fn() };
  destroyed = false;
  isDestroyed(): boolean { return this.destroyed; }
  on(name: string, listener: (...args: unknown[]) => void): void { this.handlers.set(name, listener); }
  close = vi.fn(() => {
    const event = { preventDefault: vi.fn() };
    this.handlers.get("close")?.(event);
    if (!event.preventDefault.mock.calls.length) this.destroyed = true;
  });
  asBrowserWindow(): BrowserWindow { return this as unknown as BrowserWindow; }
  ipcEvent() { return { sender: this.webContents, senderFrame: this.frame }; }
}

beforeEach(() => {
  electron.appHandlers.clear();
  electron.ipcHandlers.clear();
  electron.windows.length = 0;
  electron.quit.mockClear();
  electron.showMessageBox.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

function fixture(flushExternal?: (window: BrowserWindow) => Promise<void>) {
  const window = new TestWindow();
  electron.windows.push(window);
  const flushLogs = vi.fn(async () => undefined);
  const guard = installWindowLifecycle(flushLogs, flushExternal);
  guard(window.asBrowserWindow());
  const quit = () => {
    const event = { preventDefault: vi.fn() };
    electron.appHandlers.get("before-quit")!(event);
    return event;
  };
  return { window, flushLogs, quit };
}

describe("window lifecycle persistence", () => {
  it("keeps the browser backend open after an external save failure and permits a successful retry", async () => {
    const save = vi.fn<() => Promise<void>>(async () => { throw new Error("disk full"); });
    const f = fixture(save);
    f.window.close();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(expect.stringContaining("已取消关闭"), expect.any(Error)));
    expect(f.window.destroyed).toBe(false);
    expect(f.window.close).toHaveBeenCalledOnce();
    expect(electron.showMessageBox).not.toHaveBeenCalled();

    save.mockImplementationOnce(async () => undefined);
    f.window.close();
    await vi.waitFor(() => expect(f.window.destroyed).toBe(true));
    expect(save).toHaveBeenCalledTimes(2);
    expect(electron.showMessageBox).not.toHaveBeenCalled();
  });

  it("cancels application exit after an external save failure without opening a hidden native dialog", async () => {
    const save = vi.fn<() => Promise<void>>(async () => { throw new Error("browser save failed"); });
    const f = fixture(save);
    const event = f.quit();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledOnce());
    expect(electron.quit).not.toHaveBeenCalled();
    expect(f.flushLogs).not.toHaveBeenCalled();
    expect(f.window.destroyed).toBe(false);
    expect(electron.showMessageBox).not.toHaveBeenCalled();

    save.mockImplementationOnce(async () => undefined);
    f.quit();
    await vi.waitFor(() => expect(electron.quit).toHaveBeenCalledOnce());
    expect(f.flushLogs).toHaveBeenCalledOnce();
  });

  it("waits for successful external persistence before flushing logs and allowing application exit", async () => {
    let saved!: () => void;
    const pendingSave = new Promise<void>((resolve) => { saved = resolve; });
    const save = vi.fn(() => pendingSave);
    const f = fixture(save);
    f.quit();
    expect(save).toHaveBeenCalledWith(f.window);
    expect(f.flushLogs).not.toHaveBeenCalled();
    expect(electron.quit).not.toHaveBeenCalled();
    saved();
    await vi.waitFor(() => expect(electron.quit).toHaveBeenCalledOnce());
    expect(f.flushLogs).toHaveBeenCalledOnce();
    expect(electron.showMessageBox).not.toHaveBeenCalled();
    expect(f.quit().preventDefault).not.toHaveBeenCalled();
  });

  it("preserves the desktop save acknowledgement and native failure choices", async () => {
    const f = fixture();
    electron.ipcHandlers.get("window:renderer-ready")!(f.window.ipcEvent());
    f.quit();
    expect(electron.quit).not.toHaveBeenCalled();
    const [channel, request] = f.window.webContents.send.mock.calls[0];
    expect(channel).toBe("window:save-request");
    electron.ipcHandlers.get("window:save-result")!(f.window.ipcEvent(), { requestId: request.requestId, ok: false, error: "disk full" });
    await vi.waitFor(() => expect(electron.showMessageBox).toHaveBeenCalledOnce());
    expect(electron.showMessageBox).toHaveBeenCalledWith(f.window, expect.objectContaining({
      buttons: ["重试保存", "继续编辑", "不保存并关闭"], detail: "disk full"
    }));
    expect(electron.quit).not.toHaveBeenCalled();
    expect(f.flushLogs).not.toHaveBeenCalled();

    f.quit();
    const retry = f.window.webContents.send.mock.calls[1][1];
    electron.ipcHandlers.get("window:save-result")!(f.window.ipcEvent(), { requestId: retry.requestId, ok: true });
    await vi.waitFor(() => expect(electron.quit).toHaveBeenCalledOnce());
  });
});
