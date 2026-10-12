import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../electron/storage/memory-store.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createStore(): Promise<MemoryStore> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-memory-"));
  directories.push(directory);
  return new MemoryStore(directory);
}

describe("MemoryStore", () => {
  it("retrieves recent submitted prompts for the current board", async () => {
    const store = await createStore();
    const sources = [{
      type: "prompt_submitted" as const,
      surface: "canvas-prompt" as const,
      boardId: "board-a",
      content: "白色陶瓷杯，柔和窗边侧光",
      sourceId: "job-a"
    }, {
      type: "prompt_submitted" as const,
      surface: "canvas-prompt" as const,
      boardId: "board-b",
      content: "深色城市夜景",
      sourceId: "job-b"
    }];
    await store.saveExtractedMemories(sources, [{
      kind: "episodic",
      scope: "board",
      content: "当前产品摄影偏向白色陶瓷主体和柔和窗边侧光。",
      confidence: 0.8,
      sourceIds: ["job-a"]
    }, {
      kind: "episodic",
      scope: "board",
      content: "当前在尝试深色城市夜景。",
      confidence: 0.7,
      sourceIds: ["job-b"]
    }]);

    const results = await store.retrieve({ boardId: "board-a" }, "balanced", "产品摄影 陶瓷杯");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: "episodic", scope: "board", evidenceCount: 1 });
    expect(results[0].content).toContain("白色陶瓷主体");
  });

  it("reinforces a prompt after a successful generation and records failed outcomes", async () => {
    const store = await createStore();
    const base = {
      surface: "canvas-prompt" as const,
      boardId: "board-a",
      content: "极简产品摄影，保留大面积留白"
    };
    await store.saveExtractedMemories([
      { type: "prompt_submitted", ...base, sourceId: "prompt-a" },
      { type: "generation_succeeded", ...base, jobId: "job-a", sourceId: "job-a" },
      { type: "generation_failed", ...base, jobId: "job-b", sourceId: "job-b" }
    ], [{
      kind: "procedural",
      scope: "board",
      content: "产品摄影倾向用极简构图和大面积留白突出主体。",
      confidence: 0.8,
      sourceIds: ["prompt-a", "job-a", "job-b"]
    }]);

    const results = await store.retrieve({ boardId: "board-a" }, "balanced", "产品摄影 留白");
    expect(results[0]).toMatchObject({ evidenceCount: 3 });
    expect((await store.getStats()).eventCount).toBe(3);
  });

  it("keeps assistant-only output as a candidate until it is actually submitted", async () => {
    const store = await createStore();
    await store.record({
      type: "assistant_generated",
      surface: "scene-template",
      boardId: "board-a",
      content: "商品主体：白色陶瓷杯"
    });

    expect(await store.retrieve({ boardId: "board-a" }, "active", "陶瓷杯")).toEqual([]);
    expect(await store.getStats()).toMatchObject({ candidateMemoryCount: 0, activeMemoryCount: 0, eventCount: 1 });
  });

  it("replaces prompt draft checkpoints instead of storing every change", async () => {
    const store = await createStore();
    await store.record({
      type: "prompt_draft",
      surface: "canvas-prompt",
      boardId: "board-a",
      content: "第一版草稿"
    });
    await store.record({
      type: "prompt_draft",
      surface: "canvas-prompt",
      boardId: "board-a",
      content: "第二版草稿"
    });

    const stats = await store.getStats();
    expect(stats.eventCount).toBe(1);
    expect(stats.activeMemoryCount).toBe(0);
    const results = await store.retrieve({ boardId: "board-a" }, "cautious", "第二版");
    expect(results).toEqual([]);
  });

  it("removes memories when their source comment is deleted", async () => {
    const store = await createStore();
    await store.saveExtractedMemories([{
      type: "comment_added",
      surface: "comment",
      sourceId: "comment-a",
      assetPath: "/asset/a.png",
      content: "主体很好，背景太抢"
    }], [{
      kind: "semantic",
      scope: "asset",
      content: "偏好弱化背景，让主体保持更高的视觉优先级。",
      confidence: 0.8,
      sourceIds: ["comment-a"]
    }]);

    expect((await store.getStats()).activeMemoryCount).toBe(1);
    await store.removeBySource("comment-a");
    expect(await store.getStats()).toMatchObject({ eventCount: 0, activeMemoryCount: 0 });
  });

  it("clears events and memories without touching other workspace stores", async () => {
    const store = await createStore();
    await store.record({
      type: "prompt_submitted",
      surface: "canvas-prompt",
      content: "极简产品摄影"
    });
    await store.clear();
    expect(await store.getStats()).toMatchObject({ eventCount: 0, activeMemoryCount: 0, candidateMemoryCount: 0 });
  });

  it("lists each memory with its generation reason and source evidence", async () => {
    const store = await createStore();
    await store.saveExtractedMemories([{
      type: "comment_added",
      surface: "comment",
      sourceId: "comment-a",
      boardId: "board-a",
      assetPath: "/asset/a.png",
      content: "主体很好，背景太抢",
      occurredAt: "2026-07-18T10:00:00.000Z"
    }], [{
      kind: "semantic",
      scope: "asset",
      content: "偏好降低背景存在感，让主体更突出。",
      confidence: 0.78,
      sourceIds: ["comment-a"]
    }]);

    const memories = await store.listMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({
      kind: "semantic",
      scope: "asset",
      status: "active",
      generationReason: "根据你对作品的评论提炼；评论会作为创作取舍的反馈证据。"
    });
    expect(memories[0].evidence).toEqual([
      expect.objectContaining({
        type: "comment_added",
        surface: "comment",
        summary: expect.stringContaining("主体很好"),
        occurredAt: "2026-07-18T10:00:00.000Z"
      })
    ]);
  });

  it("keeps a deleted memory rejected so the same evidence cannot recreate it", async () => {
    const store = await createStore();
    const event = {
      type: "prompt_submitted" as const,
      surface: "canvas-prompt" as const,
      boardId: "board-a",
      content: "白色陶瓷杯，柔和窗边侧光",
      sourceId: "job-a"
    };
    const extracted = [{
      kind: "semantic" as const,
      scope: "board" as const,
      content: "产品摄影偏好白色陶瓷主体和柔和窗边侧光。",
      confidence: 0.8,
      sourceIds: ["job-a"]
    }];
    await store.saveExtractedMemories([event], [{
      ...extracted[0],
      content: "偏好用柔和的侧向窗光表现浅色陶瓷产品。"
    }]);
    const [memory] = await store.listMemories();

    expect(await store.deleteMemory(memory.id)).toBe(true);
    expect(await store.listMemories()).toEqual([]);
    expect(await store.retrieve({ boardId: "board-a" }, "balanced", "陶瓷杯")).toEqual([]);

    await store.saveExtractedMemories([event], extracted);
    await store.organize();
    expect(await store.listMemories()).toEqual([]);
    expect(await store.retrieve({ boardId: "board-a" }, "balanced", "陶瓷杯")).toEqual([]);
  });

  it("updates the last organized time when organizing memories", async () => {
    const store = await createStore();
    await store.record({
      type: "prompt_submitted",
      surface: "canvas-prompt",
      content: "极简产品摄影",
      occurredAt: "2025-01-01T00:00:00.000Z"
    });

    const organized = await store.organize();
    expect(organized.lastOrganizedAt).toBeDefined();
    expect(Date.parse(organized.lastOrganizedAt ?? "")).toBeGreaterThan(Date.parse("2025-01-01T00:00:00.000Z"));
  });

  it("imports historical sources once and rebuilds conversation memories", async () => {
    const store = await createStore();
    const historicalEvents = [{
      type: "assistant_conversation" as const,
      surface: "canvas-prompt" as const,
      content: "用户：延续上一张的柔和窗边光\n助手：保持白色陶瓷材质和左侧光线",
      boardId: "board-a",
      sourceId: "conversation-a",
      occurredAt: new Date().toISOString()
    }];

    const extracted = [{
      kind: "episodic" as const,
      scope: "board" as const,
      content: "当前希望延续白色陶瓷材质和柔和左侧窗光。",
      confidence: 0.75,
      sourceIds: ["conversation-a"]
    }];
    const first = await store.saveExtractedMemories(historicalEvents, extracted);
    const second = await store.saveExtractedMemories(historicalEvents, extracted);

    expect(first.importedEventCount).toBe(1);
    expect(second.importedEventCount).toBe(0);
    expect(first.stats.activeMemoryCount).toBe(1);
    expect(await store.listMemories()).toEqual([
      expect.objectContaining({
        status: "active",
        generationReason: "根据你与 AI 助手的近期对话提炼，用于延续创作意图和上下文。",
        evidence: [expect.objectContaining({ type: "assistant_conversation" })]
      })
    ]);
  });

  it("stores extracted conclusions while retaining raw records only as evidence", async () => {
    const store = await createStore();
    const source = {
      type: "generation_succeeded" as const,
      surface: "canvas-prompt" as const,
      content: "白色陶瓷杯，固定主体比例，柔和左侧窗光，背景留白",
      boardId: "board-a",
      jobId: "job-a",
      sourceId: "generation-job:job-a",
      occurredAt: new Date().toISOString()
    };

    const result = await store.saveExtractedMemories([source], [{
      kind: "procedural",
      scope: "board",
      content: "制作产品图时先固定主体比例，再用柔和侧光和留白突出材质。",
      confidence: 0.82,
      sourceIds: ["generation-job:job-a"]
    }]);
    const [memory] = await store.listMemories();

    expect(result.generatedMemoryCount).toBe(1);
    expect(memory.content).toBe("制作产品图时先固定主体比例，再用柔和侧光和留白突出材质。");
    expect(memory.evidence[0].summary).toContain("白色陶瓷杯");
    expect(memory.generationReason).toContain("历史提示词提炼");
  });
});
