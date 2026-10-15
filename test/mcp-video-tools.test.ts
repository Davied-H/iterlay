import { describe, expect, it } from "vitest";
import { mcpFixture } from "./helpers/mcp-fixture";
describe("typed MCP video commands", () => {
  it("passes typed media references to the video service", async () => {
    const f = mcpFixture();
    f.mocks.startVideoGeneration.mockResolvedValue({ id: "video", status: "queued" });
    expect(await f.commands.call("generate_video", { boardId: "board", prompt: "animate", firstFramePath: "/first.png", referenceVideoPaths: ["/reference.mp4"] })).toMatchObject({ videoGenerationId: "video" });
    expect(f.mocks.startVideoGeneration).toHaveBeenCalledWith(expect.objectContaining({ firstFramePath: "/first.png", referenceVideoPaths: ["/reference.mp4"], durationSeconds: 5 }));
  });
  it("persists completed output once without duplicate board nodes", async () => {
    const f = mcpFixture();
    f.mocks.getVideoJob.mockResolvedValue({ id: "video", status: "completed", input: { boardId: "board", mode: "generate" }, outputVideoPath: "/output.mp4", mimeType: "video/mp4" });
    await f.commands.call("get_video_generation_status", { videoGenerationId: "video" });
    expect(f.mocks.appendBoardNodes).toHaveBeenCalledOnce();
    f.mocks.getBoard.mockResolvedValue({ id: "board", nodes: [{ id: "output", type: "video", videoPath: "/output.mp4" }] });
    await f.commands.call("get_video_generation_status", { videoGenerationId: "video" });
    expect(f.mocks.appendBoardNodes).toHaveBeenCalledOnce();
  });
  it("distinguishes stopping local polling from remote cancellation", async () => {
    const f = mcpFixture();
    f.mocks.stopVideoPolling.mockResolvedValue({ stopped: true, job: null });
    expect(await f.commands.call("stop_video_polling", { videoGenerationId: "video" })).toMatchObject({ stopped: true, remoteCancelled: false });
  });
  it("validates import payloads before touching managed storage", async () => {
    const f = mcpFixture();
    await expect(f.commands.call("import_video", { boardId: "board", dataUrl: "https://example.com/video.mp4" })).rejects.toThrow("data URL");
    expect(f.mocks.importVideo).not.toHaveBeenCalled();
  });
});
