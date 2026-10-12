import { describe, expect, it, vi } from "vitest";
import { buildRendererCall } from "../electron/mcp-bridge.js";
import { listMcpTools } from "../electron/mcp-stdio-core.js";

type WorkbenchMock = Record<string, ReturnType<typeof vi.fn>>;

async function runRendererCall(method: string, args: Record<string, unknown>, imageWorkbench: WorkbenchMock) {
  const window = { imageWorkbench, dispatchEvent: vi.fn() };
  const crypto = { randomUUID: vi.fn(() => "generated-uuid") };
  class CustomEventMock {
    constructor(public type: string, public init: unknown) {}
  }
  const execute = new Function("window", "crypto", "CustomEvent", "atob", `return ${buildRendererCall(method, args)}`);
  return execute(window, crypto, CustomEventMock, (value: string) => Buffer.from(value, "base64").toString("binary"));
}

describe("MCP video tools", () => {
  it("publishes the four video tools with their required inputs", () => {
    const tools = new Map(listMcpTools().map((tool) => [tool.name, tool]));

    expect(tools.get("generate_video")).toMatchObject({
      inputSchema: {
        required: ["boardId", "prompt"],
        properties: {
          mode: { enum: ["generate", "remix", "extend"] },
          generationNodeId: { type: "string" }
        }
      }
    });
    expect(tools.get("get_video_generation_status")).toMatchObject({
      inputSchema: { required: ["videoGenerationId"] }
    });
    expect(tools.get("stop_video_polling")).toMatchObject({
      inputSchema: { required: ["videoGenerationId"] }
    });
    expect(tools.get("import_video")).toMatchObject({
      inputSchema: { required: ["dataUrl"] }
    });
  });

  it("maps generate_video inputs to startVideoGeneration", async () => {
    const startVideoGeneration = vi.fn().mockResolvedValue({
      id: "video-job-1",
      status: "queued",
      createdAt: "2026-08-11T00:00:00.000Z",
      input: { boardId: "board-1" },
      model: "seedance"
    });
    const args = {
      boardId: "board-1",
      prompt: "镜头缓慢推进",
      mode: "remix",
      model: "seedance",
      aspectRatio: "9:16",
      resolution: "1080p",
      durationSeconds: 8,
      referenceImagePaths: ["/managed/reference.png"],
      firstFramePath: "/managed/first.png",
      lastFramePath: "/managed/last.png",
      sourceVideoPath: "/managed/source.mp4",
      referenceVideoPaths: ["/managed/motion.mp4"],
      referenceAudioPaths: ["/managed/beat.mp3"],
      generationNodeId: "generation-node-1",
      targetVideoNodeId: "video-node-1",
      generateAudio: false,
      watermark: true,
      providerId: "ark"
    };

    const result = await runRendererCall("generate_video", args, { startVideoGeneration });

    expect(startVideoGeneration).toHaveBeenCalledWith(args);
    expect(result).toMatchObject({ videoGenerationId: "video-job-1", status: "queued", boardId: "board-1" });
  });

  it("defaults generate_video audio generation to off", async () => {
    const startVideoGeneration = vi.fn().mockResolvedValue({
      id: "video-job-default-audio",
      status: "queued",
      createdAt: "2026-08-11T00:00:00.000Z",
      input: { boardId: "board-1" },
      model: "seedance"
    });

    await runRendererCall("generate_video", {
      boardId: "board-1",
      prompt: "镜头缓慢推进"
    }, { startVideoGeneration });

    expect(startVideoGeneration).toHaveBeenCalledWith(expect.objectContaining({
      generateAudio: false
    }));
  });

  it("returns managed completed output and appends its video node only once", async () => {
    const nodes: Array<Record<string, unknown>> = [];
    const job = {
      id: "video-job-2",
      status: "completed",
      createdAt: "2026-08-11T00:00:00.000Z",
      completedAt: "2026-08-11T00:01:00.000Z",
      input: { boardId: "board-2", prompt: "海面流动" },
      model: "seedance",
      outputVideoPath: "/managed/result.mp4",
      outputPosterPath: "/managed/result.jpg",
      mimeType: "video/mp4",
      width: 1280,
      height: 720,
      durationMs: 5000,
      remoteOutputUrl: "https://provider.example/temporary.mp4"
    };
    const appendBoardNodes = vi.fn(async (_boardId: string, appended: Array<Record<string, unknown>>) => {
      nodes.push(...appended);
    });
    const imageWorkbench = {
      getVideoJob: vi.fn().mockResolvedValue(job),
      getBoard: vi.fn(async () => ({ id: "board-2", nodes })),
      appendBoardNodes
    };

    const first = await runRendererCall("get_video_generation_status", { videoGenerationId: job.id }, imageWorkbench);
    const second = await runRendererCall("get_video_generation_status", { videoGenerationId: job.id }, imageWorkbench);

    expect(first).toMatchObject({
      videoGenerationId: job.id,
      status: "completed",
      video: { path: "/managed/result.mp4", posterPath: "/managed/result.jpg" }
    });
    expect(JSON.stringify(first)).not.toContain("https://provider.example");
    expect(second).toMatchObject({ video: { path: "/managed/result.mp4" } });
    expect(appendBoardNodes).toHaveBeenCalledTimes(1);
    expect(nodes[0]).toMatchObject({
      id: "video-video-job-2",
      type: "video",
      videoPath: "/managed/result.mp4",
      source: "generated"
    });
  });

  it("states that stop_video_polling does not cancel the remote task", async () => {
    const stopVideoPolling = vi.fn().mockResolvedValue({ stopped: true, job: null });

    const result = await runRendererCall(
      "stop_video_polling",
      { videoGenerationId: "video-job-3" },
      { stopVideoPolling }
    );

    expect(stopVideoPolling).toHaveBeenCalledWith("video-job-3");
    expect(result).toMatchObject({
      stopped: true,
      videoGenerationId: "video-job-3",
      remoteCancelled: false
    });
    expect(result.message).toContain("远端任务不会被取消");
  });

  it("does not append remix results as ordinary video nodes", async () => {
    const appendBoardNodes = vi.fn();
    const job = {
      id: "video-job-remix",
      status: "completed",
      createdAt: "2026-08-11T00:00:00.000Z",
      input: {
        boardId: "board-remix",
        mode: "remix",
        generationNodeId: "generation-node-1",
        targetVideoNodeId: "video-node-1"
      },
      model: "seedance",
      outputVideoPath: "/managed/remix.mp4"
    };

    await runRendererCall("get_video_generation_status", { videoGenerationId: job.id }, {
      getVideoJob: vi.fn().mockResolvedValue(job),
      getBoard: vi.fn(),
      appendBoardNodes
    });

    expect(appendBoardNodes).not.toHaveBeenCalled();
  });

  it("decodes a video data URL, imports it, and optionally appends a board node", async () => {
    const importVideo = vi.fn().mockResolvedValue({ path: "/managed/import.mp4", mimeType: "video/mp4" });
    const appendBoardNodes = vi.fn().mockResolvedValue(undefined);

    const result = await runRendererCall(
      "import_video",
      { dataUrl: "data:video/mp4;base64,AAEC/w==", boardId: "board-3" },
      { importVideo, appendBoardNodes }
    );

    const [buffer, mimeType] = importVideo.mock.calls[0];
    expect([...new Uint8Array(buffer)]).toEqual([0, 1, 2, 255]);
    expect(mimeType).toBe("video/mp4");
    expect(appendBoardNodes).toHaveBeenCalledWith("board-3", [expect.objectContaining({
      type: "video",
      videoPath: "/managed/import.mp4",
      source: "upload"
    })]);
    expect(result).toEqual({ path: "/managed/import.mp4", mimeType: "video/mp4", boardId: "board-3" });
  });

  it("rejects remote URLs passed to import_video", async () => {
    const importVideo = vi.fn();

    await expect(runRendererCall(
      "import_video",
      { dataUrl: "https://provider.example/result.mp4" },
      { importVideo }
    )).rejects.toThrow("仅支持 mp4、mov 或 webm 的视频 data URL");
    expect(importVideo).not.toHaveBeenCalled();
  });
});
