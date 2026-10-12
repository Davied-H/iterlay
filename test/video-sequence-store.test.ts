import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VideoSequenceStore, freezeSequenceImage } from "../electron/storage/video-sequence-store.js";
import type { VideoSequenceTask } from "../electron/video-sequence-types.js";

describe("VideoSequenceStore", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-sequence-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("creates N-1 segments and preserves frozen hashes", async () => {
    const store = new VideoSequenceStore(dir);
    const sources = await Promise.all(["a", "b", "c"].map(async (name) => {
      const imagePath = path.join(dir, `${name}.png`);
      await writeFile(imagePath, name);
      return freezeSequenceImage({ imagePath, sha256: "" });
    }));
    const sequence = await store.createSequence({ boardId: "board", sources });
    expect(sequence.segments).toHaveLength(2);
    expect(sequence.keyframes.every((item) => item.source.sha256.length === 64)).toBe(true);
    expect(sequence.defaults.generateAudio).toBe(false);
  });

  it("creates a video assembly with one immutable active version per source", async () => {
    const store = new VideoSequenceStore(dir);
    const sequence = await store.createAssemblySequence({
      boardId: "board",
      sources: ["a", "b"].map((name, index) => ({
        nodeId: `video-${name}`, nodeVersionIndex: index, versionId: `job-${name}`,
        videoPath: path.join(dir, `${name}.mp4`), sha256: name.repeat(64).slice(0, 64),
        mimeType: "video/mp4", width: 1280, height: 720, durationMs: 2_000 + index * 1_000
      }))
    });
    expect(sequence).toMatchObject({ kind: "video-assembly", keyframes: [] });
    expect(sequence.segments.map((segment) => ({ kind: segment.kind, order: segment.order, versions: segment.versions.length }))).toEqual([
      { kind: "source-video", order: 0, versions: 1 },
      { kind: "source-video", order: 1, versions: 1 }
    ]);
    expect(sequence.segments.every((segment) => segment.activeVersionId === segment.versions[0].id)).toBe(true);
    expect(await store.listTasks(sequence.id)).toEqual([]);
  });

  it("deduplicates active segment revisions under concurrent writes", async () => {
    const store = new VideoSequenceStore(dir);
    const base = task("a");
    const created = await Promise.all(Array.from({ length: 8 }, () => store.createTasks([{ ...base, id: crypto.randomUUID(), clientRequestId: crypto.randomUUID() }])));
    expect(created.flat()).toHaveLength(1);
    expect(await store.listTasks()).toHaveLength(1);
  });
});

function task(id: string): VideoSequenceTask {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, id, clientRequestId: id, boardId: "board", sequenceId: "sequence",
    segmentId: "segment", segmentRevision: 1, inputFingerprint: "fingerprint", attempt: 1,
    status: "pending", createdAt: now, updatedAt: now,
    input: { prompt: "move", model: "model", aspectRatio: "16:9", resolution: "720p", durationSeconds: 5, referenceImagePaths: [] }
  };
}
