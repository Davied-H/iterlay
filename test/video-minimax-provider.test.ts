import { describe, expect, it, vi } from "vitest";
import {
  buildMiniMaxVideoInput,
  MINIMAX_H3_MAX_CAPABILITY,
  MiniMaxVideoProvider
} from "../electron/providers/video-minimax.js";
import type { MiniMaxVideoProviderConfig } from "../electron/providers/video-types.js";

const config: MiniMaxVideoProviderConfig = {
  provider: "minimax",
  baseUrl: "https://api.minimax.io",
  apiKey: "minimax-key",
  model: "MiniMax-H3"
};

describe("MiniMaxVideoProvider", () => {
  it("builds V2 multimodal content and maps desktop settings", () => {
    expect(buildMiniMaxVideoInput({
      prompt: "镜头向前推进",
      ratio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      inputs: [
        { id: "first", kind: "image", role: "first-frame", mimeType: "image/png", bytes: Buffer.from("first") },
        { id: "last", kind: "image", role: "last-frame", mimeType: "image/png", url: "https://media.test/last.png" }
      ]
    }, "MiniMax-H3")).toMatchObject({
      model: "MiniMax-H3",
      resolution: "768P",
      duration: 5,
      ratio: "adaptive",
      content: [
        { type: "text", text: "镜头向前推进" },
        { type: "image_url", role: "first_frame" },
        { type: "image_url", role: "last_frame" }
      ]
    });
  });

  it("lists H3 capabilities and submits, polls, cancels, and downloads V2 tasks", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: "mini-task" }))
      .mockResolvedValueOnce(jsonResponse({
        task: { status: "succeeded", content: { url: "https://media.test/result.mp4" } }
      }))
      .mockResolvedValueOnce(jsonResponse({ status: "cancelled" }))
      .mockResolvedValueOnce(new Response(Buffer.from("video"), { headers: { "content-type": "video/mp4" } }));
    const provider = new MiniMaxVideoProvider(fetchMock);

    await expect(provider.listModels({ ...config, apiKey: "" })).resolves.toEqual([
      expect.objectContaining({ id: "MiniMax-H3" }),
      expect.objectContaining({
        id: "MiniMax-H3-Max",
        capability: expect.objectContaining({
          durationSeconds: MINIMAX_H3_MAX_CAPABILITY.durationSeconds,
          resolutions: MINIMAX_H3_MAX_CAPABILITY.resolutions
        })
      })
    ]);
    const task = await provider.submit({ prompt: "海边日落", model: config.model }, config);
    expect(task).toMatchObject({ provider: "minimax", id: "mini-task", status: "queued" });
    const completed = await provider.poll(task, config);
    expect(completed).toMatchObject({
      status: "succeeded",
      outputs: [{ kind: "video", role: "result", url: "https://media.test/result.mp4" }]
    });
    await expect(provider.cancel(task, config)).resolves.toMatchObject({ supported: true, cancelled: true });
    await expect(provider.download(completed.outputs![0], config)).resolves.toMatchObject({
      mimeType: "video/mp4",
      bytes: Buffer.from("video")
    });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.minimax.io/v2/video_generation");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.minimax.io/v2/query/video_generation/mini-task");
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.minimax.io/v2/video_generation/mini-task");
  });

  it("rejects mixed frame and reference inputs", async () => {
    const provider = new MiniMaxVideoProvider(vi.fn() as typeof fetch);
    await expect(provider.submit({
      prompt: "test",
      inputs: [
        { id: "first", kind: "image", role: "first-frame", mimeType: "image/png", bytes: Buffer.from("first") },
        { id: "ref", kind: "image", role: "reference-image", mimeType: "image/png", bytes: Buffer.from("ref") }
      ]
    }, config)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
