import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as atomic from "../electron/storage/atomic-json";
import { BoardStore } from "../electron/storage/board-store";

describe("recoverable parent-child board commits", () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-board-transactions-")); });
  afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });
  const journalFile = () => path.join(directory, "boards/.transaction.json");

  it("replays a child creation interrupted before the parent write on the same instance", async () => {
    const store = new BoardStore(directory), parent = await store.createBoard("Parent");
    const write = atomic.writeJsonAtomic;
    let fail = true;
    vi.spyOn(atomic, "writeJsonAtomic").mockImplementation(async (file, value) => {
      if (fail && file === path.join(directory, "boards", parent.id + ".json")) { fail = false; throw new Error("disk unavailable"); }
      return write(file, value);
    });
    await expect(store.createComicDramaProject({ parentBoardId: parent.id, name: "Child", position: { x: 10, y: 20 } })).rejects.toThrow("disk unavailable");
    expect(JSON.parse(await readFile(journalFile(), "utf8")).boards).toHaveLength(2);
    const recovered = await store.getBoard(parent.id);
    const entry = recovered?.nodes.find((node) => node.type === "comic-drama-entry");
    expect(entry).toMatchObject({ type: "comic-drama-entry", name: "Child" });
    if (entry?.type !== "comic-drama-entry") throw new Error("Missing parent entry");
    expect(await store.getBoard(entry.childBoardId)).toMatchObject({ name: "Child", parentBoardId: parent.id });
    await expect(access(journalFile())).rejects.toThrow();
  });

  it("rolls forward a partially persisted rename when a fresh store opens", async () => {
    const store = new BoardStore(directory), parent = await store.createBoard("Parent");
    const result = await store.createComicDramaProject({ parentBoardId: parent.id, name: "Child", position: { x: 0, y: 0 } });
    const child = { ...result.childBoard, revision: 1, name: "Renamed" };
    const updatedParent = { ...result.parentBoard, revision: 2, nodes: result.parentBoard.nodes.map((node) => node.id === result.entryNode.id ? { ...node, name: "Renamed" } : node) };
    await writeFile(journalFile(), JSON.stringify({ schemaVersion: 1, boards: [child, updatedParent] }));
    await writeFile(path.join(directory, "boards", child.id + ".json"), JSON.stringify(child));
    const reopened = new BoardStore(directory);
    expect(await reopened.getBoard(child.id)).toMatchObject({ name: "Renamed", revision: 1 });
    expect((await reopened.getBoard(parent.id))?.nodes[0]).toMatchObject({ name: "Renamed" });
    expect(await reopened.listSummaries()).toHaveLength(2);
    await expect(access(journalFile())).rejects.toThrow();
  });

  it("preserves an invalid journal and refuses mutations until it is repaired", async () => {
    await new BoardStore(directory).createBoard("Keep");
    await writeFile(journalFile(), '{"schemaVersion":1,"boards":[]}');
    const store = new BoardStore(directory);
    await expect(store.createBoard("Must not write")).rejects.toThrow("事务日志无效");
    await expect(store.listSummaries()).rejects.toThrow("事务日志无效");
    expect(await readFile(journalFile(), "utf8")).toBe('{"schemaVersion":1,"boards":[]}');
    await rm(journalFile());
    expect(await store.listSummaries()).toHaveLength(1);
  });
});
