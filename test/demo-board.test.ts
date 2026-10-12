import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createInitialDemoBoard,
  DEMO_ASSET_FILE_NAMES,
  ensureInitialDemoBoard,
  INITIAL_DEMO_BOARD_NAME,
  INITIAL_DEMO_BOARD_VERSION
} from "../electron/demo-board.js";
import { AssetMetaStore } from "../electron/storage/asset-meta-store.js";
import { AssetStore } from "../electron/storage/asset-store.js";
import { BoardStore } from "../electron/storage/board-store.js";
import { CommentStore } from "../electron/storage/comment-store.js";
import { HistoryStore } from "../electron/storage/history-store.js";
import { isBoardImageNode } from "../shared/types.js";

describe("initial demo board", () => {
  let directory: string;
  let assetsDirectory: string;
  let workspaceDirectory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-demo-board-"));
    assetsDirectory = path.join(directory, "bundled-assets");
    workspaceDirectory = path.join(directory, "workspace");
    await mkdir(assetsDirectory, { recursive: true });
    await Promise.all(
      Object.values(DEMO_ASSET_FILE_NAMES).map((fileName) =>
        writeFile(path.join(assetsDirectory, fileName), Buffer.from(`fixture:${fileName}`))
      )
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("installs an operable board with history, versions, slices, comments and asset metadata", async () => {
    const assets = new AssetStore(workspaceDirectory);
    const boards = new BoardStore(workspaceDirectory);
    const history = new HistoryStore(workspaceDirectory);
    const comments = new CommentStore(workspaceDirectory);
    const assetMeta = new AssetMetaStore(workspaceDirectory);

    const board = await createInitialDemoBoard({
      assetsDirectory,
      assets,
      boards,
      history,
      comments,
      assetMeta
    });

    expect(board.name).toBe(INITIAL_DEMO_BOARD_NAME);
    expect(board.nodes).toHaveLength(6);
    expect(board.viewport).toEqual({ x: 220, y: 76, zoom: 0.68 });
    expect(board.thumbnailDataUrl).toBe(
      `data:image/jpeg;base64,${Buffer.from(`fixture:${DEMO_ASSET_FILE_NAMES.cover}`).toString("base64")}`
    );
    const imageNodes = board.nodes.filter(isBoardImageNode);
    expect(imageNodes.every((node) => node.imagePath.startsWith(workspaceDirectory))).toBe(true);

    const versionNode = imageNodes.find((node) => node.versions);
    expect(versionNode?.versions).toHaveLength(3);
    expect(versionNode?.activeVersion).toBe(2);

    const sliceNodes = imageNodes.filter((node) => node.source === "slice");
    expect(sliceNodes).toHaveLength(2);
    expect(sliceNodes.every((node) => node.derivation?.sourceNodeId.endsWith("-contact-sheet"))).toBe(true);

    const jobs = await history.listJobs();
    expect(jobs).toHaveLength(4);
    expect(jobs.every((job) => job.status === "succeeded" && job.boardId === board.id)).toBe(true);
    expect(jobs.some((job) => job.input.workflowMode === "edit")).toBe(true);
    expect(jobs.some((job) => job.referenceImagePaths.length === 4)).toBe(true);

    expect(await comments.list()).toHaveLength(2);
    const metadata = await assetMeta.list();
    expect(metadata).toHaveLength(3);
    expect(metadata.some((item) => item.favorite && item.tags.includes("目录候选"))).toBe(true);
  });

  it("adds the demo once for existing users and does not restore it after deletion", async () => {
    const assets = new AssetStore(workspaceDirectory);
    const boards = new BoardStore(workspaceDirectory);
    const history = new HistoryStore(workspaceDirectory);
    const comments = new CommentStore(workspaceDirectory);
    const assetMeta = new AssetMetaStore(workspaceDirectory);
    const existing = await boards.createBoard("已有画板");
    await boards.setLastOpenedBoardId(existing.id);
    const input = { assetsDirectory, assets, boards, history, comments, assetMeta };

    const firstInstall = await ensureInitialDemoBoard(input);
    expect(firstInstall?.created).toBe(true);
    expect(firstInstall?.isFirstBoard).toBe(false);
    expect((await boards.listBoards()).map((board) => board.name)).toEqual([
      INITIAL_DEMO_BOARD_NAME,
      "已有画板"
    ]);
    expect(await boards.getLastOpenedBoardId()).toBe(existing.id);

    expect(await ensureInitialDemoBoard(input)).toBeNull();
    await boards.deleteBoard(firstInstall!.board.id);
    expect(await ensureInitialDemoBoard(input)).toBeNull();
    expect((await boards.listBoards()).map((board) => board.name)).toEqual(["已有画板"]);
  });

  it("repairs the missing cover on an existing v1 demo without duplicating the board", async () => {
    const assets = new AssetStore(workspaceDirectory);
    const boards = new BoardStore(workspaceDirectory);
    const history = new HistoryStore(workspaceDirectory);
    const comments = new CommentStore(workspaceDirectory);
    const assetMeta = new AssetMetaStore(workspaceDirectory);
    const existingDemo = await boards.createBoard(INITIAL_DEMO_BOARD_NAME);
    await boards.setInstalledDemoBoardVersion(1);

    const result = await ensureInitialDemoBoard({
      assetsDirectory,
      assets,
      boards,
      history,
      comments,
      assetMeta
    });

    expect(result?.created).toBe(false);
    expect(result?.board.id).toBe(existingDemo.id);
    expect(result?.board.thumbnailDataUrl).toBe(
      `data:image/jpeg;base64,${Buffer.from(`fixture:${DEMO_ASSET_FILE_NAMES.cover}`).toString("base64")}`
    );
    expect(await boards.getInstalledDemoBoardVersion()).toBe(INITIAL_DEMO_BOARD_VERSION);
    expect(await boards.listBoards()).toHaveLength(1);
  });

  it("does not restore a v1 demo that the user already deleted", async () => {
    const assets = new AssetStore(workspaceDirectory);
    const boards = new BoardStore(workspaceDirectory);
    const history = new HistoryStore(workspaceDirectory);
    const comments = new CommentStore(workspaceDirectory);
    const assetMeta = new AssetMetaStore(workspaceDirectory);
    await boards.setInstalledDemoBoardVersion(1);

    expect(await ensureInitialDemoBoard({
      assetsDirectory,
      assets,
      boards,
      history,
      comments,
      assetMeta
    })).toBeNull();
    expect(await boards.getInstalledDemoBoardVersion()).toBe(INITIAL_DEMO_BOARD_VERSION);
    expect(await boards.listBoards()).toHaveLength(0);
  });
});
