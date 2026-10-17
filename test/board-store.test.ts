import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BoardStore,
  boardAssetCatalogFingerprint,
  boardStorageFingerprint
} from "../electron/storage/board-store.js";

describe("BoardStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-boards-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("serializes concurrent node appends without losing updates", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("并发画板");

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        store.appendNodes(board.id, [
          {
            id: `node-${index}`,
            imagePath: `/tmp/${index}.png`,
            jobId: `job-${index}`,
            source: "generated" as const
          }
        ])
      )
    );

    const saved = await store.getBoard(board.id);
    expect(saved?.nodes).toHaveLength(12);
    expect(new Set(saved?.nodes.map((node) => node.id)).size).toBe(12);
  });

  it("preserves supplied image dimensions for aspect-ratio canvas rendering", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("竖版画板");

    await store.appendNodes(board.id, [{
      id: "portrait-node",
      imagePath: "/tmp/portrait.png",
      jobId: "job-portrait",
      source: "generated",
      width: 1024,
      height: 1536
    }]);

    expect((await store.getBoard(board.id))?.nodes[0]).toMatchObject({
      width: 1024,
      height: 1536
    });
  });

  it("moves one image node without changing other board nodes", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("移动图片");
    await store.saveBoard({
      id: board.id,
      nodes: [
        { id: "image-1", type: "image", imagePath: "/tmp/one.png", jobId: "job-1", source: "generated", x: 10, y: 20 },
        { id: "image-2", type: "image", imagePath: "/tmp/two.png", jobId: "job-2", source: "generated", x: 100, y: 200 },
        { id: "text-1", type: "text", text: "说明", x: 40, y: 50 }
      ]
    });

    const result = await store.moveImageNode(board.id, "image-1", { x: -80, y: 320 });

    expect(result).toMatchObject({
      previous: { x: 10, y: 20 },
      node: { id: "image-1", x: -80, y: 320 }
    });
    expect((await store.getBoard(board.id))?.nodes).toMatchObject([
      { id: "image-1", x: -80, y: 320 },
      { id: "image-2", x: 100, y: 200 },
      { id: "text-1", x: 40, y: 50 }
    ]);
    await expect(store.moveImageNode(board.id, "text-1", { x: 0, y: 0 }))
      .rejects.toThrow("指定节点不是图片节点");
  });

  it("atomically resizes, arranges, duplicates, and switches image versions", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("MCP 图片编排");
    await store.saveBoard({
      id: board.id,
      nodes: [
        {
          id: "image-a",
          type: "image",
          imagePath: "/tmp/a-v2.png",
          jobId: "job-a-v2",
          source: "generated",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          versions: [
            { imagePath: "/tmp/a-v1.png", jobId: "job-a-v1", width: 100, height: 100 },
            { imagePath: "/tmp/a-v2.png", jobId: "job-a-v2", width: 200, height: 100 }
          ],
          activeVersion: 1
        },
        { id: "image-b", type: "image", imagePath: "/tmp/b.png", jobId: "job-b", source: "upload", x: 400, y: 200, width: 100, height: 200 }
      ]
    });

    await expect(store.resizeImageNode(board.id, "image-a", 400)).resolves.toEqual({
      previousWidth: 264,
      displayWidth: 400,
      displayHeight: 200
    });
    const arranged = await store.arrangeImageNodes(board.id, ["image-a", "image-b"], "horizontal", 40);
    expect(arranged).toHaveLength(2);
    expect(arranged[1].x).toBeGreaterThan(arranged[0].x);

    const copies = await store.duplicateImageNodes(board.id, ["image-a", "image-b"], 24);
    expect(copies).toHaveLength(2);
    expect(copies[0]).toMatchObject({ sourceNodeId: "image-a" });
    expect(copies[0].node.id).not.toBe("image-a");
    expect(copies[0].node.x).toBeCloseTo(arranged[0].x + 24);
    expect(copies[0].node.versions).toHaveLength(2);

    await expect(store.setImageNodeVersion(board.id, "image-a", 0)).resolves.toMatchObject({
      previousVersionIndex: 1,
      versionIndex: 0,
      versionCount: 2,
      node: { imagePath: "/tmp/a-v1.png", jobId: "job-a-v1", width: 100, height: 100 }
    });
    await expect(store.setImageNodeVersion(board.id, "image-a", 2)).rejects.toThrow("版本索引超出范围");
  });

  it("removes connections attached to trashed image nodes", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("回收图片连线");
    await store.saveBoard({
      id: board.id,
      nodes: [
        { id: "image-a", type: "image", imagePath: "/tmp/a.png", jobId: "job-a", source: "generated", x: 0, y: 0 },
        { id: "image-b", type: "image", imagePath: "/tmp/b.png", jobId: "job-b", source: "generated", x: 300, y: 0 }
      ],
      connections: [{ id: "edge", source: "image-a", target: "image-b" }]
    });

    await store.removeNodes(board.id, ["image-a"]);

    expect((await store.getBoard(board.id))?.connections).toEqual([]);
  });

  it("sums unique image and version file sizes in board summaries", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("容量画板");
    const firstPath = path.join(dir, "first.png");
    const secondPath = path.join(dir, "second.png");
    await Promise.all([
      writeFile(firstPath, Buffer.alloc(1024)),
      writeFile(secondPath, Buffer.alloc(2048))
    ]);

    await store.saveBoard({
      id: board.id,
      nodes: [{
        id: "node-1",
        imagePath: firstPath,
        jobId: "job-1",
        source: "generated",
        x: 0,
        y: 0,
        versions: [
          { imagePath: firstPath, jobId: "job-1" },
          { imagePath: secondPath, jobId: "job-2" }
        ]
      }]
    });

    expect((await store.listSummaries())[0].storageBytes).toBe(3072);
  });

  it("reuses storage bytes for layout saves and recalculates after asset membership changes", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const store = new BoardStore(dir);
    const board = await store.createBoard("容量缓存画板");
    const firstPath = path.join(dir, "cached-first.png");
    const secondPath = path.join(dir, "cached-second.png");
    await Promise.all([
      writeFile(firstPath, Buffer.alloc(1024)),
      writeFile(secondPath, Buffer.alloc(512))
    ]);
    const image = {
      id: "image-1",
      type: "image" as const,
      imagePath: firstPath,
      jobId: "job-1",
      source: "generated" as const,
      x: 0,
      y: 0
    };

    const initial = await store.saveBoardWithSummary({ id: board.id, nodes: [image] });
    expect(initial.summary.storageBytes).toBe(1024);
    expect(initial.assetCatalogChanged).toBe(true);

    await writeFile(firstPath, Buffer.alloc(2048));
    const layout = await store.saveBoardWithSummary({
      id: board.id,
      nodes: [{ ...image, x: 240, y: -80 }, { id: "text", type: "text", text: "布局说明", x: 0, y: 0 }],
      viewport: { x: 10, y: 20, zoom: 0.8 }
    });
    expect(layout.summary.storageBytes).toBe(1024);
    expect(layout.assetCatalogChanged).toBe(false);

    now.mockReturnValue(31_001);
    expect(await store.summarize((await store.getBoard(board.id))!)).toEqual(
      expect.objectContaining({ storageBytes: 2048 })
    );

    const withNewAsset = await store.saveBoardWithSummary({
      id: board.id,
      nodes: [
        { ...image, x: 240, y: -80 },
        { id: "image-2", type: "image", imagePath: secondPath, jobId: "job-2", source: "upload", x: 500, y: 0 }
      ]
    });
    expect(withNewAsset.summary.storageBytes).toBe(2560);
    expect(withNewAsset.assetCatalogChanged).toBe(true);
  });

  it("fingerprints only stable media membership for board storage", () => {
    const board = {
      schemaVersion: 3 as const,
      id: "board-fingerprint",
      name: "指纹画板",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nodes: [{ id: "image", type: "image" as const, imagePath: "/tmp/a.png", jobId: "job", source: "generated" as const, x: 0, y: 0 }]
    };
    const layoutOnly = {
      ...board,
      updatedAt: "2026-01-02T00:00:00.000Z",
      nodes: [{ ...board.nodes[0], x: 900, y: -300, displayWidth: 480 }]
    };
    const withVersion = {
      ...layoutOnly,
      nodes: [{ ...layoutOnly.nodes[0], versions: [{ imagePath: "/tmp/a-v2.png", jobId: "job-v2" }] }]
    };

    expect(boardStorageFingerprint(layoutOnly)).toBe(boardStorageFingerprint(board));
    expect(boardAssetCatalogFingerprint(layoutOnly)).toBe(boardAssetCatalogFingerprint(board));
    expect(boardStorageFingerprint(withVersion)).not.toBe(boardStorageFingerprint(board));
    expect(boardAssetCatalogFingerprint(withVersion)).not.toBe(boardAssetCatalogFingerprint(board));
  });

  it("ignores empty media paths when fingerprinting storage membership", () => {
    expect(boardStorageFingerprint({
      schemaVersion: 3,
      id: "empty-media-paths",
      name: "空媒体路径",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nodes: [
        {
          id: "image",
          type: "image",
          imagePath: "",
          jobId: "image-job",
          source: "generated",
          x: 0,
          y: 0,
          versions: [{ imagePath: "", jobId: "image-version" }]
        },
        {
          id: "video",
          type: "video",
          videoPath: "",
          posterPath: "",
          jobId: "video-job",
          source: "generated",
          x: 0,
          y: 0,
          versions: [{ videoPath: "", posterPath: "", jobId: "video-version" }]
        }
      ]
    })).toBe("[]");
  });

  it("persists node connections with their edge handles", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("连接画板");

    await store.saveBoard({
      id: board.id,
      connections: [{
        id: "edge-1",
        source: "node-a",
        target: "node-b",
        sourceHandle: "source-right",
        targetHandle: "target-left"
      }]
    });

    expect((await store.getBoard(board.id))?.connections).toEqual([{
      id: "edge-1",
      kind: "visual",
      source: "node-a",
      target: "node-b",
      sourceHandle: "source-right",
      targetHandle: "target-left"
    }]);
  });

  it("remaps connection endpoints and ids when duplicating a board", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("可复制连接画板");
    await store.saveBoard({
      id: board.id,
      nodes: [
        { id: "node-a", imagePath: "/tmp/a.png", jobId: "job-a", source: "upload", x: 0, y: 0 },
        { id: "node-b", imagePath: "/tmp/b.png", jobId: "job-b", source: "upload", x: 320, y: 0 }
      ],
      connections: [{
        id: "edge-original",
        source: "node-a",
        target: "node-b",
        sourceAnchor: { side: "right", ratio: 0.35, mode: "pinned" },
        targetAnchor: { side: "left", ratio: 0.65, mode: "auto" },
        routing: {
          mode: "manual",
          kind: "orthogonal",
          waypoints: [{ id: "bend-1", x: 160, y: 80 }]
        }
      }]
    });

    const copy = await store.duplicateBoard(board.id);
    expect(copy).not.toBeNull();
    expect(copy?.connections).toHaveLength(1);
    expect(copy?.connections?.[0].id).not.toBe("edge-original");
    expect(copy?.connections?.[0].source).toBe(copy?.nodes[0].id);
    expect(copy?.connections?.[0].target).toBe(copy?.nodes[1].id);
    expect(copy?.connections?.[0].sourceAnchor).toEqual({ side: "right", ratio: 0.35, mode: "pinned" });
    expect(copy?.connections?.[0].targetAnchor).toEqual({ side: "left", ratio: 0.65, mode: "auto" });
    expect(copy?.connections?.[0].routing?.waypoints).toEqual([{ id: "bend-1", x: 160, y: 80 }]);
  });

  it("places appended nodes after the actual rendered right edge", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("宽节点画板");

    await store.appendNodes(board.id, [{
      id: "wide-node",
      imagePath: "/tmp/wide.png",
      jobId: "job-wide",
      source: "generated",
      displayWidth: 640
    }]);
    await store.appendNodes(board.id, [{
      id: "next-node",
      imagePath: "/tmp/next.png",
      jobId: "job-next",
      source: "generated"
    }]);

    expect((await store.getBoard(board.id))?.nodes).toMatchObject([
      { id: "wide-node", x: 0, displayWidth: 640 },
      { id: "next-node", x: 680 }
    ]);
  });

  it("atomically completes a generation node and deduplicates recovered outputs", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("生成恢复画板");
    await store.saveBoard({
      id: board.id,
      nodes: [{
        id: "generation-1",
        type: "generation",
        prompt: "做个海报",
        status: "running",
        x: 20,
        y: 30
      }]
    });
    const output = {
      id: "output-1",
      type: "image" as const,
      imagePath: "/tmp/output.png",
      jobId: "job-1",
      source: "generated" as const,
      width: 1024,
      height: 1024
    };

    await store.finishGenerationNode(board.id, "generation-1", { jobId: "job-1", nodes: [output] });
    await store.finishGenerationNode(board.id, "generation-1", {
      jobId: "job-1",
      nodes: [{ ...output, width: 1690, height: 931 }]
    });

    const saved = await store.getBoard(board.id);
    expect(saved?.nodes).toHaveLength(2);
    expect(saved?.nodes[0]).toMatchObject({
      id: "generation-1",
      status: "succeeded",
      lastGenerationId: "job-1"
    });
    expect(saved?.nodes[1]).toMatchObject({
      id: "output-1",
      jobId: "job-1",
      width: 1690,
      height: 931
    });
    expect(saved?.connections).toMatchObject([{
      source: "generation-1",
      target: "output-1",
      kind: "visual",
      sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
      targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" }
    }]);
    expect(saved?.nodes[1]).toMatchObject({ x: 552, y: 117.2828402366864 });
  });

  it("stacks multiple recovered generation outputs vertically", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("纵向生成结果");
    await store.saveBoard({
      id: board.id,
      nodes: [{
        id: "generation-1",
        type: "generation",
        status: "running",
        x: 20,
        y: 30,
        displayWidth: 400
      }]
    });

    await store.finishGenerationNode(board.id, "generation-1", {
      jobId: "job-1",
      nodes: [
        { id: "portrait", type: "image", imagePath: "/tmp/portrait.png", jobId: "job-1", source: "generated", width: 800, height: 1200 },
        { id: "square", type: "image", imagePath: "/tmp/square.png", jobId: "job-1", source: "generated", width: 1000, height: 1000 },
        { id: "landscape", type: "image", imagePath: "/tmp/landscape.png", jobId: "job-1", source: "generated", width: 1600, height: 900 }
      ]
    });

    const saved = await store.getBoard(board.id);
    expect(saved?.nodes.slice(1).map((node) => ({ id: node.id, x: node.x, y: node.y }))).toEqual([
      { id: "portrait", x: 612, y: -254.25 },
      { id: "square", x: 612, y: 181.75 },
      { id: "landscape", x: 612, y: 485.75 }
    ]);
    expect(saved?.connections).toHaveLength(3);
  });

  it("persists a failed generation node without adding an output", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("失败恢复画板");
    await store.saveBoard({
      id: board.id,
      nodes: [{ id: "generation-1", type: "generation", status: "running", x: 0, y: 0 }]
    });

    await store.finishGenerationNode(board.id, "generation-1", { error: "生成失败" });

    expect((await store.getBoard(board.id))?.nodes).toMatchObject([{
      id: "generation-1",
      status: "failed",
      error: "生成失败"
    }]);
  });

  it("atomically completes a video generation node without duplicating recovered output", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("视频恢复画板");
    await store.saveBoard({
      id: board.id,
      nodes: [{
        id: "video-generation-1",
        type: "video-generation",
        prompt: "让海浪缓慢流动",
        status: "generating",
        x: 20,
        y: 30
      }]
    });
    const output = {
      id: "video-1",
      type: "video" as const,
      videoPath: "/tmp/output.mp4",
      posterPath: "/tmp/output.jpg",
      jobId: "video-job-1",
      source: "generated" as const,
      mimeType: "video/mp4",
      width: 1280,
      height: 720,
      durationMs: 5000
    };

    await store.finishVideoGenerationNode(board.id, "video-generation-1", { jobId: "video-job-1", node: output });
    await store.finishVideoGenerationNode(board.id, "video-generation-1", { jobId: "video-job-1", node: output });

    const saved = await store.getBoard(board.id);
    expect(saved?.nodes).toHaveLength(2);
    expect(saved?.nodes[0]).toMatchObject({ status: "completed", lastGenerationId: "video-job-1" });
    expect(saved?.nodes[1]).toMatchObject({ type: "video", videoPath: "/tmp/output.mp4", width: 1280, height: 720 });
    expect(saved?.connections).toHaveLength(1);
    expect(saved?.connections?.[0]).toMatchObject({
      source: "video-generation-1",
      target: "video-1",
      label: "生成结果",
      sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
      targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    });
  });

  it("persists video generation failure without adding an output", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("视频失败画板");
    await store.saveBoard({
      id: board.id,
      nodes: [{ id: "video-generation-1", type: "video-generation", status: "generating", x: 0, y: 0 }]
    });

    await store.startVideoGenerationNode(board.id, "video-generation-1", { jobId: "failed-job", status: "submitting" });
    await store.finishVideoGenerationNode(board.id, "video-generation-1", { jobId: "failed-job", error: "视频生成失败" });

    expect((await store.getBoard(board.id))?.nodes).toMatchObject([{
      id: "video-generation-1",
      status: "failed",
      lastGenerationId: "failed-job",
      error: "视频生成失败"
    }, {
      id: "video-output-failed-job",
      type: "video",
      videoPath: "",
      jobId: "failed-job",
      status: "failed",
      error: "视频生成失败"
    }]);
  });

  it("keeps an older recovered video job from taking over a newer retry", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("视频恢复竞态画板");
    await store.saveBoard({
      id: board.id,
      nodes: [{
        id: "video-generation-1",
        type: "video-generation",
        status: "generating",
        lastGenerationId: "new-job",
        x: 0,
        y: 0
      }]
    });

    await store.startVideoGenerationNode(board.id, "video-generation-1", {
      jobId: "old-job",
      status: "generating"
    });
    await store.finishVideoGenerationNode(board.id, "video-generation-1", {
      jobId: "old-job",
      error: "旧任务失败"
    });

    const saved = await store.getBoard(board.id);
    expect(saved?.nodes.find((node) => node.id === "video-generation-1")).toMatchObject({
      status: "generating",
      lastGenerationId: "new-job"
    });
    expect(saved?.nodes.find((node) => node.id === "video-output-old-job")).toMatchObject({
      status: "failed",
      error: "旧任务失败"
    });
  });

  it("lets a submitting retry replace the previous video job ownership", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("视频重试接管画板");
    await store.saveBoard({
      id: board.id,
      nodes: [{
        id: "video-generation-1",
        type: "video-generation",
        status: "submitting",
        lastGenerationId: "old-job",
        x: 0,
        y: 0
      }]
    });

    await store.startVideoGenerationNode(board.id, "video-generation-1", {
      jobId: "new-job",
      status: "submitting"
    });

    expect((await store.getBoard(board.id))?.nodes.find((node) => node.id === "video-generation-1")).toMatchObject({
      status: "submitting",
      lastGenerationId: "new-job"
    });
  });

  it("keeps an older recovery from consuming the placeholder of a newer submitting job", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("视频提交恢复竞态画板");
    const pendingId = "video-output-pending-video-generation-1";
    await store.saveBoard({
      id: board.id,
      nodes: [
        {
          id: "video-generation-1",
          type: "video-generation",
          status: "submitting",
          lastGenerationId: "new-job",
          x: 0,
          y: 0
        },
        {
          id: pendingId,
          type: "video",
          videoPath: "",
          jobId: "pending-video-generation-1",
          source: "generated",
          generationNodeId: "video-generation-1",
          status: "submitting",
          x: 532,
          y: 0
        }
      ],
      connections: [{
        id: "new-pending-result",
        source: "video-generation-1",
        target: pendingId,
        sourceHandle: "source-right",
        targetHandle: "target-left",
        kind: "visual",
        label: "生成结果"
      }]
    });

    await store.startVideoGenerationNode(board.id, "video-generation-1", {
      jobId: "old-job",
      status: "generating"
    });
    await store.finishVideoGenerationNode(board.id, "video-generation-1", {
      jobId: "old-job",
      error: "旧任务失败"
    });

    const saved = await store.getBoard(board.id);
    expect(saved?.nodes).toHaveLength(3);
    expect(saved?.nodes.find((node) => node.id === "video-generation-1")).toMatchObject({
      status: "submitting",
      lastGenerationId: "new-job"
    });
    expect(saved?.nodes.find((node) => node.id === pendingId)).toMatchObject({
      jobId: "pending-video-generation-1",
      generationNodeId: "video-generation-1",
      status: "submitting"
    });
    expect(saved?.nodes.find((node) => node.id === "video-output-old-job")).toMatchObject({
      jobId: "old-job",
      status: "failed",
      error: "旧任务失败"
    });
    expect(saved?.connections).toHaveLength(2);
    expect(saved?.connections).toContainEqual(expect.objectContaining({
      id: "new-pending-result",
      source: "video-generation-1",
      target: pendingId
    }));
    expect(saved?.connections).toContainEqual(expect.objectContaining({
      source: "video-generation-1",
      target: "video-output-old-job"
    }));
  });

  it.each(["pending-video-generation-1", "pending-"])("promotes the immediate video placeholder %s without duplicating its card or connection", async (pendingJobId) => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("视频即时占位画板");
    await store.saveBoard({
      id: board.id,
      nodes: [
        { id: "video-generation-1", type: "video-generation", status: "submitting", aspectRatio: "1:1", x: 0, y: 0 },
        {
          id: `video-output-${pendingJobId}`,
          type: "video",
          videoPath: "",
          jobId: pendingJobId,
          source: "generated",
          generationNodeId: "video-generation-1",
          status: "submitting",
          x: 436,
          y: 0
        }
      ],
      connections: [{
        id: "pending-result",
        source: "video-generation-1",
        target: `video-output-${pendingJobId}`,
        sourceHandle: "source-right",
        targetHandle: "target-left",
        kind: "visual",
        label: "生成结果",
        routing: { mode: "auto", kind: "curved", waypoints: [] }
      }]
    });

    await store.startVideoGenerationNode(board.id, "video-generation-1", {
      jobId: "real-job",
      status: "queued"
    });

    const saved = await store.getBoard(board.id);
    expect(saved?.nodes).toHaveLength(2);
    expect(saved?.nodes.find((node) => node.type === "video")).toMatchObject({
      id: "video-output-real-job",
      jobId: "real-job",
      status: "queued",
      aspectRatio: "1:1",
      x: 532,
      y: 138
    });
    expect(saved?.connections).toMatchObject([{
      id: "pending-result",
      source: "video-generation-1",
      target: "video-output-real-job",
      sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
      targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    }]);
  });

  it("atomically appends and activates a remix version with generation status", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("视频版本画板");
    await store.saveBoard({
      id: board.id,
      nodes: [
        { id: "remix", type: "video-generation", mode: "remix", status: "generating", targetVideoNodeId: "video", x: 0, y: 0 },
        { id: "video", type: "video", videoPath: "/tmp/v1.mp4", posterPath: "/tmp/v1.jpg", jobId: "job-v1", source: "generated", width: 1280, height: 720, durationMs: 5000, x: 380, y: 0 }
      ]
    });
    const version = {
      videoPath: "/tmp/v2.mp4",
      posterPath: "/tmp/v2.jpg",
      jobId: "job-v2",
      mimeType: "video/mp4",
      width: 720,
      height: 1280,
      durationMs: 10000
    };

    await store.finishVideoGenerationNodeVersion(board.id, "remix", "video", { jobId: "job-v2", version });
    await store.finishVideoGenerationNodeVersion(board.id, "remix", "video", { jobId: "job-v2", version });

    const saved = await store.getBoard(board.id);
    expect(saved?.nodes.find((node) => node.id === "remix")).toMatchObject({ status: "completed", lastGenerationId: "job-v2" });
    expect(saved?.nodes.find((node) => node.id === "video")).toMatchObject({
      videoPath: "/tmp/v2.mp4",
      posterPath: "/tmp/v2.jpg",
      jobId: "job-v2",
      width: 720,
      height: 1280,
      durationMs: 10000,
      activeVersion: 1,
      versions: [
        { videoPath: "/tmp/v1.mp4", jobId: "job-v1" },
        { videoPath: "/tmp/v2.mp4", jobId: "job-v2" }
      ]
    });
  });

  it("bounds pending image dimension deduplication without cancelling returned promises", async () => {
    const pendingResolvers = new Map<string, (value: null) => void>();
    const resolver = vi.fn((imagePath: string) => new Promise<null>((resolve) => {
      pendingResolvers.set(imagePath, resolve);
    }));
    const store = new BoardStore(dir, resolver);
    const cacheAccess = store as unknown as {
      imageDimensionsFor: (imagePath: string) => Promise<unknown>;
      imageDimensions: Map<string, unknown>;
    };
    const paths = Array.from({ length: 513 }, (_, index) => "/tmp/dimension-" + index + ".png");
    const pending = paths.map((imagePath) => cacheAccess.imageDimensionsFor(imagePath));

    const reloaded = cacheAccess.imageDimensionsFor(paths[0]);
    expect(reloaded).not.toBe(pending[0]);
    expect(resolver).toHaveBeenCalledTimes(514);
    expect(cacheAccess.imageDimensions.size).toBeLessThanOrEqual(512);

    for (const resolve of pendingResolvers.values()) resolve(null);
    await Promise.all([...pending.slice(1), reloaded]);
  });

  it("repairs stale image and version dimensions from physical files", async () => {
    const initial = new BoardStore(dir);
    const board = await initial.createBoard("尺寸修复画板");
    await initial.saveBoard({
      id: board.id,
      nodes: [{
        id: "image-1",
        type: "image",
        imagePath: "/tmp/current.png",
        jobId: "job-1",
        source: "generated",
        width: 1024,
        height: 1024,
        x: 0,
        y: 0,
        versions: [{
          imagePath: "/tmp/version.png",
          jobId: "job-version",
          width: 1024,
          height: 1024
        }]
      }]
    });
    const resolver = vi.fn(async (imagePath: string) => (
      imagePath.endsWith("current.png")
        ? { width: 1690, height: 931 }
        : { width: 800, height: 1200 }
    ));
    const verified = new BoardStore(dir, resolver);

    const repaired = await verified.getBoardWithVerifiedImageDimensions(board.id);
    await verified.getBoardWithVerifiedImageDimensions(board.id);

    expect(repaired?.nodes[0]).toMatchObject({
      width: 1690,
      height: 931,
      versions: [{ width: 800, height: 1200 }]
    });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect((await new BoardStore(dir).getBoard(board.id))?.nodes[0]).toMatchObject({
      width: 1690,
      height: 931,
      versions: [{ width: 800, height: 1200 }]
    });
  });

  it("preserves the demo install marker when the last opened board changes", async () => {
    const store = new BoardStore(dir);
    const first = await store.createBoard("画板一");
    const second = await store.createBoard("画板二");

    await store.setLastOpenedBoardId(first.id);
    await store.setInstalledDemoBoardVersion(1);
    await store.setLastOpenedBoardId(second.id);

    expect(await store.getLastOpenedBoardId()).toBe(second.id);
    expect(await store.getInstalledDemoBoardVersion()).toBe(1);
  });

  it("orders new and recently opened boards first", async () => {
    vi.useFakeTimers();
    try {
      const store = new BoardStore(dir);
      vi.setSystemTime(new Date("2026-07-20T08:00:00.000Z"));
      const first = await store.createBoard("画板一");
      vi.setSystemTime(new Date("2026-07-20T09:00:00.000Z"));
      const second = await store.createBoard("画板二");

      expect((await store.listBoards()).map((board) => board.id)).toEqual([second.id, first.id]);

      vi.setSystemTime(new Date("2026-07-20T10:00:00.000Z"));
      await store.setLastOpenedBoardId(first.id);

      expect((await store.listBoards()).map((board) => board.id)).toEqual([first.id, second.id]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves boards to trash and restores them with their original data", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("可恢复画板");
    await store.appendNodes(board.id, [{
      id: "node-1",
      imagePath: "/tmp/recoverable.png",
      jobId: "job-1",
      source: "generated"
    }]);

    expect(await store.trashBoard(board.id)).toBe(true);
    expect(await store.getBoard(board.id)).toBeNull();
    expect(await store.listBoards()).toHaveLength(0);
    expect(await store.listAllBoards()).toMatchObject([{ id: board.id, nodes: [{ id: "node-1" }] }]);
    expect(await store.listTrashedBoards(7)).toMatchObject([{
      id: board.id,
      name: "可恢复画板",
      imageCount: 1
    }]);

    const restored = await store.restoreBoard(board.id);
    expect(restored).toMatchObject({ id: board.id, name: "可恢复画板", nodes: [{ id: "node-1" }] });
    expect(await store.listTrashedBoards(7)).toHaveLength(0);
    expect(await store.getBoard(board.id)).toMatchObject({ id: board.id, nodes: [{ id: "node-1" }] });
  });

  it("removes and restores image nodes without changing their canvas placement", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("图片回收站");
    await store.appendNodes(board.id, [{
      id: "node-1",
      imagePath: "/tmp/recoverable.png",
      jobId: "job-1",
      source: "generated"
    }]);
    const original = (await store.getBoard(board.id))?.nodes[0];
    expect(original).toBeDefined();

    const removed = await store.removeNodes(board.id, ["node-1"]);
    expect(removed).toEqual([original]);
    expect((await store.getBoard(board.id))?.nodes).toEqual([]);

    expect(await store.restoreNodes(board.id, removed)).toBe(true);
    expect((await store.getBoard(board.id))?.nodes).toEqual([original]);
  });

  it("purges only trash entries older than the configured retention", async () => {
    vi.useFakeTimers();
    try {
      const store = new BoardStore(dir);
      vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
      const oldBoard = await store.createBoard("过期画板");
      await store.trashBoard(oldBoard.id);

      vi.setSystemTime(new Date("2026-07-06T00:00:00.000Z"));
      const recentBoard = await store.createBoard("近期画板");
      await store.trashBoard(recentBoard.id);

      const purged = await store.purgeExpiredTrashedBoards(7, Date.parse("2026-07-09T00:00:00.000Z"));
      expect(purged).toEqual([oldBoard.id]);
      expect((await store.listTrashedBoards(7)).map((board) => board.id)).toEqual([recentBoard.id]);
      expect(await store.purgeExpiredTrashedBoards(0, Date.parse("2027-07-09T00:00:00.000Z"))).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
