import { describe, expect, it, vi } from "vitest";
import { buildFalVideoInput, FalVideoProvider } from "../electron/providers/video-fal.js";
import type { FalVideoProviderConfig, VideoRemoteTask } from "../electron/providers/video-types.js";

const config: FalVideoProviderConfig = {
  provider: "fal",
  apiKey: "fal-key",
  baseUrl: "https://queue.fal.run",
  model: "fal-ai/kling-video/v2.1/standard/image-to-video"
};

describe("FalVideoProvider", () => {
  it("maps prompt, first/last frames and common options to fal input", () => {
    expect(buildFalVideoInput({
      prompt: "镜头缓慢推进",
      ratio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      generateAudio: true,
      inputs: [
        { id: "first", kind: "image", role: "first-frame", mimeType: "image/png", bytes: Buffer.from("first") },
        { id: "last", kind: "image", role: "last-frame", mimeType: "image/png", url: "https://media.test/last.png" }
      ]
    })).toMatchObject({
      prompt: "镜头缓慢推进",
      image_url: "data:image/png;base64,Zmlyc3Q=",
      end_image_url: "https://media.test/last.png",
      aspect_ratio: "16:9",
      resolution: "720p",
      duration: 5,
      generate_audio: true
    });
  });

  it("uses the string duration enum required by Seedance 2.0", () => {
    expect(buildFalVideoInput({
      prompt: "镜头缓慢推进",
      durationSeconds: 5,
      inputs: [{ id: "first", kind: "image", role: "first-frame", mimeType: "image/png", bytes: Buffer.from("first") }]
    }, "bytedance/seedance-2.0/image-to-video")).toMatchObject({ duration: "5" });
  });

  it("supplies a visible default motion prompt for Seedance 2.0 image-only input", () => {
    expect(buildFalVideoInput({
      prompt: "",
      inputs: [{ id: "first", kind: "image", role: "first-frame", mimeType: "image/png", bytes: Buffer.from("first") }]
    }, "bytedance/seedance-2.0/image-to-video")).toMatchObject({
      prompt: "在首尾画面之间自然过渡，保持主体与场景一致。"
    });
  });

  it("submits, polls the queue and reads a completed video", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        request_id: "fal-task",
        status: "IN_QUEUE",
        status_url: "https://queue.fal.run/fal-ai/seedance-2/requests/fal-task/status",
        response_url: "https://queue.fal.run/fal-ai/seedance-2/requests/fal-task",
        cancel_url: "https://queue.fal.run/fal-ai/seedance-2/requests/fal-task/cancel"
      }))
      .mockResolvedValueOnce(jsonResponse({ status: "COMPLETED" }))
      .mockResolvedValueOnce(jsonResponse({ video: { url: "https://media.test/result.mp4", content_type: "video/mp4" } }));
    const provider = new FalVideoProvider(fetchMock as typeof fetch);
    const queued = await provider.submit({ prompt: "海面日出" }, config);

    expect(queued).toMatchObject({ provider: "fal", id: "fal-task", status: "queued" });
    expect(fetchMock.mock.calls[0][0]).toBe(`https://queue.fal.run/${config.model}`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: expect.objectContaining({ Authorization: "Key fal-key" }) });
    await expect(provider.poll(queued, config)).resolves.toMatchObject({
      status: "succeeded",
      outputs: [{ kind: "video", role: "result", url: "https://media.test/result.mp4" }]
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://queue.fal.run/fal-ai/seedance-2/requests/fal-task/status");
    expect(fetchMock.mock.calls[2][0]).toBe("https://queue.fal.run/fal-ai/seedance-2/requests/fal-task");
  });

  it("cancels a fal queue task remotely", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "CANCELLED" }));
    const provider = new FalVideoProvider(fetchMock as typeof fetch);
    const task: VideoRemoteTask = {
      provider: "fal", id: "fal-task", model: config.model, status: "queued",
      submittedAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z"
    };
    await expect(provider.cancel(task, config)).resolves.toMatchObject({ supported: true, cancelled: true, task: { status: "cancelled" } });
    expect(fetchMock.mock.calls[0][0]).toContain("/requests/fal-task/cancel");
  });

  it("maps authentication errors", async () => {
    const provider = new FalVideoProvider(vi.fn().mockResolvedValue(jsonResponse({ error: "bad key" }, 401)) as typeof fetch);
    await expect(provider.submit({ prompt: "test" }, config)).rejects.toMatchObject({ code: "AUTH_ERROR", status: 401 });
  });

  it("surfaces fal validation details with their field path", async () => {
    const provider = new FalVideoProvider(vi.fn().mockResolvedValue(jsonResponse({
      detail: [{ loc: ["body", "duration"], msg: "Input should be 'auto', '4' or '5'", type: "enum" }]
    }, 422)) as typeof fetch);
    await expect(provider.submit({ prompt: "test", durationSeconds: 5 }, {
      ...config,
      model: "bytedance/seedance-2.0/image-to-video"
    })).rejects.toMatchObject({
      code: "FAL_API_ERROR",
      status: 422,
      message: "body.duration: Input should be 'auto', '4' or '5'"
    });
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}
