import { describe, expect, it, vi } from "vitest";
import type { BoardMutationPlan, ComicDramaBoardSnapshot } from "../shared/comic-drama.js";
import {
  COMIC_DRAMA_REQUIRED_TOOL_NAMES,
  createComicDramaAgentTools
} from "../electron/comic-drama-agent-tools.js";

const snapshot: ComicDramaBoardSnapshot = {
  boardId: "comic-board",
  revision: 3,
  nodes: [{
    id: "setting",
    type: "comic-setting",
    x: 0,
    y: 0,
    status: "draft",
    activeVersionId: "setting-v1",
    versions: [{
      versionId: "setting-v1",
      createdAt: "2026-01-01T00:00:00.000Z",
      fields: {
        title: "未命名漫剧",
        synopsis: "",
        genre: "",
        tone: "",
        worldRules: [],
        visualStyle: "",
        constraints: [],
        aspectRatio: "9:16",
        targetDurationSeconds: 30
      }
    }]
  }],
  connections: [],
  groups: []
};

function tools() {
  return createComicDramaAgentTools(
    { getSnapshot: vi.fn(async () => structuredClone(snapshot)) },
    {
      agentRunId: "run-1",
      conversationId: "conversation-1",
      boardId: snapshot.boardId
    }
  );
}

function writableTools(applyMutation = vi.fn(async (input: { plan: BoardMutationPlan }) => ({
  boardId: input.plan.boardId,
  revision: input.plan.baseRevision + 1,
  addedNodeIds: input.plan.additions.nodes.map((node) => node.id),
  addedConnectionIds: input.plan.additions.connections.map((connection) => connection.id),
  addedGroupIds: input.plan.additions.groups.map((group) => group.id),
  updatedNodeIds: input.plan.updates?.nodes.map((node) => node.id)
}))) {
  const ready = structuredClone(snapshot);
  const setting = ready.nodes[0];
  if (setting.type === "comic-setting") {
    setting.status = "saved";
    setting.versions[0].fields.title = "雨夜来信";
    setting.versions[0].fields.synopsis = "旧物修复师收到一封迟到十年的信。";
  }
  return {
    applyMutation,
    tools: createComicDramaAgentTools({
      getSnapshot: vi.fn(async () => structuredClone(ready)),
      applyMutation
    }, {
      agentRunId: "run-write",
      conversationId: "conversation-write",
      boardId: ready.boardId
    })
  };
}

describe("comic drama Agent tools", () => {
  it("exposes only the internal read-only scene tools in slice 1", () => {
    expect(tools().map((tool) => tool.name)).toEqual([...COMIC_DRAMA_REQUIRED_TOOL_NAMES]);
  });

  it("reads the latest state and reports setting blockers", async () => {
    const tool = tools().find((candidate) => candidate.name === "get_comic_drama_state")!;
    const result = await tool.execute("call-1", {
      boardId: snapshot.boardId,
      selectedNodeIds: ["setting"]
    });
    const content = result.content[0];
    expect(content.type).toBe("text");
    const value = JSON.parse(content.type === "text" ? content.text : "{}");
    expect(value).toMatchObject({
      boardId: snapshot.boardId,
      revision: 3,
      stage: "setting",
      selectedNodeIds: ["setting"],
      blockers: [{ code: "SETTING_INCOMPLETE", nodeId: "setting" }]
    });
  });

  it("fails closed for every cross-board read", async () => {
    for (const tool of tools()) {
      const args = tool.name === "inspect_comic_drama_node"
        ? { boardId: "other-board", nodeId: "setting" }
        : { boardId: "other-board" };
      await expect(tool.execute("call-scope", args)).rejects.toThrow("COMIC_BOARD_SCOPE_VIOLATION");
    }
  });

  it("constructs character nodes and pinned setting connections in the host", async () => {
    const { tools: sceneTools, applyMutation } = writableTools();
    const tool = sceneTools.find((candidate) => candidate.name === "create_comic_characters")!;
    await tool.execute("call-write", {
      boardId: snapshot.boardId,
      expectedRevision: 3,
      idempotencyKey: "characters-0001",
      characters: [{
        name: "林默",
        role: "旧物修复师",
        profile: "克制敏锐，试图查明旧信来源。",
        appearanceAnchors: ["28岁", "短黑发", "深色工作围裙"],
        visualPrompt: "28岁男性旧物修复师，短黑发，深色工作围裙，角色设定图"
      }]
    });

    const plan = applyMutation.mock.calls[0][0].plan;
    expect(plan.additions.nodes).toMatchObject([{
      type: "comic-character",
      name: "林默"
    }]);
    expect(plan.additions.connections).toMatchObject([{
      source: "setting",
      kind: "reference",
      versionBinding: { mode: "pinned", versionId: "setting-v1" }
    }]);
  });

  it("rejects writes based on a stale revision before applying", async () => {
    const { tools: sceneTools, applyMutation } = writableTools();
    const tool = sceneTools.find((candidate) => candidate.name === "update_comic_setting")!;
    await expect(tool.execute("call-stale", {
      boardId: snapshot.boardId,
      expectedRevision: 2,
      idempotencyKey: "setting-0001",
      setting: {
        title: "雨夜来信",
        synopsis: "旧物修复师收到一封迟到十年的信。"
      }
    })).rejects.toThrow("BOARD_REVISION_CONFLICT");
    expect(applyMutation).not.toHaveBeenCalled();
  });

  it("keeps media grants inside the Agent run and rejects replay", async () => {
    const ready = structuredClone(snapshot);
    const setting = ready.nodes[0];
    if (setting.type === "comic-setting") {
      setting.status = "saved";
      setting.versions[0].fields.title = "雨夜来信";
      setting.versions[0].fields.synopsis = "迟到十年的信。";
    }
    ready.nodes.push({
      id: "character",
      type: "comic-character",
      x: 320,
      y: 0,
      name: "林默",
      status: "saved",
      activeVersionId: "character-v1",
      versions: [{
        versionId: "character-v1",
        createdAt: "2026-01-01T00:00:00.000Z",
        fields: {
          role: "旧物修复师",
          profile: "克制敏锐",
          appearanceAnchors: ["短黑发", "深色工作围裙"],
          visualPrompt: "角色设定图"
        }
      }]
    });
    const generateMedia = vi.fn(async () => ({
      taskId: "task-1",
      status: "running",
      boardId: ready.boardId
    }));
    const sceneTools = createComicDramaAgentTools({
      getSnapshot: vi.fn(async () => structuredClone(ready)),
      applyMutation: vi.fn(),
      issueMediaQuote: vi.fn(async () => ({
        quoteId: "quote-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        inputFingerprint: "fingerprint-1",
        clientRequestId: "request-1",
        providerKey: "official",
        priceSnapshot: {
          stage: "character",
          amount: 1,
          currency: "credit",
          authoritative: true as const
        }
      })),
      confirmMedia: vi.fn(async () => true),
      generateMedia,
      getMediaStatus: vi.fn(async () => [])
    }, {
      agentRunId: "run-media",
      conversationId: "conversation-media",
      boardId: ready.boardId
    });
    const quote = sceneTools.find((tool) => tool.name === "quote_comic_media")!;
    const confirm = sceneTools.find((tool) => tool.name === "confirm_comic_media")!;
    const generate = sceneTools.find((tool) => tool.name === "generate_comic_media")!;

    await quote.execute("call-quote", {
      boardId: ready.boardId,
      operation: {
        kind: "character-image",
        targetNodeId: "character",
        prompt: "林默角色设定图",
        count: 1
      }
    });
    const confirmation = await confirm.execute("call-confirm", { quoteId: "quote-1" });
    const confirmationBlock = confirmation.content[0];
    const confirmationValue = JSON.parse(confirmationBlock.type === "text" ? confirmationBlock.text : "{}");
    expect(confirmationValue).toMatchObject({
      approved: true,
      quoteId: "quote-1",
      confirmationId: expect.any(String)
    });
    expect(JSON.stringify(confirmationValue)).not.toContain("authorizationToken");

    await generate.execute("call-generate", {
      confirmationId: confirmationValue.confirmationId
    });
    expect(generateMedia).toHaveBeenCalledOnce();
    await expect(generate.execute("call-replay", {
      confirmationId: confirmationValue.confirmationId
    })).rejects.toThrow("AUTHORIZATION_REPLAYED");
  });
});
