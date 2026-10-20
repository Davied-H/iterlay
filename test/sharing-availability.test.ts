import { afterEach, describe, expect, it, vi } from "vitest";

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }));
vi.mock("electron", () => ({ ipcMain: { handle: vi.fn((channel, handler) => handlers.set(channel, handler)) } }));
import { registerSharingIpc } from "../electron/sharing-ipc";

afterEach(() => { handlers.clear(); vi.clearAllMocks(); });

describe("closed online sharing", () => {
  it("blocks every sharing entry before loading files or contacting the backend, even with old enabled settings", async () => {
    const getSettings = vi.fn(() => ({ onlineImageSharingEnabled: true }));
    const start = vi.fn();
    const ensureDownloadDirectory = vi.fn();
    registerSharingIpc({ settings: { getSettings }, publicShareClient: { start }, ensureDownloadDirectory } as unknown as Parameters<typeof registerSharingIpc>[0]);
    for (const channel of ["downloads:sharePath", "sharing:startImage", "downloads:shareWechatPackage"]) {
      expect(handlers.has(channel)).toBe(true);
      await expect(handlers.get(channel)!({}, null)).rejects.toThrow("在线分享暂未开放");
    }
    expect(getSettings).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(ensureDownloadDirectory).not.toHaveBeenCalled();
    expect(handlers.get("sharing:getActive")!()).toBeNull();
  });
});
