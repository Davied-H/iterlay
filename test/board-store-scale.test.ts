import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BoardStore } from "../electron/storage/board-store";
describe("board storage scale and concurrent reads", () => {
  it("keeps every board addressable after detail cache eviction", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-board-scale-"));
    try {
      const store = new BoardStore(directory);
      const ids: string[] = [];
      for (let index = 0; index < 40; index++) ids.push((await store.createBoard("Board " + index)).id);
      expect(await store.listSummaries()).toHaveLength(40);
      await store.renameBoard(ids[0], "Renamed");
      expect((await store.listSummaries()).find((board) => board.id === ids[0])?.name).toBe("Renamed");
      expect(await store.listBoards()).toHaveLength(40);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("does not hold the write queue while image metadata is loading", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-board-scale-"));
    try {
      const seed = new BoardStore(directory);
      const a = await seed.createBoard("A"), b = await seed.createBoard("B");
      await seed.saveBoard({ id: a.id, nodes: [{ id: "image", type: "image", imagePath: "/fixture.png", jobId: "fixture", source: "generated", x: 0, y: 0 }] });
      let started!: () => void, finish!: (value: { width: number; height: number }) => void;
      const starting = new Promise<void>((resolve) => { started = resolve; });
      const metadata = new Promise<{ width: number; height: number }>((resolve) => { finish = resolve; });
      const store = new BoardStore(directory, async () => { started(); return metadata; });
      const loading = store.getBoardWithVerifiedImageDimensions(a.id);
      await starting;
      expect((await store.renameBoard(b.id, "B renamed"))?.name).toBe("B renamed");
      await store.renameBoard(a.id, "A changed during lookup");
      finish({ width: 10, height: 20 });
      expect((await loading)?.name).toBe("A changed during lookup");
      expect((await store.getBoardWithVerifiedImageDimensions(a.id))?.nodes[0]).toMatchObject({ width: 10, height: 20 });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("rejects invalid IDs rather than aliasing another board during deletion", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-board-scale-"));
    try {
      const store = new BoardStore(directory), board = await store.createBoard("Keep");
      await expect(store.deleteBoard(board.id + "/")).rejects.toThrow("ID 无效");
      expect(await store.getBoard(board.id)).not.toBeNull();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
