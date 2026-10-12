import { describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn()
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
    send: electronMocks.send
  }
}));

describe("video preload API", () => {
  it("exposes the agreed video task and asset channels", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as Record<string, (...args: never[]) => Promise<unknown>>;
    const input = {
      prompt: "让海面动起来",
      model: "seedance-model",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      referenceImagePaths: []
    };
    const bytes = new ArrayBuffer(4);

    await api.importVideo(bytes as never, "video/mp4" as never);
    await api.importAudio(bytes as never, "audio/mpeg" as never);
    await api.getVideoCapabilities();
    await api.listVideoProviderModels({ type: "openrouter" } as never, "openrouter-key" as never);
    await api.startVideoGeneration(input as never);
    await api.createVideoSequenceFromVideos({ boardId: "board", videoNodeIds: ["video-a", "video-b"] } as never);
    await api.listVideoJobs();
    await api.getVideoJob("job-1" as never);
    await api.recoverVideoGenerations();
    await api.stopVideoPolling("job-1" as never);
    await api.saveVideo("/managed/result.mp4" as never);
    await api.revealVideo("/managed/result.mp4" as never);

    expect(electronMocks.invoke.mock.calls).toEqual([
      ["video:import", bytes, "video/mp4"],
      ["audio:import", bytes, "audio/mpeg"],
      ["video:capabilities"],
      ["videoProvider:listModels", { type: "openrouter" }, "openrouter-key"],
      ["video:start", input],
      ["videoSequence:createFromVideos", { boardId: "board", videoNodeIds: ["video-a", "video-b"] }],
      ["video:list"],
      ["video:get", "job-1"],
      ["video:recover"],
      ["video:stopPolling", "job-1"],
      ["video:save", "/managed/result.mp4"],
      ["video:reveal", "/managed/result.mp4"]
    ]);
  });
});
