import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isBoardGenerationNode,
  isBoardImageNode,
  isBoardTextNode,
  normalizeBoardConnection,
  normalizeBoardNode
} from "../shared/types.js";
import { BoardStore } from "../electron/storage/board-store.js";

describe("board node model", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-board-model-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("normalizes legacy image nodes and visual connections", () => {
    const image = normalizeBoardNode({
      id: "legacy-image",
      imagePath: "/tmp/legacy.png",
      jobId: "job-legacy",
      source: "upload",
      x: 12,
      y: 24,
      displayWidth: 360
    });
    const connection = normalizeBoardConnection({ id: "legacy-edge", source: "a", target: "b" });

    expect(image).toMatchObject({ id: "legacy-image", type: "image", displayWidth: 360 });
    expect(image && isBoardImageNode(image)).toBe(true);
    expect(connection).toEqual({ id: "legacy-edge", source: "a", target: "b", kind: "visual" });
  });

  it("round-trips text and generation nodes with reference semantics", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("工作流");

    await store.saveBoard({
      id: board.id,
      nodes: [
        { id: "prompt", type: "text", text: "雨夜街道", x: 0, y: 0 },
        { id: "generate", type: "generation", prompt: "电影感", count: 2, x: 320, y: 0 }
      ],
      connections: [{ id: "reference", source: "prompt", target: "generate", kind: "reference" }]
    });

    const saved = await store.getBoard(board.id);
    expect(saved?.schemaVersion).toBe(3);
    expect(saved?.nodes[0] && isBoardTextNode(saved.nodes[0])).toBe(true);
    expect(saved?.nodes[1] && isBoardGenerationNode(saved.nodes[1])).toBe(true);
    expect(saved?.connections).toEqual([
      { id: "reference", source: "prompt", target: "generate", kind: "reference" }
    ]);
  });

  it("upgrades legacy board JSON without losing image metadata", async () => {
    const boardsDir = path.join(dir, "boards");
    await mkdir(boardsDir, { recursive: true });
    await writeFile(path.join(boardsDir, "legacy.json"), JSON.stringify({
      id: "legacy",
      name: "旧画板",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z",
      nodes: [{
        id: "image",
        imagePath: "/tmp/image.png",
        jobId: "job",
        source: "generated",
        x: 40,
        y: 80,
        versions: [{ imagePath: "/tmp/image.png", jobId: "job" }]
      }],
      connections: [{ id: "edge", source: "image", target: "image" }]
    }));

    const store = new BoardStore(dir);
    const board = await store.getBoard("legacy");

    expect(board).toMatchObject({ schemaVersion: 3, id: "legacy" });
    expect(board?.nodes[0]).toMatchObject({
      id: "image",
      type: "image",
      x: 40,
      y: 80,
      versions: [{ imagePath: "/tmp/image.png", jobId: "job" }]
    });
    expect(board?.connections?.[0]).toMatchObject({ kind: "visual" });
  });

  it("duplicates heterogeneous nodes and remaps reference endpoints", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("可复制工作流");
    await store.saveBoard({
      id: board.id,
      nodes: [
        { id: "text", type: "text", text: "产品摄影", x: 0, y: 0 },
        { id: "generation", type: "generation", x: 300, y: 0 }
      ],
      connections: [{ id: "edge", source: "text", target: "generation", kind: "reference" }]
    });

    const copy = await store.duplicateBoard(board.id);
    expect(copy?.nodes.map((node) => node.type)).toEqual(["text", "generation"]);
    expect(copy?.connections?.[0]).toMatchObject({
      kind: "reference",
      source: copy?.nodes[0].id,
      target: copy?.nodes[1].id
    });
    expect(copy?.connections?.[0].id).not.toBe("edge");
  });

  it("preserves heterogeneous nodes and connection kinds through board trash", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("可恢复工作流");
    await store.saveBoard({
      id: board.id,
      nodes: [
        { id: "text", type: "text", text: "参考描述", x: 0, y: 0 },
        { id: "generation", type: "generation", prompt: "补充提示", x: 300, y: 0 }
      ],
      connections: [{ id: "edge", source: "text", target: "generation", kind: "reference" }]
    });

    expect(await store.trashBoard(board.id)).toBe(true);
    const restored = await store.restoreBoard(board.id);

    expect(restored?.nodes).toMatchObject([
      { id: "text", type: "text", text: "参考描述" },
      { id: "generation", type: "generation", prompt: "补充提示" }
    ]);
    expect(restored?.connections?.[0]).toMatchObject({ kind: "reference" });
  });

  it("counts and measures only image nodes", async () => {
    const imagePath = path.join(dir, "image.png");
    await writeFile(imagePath, Buffer.alloc(128));
    const store = new BoardStore(dir);
    const board = await store.createBoard("混合节点");
    await store.saveBoard({
      id: board.id,
      nodes: [
        { id: "text", type: "text", text: "说明", x: 0, y: 0 },
        { id: "generation", type: "generation", x: 100, y: 0 },
        { id: "image", type: "image", imagePath, jobId: "job", source: "upload", x: 200, y: 0 }
      ]
    });

    const [summary] = await store.listSummaries();
    expect(summary.imageCount).toBe(1);
    expect(summary.storageBytes).toBe(128);

    const persisted = JSON.parse(await readFile(path.join(dir, "boards", `${board.id}.json`), "utf8"));
    expect(persisted.schemaVersion).toBe(3);
  });
});
