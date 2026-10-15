import { describe, expect, it, vi } from "vitest";
import { collectWorkbenchChannels, createWorkbenchClient, VIDEO_SEQUENCE_MUTATIONS } from "../shared/workbench-client.js";

describe("shared workbench client", () => {
  it("derives complete transport allowlists including every dynamic video mutation", () => {
    const channels = collectWorkbenchChannels();
    expect(channels.invoke).toContain("settings:save");
    expect(channels.invoke).toContain("boards:save");
    expect(channels.invoke).toContain("license:getStatus");
    expect(channels.send).toEqual(new Set([
      "window:renderer-ready", "window:save-result", "scene:collaborate:start",
      "scene:collaborate:cancel", "scene:collaborate:interaction-response"
    ]));
    expect(channels.events).toContain("scene:collaborate:event");
    expect(channels.events).toContain("window:save-request");
    for (const operation of VIDEO_SEQUENCE_MUTATIONS) expect(channels.invoke).toContain(`videoSequence:${operation}`);
    expect([...channels.invoke, ...channels.send, ...channels.events].some((channel) => channel.includes("undefined"))).toBe(false);
  });

  it("preserves binary arguments, result identity, rejection and subscription cleanup", async () => {
    const invoke = vi.fn().mockResolvedValue({ path: "/media/clip.mp4" });
    const unsubscribe = vi.fn();
    const on = vi.fn<(channel: string, listener: (...args: unknown[]) => void) => void>();
    const api = createWorkbenchClient({
      invoke, send: vi.fn(),
      on: (channel, listener) => { on(channel, listener as (...args: unknown[]) => void); return unsubscribe; }
    });
    const data = new Uint8Array([1, 2, 3]).buffer;
    const expected = await invoke();
    invoke.mockClear();
    await expect(api.importVideo(data, "video/mp4")).resolves.toBe(expected);
    expect(invoke).toHaveBeenCalledWith("video:import", data, "video/mp4");
    const error = new Error("disk unavailable");
    invoke.mockRejectedValueOnce(error);
    await expect(api.listBoards()).rejects.toBe(error);
    const listener = vi.fn();
    const stop = api.onWorkbenchEvent(listener);
    const handler = on.mock.calls[0][1] as (event: unknown) => void;
    handler({ type: "board-updated", boardId: "board-1" });
    expect(listener).toHaveBeenCalledWith({ type: "board-updated", boardId: "board-1" });
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
