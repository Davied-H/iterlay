import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createComicDramaContextSnapshot, createComicFrameContextSnapshot, createComicVideoContextSnapshot, evaluateComicDramaContextSnapshot, getComicDramaProductionInvalidationTargets, getComicDramaVersionChangeScopes, getComicVideoReadiness, fingerprintComicDramaContext, normalizeComicDramaNode } from "../shared/comic-drama.js";
import type { BoardConnection, BoardData, BoardMutationPlan, ComicCharacterNode, ComicSegmentScriptNode, ComicSettingNode, VideoSequence } from "../shared/types.js";
import { BoardStore } from "../electron/storage/board-store.js";
import { VideoSequenceStore } from "../electron/storage/video-sequence-store.js";
import { registerComicDramaIpc } from "../electron/comic-drama-ipc.js";
import { BOARD_ARCHIVE_FORMAT, buildBoardArchive, parseBoardArchive } from "../electron/board-archive.js";

const electronMocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => electronMocks.handlers.set(channel, handler),
    removeHandler: (channel: string) => electronMocks.handlers.delete(channel)
  }
}));

const now = "2026-08-22T08:00:00.000Z";
const settingNode = (activeVersionId = "setting-v1"): ComicSettingNode => ({
  id: "setting", type: "comic-setting", x: 0, y: 0, status: "saved", activeVersionId,
  versions: [{ versionId: "setting-v1", createdAt: now, fields: {
    title: "雨夜来信", synopsis: "一封迟到十年的信改变了小城。", genre: "悬疑", tone: "克制",
    worldRules: ["记忆会附着在旧物上"], visualStyle: "冷色手绘", constraints: ["不使用旁白"],
    aspectRatio: "9:16", targetDurationSeconds: 30
  } }]
});
const characterNode = (activeVersionId = "character-v1"): ComicCharacterNode => ({
  id: "character", type: "comic-character", x: 320, y: 0, name: "林默", status: "ready", activeVersionId,
  versions: [{ versionId: "character-v1", createdAt: now, fields: {
    role: "旧物修复师", profile: "沉默、敏锐", appearanceAnchors: ["短黑发", "旧风衣"], visualPrompt: "冷色手绘人物立绘"
  } }]
});
const segmentNode = (): ComicSegmentScriptNode => ({
  id: "segment", type: "comic-segment-script", x: 640, y: 0, order: 1, title: "来信", status: "draft",
  activeVersionId: "segment-v1", versions: [{ versionId: "segment-v1", createdAt: now, fields: {
    purpose: "引出旧信", scene: "雨夜修复店", action: "林默拆开信封", dialogue: "这封信，不该现在出现。",
    emotion: "警觉", visualDirection: "冷蓝逆光", cameraDirection: "特写推进", durationSeconds: 6
  } }]
});
const reference = (id: string, source: string, versionBinding: BoardConnection["versionBinding"]): BoardConnection =>
  ({ id, source, target: "segment", kind: "reference", versionBinding });

describe("comic drama domain contract", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-comic-drama-"));
    electronMocks.handlers.clear();
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("normalizes the three semantic cards", () => {
    const setting = settingNode();
    expect(normalizeComicDramaNode({ ...setting, versions: [{ ...setting.versions[0], fields: {
      ...setting.versions[0].fields, title: "  雨夜来信  ", worldRules: [" 规则一 ", "", "规则一"], targetDurationSeconds: 30.8
    } }] })).toMatchObject({
      type: "comic-setting", activeVersionId: "setting-v1",
      versions: [{ fields: { title: "雨夜来信", worldRules: ["规则一"], targetDurationSeconds: 31 } }]
    });
    expect(normalizeComicDramaNode(characterNode())).toMatchObject({ type: "comic-character", name: "林默" });
    expect(normalizeComicDramaNode(segmentNode())).toMatchObject({ type: "comic-segment-script", order: 1 });
    expect(normalizeComicDramaNode({ ...characterNode(), activeVersionId: "missing" })).toBeNull();
  });

  it("creates a parent entry and an independent comic child board atomically", async () => {
    const store = new BoardStore(dir);
    const parent = await store.createBoard("品牌项目");
    const created = await store.createComicDramaProject({
      parentBoardId: parent.id,
      name: "雨夜来信",
      position: { x: 120, y: 80 }
    });

    expect(created.entryNode).toMatchObject({
      type: "comic-drama-entry",
      childBoardId: created.childBoard.id,
      name: "雨夜来信",
      x: 120,
      y: 80
    });
    expect(await store.getBoard(parent.id)).toMatchObject({
      kind: "standard",
      nodes: [expect.objectContaining({ type: "comic-drama-entry", childBoardId: created.childBoard.id })]
    });
    expect(await store.getBoard(created.childBoard.id)).toMatchObject({
      kind: "comic-drama",
      parentBoardId: parent.id,
      nodes: [expect.objectContaining({ type: "comic-setting" })]
    });

    await store.renameBoard(created.childBoard.id, "雨夜重逢");
    expect(await store.getBoard(parent.id)).toMatchObject({
      nodes: [expect.objectContaining({ type: "comic-drama-entry", name: "雨夜重逢" })]
    });

    await store.trashBoard(parent.id);
    expect(await store.getBoard(parent.id)).toBeNull();
    expect(await store.getBoard(created.childBoard.id)).toBeNull();
    await store.restoreBoard(parent.id);
    expect((await store.getBoard(created.childBoard.id))?.parentBoardId).toBe(parent.id);
  });

  it("allows a complete canvas snapshot to remove a comic project entry", async () => {
    const store = new BoardStore(dir);
    const parent = await store.createBoard("品牌项目");
    await store.createComicDramaProject({
      parentBoardId: parent.id,
      name: "雨夜来信",
      position: { x: 0, y: 0 }
    });
    await store.saveBoard({ id: parent.id, nodes: [], replaceManagedNodes: true });
    expect((await store.getBoard(parent.id))?.nodes).toEqual([]);
  });

  it("persists idempotent Agent mutation receipts across store restarts", async () => {
    const store = new BoardStore(dir);
    const parent = await store.createBoard("品牌项目");
    const created = await store.createComicDramaProject({
      parentBoardId: parent.id,
      name: "雨夜来信",
      position: { x: 0, y: 0 }
    });
    const snapshot = await store.getComicDramaBoardSnapshot(created.childBoard.id);
    const current = snapshot.nodes.find((node) => node.type === "comic-setting")!;
    const versionId = "setting-agent-v2";
    const updated = {
      ...current,
      status: "saved" as const,
      activeVersionId: versionId,
      versions: [...current.versions, {
        versionId,
        createdAt: now,
        fields: {
          ...current.versions[0].fields,
          title: "雨夜来信",
          synopsis: "旧物修复师收到一封迟到十年的信。"
        }
      }]
    };
    const plan = {
      planId: "plan-agent-1",
      boardId: snapshot.boardId,
      baseRevision: snapshot.revision,
      preview: {
        title: "更新设定",
        additions: { nodes: 0, connections: 0, groups: 0 },
        updates: { nodes: 1 },
        impact: "更新设定",
        cost: "无"
      },
      additions: { nodes: [], connections: [], groups: [] },
      updates: { nodes: [updated] }
    };
    const input = {
      toolName: "update_comic_setting",
      idempotencyKey: "setting-update-001",
      inputHash: "hash-a",
      plan
    };
    const first = await store.applyComicDramaAgentMutation(input);
    const replay = await new BoardStore(dir).applyComicDramaAgentMutation(input);

    expect(first.receipt).toMatchObject({
      toolName: "update_comic_setting",
      beforeRevision: snapshot.revision,
      afterRevision: snapshot.revision + 1
    });
    expect(replay).toEqual(first);
    expect((await store.getBoard(snapshot.boardId))?.revision).toBe(snapshot.revision + 1);
    await expect(new BoardStore(dir).applyComicDramaAgentMutation({
      ...input,
      inputHash: "hash-b"
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_INPUT_MISMATCH" });
  });

  it("keeps pinned context stable, marks following context stale, and blocks missing pinned versions", () => {
    const board: BoardData = {
      schemaVersion: 3, revision: 4, id: "board", name: "普通画板", createdAt: now, updatedAt: now,
      nodes: [settingNode(), characterNode(), segmentNode()],
      connections: [
        reference("setting-edge", "setting", { mode: "follow-active" }),
        reference("character-edge", "character", { mode: "pinned", versionId: "character-v1" })
      ]
    };
    const snapshot = createComicDramaContextSnapshot(board, "segment", now);
    expect(snapshot).toMatchObject({ boardId: "board", boardRevision: 4, targetNodeId: "segment", sources: [
      { nodeId: "character", versionId: "character-v1", binding: { mode: "pinned", versionId: "character-v1" } },
      { nodeId: "setting", versionId: "setting-v1", binding: { mode: "follow-active" } }
    ] });
    expect(evaluateComicDramaContextSnapshot(snapshot, { ...board, nodes: [settingNode(), {
      ...characterNode(), activeVersionId: "character-v2",
      versions: [...characterNode().versions, { ...characterNode().versions[0], versionId: "character-v2" }]
    }, segmentNode()] })).toEqual({ status: "current", changedSourceNodeIds: [], missingVersionSourceNodeIds: [] });
    expect(evaluateComicDramaContextSnapshot(snapshot, { ...board, nodes: [{
      ...settingNode(), activeVersionId: "setting-v2",
      versions: [...settingNode().versions, { ...settingNode().versions[0], versionId: "setting-v2" }]
    }, characterNode(), segmentNode()] })).toMatchObject({ status: "stale", changedSourceNodeIds: ["setting"] });
    expect(evaluateComicDramaContextSnapshot(snapshot, { ...board, nodes: [settingNode(), {
      ...characterNode(), activeVersionId: "character-v2", versions: [{ ...characterNode().versions[0], versionId: "character-v2" }]
    }, segmentNode()] })).toMatchObject({ status: "blocked", missingVersionSourceNodeIds: ["character"] });
  });

  it("creates a stable SHA-256 fingerprint for immutable context snapshots", async () => {
    const board: BoardData = { revision: 1, id: "board", name: "普通画板", createdAt: now, updatedAt: now,
      nodes: [settingNode(), segmentNode()], connections: [reference("setting-edge", "setting", { mode: "follow-active" })] };
    const snapshot = createComicDramaContextSnapshot(board, "segment", now);
    const fingerprint = await fingerprintComicDramaContext(snapshot);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(fingerprintComicDramaContext(structuredClone(snapshot))).resolves.toBe(fingerprint);
  });

  it("classifies narrative, visual, and video-only invalidation scopes", () => {
    const setting = settingNode().versions[0];
    const segment = segmentNode().versions[0];
    expect(getComicDramaVersionChangeScopes(setting, { ...setting, versionId: "setting-v2", fields: { ...setting.fields, synopsis: "新的梗概" } })).toEqual(["segment-context"]);
    expect(getComicDramaVersionChangeScopes(setting, { ...setting, versionId: "setting-v2", fields: { ...setting.fields, visualStyle: "水墨" } })).toEqual(["image", "video"]);
    expect(getComicDramaVersionChangeScopes(segment, { ...segment, versionId: "segment-v2", fields: { ...segment.fields, dialogue: "新的对白" } })).toEqual(["video"]);
  });

  it("requires adopted first and last frames plus a first-last-frame provider", () => {
    expect(() => createComicFrameContextSnapshot({
      role: "last-frame", segmentNodeId: "segment", segmentScriptVersionId: "segment-v1",
      characterVersions: [{ nodeId: "character", versionId: "character-v1" }], sharedVisualVersions: []
    })).toThrow("尾帧生成必须绑定已采用首帧版本");
    expect(createComicFrameContextSnapshot({
      role: "last-frame", segmentNodeId: "segment", segmentScriptVersionId: "segment-v1",
      characterVersions: [{ nodeId: "character", versionId: "character-v1" }], sharedVisualVersions: [],
      adoptedFirstFrame: { nodeId: "first-image", versionId: "first-v2" }
    })).toMatchObject({ role: "last-frame", adoptedFirstFrame: { versionId: "first-v2" } });
    expect(createComicVideoContextSnapshot({
      segmentNodeId: "segment", segmentScriptVersionId: "segment-v1", characterVersions: [], sharedVisualVersions: [],
      adoptedFirstFrame: { nodeId: "first-image", versionId: "first-v2" },
      adoptedLastFrame: { nodeId: "last-image", versionId: "last-v1" }
    })).toMatchObject({ adoptedFirstFrame: { versionId: "first-v2" }, adoptedLastFrame: { versionId: "last-v1" } });
    expect(getComicVideoReadiness({ providerModes: ["image-to-video"] })).toMatchObject({ reason: "missing-first-frame" });
    expect(getComicVideoReadiness({ adoptedFirstFrameVersionId: "first-v2", providerModes: ["image-to-video"] })).toMatchObject({ reason: "missing-last-frame" });
    expect(getComicVideoReadiness({ adoptedFirstFrameVersionId: "first-v2", adoptedLastFrameVersionId: "last-v1", providerModes: ["image-to-video"] })).toEqual({
      status: "blocked", reason: "unsupported-provider", action: "switch-model"
    });
    expect(getComicVideoReadiness({ adoptedFirstFrameVersionId: "first-v2", adoptedLastFrameVersionId: "last-v1", providerModes: ["first-last-frame"] })).toEqual({ status: "ready" });
  });

  it("propagates frame invalidation only to affected downstream stages", () => {
    expect(getComicDramaProductionInvalidationTargets("script")).toEqual(["first-frame", "last-frame", "video"]);
    expect(getComicDramaProductionInvalidationTargets("character")).toEqual(["first-frame", "last-frame", "video"]);
    expect(getComicDramaProductionInvalidationTargets("shared-visual")).toEqual(["first-frame", "last-frame", "video"]);
    expect(getComicDramaProductionInvalidationTargets("first-frame")).toEqual(["last-frame", "video"]);
    expect(getComicDramaProductionInvalidationTargets("last-frame")).toEqual(["video"]);
  });

  it("upgrades legacy boards and atomically applies a plan at the expected revision", async () => {
    const boardsDir = path.join(dir, "boards");
    await mkdir(boardsDir, { recursive: true });
    await writeFile(path.join(boardsDir, "legacy.json"), JSON.stringify({
      id: "legacy", name: "旧画板", createdAt: now, updatedAt: now,
      nodes: [{ id: "note", type: "text", text: "保留", x: 0, y: 0 }]
    }));
    const store = new BoardStore(dir);
    expect((await store.getBoard("legacy"))?.revision).toBe(0);
    const plan: BoardMutationPlan = {
      planId: "plan-1", boardId: "legacy", baseRevision: 0,
      preview: {
        title: "添加漫剧基础卡", additions: { nodes: 3, connections: 2, groups: 1 },
        impact: "不会改变现有节点", cost: "不调用媒体模型",
        costItems: [
          { stage: "first-frame", amount: 10, currency: "credit", authoritative: true },
          { stage: "last-frame", amount: 10, currency: "credit", authoritative: true },
          { stage: "video", amount: 60, currency: "gold-bean", authoritative: false }
        ]
      },
      additions: {
        nodes: [settingNode(), characterNode(), segmentNode()],
        connections: [
          reference("setting-edge", "setting", { mode: "follow-active" }),
          reference("character-edge", "character", { mode: "pinned", versionId: "character-v1" })
        ],
        groups: [{ id: "segment-group", title: "片段 01", nodeIds: ["segment"], x: 620, y: -20, width: 340, height: 360 }]
      }
    };
    expect(await store.applyMutationPlan(plan)).toEqual({
      boardId: "legacy", revision: 1,
      addedNodeIds: ["setting", "character", "segment"],
      addedConnectionIds: ["setting-edge", "character-edge"], addedGroupIds: ["segment-group"]
    });
    expect(await store.getComicDramaBoardSnapshot("legacy")).toMatchObject({
      boardId: "legacy", revision: 1,
      nodes: [{ id: "setting" }, { id: "character" }, { id: "segment" }],
      groups: [{ id: "segment-group", nodeIds: ["segment"] }]
    });
    const beforeConflict = await readFile(path.join(boardsDir, "legacy.json"), "utf8");
    await expect(store.applyMutationPlan({ ...plan, planId: "plan-2" })).rejects.toMatchObject({
      code: "BOARD_REVISION_CONFLICT", currentRevision: 1
    });
    expect(await readFile(path.join(boardsDir, "legacy.json"), "utf8")).toBe(beforeConflict);
  });

  it("preserves main-process comic data when a legacy renderer saves ordinary nodes", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("兼容画板");
    const plan: BoardMutationPlan = {
      planId: "managed", boardId: board.id, baseRevision: 0,
      preview: { title: "添加设定", additions: { nodes: 1, connections: 0, groups: 1 }, impact: "无", cost: "免费" },
      additions: { nodes: [settingNode()], connections: [], groups: [{ id: "group", title: "设定", nodeIds: ["setting"], x: 0, y: 0, width: 300, height: 300 }] }
    };
    await store.applyMutationPlan(plan);
    await store.saveBoard({ id: board.id, nodes: [{ id: "legacy-text", type: "text", text: "旧 UI 保存", x: 400, y: 0 }], connections: [] });
    const saved = await store.getBoard(board.id);
    expect(saved?.nodes.map((node) => node.id)).toEqual(["legacy-text", "setting"]);
    expect(saved?.groups).toMatchObject([{ id: "group", nodeIds: ["setting"] }]);
  });

  it("atomically saves a new setting version without adding duplicate nodes", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("设定协作");
    const initial = settingNode();
    await store.applyMutationPlan({
      planId: "add-setting",
      boardId: board.id,
      baseRevision: 0,
      preview: { title: "添加设定", additions: { nodes: 1, connections: 0, groups: 0 }, impact: "无", cost: "免费" },
      additions: { nodes: [initial], connections: [], groups: [] }
    });
    const nextVersionId = "setting-v2";
    const updated = {
      ...initial,
      status: "saved" as const,
      activeVersionId: nextVersionId,
      versions: [...initial.versions, {
        ...initial.versions[0],
        versionId: nextVersionId,
        fields: { ...initial.versions[0].fields, synopsis: "补充后的完整设定" }
      }]
    };
    await expect(store.applyMutationPlan({
      planId: "update-setting",
      boardId: board.id,
      baseRevision: 1,
      action: { kind: "update-setting", settingNodeId: initial.id },
      preview: {
        title: "保存设定新版本",
        additions: { nodes: 0, connections: 0, groups: 0 },
        updates: { nodes: 1 },
        impact: "更新设定",
        cost: "免费"
      },
      additions: { nodes: [], connections: [], groups: [] },
      updates: { nodes: [updated] }
    })).resolves.toMatchObject({
      revision: 2,
      addedNodeIds: [],
      updatedNodeIds: [initial.id]
    });
    const snapshot = await store.getComicDramaBoardSnapshot(board.id);
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0]).toMatchObject({
      id: initial.id,
      status: "saved",
      activeVersionId: nextVersionId,
      versions: [{ versionId: "setting-v1" }, { versionId: nextVersionId }]
    });
  });

  it("rejects an invalid plan without leaving partial nodes", async () => {
    const store = new BoardStore(dir);
    const board = await store.createBoard("普通画板");
    const plan: BoardMutationPlan = {
      planId: "invalid", boardId: board.id, baseRevision: board.revision ?? 0,
      preview: { title: "无效预览", additions: { nodes: 1, connections: 1, groups: 0 }, impact: "无", cost: "免费" },
      additions: {
        nodes: [settingNode()],
        connections: [{ id: "dangling", source: "setting", target: "missing", kind: "reference" }], groups: []
      }
    };
    await expect(store.applyMutationPlan(plan)).rejects.toThrow("连接端点不存在");
    expect((await store.getBoard(board.id))?.nodes).toEqual([]);
    expect((await store.getBoard(board.id))?.revision).toBe(0);

    const cyclePlan: BoardMutationPlan = {
      ...plan,
      planId: "cycle",
      preview: { ...plan.preview, additions: { nodes: 2, connections: 2, groups: 0 } },
      additions: {
        nodes: [settingNode(), segmentNode()],
        connections: [
          { id: "to-segment", source: "setting", target: "segment", kind: "reference" },
          { id: "to-setting", source: "segment", target: "setting", kind: "reference" }
        ],
        groups: []
      }
    };
    await expect(store.applyMutationPlan(cyclePlan)).rejects.toThrow("引用连接不能形成环");
    expect((await store.getBoard(board.id))?.nodes).toEqual([]);
  });

  it("registers snapshot and atomic apply IPC handlers", async () => {
    const boards = {
      getComicDramaBoardSnapshot: vi.fn().mockResolvedValue({ boardId: "board", revision: 2 }),
      applyMutationPlan: vi.fn().mockResolvedValue({ boardId: "board", revision: 3 })
    };
    const dispose = registerComicDramaIpc(boards);
    const plan = { planId: "plan", boardId: "board", baseRevision: 2 };
    await electronMocks.handlers.get("comicDrama:getBoardSnapshot")!({}, "board");
    await electronMocks.handlers.get("comicDrama:applyMutationPlan")!({}, plan);
    expect(boards.getComicDramaBoardSnapshot).toHaveBeenCalledWith("board");
    expect(boards.applyMutationPlan).toHaveBeenCalledWith(plan);
    dispose();
    expect(electronMocks.handlers.size).toBe(0);
  });

  it("round-trips semantic cards, groups, bindings and sequence entries in board archives", async () => {
    const sequence: VideoSequence = {
      id: "sequence-1", boardId: "archive-board", name: "第一版成片", revision: 1, createdAt: now, updatedAt: now,
      defaults: { model: "first-last-model", aspectRatio: "9:16", resolution: "720p", fps: 30, durationSeconds: 6, generateAudio: false, watermark: false },
      keyframes: [], segments: [], exportVersions: []
    };
    const board: BoardData = {
      schemaVersion: 3, revision: 7, id: "archive-board", name: "归档画板", createdAt: now, updatedAt: now,
      nodes: [settingNode(), characterNode(), segmentNode(), {
        id: "sequence-entry", type: "video-sequence-entry", x: 980, y: 0, sequenceId: "sequence-1",
        name: "第一版成片", segmentCount: 3, durationMs: 18_000, exportStatus: "stale"
      }],
      connections: [reference("setting-edge", "setting", { mode: "pinned", versionId: "setting-v1" })],
      groups: [{ id: "group", title: "片段 01", nodeIds: ["segment"], x: 620, y: -20, width: 340, height: 360 }]
    };
    const parsed = await parseBoardArchive(await buildBoardArchive(board, [], "0.1.48", [], [], [], [sequence]));
    expect(parsed.manifest.format).toBe(BOARD_ARCHIVE_FORMAT);
    expect(parsed.board).toMatchObject({
      revision: 7,
      nodes: [
        { type: "comic-setting" }, { type: "comic-character" }, { type: "comic-segment-script" },
        { type: "video-sequence-entry", sequenceId: "sequence-1" }
      ],
      connections: [{ versionBinding: { mode: "pinned", versionId: "setting-v1" } }],
      groups: [{ id: "group", nodeIds: ["segment"] }]
    });
    expect(parsed.videoSequences).toMatchObject([{ id: "sequence-1", boardId: "archive-board" }]);
    const sequenceStore = new VideoSequenceStore(dir);
    await sequenceStore.importMany(parsed.videoSequences.map((item) => ({ ...item, boardId: "imported-board" })));
    await expect(sequenceStore.getSequence("imported-board", "sequence-1")).resolves.toMatchObject({ id: "sequence-1" });
  });
});
