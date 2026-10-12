import { describe, expect, it, vi } from "vitest";
import { ARK_VIDEO_CAPABILITY, ArkVideoProvider } from "../electron/providers/video-ark.js";
import type { ArkVideoProviderConfig, VideoRemoteTask } from "../electron/providers/video-types.js";

const config: ArkVideoProviderConfig = {
  provider: "ark",
  apiKey: "ark-key",
  model: "doubao-seedance-1-5-pro"
};

const queuedTask: VideoRemoteTask = {
  provider: "ark",
  id: "task-1",
  model: config.model,
  status: "queued",
  submittedAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z"
};

describe("ArkVideoProvider", () => {
  it("declares Ark capabilities without claiming remote cancellation", () => {
    expect(ARK_VIDEO_CAPABILITY).toMatchObject({
      provider: "ark",
      supportsCancel: false,
      maxInputs: { images: 9, videos: 3, audios: 3 },
      durationSeconds: { min: 4, max: 15, supportsAuto: true }
    });
  });

  it("submits text-to-video using Ark's task endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "task-1", status: "queued" }));
    const provider = new ArkVideoProvider(fetchMock as typeof fetch);

    const task = await provider.submit({ prompt: "海面日出" }, config);

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer ark-key", "Content-Type": "application/json" }
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      model: config.model,
      content: [{ type: "text", text: "海面日出" }],
      ratio: "adaptive",
      resolution: "720p",
      duration: 5,
      generate_audio: false,
      watermark: false
    });
    expect(task).toMatchObject({ provider: "ark", id: "task-1", model: config.model, status: "queued" });
  });

  it("maps first/last frames and future reference media into structured Ark content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { task_id: "task-media", status: "pending" } }));
    const provider = new ArkVideoProvider(fetchMock as typeof fetch);

    await provider.submit({
      prompt: "平滑转场",
      ratio: "16:9",
      resolution: "1080p",
      durationSeconds: "auto",
      generateAudio: false,
      watermark: true,
      inputs: [
        { id: "first", kind: "image", role: "first-frame", mimeType: "image/png", bytes: Buffer.from("first") },
        { id: "last", kind: "image", role: "last-frame", mimeType: "image/jpeg", url: "https://media.test/last.jpg" },
        { id: "image", kind: "image", role: "reference-image", mimeType: "image/webp", url: "https://media.test/ref.webp" },
        { id: "video", kind: "video", role: "reference-video", mimeType: "video/mp4", url: "https://media.test/ref.mp4" },
        { id: "audio", kind: "audio", role: "reference-audio", mimeType: "audio/mpeg", bytes: Buffer.from("audio") }
      ]
    }, config);

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      ratio: "16:9",
      resolution: "1080p",
      duration: -1,
      generate_audio: false,
      watermark: true
    });
    expect(body.content).toEqual([
      { type: "text", text: "平滑转场" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from("first").toString("base64")}` }, role: "first_frame" },
      { type: "image_url", image_url: { url: "https://media.test/last.jpg" }, role: "last_frame" },
      { type: "image_url", image_url: { url: "https://media.test/ref.webp" }, role: "reference_image" },
      { type: "video_url", video_url: { url: "https://media.test/ref.mp4" }, role: "reference_video" },
      { type: "audio_url", audio_url: { url: `data:audio/mpeg;base64,${Buffer.from("audio").toString("base64")}` }, role: "reference_audio" }
    ]);
  });

  it.each([
    ["pending", "queued"],
    ["processing", "running"],
    ["completed", "succeeded"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    ["expired", "expired"]
  ] as const)("normalizes poll status %s to %s", async (rawStatus, expectedStatus) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: rawStatus }));
    const provider = new ArkVideoProvider(fetchMock as typeof fetch);

    const task = await provider.poll(queuedTask, config);

    expect(task.status).toBe(expectedStatus);
    expect(task.rawStatus).toBe(rawStatus);
  });

  it("extracts video and last-frame outputs from succeeded task content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      status: "succeeded",
      content: {
        video_url: "https://media.test/result.mp4",
        last_frame_url: "https://media.test/poster.jpg"
      }
    }));
    const provider = new ArkVideoProvider(fetchMock as typeof fetch);

    const task = await provider.poll(queuedTask, config);

    expect(task.outputs).toEqual([
      { kind: "video", role: "result", url: "https://media.test/result.mp4", mimeType: "video/mp4" },
      { kind: "image", role: "last-frame", url: "https://media.test/poster.jpg" }
    ]);
  });

  it("does not call the network or mutate task state when cancel is unsupported", async () => {
    const fetchMock = vi.fn();
    const provider = new ArkVideoProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.cancel(queuedTask, config);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ supported: false, cancelled: false, task: queuedTask });
    expect(result.task.status).toBe("queued");
  });

  it("downloads a video result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("video-data", { headers: { "content-type": "video/mp4; charset=binary" } }));
    const provider = new ArkVideoProvider(fetchMock as typeof fetch);

    const result = await provider.download({ kind: "video", role: "result", url: "https://media.test/result.mp4" }, config);

    expect(result.bytes.toString()).toBe("video-data");
    expect(result.mimeType).toBe("video/mp4");
  });

  it("validates credentials, reference limits, and first/last-frame pairing before fetch", async () => {
    const fetchMock = vi.fn();
    const provider = new ArkVideoProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.submit({ prompt: "test" }, { ...config, apiKey: "" })).rejects.toMatchObject({ code: "AUTH_ERROR" });
    await expect(provider.submit({
      prompt: "test",
      inputs: Array.from({ length: 10 }, (_, index) => ({
        id: `image-${index}`,
        kind: "image" as const,
        role: "reference-image" as const,
        mimeType: "image/png",
        url: `https://media.test/${index}.png`
      }))
    }, config)).rejects.toMatchObject({ code: "TOO_MANY_REFERENCES" });
    await expect(provider.submit({
      prompt: "test",
      inputs: [{ id: "last", kind: "image", role: "last-frame", mimeType: "image/png", url: "https://media.test/last.png" }]
    }, config)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a source video for remix and extend modes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "task-extend", status: "queued" }));
    const provider = new ArkVideoProvider(fetchMock as typeof fetch);

    await expect(provider.submit({ prompt: "重新剪辑", mode: "remix" }, config))
      .rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(provider.submit({
      prompt: "延长镜头",
      mode: "extend",
      inputs: [{
        id: "source",
        kind: "video",
        role: "reference-video",
        mimeType: "video/mp4",
        url: "https://media.test/source.mp4"
      }]
    }, config)).resolves.toMatchObject({ id: "task-extend" });
  });

  it.each([
    [401, "AUTH_ERROR"],
    [429, "RATE_LIMITED"],
    [503, "PROVIDER_UNAVAILABLE"]
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "request failed" }, status));
    const provider = new ArkVideoProvider(fetchMock as typeof fetch);

    await expect(provider.submit({ prompt: "test" }, config)).rejects.toMatchObject({ code, status });
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
