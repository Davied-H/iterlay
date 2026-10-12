import { describe, expect, it, vi } from "vitest";
import type { LicenseService } from "../electron/licensing/service.js";
import { OfficialVideoProvider } from "../electron/providers/video-official.js";
import type { OfficialVideoProviderConfig, VideoRemoteTask } from "../electron/providers/video-types.js";

const config: OfficialVideoProviderConfig = { provider: "official", model: "官方视频模型" };

function fakeLicense() {
  return {
    markCredentialRejected: vi.fn(),
    createSignedRequest: vi.fn(async (purpose: string, payload: string) => ({
      grant: "grant",
      nonce: "nonce-with-enough-length",
      proof: "proof",
      appVersion: "1.0.0",
      purpose,
      bodyHash: `hash:${payload}`
    }))
  } as unknown as LicenseService;
}

function job(status: VideoRemoteTask["status"] = "running") {
  return { job: { id: "video-job", status, model: "fal-ai/kling-video", createdAt: "2026-08-12T00:00:00.000Z" } };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

describe("OfficialVideoProvider", () => {
  it("signs generate payloads and maps first and last frame inputs", async () => {
    const license = fakeLicense();
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { auth: { purpose: string; bodyHash: string }; payload: Record<string, unknown> };
      expect(body.auth.purpose).toBe("official.videos.generate");
      expect(body.auth.bodyHash).toBe(`hash:${JSON.stringify(body.payload)}`);
      expect(body.payload).toMatchObject({
        prompt: "镜头缓慢推进",
        model: "official-seedance",
        mode: "generate",
        ratio: "16:9",
        resolution: "720p",
        durationSeconds: 5,
        inputs: [
          { id: "first", kind: "image", role: "first-frame", dataBase64: "Zmlyc3Q=" },
          { id: "last", kind: "image", role: "last-frame", dataBase64: "bGFzdA==" }
        ]
      });
      return json(job());
    });
    const provider = new OfficialVideoProvider(license, "https://manage.example.com/api/v1/", fetcher as typeof fetch);

    await expect(provider.submit({
      prompt: " 镜头缓慢推进 ",
      model: "official-seedance",
      ratio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      inputs: [
        { id: "first", kind: "image", role: "first-frame", mimeType: "image/png", bytes: Buffer.from("first") },
        { id: "last", kind: "image", role: "last-frame", mimeType: "image/png", bytes: Buffer.from("last") }
      ]
    }, config)).resolves.toMatchObject({ provider: "official", id: "video-job", status: "running" });
  });

  it("polls, cancels and downloads through signed official endpoints", async () => {
    const purposes: string[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { auth: { purpose: string }; payload: Record<string, string> };
      purposes.push(body.auth.purpose);
      if (body.auth.purpose === "official.videos.status") return json({ job: { ...job("succeeded").job, outputs: [{ id: "output-1", kind: "video", role: "result", mimeType: "video/mp4" }] } });
      if (body.auth.purpose === "official.videos.cancel") return json({ job: job("cancelled").job, supported: true, cancelled: true });
      expect(body.payload).toEqual({ jobId: "video-job", outputId: "output-1" });
      return new Response(Buffer.from("video-bytes"), { headers: { "content-type": "video/mp4" } });
    });
    const provider = new OfficialVideoProvider(fakeLicense(), "https://manage.example.com/api/v1", fetcher as typeof fetch);
    const task: VideoRemoteTask = { provider: "official", id: "video-job", model: "official", status: "running", submittedAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z" };
    const completed = await provider.poll(task, config);
    await expect(provider.cancel(task, config)).resolves.toMatchObject({ supported: true, cancelled: true });
    await expect(provider.download(completed.outputs![0], config)).resolves.toMatchObject({ mimeType: "video/mp4", bytes: Buffer.from("video-bytes") });
    expect(purposes).toEqual(["official.videos.status", "official.videos.cancel", "official.videos.download"]);
  });

  it.each(["completed", "complete", "success", "done"])("normalizes official terminal status %s", async (status) => {
    const provider = new OfficialVideoProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async () => json({
        job: {
          id: "video-job",
          status,
          outputs: [{ id: "output-1", kind: "video", role: "result", mimeType: "video/mp4" }]
        }
      })) as typeof fetch
    );
    const task: VideoRemoteTask = {
      provider: "official",
      id: "video-job",
      model: "official",
      status: "running",
      submittedAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z"
    };

    await expect(provider.poll(task, config)).resolves.toMatchObject({
      status: "succeeded",
      rawStatus: status
    });
  });

  it("rejects unknown official statuses instead of polling forever", async () => {
    const provider = new OfficialVideoProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async () => json({ job: { id: "video-job", status: "mystery" } })) as typeof fetch
    );
    const task: VideoRemoteTask = {
      provider: "official",
      id: "video-job",
      model: "official",
      status: "running",
      submittedAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z"
    };

    await expect(provider.poll(task, config)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: "官方视频服务返回了未知任务状态：mystery"
    });
  });

  it("maps official worker failures to a user-facing refunded message", async () => {
    const provider = new OfficialVideoProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async () => json({ job: { id: "video-job", status: "failed", errorCode: "poll_failed" } })) as typeof fetch
    );
    const task: VideoRemoteTask = {
      provider: "official",
      id: "video-job",
      model: "official",
      status: "running",
      submittedAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z"
    };

    await expect(provider.poll(task, config)).resolves.toMatchObject({
      status: "failed",
      error: "官方视频上游状态查询连续失败，任务已结束并退还金豆。"
    });
  });

  it.each([
    [401, "invalid_credential"],
    [402, "insufficient_gold_beans"],
    [410, "video_result_expired"],
    [413, "HTTP_413"]
  ])("maps HTTP %i errors", async (status, code) => {
    const license = fakeLicense();
    const provider = new OfficialVideoProvider(license, "https://manage.example.com/api/v1", vi.fn(async () => json(status === 413 ? {} : { code }, status)) as typeof fetch);
    await expect(provider.submit({ prompt: "test" }, config)).rejects.toMatchObject({ code, status });
    if (status === 401) expect(license.markCredentialRejected).toHaveBeenCalled();
  });

  it("explains that a 413 happened after automatic resizing", async () => {
    const provider = new OfficialVideoProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async () => json({}, 413)) as typeof fetch
    );

    await expect(provider.submit({ prompt: "test" }, config)).rejects.toMatchObject({
      code: "HTTP_413",
      message: "视频参考图片自动缩小后仍超过官方服务限制，请更换图片后重试。"
    });
  });

  it("reads official video availability and the independent gold bean balance", async () => {
    const fetcher = vi.fn(async () => json({
      credits: { balance: 100 },
      goldBeans: { balance: 0 },
      providerAvailable: true,
      videoAvailable: true,
      videoGoldBeanCostPerSecond: 1
    }));
    const provider = new OfficialVideoProvider(fakeLicense(), "https://manage.example.com/api/v1", fetcher as typeof fetch);

    await expect(provider.testConnection()).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("describes a zero gold bean balance without suggesting activation", async () => {
    const provider = new OfficialVideoProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async () => json({ code: "insufficient_gold_beans" }, 402)) as typeof fetch
    );

    await expect(provider.submit({ prompt: "test" }, config)).rejects.toMatchObject({
      code: "insufficient_gold_beans",
      message: "金豆余额不足，请联系管理员添加金豆，或切换自定义视频 Provider。"
    });
  });

  it.each([
    [{ prompt: "test", mode: "remix" }, "UNSUPPORTED_VIDEO_MODE"],
    [{ prompt: "test", mode: "extend" }, "UNSUPPORTED_VIDEO_MODE"],
    [{ prompt: "test", inputs: [{ id: "video", kind: "video", role: "reference", bytes: Buffer.from("video") }] }, "INVALID_REQUEST"]
  ])("rejects unsupported input before sending a request", async (input, code) => {
    const fetcher = vi.fn();
    const provider = new OfficialVideoProvider(fakeLicense(), "https://manage.example.com/api/v1", fetcher as typeof fetch);
    await expect(provider.submit(input as never, config)).rejects.toMatchObject({ code });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
