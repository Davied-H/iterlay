import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryStore } from "../electron/storage/history-store.js";

describe("HistoryStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-history-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists jobs newest first", async () => {
    const store = new HistoryStore(dir);

    await store.addJob({
      id: "older",
      status: "succeeded",
      createdAt: "2026-05-05T01:00:00.000Z",
      prompt: "older",
      input: { workflowMode: "generate", prompt: "older", model: "gpt-image-1", size: "1024x1024", n: 1 },
      referenceImagePaths: [],
      outputImagePaths: ["older.png"]
    });
    await store.addJob({
      id: "newer",
      status: "succeeded",
      createdAt: "2026-05-05T02:00:00.000Z",
      prompt: "newer",
      input: { workflowMode: "generate", prompt: "newer", model: "gpt-image-1", size: "1024x1024", n: 1 },
      referenceImagePaths: [],
      outputImagePaths: ["newer.png"]
    });

    const jobs = await store.listJobs();
    expect(jobs.map((job) => job.id)).toEqual(["newer", "older"]);
  });

  it("serializes concurrent mutations without losing jobs", async () => {
    const store = new HistoryStore(dir);
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.addJob({
          id: `job-${index}`,
          status: "succeeded",
          createdAt: new Date(2026, 0, 1, 0, index).toISOString(),
          prompt: `prompt-${index}`,
          input: { workflowMode: "generate", prompt: `prompt-${index}`, model: "gpt-image-1", size: "1024x1024", n: 1 },
          referenceImagePaths: [],
          outputImagePaths: [`${index}.png`]
        })
      )
    );

    const jobs = await store.listJobs();
    expect(jobs).toHaveLength(20);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(20);
  });

  it("imports many jobs in one mutation and replaces matching ids", async () => {
    const store = new HistoryStore(dir);
    const base = {
      status: "succeeded" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      prompt: "initial",
      input: { workflowMode: "generate" as const, prompt: "initial", model: "gpt-image-1", size: "1024x1024", n: 1 },
      referenceImagePaths: [],
      outputImagePaths: ["image.png"]
    };
    await store.addJob({ ...base, id: "same" });
    await store.importMany([{ ...base, id: "same", prompt: "updated" }, { ...base, id: "new" }]);

    const jobs = await store.listJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs.find((job) => job.id === "same")?.prompt).toBe("updated");
  });

  it("marks jobs interrupted by an app restart as failed", async () => {
    const store = new HistoryStore(dir);
    const base = {
      createdAt: "2026-01-01T00:00:00.000Z",
      prompt: "interrupted",
      input: { workflowMode: "generate" as const, prompt: "interrupted", model: "gpt-image-1", size: "1024x1024", n: 1 },
      referenceImagePaths: [],
      outputImagePaths: []
    };
    await store.importMany([
      { ...base, id: "running", status: "running" },
      { ...base, id: "queued", status: "queued" },
      { ...base, id: "done", status: "succeeded", outputImagePaths: ["done.png"] }
    ]);

    const completedAt = "2026-01-01T00:05:00.000Z";
    await expect(store.failInterruptedJobs(completedAt)).resolves.toBe(2);
    const jobs = await store.listJobs();
    expect(jobs.find((job) => job.id === "running")).toMatchObject({
      status: "failed",
      completedAt,
      error: "应用在任务完成前重启，生成已中断，请重试。"
    });
    expect(jobs.find((job) => job.id === "queued")?.status).toBe("failed");
    expect(jobs.find((job) => job.id === "done")?.status).toBe("succeeded");
  });

  it("clears only generation history belonging to the selected board", async () => {
    const store = new HistoryStore(dir);
    const base = {
      status: "succeeded" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      prompt: "prompt",
      providerId: "fal",
      providerName: "fal.ai",
      model: "fal-ai/nano-banana-pro",
      input: {
        workflowMode: "generate" as const,
        prompt: "prompt",
        model: "fal-ai/nano-banana-pro",
        size: "1024x1024",
        n: 1
      },
      referenceImagePaths: [],
      outputImagePaths: ["image.png"]
    };
    await store.importMany([
      { ...base, id: "board-a-1", boardId: "board-a" },
      { ...base, id: "board-a-2", boardId: "board-a" },
      { ...base, id: "board-b-1", boardId: "board-b" }
    ]);

    await expect(store.clearJobsByBoard("board-a")).resolves.toBe(2);
    await expect(store.clearJobsByBoard("board-a")).resolves.toBe(0);
    expect((await store.listJobs()).map((job) => job.id)).toEqual(["board-b-1"]);
  });
});
