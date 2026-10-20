import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  focusedWindow: undefined as {
    webContents: { id: number; send: ReturnType<typeof vi.fn> };
    isMinimized: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
  } | undefined,
  handle: vi.fn(),
  getFocusedWindow: vi.fn(),
  getAllWindows: vi.fn()
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getFocusedWindow: electronMocks.getFocusedWindow,
    getAllWindows: electronMocks.getAllWindows
  },
  ipcMain: {
    handle: electronMocks.handle
  }
}));

describe("deep-link main-process dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
    electronMocks.handle.mockClear();
    electronMocks.focusedWindow = undefined;
    electronMocks.getFocusedWindow.mockImplementation(() => electronMocks.focusedWindow);
    electronMocks.getAllWindows.mockReturnValue([]);
  });

  it("buffers cold-start links and sends later links to the ready window", async () => {
    const { dispatchDeepLink, registerDeepLinkIpc } = await import("../electron/deep-link.js");
    registerDeepLinkIpc();
    expect(dispatchDeepLink("iterlay://boards/board-1")).toBe(true);

    const readyHandler = electronMocks.handle.mock.calls[0][1] as (event: unknown) => string[];
    const sender = { id: 7, once: vi.fn() };
    expect(readyHandler({ sender })).toEqual(["iterlay://boards/board-1"]);

    const send = vi.fn();
    electronMocks.focusedWindow = {
      webContents: { id: 7, send },
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    };

    expect(dispatchDeepLink("iterlay://assets")).toBe(true);
    expect(send).toHaveBeenCalledWith("deep-link:open", "iterlay://assets");
    expect(electronMocks.focusedWindow.restore).toHaveBeenCalledOnce();
    expect(electronMocks.focusedWindow.focus).toHaveBeenCalledOnce();
  });

  it("registers only one destruction listener across repeated renderer readiness and releases its entry", async () => {
    const { dispatchDeepLink, registerDeepLinkIpc } = await import("../electron/deep-link.js");
    registerDeepLinkIpc();
    registerDeepLinkIpc();
    expect(electronMocks.handle).toHaveBeenCalledOnce();
    const readyHandler = electronMocks.handle.mock.calls[0][1] as (event: unknown) => string[];
    const sender = Object.assign(new EventEmitter(), { id: 19 });
    for (let attempt = 0; attempt < 20; attempt += 1) expect(readyHandler({ sender })).toEqual([]);
    expect(sender.listenerCount("destroyed")).toBe(1);

    const send = vi.fn();
    electronMocks.focusedWindow = {
      webContents: { id: sender.id, send }, isMinimized: vi.fn(() => false),
      restore: vi.fn(), show: vi.fn(), focus: vi.fn()
    };
    dispatchDeepLink("iterlay://assets");
    expect(send).toHaveBeenCalledOnce();
    sender.emit("destroyed");
    expect(sender.listenerCount("destroyed")).toBe(0);
    dispatchDeepLink("iterlay://boards/after-destruction");
    expect(send).toHaveBeenCalledOnce();

    const replacement = Object.assign(new EventEmitter(), { id: sender.id });
    expect(readyHandler({ sender: replacement })).toEqual(["iterlay://boards/after-destruction"]);
    expect(replacement.listenerCount("destroyed")).toBe(1);
    dispatchDeepLink("iterlay://assets");
    expect(send).toHaveBeenCalledTimes(2);
    replacement.emit("destroyed");
  });

});
