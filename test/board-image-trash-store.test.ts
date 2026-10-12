import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardImageTrashStore } from "../electron/storage/board-image-trash-store.js";

const directories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("BoardImageTrashStore", () => {
  it("keeps deleted board images recoverable until the configured retention expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-image-trash-"));
    directories.push(directory);
    const store = new BoardImageTrashStore(directory);

    const [item] = await store.add("board-a", "灵感画板", [{
      id: "node-a",
      imagePath: "/tmp/a.png",
      jobId: "job-a",
      source: "generated",
      x: 32,
      y: 48,
      versions: [{ imagePath: "/tmp/a-v1.png", jobId: "job-a-v1" }]
    }]);

    expect((await store.list(3))[0]).toMatchObject({
      id: item?.id,
      boardId: "board-a",
      expiresAt: "2026-07-28T00:00:00.000Z"
    });
    expect(await store.referencedAssetPaths()).toEqual(new Set(["/tmp/a.png", "/tmp/a-v1.png"]));
    expect(await store.purgeExpired(3, Date.parse("2026-07-27T23:59:59.000Z"))).toEqual([]);
    expect((await store.purgeExpired(3, Date.parse("2026-07-28T00:00:00.000Z"))).map((entry) => entry.id)).toEqual([item?.id]);
    expect(await store.list(3)).toEqual([]);
  });
});
