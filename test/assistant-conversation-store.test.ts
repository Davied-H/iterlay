import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantConversationStore } from "../electron/storage/assistant-conversation-store.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("AssistantConversationStore", () => {
  it("persists assistant exchanges as rebuildable memory sources", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-assistant-conversation-"));
    directories.push(directory);
    const store = new AssistantConversationStore(directory);

    const record = await store.add({
      surface: "canvas-prompt",
      instruction: "延续上一张的光线",
      response: "保留柔和左侧窗光。",
      reasoningSummary: "先核对参考光线。",
      generatedPrompt: "白色台灯置于窗边，保留柔和左侧窗光。",
      conversationId: "conversation-a",
      memoryQuery: { boardId: "board-a" }
    });

    expect(record).toMatchObject({
      conversationId: "conversation-a",
      surface: "canvas-prompt",
      boardId: "board-a"
    });
    expect(await store.list()).toEqual([
      expect.objectContaining({ instruction: "延续上一张的光线", response: "保留柔和左侧窗光。" })
    ]);
    expect((await store.list())[0]?.generatedPrompt).toBe("白色台灯置于窗边，保留柔和左侧窗光。");
    expect((await new AssistantConversationStore(directory).list())[0]?.reasoningSummary).toBe("先核对参考光线。");
  });

  it("keeps multiple exchanges in the same conversation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-assistant-conversation-"));
    directories.push(directory);
    const store = new AssistantConversationStore(directory);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T08:23:56.273Z"));

    try {
      await store.add({
        surface: "canvas-prompt",
        instruction: "先做一张雨夜街头",
        response: "我会保留冷色霓虹。",
        conversationId: "conversation-a"
      });
      await store.add({
        surface: "canvas-prompt",
        instruction: "再增加电影感",
        response: "已补充低机位和浅景深。",
        conversationId: "conversation-a"
      });

      expect(await store.list()).toEqual([
        expect.objectContaining({ conversationId: "conversation-a", instruction: "再增加电影感" }),
        expect.objectContaining({ conversationId: "conversation-a", instruction: "先做一张雨夜街头" })
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
