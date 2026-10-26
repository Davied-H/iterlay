import { describe, expect, it, vi } from "vitest";
import { workspaceFixture } from "./helpers/workspace-fixture";
describe("typed workspace video commands", () => {
  it("passes typed media references to the video service", async () => {
    const f = workspaceFixture();
    f.mocks.startVideoGeneration.mockResolvedValue({ id: "video", status: "queued" });
    expect(await f.commands.call("generate_video", { boardId: "board", prompt: "animate", firstFramePath: "/first.png", referenceVideoPaths: ["/reference.mp4"] })).toMatchObject({ videoGenerationId: "video" });
    expect(f.mocks.startVideoGeneration).toHaveBeenCalledWith(expect.objectContaining({ firstFramePath: "/first.png", referenceVideoPaths: ["/reference.mp4"], durationSeconds: 5 }));
  });
  it("persists completed output once without duplicate board nodes", async () => {
    const f = workspaceFixture();
    f.mocks.getVideoJob.mockResolvedValue({ id: "video", status: "completed", input: { boardId: "board", mode: "generate" }, outputVideoPath: "/output.mp4", mimeType: "video/mp4" });
    await f.commands.call("get_video_generation_status", { videoGenerationId: "video" });
    expect(f.mocks.appendBoardNodes).toHaveBeenCalledOnce();
    f.mocks.getBoard.mockResolvedValue({ id: "board", nodes: [{ id: "output", type: "video", videoPath: "/output.mp4" }] });
    await f.commands.call("get_video_generation_status", { videoGenerationId: "video" });
    expect(f.mocks.appendBoardNodes).toHaveBeenCalledOnce();
  });
  it("shows and focuses the generation anchor before a slow provider accepts the task", async () => {
    const f = workspaceFixture();
    let accept!: (job: unknown) => void;
    f.mocks.startVideoGeneration.mockImplementation(() => new Promise(resolve => { accept = resolve; }));
    const submission = f.commands.call("generate_video", { boardId: "board", prompt: "animate", aspectRatio: "9:16" });
    await vi.waitFor(() => expect(f.mocks.startVideoGeneration).toHaveBeenCalledOnce());
    const input = f.mocks.startVideoGeneration.mock.calls[0][0] as { generationNodeId: string };
    expect(input.generationNodeId).toBeTruthy();
    expect(f.mocks.appendBoardNodes).toHaveBeenCalledWith("board", [expect.objectContaining({
      id: input.generationNodeId, type: "video-generation", aspectRatio: "9:16", status: "submitting"
    }), expect.objectContaining({ type: "video", status: "submitting", generationNodeId: input.generationNodeId })]);
    expect(f.emit).toHaveBeenCalledWith(expect.objectContaining({ type: "board-updated", boardId: "board", nodeIds: [`video-output-pending-${input.generationNodeId}`] }));
    accept({ id: "video", status: "queued" });
    await submission;
    expect(f.emit).toHaveBeenLastCalledWith(expect.objectContaining({ nodeIds: ["video-output-video"] }));
  });
  it("refreshes and focuses an already persisted result once on completion", async () => {
    const f = workspaceFixture();
    f.mocks.getBoard.mockResolvedValue({ id: "board", nodes: [{ id: "video-output-video", type: "video", videoPath: "/output.mp4" }] });
    f.mocks.getVideoJob.mockResolvedValue({ id: "video", status: "completed", input: { boardId: "board" }, outputVideoPath: "/output.mp4" });
    await f.commands.call("get_video_generation_status", { videoGenerationId: "video", preserveView: true });
    await f.commands.call("get_video_generation_status", { videoGenerationId: "video", preserveView: true });
    expect(f.mocks.appendBoardNodes).not.toHaveBeenCalled();
    expect(f.emit).toHaveBeenCalledOnce();
    expect(f.emit).toHaveBeenCalledWith({ type: "board-updated", boardId: "board", nodeIds: ["video-output-video"], preserveView: true });
  });
  it("does not leave an endless submitting node after validation fails", async () => {
    const f = workspaceFixture();
    f.mocks.startVideoGeneration.mockImplementation(async (input) => {
      f.mocks.getBoard.mockResolvedValue({ id: "board", nodes: [{ id: (input as { generationNodeId: string }).generationNodeId, type: "video-generation", status: "submitting" }] });
      throw new Error("unsupported model");
    });
    await expect(f.commands.call("generate_video", { boardId: "board", prompt: "animate" })).rejects.toThrow("unsupported model");
    expect(f.mocks.saveBoard).toHaveBeenCalledWith({ id: "board", nodes: [expect.objectContaining({ status: "failed", error: "unsupported model" })] });
  });
  it("reveals completion even when the assistant makes no further status calls", async () => {
    vi.useFakeTimers();
    try {
      const f = workspaceFixture();
      f.mocks.startVideoGeneration.mockResolvedValue({ id: "video", status: "queued" });
      await f.commands.call("generate_video", { boardId: "board", prompt: "animate" });
      f.mocks.getBoard.mockResolvedValue({ id: "board", nodes: [{ id: "video-output-video", type: "video", videoPath: "/output.mp4" }] });
      f.mocks.getVideoJob.mockResolvedValue({ id: "video", status: "completed", input: { boardId: "board" }, outputVideoPath: "/output.mp4" });
      f.emit.mockClear();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(f.emit).toHaveBeenCalledWith(expect.objectContaining({ type: "board-updated", nodeIds: ["video-output-video"] }));
      await vi.advanceTimersByTimeAsync(4_000);
      expect(f.mocks.getVideoJob).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("distinguishes stopping local polling from remote cancellation", async () => {
    const f = workspaceFixture();
    f.mocks.stopVideoPolling.mockResolvedValue({ stopped: true, job: null });
    expect(await f.commands.call("stop_video_polling", { videoGenerationId: "video" })).toMatchObject({ stopped: true, remoteCancelled: false });
  });
  it("validates import payloads before touching managed storage", async () => {
    const f = workspaceFixture();
    await expect(f.commands.call("import_video", { boardId: "board", dataUrl: "https://example.com/video.mp4" })).rejects.toThrow("data URL");
    expect(f.mocks.importVideo).not.toHaveBeenCalled();
  });
});
