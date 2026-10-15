import { mkdtemp, readFile, writeFile, appendFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GenerationJob } from "../shared/types";
import { HistoryStore } from "../electron/storage/history-store";
const job = (id: string, boardId = "board"): GenerationJob => ({
  id, boardId, status: "succeeded", createdAt: "2026-10-15T00:00:00Z", prompt: id,
  input: { workflowMode: "generate", prompt: id, model: "fixture", n: 1, size: "auto" }, referenceImagePaths: [], outputImagePaths: []
});
describe("incremental history durability", () => {
  it("loads legacy snapshots and appends updates without rewriting the whole file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-history-journal-"));
    try {
      const snapshot = JSON.stringify([job("old")]);
      await writeFile(path.join(directory, "history.json"), snapshot);
      const store = new HistoryStore(directory);
      await store.addJob(job("new"));
      expect(await readFile(path.join(directory, "history.json"), "utf8")).toBe(snapshot);
      expect((await new HistoryStore(directory).listJobs()).map((j) => j.id).sort()).toEqual(["new", "old"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("recovers an interrupted final write before accepting another append", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-history-journal-"));
    try {
      await new HistoryStore(directory).addJob(job("complete"));
      await appendFile(path.join(directory, "history-journal.jsonl"), '{"version":1,"upsert":[');
      const reopened = new HistoryStore(directory);
      await reopened.addJob(job("after-recovery"));
      expect((await new HistoryStore(directory).listJobs()).map((j) => j.id).sort()).toEqual(["after-recovery", "complete"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("checkpoints repeated commits and preserves deletions across restart", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-history-journal-"));
    try {
      const store = new HistoryStore(directory);
      for (let index = 0; index < 202; index++) await store.addJob(job("id-" + index, index % 2 ? "other" : "board"));
      expect(await store.clearJobsByBoard("board")).toBe(101);
      const reopened = new HistoryStore(directory);
      expect((await reopened.listJobs()).length).toBe(101);
      const first = await reopened.listPage("other", undefined, 40);
      const second = await reopened.listPage("other", first.nextCursor, 40);
      expect(new Set([...first.items, ...second.items].map((j) => j.id)).size).toBe(80);
      expect(await reopened.getJob("id-2")).toBeNull();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("produces a current legacy checkpoint when accepted writes are flushed", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-history-journal-"));
    try {
      const store = new HistoryStore(directory);
      await store.addJob(job("latest"));
      await store.flush();
      expect(JSON.parse(await readFile(path.join(directory, "history.json"), "utf8"))[0].id).toBe("latest");
      expect(await readFile(path.join(directory, "history-journal.jsonl"), "utf8")).toBe("");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

});
