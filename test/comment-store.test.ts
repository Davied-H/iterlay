import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommentStore } from "../electron/storage/comment-store.js";

describe("CommentStore", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-comments-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("persists normalized image positions for canvas comments", async () => {
    const store = new CommentStore(directory);
    const comment = await store.add("/assets/result.png", "调整这里的高光", { x: 1.2, y: -0.1 });

    expect(comment.position).toEqual({ x: 1, y: 0 });
    await expect(new CommentStore(directory).list()).resolves.toEqual([comment]);
  });

  it("keeps legacy comments without inventing a marker position", async () => {
    await writeFile(path.join(directory, "comments.json"), JSON.stringify([{
      id: "legacy-comment",
      imagePath: "/assets/legacy.png",
      text: "旧评论",
      createdAt: "2026-01-01T00:00:00.000Z"
    }]));

    const [comment] = await new CommentStore(directory).list();
    expect(comment.position).toBeUndefined();
  });

  it("moves an existing marker and persists its new position", async () => {
    const store = new CommentStore(directory);
    const comment = await store.add("/assets/result.png", "移动这里", { x: 0.2, y: 0.3 });

    const updated = await store.updatePosition(comment.id, { x: 0.74, y: 0.61 });

    expect(updated?.position).toEqual({ x: 0.74, y: 0.61 });
    await expect(new CommentStore(directory).list()).resolves.toEqual([updated]);
  });
});
