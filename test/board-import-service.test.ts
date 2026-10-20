import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importBoardBuffer } from "../electron/application/board-import";
import { buildBoardArchive } from "../electron/board-archive";
import { AssetStore } from "../electron/storage/asset-store";
import { BoardStore } from "../electron/storage/board-store";
import { HistoryStore } from "../electron/storage/history-store";
import { VideoTaskStore } from "../electron/storage/video-task-store";
import { VideoSequenceStore } from "../electron/storage/video-sequence-store";
import { CommentStore } from "../electron/storage/comment-store";
import { AssetMetaStore } from "../electron/storage/asset-meta-store";
import { isBoardImageNode, type BoardData, type GenerationJob } from "../shared/types";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-import-service-"));
  directories.push(dir);
  const imagePath = path.join(dir, "original.png");
  await writeFile(imagePath, Buffer.from("image payload"));
  const target = path.join(dir, "target");
  const dependencies = {
    assets: new AssetStore(target), boards: new BoardStore(target), history: new HistoryStore(target),
    videoTasks: new VideoTaskStore(target), videoSequences: new VideoSequenceStore(target),
    comments: new CommentStore(target), assetMeta: new AssetMetaStore(target), onImported: vi.fn()
  };
  const board: BoardData = {
    id: "source-board", name: "原画板", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    nodes: [
      { id: "text", type: "text", text: "生成要求", x: 0, y: 0 },
      { id: "image", imagePath, jobId: "job", source: "generated", x: 100, y: 0 }
    ],
    connections: [{ id: "link", source: "text", target: "image", kind: "reference" }],
    groups: [{ id: "group", title: "素材组", nodeIds: ["text", "image"], x: 0, y: 0, width: 300, height: 200 }],
    viewport: { x: 12, y: 34, zoom: 0.8 }
  };
  const job: GenerationJob = {
    id: "job", boardId: board.id, status: "succeeded", createdAt: board.createdAt, prompt: "要求",
    input: { workflowMode: "generate", prompt: "要求", model: "test", size: "1024x1024", n: 1 },
    referenceImagePaths: [], outputImagePaths: [imagePath]
  };
  const archive = await buildBoardArchive(board, [job], "test", [
    { id: "comment", imagePath, text: "保留评论", createdAt: board.createdAt }
  ], [{ imagePath, favorite: true, tags: ["保留标签"] }]);
  return { dependencies, archive, board };
}

describe("board archive import application service", () => {
  it("imports the same package twice with isolated IDs, remapped links, history, comments and metadata", async () => {
    const { dependencies, archive, board } = await fixture();
    const first = await importBoardBuffer(archive, dependencies);
    const second = await importBoardBuffer(archive, dependencies);
    expect(first.id).not.toBe(second.id);
    const imported = await dependencies.boards.getBoard(first.id);
    const repeated = await dependencies.boards.getBoard(second.id);
    expect(imported?.viewport).toEqual(board.viewport);
    expect(imported?.nodes).toHaveLength(2);
    const image = imported!.nodes.find(isBoardImageNode)!;
    const repeatedImage = repeated!.nodes.find(isBoardImageNode)!;
    expect(image.id).not.toBe("image");
    expect(image.id).not.toBe(repeatedImage.id);
    expect(image.imagePath).not.toBe(repeatedImage.imagePath);
    expect((await readFile(image.imagePath)).toString()).toBe("image payload");
    expect(imported!.connections![0].target).toBe(image.id);
    expect(imported!.groups![0].nodeIds).toContain(image.id);
    const jobs = await dependencies.history.listJobs(first.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(image.jobId);
    expect(jobs[0].outputImagePaths).toEqual([image.imagePath]);
    expect(await dependencies.comments.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ imagePath: image.imagePath, text: "保留评论" })
    ]));
    expect(await dependencies.assetMeta.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ imagePath: image.imagePath, favorite: true, tags: ["保留标签"] })
    ]));
    expect(dependencies.onImported).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid package before writing board state or invalidating the catalog", async () => {
    const { dependencies } = await fixture();
    await expect(importBoardBuffer(Buffer.from("not an archive"), dependencies)).rejects.toThrow();
    expect(await dependencies.boards.listBoards()).toEqual([]);
    expect(await dependencies.history.listJobs()).toEqual([]);
    expect(dependencies.onImported).not.toHaveBeenCalled();
  });
});
