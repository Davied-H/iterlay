import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  supported: true,
  options: [] as Array<Record<string, unknown>>,
  listeners: new Map<string, (...args: unknown[]) => void>(),
  show: vi.fn(),
  openExternal: vi.fn(() => Promise.resolve()),
  window: {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    webContents: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn()
    }
  }
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [electronMocks.window]
  },
  Notification: class {
    static isSupported(): boolean {
      return electronMocks.supported;
    }

    constructor(options: Record<string, unknown>) {
      electronMocks.options.push(options);
    }

    on(event: string, listener: (...args: unknown[]) => void): this {
      electronMocks.listeners.set(event, listener);
      return this;
    }

    show(): void {
      electronMocks.show();
    }
  },
  shell: {
    openExternal: electronMocks.openExternal
  }
}));

import {
  openSystemNotificationSettings,
  showGenerationCompletedNotification,
  showTestSystemNotification,
  showVideoGenerationNotification
} from "../electron/system-notification";

describe("generation system notification", () => {
  beforeEach(() => {
    electronMocks.supported = true;
    electronMocks.options.length = 0;
    electronMocks.listeners.clear();
    vi.clearAllMocks();
  });

  it("opens the originating board and focuses the app when clicked", () => {
    showGenerationCompletedNotification({
      count: 2,
      workflowMode: "generate",
      boardId: "board-1",
      imagePaths: ["/assets/result.png"]
    });

    expect(electronMocks.options[0]).toMatchObject({
      title: "图片生成完成",
      body: "2 张图片已准备好，点击返回 Iterlay 查看。"
    });
    expect(electronMocks.show).toHaveBeenCalledOnce();

    electronMocks.listeners.get("click")?.();
    expect(electronMocks.window.restore).toHaveBeenCalledOnce();
    expect(electronMocks.window.show).toHaveBeenCalledOnce();
    expect(electronMocks.window.focus).toHaveBeenCalledOnce();
    expect(electronMocks.window.webContents.send).toHaveBeenCalledWith("notification:generation:open", {
      boardId: "board-1",
      imagePaths: ["/assets/result.png"]
    });
  });

  it("does nothing when desktop notifications are unsupported", () => {
    electronMocks.supported = false;
    showGenerationCompletedNotification({ count: 1, workflowMode: "edit" });
    expect(electronMocks.show).not.toHaveBeenCalled();
  });

  it("delivers video completion and failure notifications", () => {
    showVideoGenerationNotification({ succeeded: true });
    expect(electronMocks.options.at(-1)).toMatchObject({
      title: "视频生成完成",
      body: "视频已保存到画板，点击返回 Iterlay 查看。"
    });

    showVideoGenerationNotification({ succeeded: false, error: "上游服务超时" });
    expect(electronMocks.options.at(-1)).toMatchObject({
      title: "视频生成失败",
      body: "上游服务超时"
    });
    expect(electronMocks.show).toHaveBeenCalledTimes(2);
  });

  it("reports when the operating system accepts a test notification", async () => {
    const result = showTestSystemNotification();

    electronMocks.listeners.get("show")?.();

    await expect(result).resolves.toEqual({ status: "delivered" });
  });

  it("surfaces asynchronous native delivery failures", async () => {
    const result = showTestSystemNotification();

    electronMocks.listeners.get("failed")?.({}, "notifications are disabled");

    await expect(result).resolves.toEqual({
      status: "failed",
      message: "notifications are disabled"
    });
  });

  it("reports unsupported desktop notifications to the test caller", async () => {
    electronMocks.supported = false;

    await expect(showTestSystemNotification()).resolves.toEqual({
      status: "unsupported",
      message: "当前系统不支持桌面通知。"
    });
  });

  it("opens the platform notification settings when available", async () => {
    const result = await openSystemNotificationSettings();

    if (process.platform === "darwin") {
      expect(electronMocks.openExternal).toHaveBeenCalledWith(
        "x-apple.systempreferences:com.apple.Notifications-Settings.extension"
      );
      expect(result).toEqual({ ok: true });
    } else if (process.platform === "win32") {
      expect(electronMocks.openExternal).toHaveBeenCalledWith("ms-settings:notifications");
      expect(result).toEqual({ ok: true });
    } else {
      expect(electronMocks.openExternal).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false });
    }
  });
});
