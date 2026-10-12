import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VideoTaskStore } from "../electron/storage/video-task-store.js";
import type { VideoGenerationJob } from "../shared/types.js";

describe("VideoTaskStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-video-history-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists concurrent jobs and replaces matching ids", async () => {
    const store = new VideoTaskStore(dir);
    await Promise.all(Array.from({ length: 12 }, (_, index) => store.addJob(job(`job-${index}`))));
    await store.updateJob({ ...job("job-4"), status: "completed", completedAt: "2026-08-11T01:00:00.000Z" });

    expect(await store.listJobs()).toHaveLength(12);
    expect(await store.getJob("job-4")).toMatchObject({ status: "completed" });
  });

  it("returns only remote tasks that can resume after restart", async () => {
    const store = new VideoTaskStore(dir);
    await store.importMany([
      { ...job("running"), status: "generating", remoteTaskId: "remote-1" },
      { ...job("download"), status: "post_processing", remoteTaskId: "remote-2" },
      { ...job("unaccepted"), status: "submitting" },
      { ...job("done"), status: "completed", remoteTaskId: "remote-3" }
    ]);

    expect((await store.listRecoverableJobs()).map((item) => item.id).sort()).toEqual(["download", "running"]);
  });

  it("filters malformed disk records and clears one board only", async () => {
    await writeFile(path.join(dir, "video-history.json"), JSON.stringify([
      job("valid", "board-a"),
      { id: "broken", status: "generating" },
      job("other", "board-b")
    ]));
    const store = new VideoTaskStore(dir);

    expect((await store.listJobs()).map((item) => item.id).sort()).toEqual(["other", "valid"]);
    await expect(store.clearJobsByBoard("board-a")).resolves.toBe(1);
    expect((await store.listJobs()).map((item) => item.id)).toEqual(["other"]);
  });

  it("migrates persisted official worker error codes to user-facing messages", async () => {
    await writeFile(path.join(dir, "video-history.json"), JSON.stringify([
      { ...job("failed"), status: "failed", error: "poll_failed" }
    ]));
    const store = new VideoTaskStore(dir);

    expect(await store.getJob("failed")).toMatchObject({
      error: "官方视频上游状态查询连续失败，任务已结束并退还金豆。"
    });
  });
});

function job(id: string, boardId = "board-a"): VideoGenerationJob {
  return {
    id,
    status: "queued",
    createdAt: "2026-08-11T00:00:00.000Z",
    model: "video-model",
    input: {
      prompt: "让画面动起来",
      model: "video-model",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      referenceImagePaths: [],
      boardId
    }
  };
}
