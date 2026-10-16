import { describe, expect, it, vi } from "vitest";
import {
  buildOpenRouterVideoInput,
  OpenRouterVideoProvider,
  openRouterVideoApiRoot
} from "../electron/providers/video-openrouter.js";
import type { OpenRouterVideoProviderConfig, VideoRemoteTask } from "../electron/providers/video-types.js";

const config: OpenRouterVideoProviderConfig = {
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api",
  apiKey: "openrouter-key",
  model: "google/veo-3.1"
};

describe("OpenRouter video provider", () => {
  it("builds the documented frame_images and input_references request shape", () => {
    expect(buildOpenRouterVideoInput({
      prompt: "让镜头向前移动",
      ratio: "16:9",
      resolution: "720p",
      durationSeconds: 8,
      generateAudio: true,
      inputs: [
        { id: "first", kind: "image", role: "first-frame", mimeType: "image/png", bytes: Buffer.from("first") },
        { id: "last", kind: "image", role: "last-frame", mimeType: "image/png", url: "https://media.test/last.png" },
        { id: "ref", kind: "image", role: "reference-image", mimeType: "image/jpeg", bytes: Buffer.from("ref") }
      ]
    }, "google/veo-3.1")).toEqual({
      model: "google/veo-3.1",
      prompt: "让镜头向前移动",
      aspect_ratio: "16:9",
      resolution: "720p",
      duration: 8,
      generate_audio: true,
      frame_images: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from("first").toString("base64")}` }, frame_type: "first_frame" },
        { type: "image_url", image_url: { url: "https://media.test/last.png" }, frame_type: "last_frame" }
      ],
      input_references: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from("ref").toString("base64")}` } }
      ]
    });
  });

  it("rejects undocumented video/audio references and remix modes", () => {
    expect(() => buildOpenRouterVideoInput({
      prompt: "重混视频",
      mode: "remix",
      inputs: [{ id: "video", kind: "video", role: "reference-video", mimeType: "video/mp4", bytes: Buffer.from("video") }]
    }, config.model)).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() => buildOpenRouterVideoInput({
      prompt: "参考音频",
      inputs: [{ id: "audio", kind: "audio", role: "reference-audio", mimeType: "audio/mpeg", bytes: Buffer.from("audio") }]
    }, config.model)).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });

  it("submits, polls, and downloads the authenticated content fallback", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "job-1", polling_url: "/api/v1/videos/job-1", status: "pending" }, 202))
      .mockResolvedValueOnce(jsonResponse({ id: "job-1", polling_url: "/api/v1/videos/job-1", status: "completed" }))
      .mockResolvedValueOnce(new Response(Buffer.from("video"), { headers: { "Content-Type": "video/mp4" } }));
    const provider = new OpenRouterVideoProvider(fetchMock);

    const submitted = await provider.submit({ prompt: "海边日落", model: config.model }, config);
    expect(submitted).toMatchObject({ provider: "openrouter", id: "job-1", status: "queued", statusUrl: "https://openrouter.ai/api/v1/videos/job-1" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/videos");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer openrouter-key", "Content-Type": "application/json" }
    });

    const completed = await provider.poll(submitted, config);
    expect(completed).toMatchObject({ status: "succeeded" });
    expect(completed.outputs?.[0].url).toBe("https://openrouter.ai/api/v1/videos/job-1/content?index=0");
    const downloaded = await provider.download(completed.outputs![0], config);
    expect(downloaded.bytes.toString()).toBe("video");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ headers: { Authorization: "Bearer openrouter-key" } });
  });

  it("uses unsigned_urls without leaking the API key and lists video models", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        id: "job-2",
        polling_url: "/api/v1/videos/job-2",
        status: "completed",
        unsigned_urls: ["https://storage.test/result.mp4"]
      }))
      .mockResolvedValueOnce(new Response(Buffer.from("unsigned"), { headers: { "Content-Type": "video/mp4" } }))
      .mockResolvedValueOnce(jsonResponse({ data: [
        { id: "google/veo-3.1", name: "Veo 3.1" },
        { id: "bytedance/seedance-2.0", name: "Seedance 2.0" },
        { id: "google/veo-3.1", name: "duplicate" }
      ] }));
    const provider = new OpenRouterVideoProvider(fetchMock);
    const task: VideoRemoteTask = {
      provider: "openrouter", id: "job-2", model: config.model, status: "running",
      submittedAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z"
    };

    const completed = await provider.poll(task, config);
    await provider.download(completed.outputs![0], config);
    expect(fetchMock.mock.calls[1][0]).toBe("https://storage.test/result.mp4");
    expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
    await expect(provider.listModels(config)).resolves.toEqual([
      { id: "google/veo-3.1", ownedBy: "google" },
      { id: "bytedance/seedance-2.0", ownedBy: "bytedance" }
    ]);
    expect(fetchMock.mock.calls[2][0]).toBe("https://openrouter.ai/api/v1/videos/models");
  });

  it("normalizes failed lifecycle states and does not claim remote cancellation support", async () => {
    const provider = new OpenRouterVideoProvider(vi.fn().mockResolvedValue(jsonResponse({
      id: "job-failed", polling_url: "/api/v1/videos/job-failed", status: "failed", error: "upstream failed"
    })));
    const task: VideoRemoteTask = {
      provider: "openrouter", id: "job-failed", model: config.model, status: "running",
      submittedAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z"
    };
    await expect(provider.poll(task, config)).resolves.toMatchObject({ status: "failed", error: "upstream failed" });
    await expect(provider.cancel(task, config)).resolves.toMatchObject({ supported: false, cancelled: false, task });
  });

  it("normalizes both supported OpenRouter base URL forms", () => {
    expect(openRouterVideoApiRoot("https://openrouter.ai/api")).toBe("https://openrouter.ai/api/v1");
    expect(openRouterVideoApiRoot("https://openrouter.ai/api/v1/")).toBe("https://openrouter.ai/api/v1");
  });

  it("preserves model parameter constraints from the public catalog", async () => {
    const provider = new OpenRouterVideoProvider(vi.fn().mockResolvedValue(jsonResponse({ data: [{
      id: "google/veo-3.1-fast",
      supported_durations: [4, 6, 8],
      supported_aspect_ratios: ["16:9", "9:16"],
      supported_resolutions: ["720p", "1080p", "4K"]
    }] })));
    await expect(provider.listModels(config)).resolves.toEqual([{
      id: "google/veo-3.1-fast", ownedBy: "google",
      supportedDurations: [4, 6, 8], supportedRatios: ["16:9", "9:16"],
      supportedResolutions: ["720p", "1080p", "4K"]
    }]);
  });

  it("lists public video models without requiring an API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "google/veo-3.1" }] }));
    const provider = new OpenRouterVideoProvider(fetchMock);
    await expect(provider.listModels({ ...config, apiKey: "" })).resolves.toEqual([{ id: "google/veo-3.1", ownedBy: "google" }]);
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
