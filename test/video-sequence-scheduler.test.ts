import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoSequenceStore, freezeSequenceImage } from "../electron/storage/video-sequence-store.js";
import { VideoSequenceScheduler } from "../electron/video/video-sequence-scheduler.js";
import type { VideoSequenceTask } from "../electron/video-sequence-types.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("VideoSequenceScheduler snapshots", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-sequence-scheduler-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("publishes the frozen task frames when the sequence is edited before the old task completes", async () => {
    const store = new VideoSequenceStore(dir);
    const paths = await Promise.all(["a", "b", "c", "replacement"].map(async (name) => {
      const imagePath = path.join(dir, `${name}.png`);
      await writeFile(imagePath, name);
      return freezeSequenceImage({ imagePath, sha256: "" });
    }));
    const sequence = await store.createSequence({ boardId: "board", sources: paths.slice(0, 3) });
    const segment = sequence.segments[0];
    const now = new Date().toISOString();
    const task: VideoSequenceTask = {
      schemaVersion: 1, id: "task", clientRequestId: "request", boardId: "board", sequenceId: sequence.id,
      segmentId: segment.id, segmentRevision: segment.desiredRevision, inputFingerprint: segment.inputFingerprint,
      attempt: 1, status: "pending", createdAt: now, updatedAt: now,
      input: {
        prompt: "move", model: "model", aspectRatio: "16:9", resolution: "720p", durationSeconds: 5,
        referenceImagePaths: [], firstFramePath: paths[0].imagePath, lastFramePath: paths[1].imagePath,
        providerId: "provider"
      },
      inputSnapshot: {
        firstFrame: structuredClone(paths[0]), lastFrame: structuredClone(paths[1]),
        config: { prompt: "move", providerId: "provider", model: "model", durationSeconds: 5, aspectRatio: "16:9", resolution: "720p", generateAudio: false, watermark: false }
      }
    };
    await store.createTasks([task]);
    const completion = deferred<never>();
    const waitForCompletion = vi.fn(async () => completion.promise);
    const scheduler = new VideoSequenceScheduler({
      store,
      assets: { readManagedBytes: vi.fn(async () => Buffer.from("image")), saveVideoOutput: vi.fn(async () => path.join(dir, "output.mp4")) },
      videoService: {
        submit: vi.fn(async () => ({ provider: "ark", id: "remote", model: "model", status: "queued", submittedAt: now, updatedAt: now })),
        waitForCompletion,
        download: vi.fn(async () => ({ bytes: Buffer.from("video"), mimeType: "video/mp4", sourceUrl: "remote" }))
      },
      ffmpeg: { probe: vi.fn(async () => ({ mimeType: "video/mp4", width: 1280, height: 720, durationMs: 5_000 })) },
      resolveProvider: () => ({ config: { provider: "ark", model: "model", apiKey: "key", baseUrl: "https://example.test" }, providerName: "Ark" })
    } as never);
    scheduler.enqueue([task.id]);
    await vi.waitFor(() => expect(waitForCompletion).toHaveBeenCalled());
    const edited = await store.mutateSequence("board", sequence.id, sequence.revision, (draft) => {
      draft.keyframes[0].source = paths[3];
      draft.segments[0].desiredRevision += 1;
      draft.segments[0].inputFingerprint = "replacement-fingerprint";
    });
    completion.resolve({
      provider: "ark", id: "remote", model: "model", status: "succeeded", submittedAt: now, updatedAt: now,
      outputs: [{ kind: "video", role: "result", url: "https://example.test/video.mp4" }]
    } as never);
    await vi.waitFor(async () => expect((await store.getTask(task.id))?.status).toBe("completed"));
    const completed = await store.getSequence("board", edited.id);
    const version = completed!.segments[0].versions.find((item) => item.taskId === task.id)!;
    expect(version.inputSnapshot).toMatchObject({
      firstFrame: { imagePath: paths[0].imagePath, sha256: paths[0].sha256 },
      lastFrame: { imagePath: paths[1].imagePath, sha256: paths[1].sha256 }
    });
    expect(version.superseded).toBe(true);
    expect(completed!.keyframes[0].source.imagePath).toBe(paths[3].imagePath);
    scheduler.dispose();
  });
});
