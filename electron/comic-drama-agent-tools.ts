import type { AgentTool } from "@mariozechner/pi-agent-core";
import { createHash } from "node:crypto";
import { Type, type TSchema } from "typebox";
import type { BoardConnection } from "../shared/types.js";
import type {
  BoardMutationPlan,
  BoardMutationResult,
  ComicCharacterFields,
  ComicCharacterNode,
  ComicDramaBoardSnapshot,
  ComicDramaBoardNode,
  ComicSegmentScriptFields,
  ComicSegmentScriptNode,
  ComicSettingFields,
  ComicSettingNode
} from "../shared/comic-drama.js";

export const COMIC_DRAMA_REQUIRED_TOOL_NAMES = [
  "get_comic_drama_state",
  "inspect_comic_drama_node",
  "validate_comic_drama_continuity"
] as const;
export const COMIC_DRAMA_WRITE_TOOL_NAMES = [
  "update_comic_setting",
  "create_comic_characters",
  "update_comic_character",
  "create_comic_segment",
  "update_comic_segment",
  "create_comic_media_chain"
] as const;
export const COMIC_DRAMA_MEDIA_TOOL_NAMES = [
  "quote_comic_media",
  "confirm_comic_media",
  "generate_comic_media",
  "get_comic_media_status"
] as const;
export const COMIC_DRAMA_AGENT_TOOL_NAMES = [
  ...COMIC_DRAMA_REQUIRED_TOOL_NAMES,
  ...COMIC_DRAMA_WRITE_TOOL_NAMES,
  ...COMIC_DRAMA_MEDIA_TOOL_NAMES
] as const;

export interface ComicMediaOperation {
  kind: "character-image" | "first-frame" | "last-frame" | "video";
  targetNodeId: string;
  prompt: string;
  providerId?: string;
  model?: string;
  count?: number;
  size?: string;
  durationSeconds?: number;
  resolution?: string;
  generateAudio?: boolean;
}

export interface ComicMediaQuote {
  quoteId: string;
  expiresAt: string;
  inputFingerprint: string;
  clientRequestId: string;
  providerKey: string;
  priceSnapshot: {
    stage: string;
    amount: number;
    currency: string;
    authoritative: true;
  };
}

export interface ComicDramaAgentToolHost {
  getSnapshot(boardId: string): Promise<ComicDramaBoardSnapshot>;
  applyMutation?(input: {
    toolName: string;
    idempotencyKey: string;
    inputHash: string;
    plan: BoardMutationPlan;
  }): Promise<BoardMutationResult>;
  issueMediaQuote?(operation: ComicMediaOperation & { boardId: string }): Promise<ComicMediaQuote>;
  confirmMedia?(input: {
    quote: ComicMediaQuote;
    operation: ComicMediaOperation;
  }): Promise<boolean>;
  generateMedia?(input: {
    quote: ComicMediaQuote;
    operation: ComicMediaOperation;
    confirmationId: string;
  }): Promise<{ taskId: string; status: string; boardId: string }>;
  getMediaStatus?(taskIds: string[]): Promise<unknown>;
}

export interface ComicDramaAgentToolContext {
  agentRunId: string;
  conversationId: string;
  boardId: string;
  signal?: AbortSignal;
}

type JsonObject = Record<string, unknown>;
interface CharacterInput extends ComicCharacterFields {
  name: string;
  visualDescription?: string;
  required?: boolean;
}
interface CharacterUpdateInput extends ComicCharacterFields {
  name?: string;
}
interface SegmentInput extends ComicSegmentScriptFields {
  title: string;
}

export function createComicDramaAgentTools(
  host: ComicDramaAgentToolHost,
  context: ComicDramaAgentToolContext
): AgentTool[] {
  const mediaQuotes = new Map<string, { quote: ComicMediaQuote; operation: ComicMediaOperation }>();
  const mediaGrants = new Map<string, { quoteId: string; consumed: boolean }>();
  const readState = async (selectedNodeIds: string[] = []): Promise<JsonObject> => {
    assertActive(context);
    const snapshot = await requireComicSnapshot(host, context.boardId);
    return comicDramaState(snapshot, selectedNodeIds);
  };

  const tools: AgentTool[] = [
    {
      name: "get_comic_drama_state",
      label: "读取漫剧状态",
      description: "读取当前绑定漫剧画板的最新阶段、节点、连接、阻塞项和建议动作。每轮决策前必须调用。",
      parameters: Type.Object({
        boardId: Type.String({ minLength: 1 }),
        selectedNodeIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }), {
          maxItems: 20,
          uniqueItems: true
        }))
      }),
      executionMode: "parallel",
      execute: async (_toolCallId, rawArgs) => {
        const args = rawArgs as { boardId: string; selectedNodeIds?: string[] };
        assertBoardScope(args.boardId, context.boardId);
        return resultContent(await readState(args.selectedNodeIds));
      }
    },
    {
      name: "inspect_comic_drama_node",
      label: "检查漫剧节点",
      description: "读取当前漫剧画板中一个语义节点的活动版本、依赖和阻塞原因。",
      parameters: Type.Object({
        boardId: Type.String({ minLength: 1 }),
        nodeId: Type.String({ minLength: 1 })
      }),
      executionMode: "parallel",
      execute: async (_toolCallId, rawArgs) => {
        const args = rawArgs as { boardId: string; nodeId: string };
        assertBoardScope(args.boardId, context.boardId);
        assertActive(context);
        const snapshot = await requireComicSnapshot(host, context.boardId);
        const node = snapshot.nodes.find((candidate) => candidate.id === args.nodeId);
        if (!node || node.type === "video-sequence-entry") {
          throw toolError("COMIC_NODE_NOT_FOUND", "当前漫剧画板中不存在指定语义节点。");
        }
        const incoming = snapshot.connections.filter((connection) => connection.target === node.id);
        const outgoing = snapshot.connections.filter((connection) => connection.source === node.id);
        return resultContent({
          boardId: snapshot.boardId,
          revision: snapshot.revision,
          node,
          activeVersion: activeVersion(node),
          incoming,
          outgoing,
          blockers: nodeBlockers(node)
        });
      }
    },
    {
      name: "validate_comic_drama_continuity",
      label: "校验漫剧连续性",
      description: "检查当前漫剧或指定片段的角色外观、脚本可执行性和上下游版本绑定。",
      parameters: Type.Object({
        boardId: Type.String({ minLength: 1 }),
        segmentNodeId: Type.Optional(Type.String({ minLength: 1 }))
      }),
      executionMode: "parallel",
      execute: async (_toolCallId, rawArgs) => {
        const args = rawArgs as { boardId: string; segmentNodeId?: string };
        assertBoardScope(args.boardId, context.boardId);
        assertActive(context);
        const snapshot = await requireComicSnapshot(host, context.boardId);
        return resultContent(validateContinuity(snapshot, args.segmentNodeId));
      }
    }
  ];
  if (!host.applyMutation) return tools;

  const apply = host.applyMutation;
  tools.push(
    writeTool("update_comic_setting", "更新漫剧设定", "创建或更新当前漫剧设定的新版本。", Type.Object({
      boardId: Type.String({ minLength: 1 }),
      expectedRevision: Type.Integer({ minimum: 0 }),
      idempotencyKey: Type.String({ minLength: 8, maxLength: 160 }),
      setting: Type.Object({
        title: Type.Optional(Type.String({ maxLength: 80 })),
        synopsis: Type.Optional(Type.String({ maxLength: 2_000 })),
        genre: Type.Optional(Type.String({ maxLength: 80 })),
        tone: Type.Optional(Type.String({ maxLength: 80 })),
        worldRules: Type.Optional(Type.Array(Type.String({ maxLength: 240 }), { maxItems: 20 })),
        visualStyle: Type.Optional(Type.String({ maxLength: 500 })),
        constraints: Type.Optional(Type.Array(Type.String({ maxLength: 240 }), { maxItems: 20 })),
        aspectRatio: Type.Optional(Type.String({ maxLength: 20 })),
        targetDurationSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 3_600 }))
      })
    }), host, context, apply, async (snapshot, args) => buildSettingPlan(
      snapshot,
      (args as { setting: Partial<ComicSettingFields> }).setting
    )),
    writeTool("create_comic_characters", "创建漫剧角色", "原子创建一到六张完整角色卡及其设定引用。", Type.Object({
      boardId: Type.String({ minLength: 1 }),
      expectedRevision: Type.Integer({ minimum: 0 }),
      idempotencyKey: Type.String({ minLength: 8, maxLength: 160 }),
      characters: Type.Array(Type.Object({
        name: Type.String({ minLength: 1, maxLength: 40 }),
        role: Type.String({ minLength: 1, maxLength: 300 }),
        profile: Type.String({ minLength: 1, maxLength: 2_000 }),
        appearanceAnchors: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), {
          minItems: 2,
          maxItems: 6
        }),
        visualPrompt: Type.String({ minLength: 1, maxLength: 4_000 }),
        visualDescription: Type.Optional(Type.String({ maxLength: 500 })),
        required: Type.Optional(Type.Boolean())
      }), { minItems: 1, maxItems: 6 })
    }), host, context, apply, async (snapshot, args) => buildCharactersPlan(
      snapshot,
      (args as { characters: CharacterInput[] }).characters
    )),
    writeTool("update_comic_character", "更新漫剧角色", "为当前漫剧中的指定角色创建一个完整新版本。", Type.Object({
      boardId: Type.String({ minLength: 1 }),
      expectedRevision: Type.Integer({ minimum: 0 }),
      idempotencyKey: Type.String({ minLength: 8, maxLength: 160 }),
      nodeId: Type.String({ minLength: 1 }),
      character: Type.Object({
        name: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
        role: Type.String({ minLength: 1, maxLength: 300 }),
        profile: Type.String({ minLength: 1, maxLength: 2_000 }),
        appearanceAnchors: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), {
          minItems: 2,
          maxItems: 6
        }),
        visualPrompt: Type.String({ minLength: 1, maxLength: 4_000 })
      })
    }), host, context, apply, async (snapshot, args) => {
      const input = args as { nodeId: string; character: CharacterUpdateInput };
      return buildCharacterUpdatePlan(snapshot, input.nodeId, input.character);
    }),
    writeTool("create_comic_segment", "创建漫剧片段", "创建一个完整片段脚本并连接当前设定和角色。", Type.Object({
      boardId: Type.String({ minLength: 1 }),
      expectedRevision: Type.Integer({ minimum: 0 }),
      idempotencyKey: Type.String({ minLength: 8, maxLength: 160 }),
      segment: segmentSchema(false)
    }), host, context, apply, async (snapshot, args) => buildSegmentPlan(
      snapshot,
      (args as { segment: SegmentInput }).segment
    )),
    writeTool("update_comic_segment", "更新漫剧片段", "为指定片段脚本创建新版本。", Type.Object({
      boardId: Type.String({ minLength: 1 }),
      expectedRevision: Type.Integer({ minimum: 0 }),
      idempotencyKey: Type.String({ minLength: 8, maxLength: 160 }),
      nodeId: Type.String({ minLength: 1 }),
      segment: segmentSchema(true)
    }), host, context, apply, async (snapshot, args) => {
      const input = args as { nodeId: string; segment: Partial<SegmentInput> };
      return buildSegmentUpdatePlan(snapshot, input.nodeId, input.segment);
    }),
    writeTool("create_comic_media_chain", "创建漫剧媒体链", "为指定片段创建首帧、尾帧和视频生成节点；不会调用媒体 Provider。", Type.Object({
      boardId: Type.String({ minLength: 1 }),
      expectedRevision: Type.Integer({ minimum: 0 }),
      idempotencyKey: Type.String({ minLength: 8, maxLength: 160 }),
      segmentNodeId: Type.String({ minLength: 1 })
    }), host, context, apply, async (snapshot, args) => buildMediaChainPlan(
      snapshot,
      (args as { segmentNodeId: string }).segmentNodeId
    ))
  );
  if (host.issueMediaQuote && host.confirmMedia && host.generateMedia && host.getMediaStatus) {
    tools.push(
      {
        name: "quote_comic_media",
        label: "报价漫剧媒体",
        description: "为一个角色图、首帧、尾帧或视频操作获取权威报价；不会开始生成。",
        parameters: Type.Object({
          boardId: Type.String({ minLength: 1 }),
          operation: Type.Object({
            kind: Type.Union([
              Type.Literal("character-image"),
              Type.Literal("first-frame"),
              Type.Literal("last-frame"),
              Type.Literal("video")
            ]),
            targetNodeId: Type.String({ minLength: 1 }),
            prompt: Type.String({ minLength: 1, maxLength: 8_000 }),
            providerId: Type.Optional(Type.String({ minLength: 1 })),
            model: Type.Optional(Type.String()),
            count: Type.Optional(Type.Integer({ minimum: 1, maximum: 4 })),
            size: Type.Optional(Type.String()),
            durationSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 60 })),
            resolution: Type.Optional(Type.String()),
            generateAudio: Type.Optional(Type.Boolean())
          })
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, rawArgs) => {
          const args = rawArgs as { boardId: string; operation: ComicMediaOperation };
          assertBoardScope(args.boardId, context.boardId);
          assertActive(context);
          const snapshot = await host.getSnapshot(context.boardId);
          assertMediaTarget(snapshot, args.operation);
          const operation = normalizeMediaOperation(args.operation);
          const quote = await host.issueMediaQuote!({ ...operation, boardId: context.boardId });
          mediaQuotes.set(quote.quoteId, { quote, operation });
          return resultContent({
            quoteId: quote.quoteId,
            expiresAt: quote.expiresAt,
            price: quote.priceSnapshot,
            operationFingerprint: quote.inputFingerprint
          });
        }
      },
      {
        name: "confirm_comic_media",
        label: "确认漫剧媒体费用",
        description: "使用 Iterlay 宿主确认指定报价。拒绝后不得继续生成。",
        parameters: Type.Object({
          quoteId: Type.String({ minLength: 1 })
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, rawArgs) => {
          const { quoteId } = rawArgs as { quoteId: string };
          const pending = mediaQuotes.get(quoteId);
          if (!pending || Date.parse(pending.quote.expiresAt) <= Date.now()) {
            throw toolError("QUOTE_EXPIRED", "报价不存在或已经过期，请重新报价。");
          }
          const approved = await host.confirmMedia!({
            quote: pending.quote,
            operation: pending.operation
          });
          if (!approved) return resultContent({ approved: false, quoteId });
          const confirmationId = crypto.randomUUID();
          mediaGrants.set(confirmationId, { quoteId, consumed: false });
          return resultContent({
            approved: true,
            confirmationId,
            quoteId,
            expiresAt: pending.quote.expiresAt
          });
        }
      },
      {
        name: "generate_comic_media",
        label: "生成漫剧媒体",
        description: "使用当前 Agent run 中已确认且未消费的 confirmationId 启动冻结的媒体操作。",
        parameters: Type.Object({
          confirmationId: Type.String({ minLength: 1 })
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, rawArgs) => {
          const { confirmationId } = rawArgs as { confirmationId: string };
          const grant = mediaGrants.get(confirmationId);
          if (!grant || grant.consumed) {
            throw toolError("AUTHORIZATION_REPLAYED", "确认不存在、已失效或已经使用。");
          }
          const pending = mediaQuotes.get(grant.quoteId);
          if (!pending || Date.parse(pending.quote.expiresAt) <= Date.now()) {
            throw toolError("QUOTE_EXPIRED", "报价已经过期，请重新报价和确认。");
          }
          grant.consumed = true;
          const task = await host.generateMedia!({
            quote: pending.quote,
            operation: pending.operation,
            confirmationId
          });
          return resultContent(task);
        }
      },
      {
        name: "get_comic_media_status",
        label: "查询漫剧媒体状态",
        description: "查询当前 Agent 启动的图片或视频任务状态。",
        parameters: Type.Object({
          taskIds: Type.Array(Type.String({ minLength: 1 }), {
            minItems: 1,
            maxItems: 20,
            uniqueItems: true
          })
        }),
        executionMode: "parallel",
        execute: async (_toolCallId, rawArgs) => {
          assertActive(context);
          const { taskIds } = rawArgs as { taskIds: string[] };
          return resultContent(await host.getMediaStatus!(taskIds));
        }
      }
    );
  }
  return tools;
}

function writeTool(
  name: typeof COMIC_DRAMA_WRITE_TOOL_NAMES[number],
  label: string,
  description: string,
  parameters: TSchema,
  host: ComicDramaAgentToolHost,
  context: ComicDramaAgentToolContext,
  apply: NonNullable<ComicDramaAgentToolHost["applyMutation"]>,
  buildPlan: (snapshot: ComicDramaBoardSnapshot, args: JsonObject) => Promise<BoardMutationPlan>
): AgentTool {
  return {
    name,
    label,
    description,
    parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, rawArgs) => {
      const args = isRecord(rawArgs) ? rawArgs : {};
      assertBoardScope(String(args.boardId ?? ""), context.boardId);
      assertActive(context);
      const expectedRevision = args.expectedRevision;
      if (!Number.isInteger(expectedRevision) || (expectedRevision as number) < 0) {
        throw toolError("COMIC_VALIDATION_FAILED", "expectedRevision 必须是非负整数。");
      }
      const idempotencyKey = typeof args.idempotencyKey === "string"
        ? args.idempotencyKey.trim()
        : "";
      if (idempotencyKey.length < 8) {
        throw toolError("COMIC_VALIDATION_FAILED", "idempotencyKey 长度不足。");
      }
      const snapshot = await applySnapshot(host, context, expectedRevision as number, buildPlan, args);
      const inputHash = canonicalInputHash(args);
      const result = await apply({
        toolName: name,
        idempotencyKey,
        inputHash,
        plan: snapshot
      });
      return resultContent(result);
    }
  };
}

async function applySnapshot(
  host: ComicDramaAgentToolHost,
  context: ComicDramaAgentToolContext,
  expectedRevision: number,
  buildPlan: (snapshot: ComicDramaBoardSnapshot, args: JsonObject) => Promise<BoardMutationPlan>,
  args: JsonObject
): Promise<BoardMutationPlan> {
  const snapshot = await host.getSnapshot(context.boardId);
  if (snapshot.revision !== expectedRevision) {
    throw toolError(
      "BOARD_REVISION_CONFLICT",
      `画板 revision 已从 ${expectedRevision} 变化为 ${snapshot.revision}，请重新读取状态。`
    );
  }
  return buildPlan(snapshot, args);
}

function segmentSchema(partial: boolean): TSchema {
  const schema = Type.Object({
    title: Type.String({ minLength: 1, maxLength: 120 }),
    purpose: Type.String({ minLength: 1, maxLength: 1_000 }),
    scene: Type.String({ minLength: 1, maxLength: 1_000 }),
    action: Type.String({ minLength: 1, maxLength: 2_000 }),
    dialogue: Type.String({ maxLength: 2_000 }),
    emotion: Type.String({ minLength: 1, maxLength: 500 }),
    visualDirection: Type.String({ maxLength: 1_000 }),
    cameraDirection: Type.String({ maxLength: 1_000 }),
    durationSeconds: Type.Integer({ minimum: 1, maximum: 60 })
  });
  return partial ? Type.Partial(schema) : schema;
}

function buildSettingPlan(
  snapshot: ComicDramaBoardSnapshot,
  patch: Partial<ComicSettingFields>
): BoardMutationPlan {
  const current = snapshot.nodes.find((node): node is ComicSettingNode => node.type === "comic-setting");
  const createdAt = new Date().toISOString();
  const versionId = crypto.randomUUID();
  const previous = current ? activeVersion(current).fields as ComicSettingFields : {
    title: "未命名漫剧",
    synopsis: "",
    genre: "",
    tone: "",
    worldRules: [],
    visualStyle: "",
    constraints: [],
    aspectRatio: "9:16",
    targetDurationSeconds: 30
  };
  const fields = {
    ...previous,
    ...cleanOptionalObject(patch)
  };
  if (!fields.title.trim() || !fields.synopsis.trim()) {
    throw toolError("COMIC_VALIDATION_FAILED", "漫剧设定必须包含有效剧名和故事梗概。");
  }
  const node: ComicSettingNode = current ? {
    ...current,
    status: "saved",
    activeVersionId: versionId,
    versions: [...current.versions, { versionId, createdAt, fields }]
  } : {
    id: crypto.randomUUID(),
    type: "comic-setting",
    x: 80,
    y: 80,
    status: "saved",
    activeVersionId: versionId,
    versions: [{ versionId, createdAt, fields }]
  };
  return mutationPlan(
    snapshot,
    current ? [] : [node],
    [],
    [],
    current ? [node] : [],
    current ? "保存漫剧设定新版本" : "创建漫剧设定"
  );
}

function buildCharactersPlan(
  snapshot: ComicDramaBoardSnapshot,
  characters: CharacterInput[]
): BoardMutationPlan {
  const setting = requireReadySetting(snapshot);
  const existingNames = new Set(snapshot.nodes
    .filter((node): node is ComicCharacterNode => node.type === "comic-character")
    .map((node) => node.name.trim().toLocaleLowerCase()));
  const incomingNames = new Set<string>();
  const createdAt = new Date().toISOString();
  const nodes = characters.map((input, index): ComicCharacterNode => {
    const normalizedName = input.name.trim().toLocaleLowerCase();
    if (existingNames.has(normalizedName) || incomingNames.has(normalizedName)) {
      throw toolError("COMIC_VALIDATION_FAILED", `角色名称重复：${input.name}`);
    }
    incomingNames.add(normalizedName);
    const versionId = crypto.randomUUID();
    return {
      id: crypto.randomUUID(),
      type: "comic-character",
      x: setting.x + 340,
      y: setting.y + index * 300,
      name: input.name.trim(),
      status: "saved",
      activeVersionId: versionId,
      versions: [{
        versionId,
        createdAt,
        fields: characterFields(input)
      }]
    };
  });
  const connections = nodes.map((node) => referenceConnection(setting, node, "由此设定派生"));
  return mutationPlan(snapshot, nodes, connections, [], [], `创建 ${nodes.length} 张角色卡`);
}

function buildCharacterUpdatePlan(
  snapshot: ComicDramaBoardSnapshot,
  nodeId: string,
  input: CharacterUpdateInput
): BoardMutationPlan {
  const current = snapshot.nodes.find((node): node is ComicCharacterNode => (
    node.type === "comic-character" && node.id === nodeId
  ));
  if (!current) throw toolError("COMIC_NODE_NOT_FOUND", "指定角色卡不存在。");
  const versionId = crypto.randomUUID();
  const updated: ComicCharacterNode = {
    ...current,
    name: input.name?.trim() || current.name,
    status: "saved",
    activeVersionId: versionId,
    versions: [...current.versions, {
      versionId,
      createdAt: new Date().toISOString(),
      fields: characterFields(input)
    }]
  };
  return mutationPlan(snapshot, [], [], [], [updated], `更新角色「${updated.name}」`);
}

function buildSegmentPlan(
  snapshot: ComicDramaBoardSnapshot,
  input: SegmentInput
): BoardMutationPlan {
  const setting = requireReadySetting(snapshot);
  const characters = snapshot.nodes.filter((node): node is ComicCharacterNode => node.type === "comic-character");
  if (characters.length === 0) {
    throw toolError("COMIC_STAGE_BLOCKED", "创建片段前至少需要一张角色卡。");
  }
  const order = snapshot.nodes.filter((node) => node.type === "comic-segment-script").length + 1;
  const versionId = crypto.randomUUID();
  const node: ComicSegmentScriptNode = {
    id: crypto.randomUUID(),
    type: "comic-segment-script",
    x: 760,
    y: 120 + (order - 1) * 340,
    order,
    title: input.title.trim(),
    status: "saved",
    activeVersionId: versionId,
    versions: [{
      versionId,
      createdAt: new Date().toISOString(),
      fields: segmentFields(input)
    }]
  };
  const connections = [setting, ...characters.slice(0, 8)]
    .map((source) => referenceConnection(source, node, "片段上下文"));
  return mutationPlan(snapshot, [node], connections, [], [], `创建片段 ${String(order).padStart(2, "0")}`);
}

function buildSegmentUpdatePlan(
  snapshot: ComicDramaBoardSnapshot,
  nodeId: string,
  patch: Partial<SegmentInput>
): BoardMutationPlan {
  const current = snapshot.nodes.find((node): node is ComicSegmentScriptNode => (
    node.type === "comic-segment-script" && node.id === nodeId
  ));
  if (!current) throw toolError("COMIC_NODE_NOT_FOUND", "指定片段脚本不存在。");
  const previous = activeVersion(current).fields as ComicSegmentScriptFields;
  const fields = { ...previous, ...cleanOptionalObject(patch) };
  const versionId = crypto.randomUUID();
  const updated: ComicSegmentScriptNode = {
    ...current,
    title: patch.title?.trim() || current.title,
    status: "saved",
    activeVersionId: versionId,
    versions: [...current.versions, {
      versionId,
      createdAt: new Date().toISOString(),
      fields: segmentFields({ title: patch.title ?? current.title, ...fields })
    }]
  };
  return mutationPlan(snapshot, [], [], [], [updated], `更新片段 ${String(current.order).padStart(2, "0")}`);
}

function buildMediaChainPlan(
  snapshot: ComicDramaBoardSnapshot,
  segmentNodeId: string
): BoardMutationPlan {
  const segment = snapshot.nodes.find((node): node is ComicSegmentScriptNode => (
    node.type === "comic-segment-script" && node.id === segmentNodeId
  ));
  if (!segment) throw toolError("COMIC_NODE_NOT_FOUND", "指定片段脚本不存在。");
  if (snapshot.groups.some((group) => group.nodeIds.includes(segment.id) && group.nodeIds.length > 1)) {
    throw toolError("COMIC_MEDIA_CHAIN_EXISTS", "当前片段已经存在媒体链。");
  }
  const firstId = crypto.randomUUID();
  const lastId = crypto.randomUUID();
  const videoId = crypto.randomUUID();
  const baseX = segment.x + 360;
  const duration = (activeVersion(segment).fields as ComicSegmentScriptFields).durationSeconds;
  const nodes: BoardMutationPlan["additions"]["nodes"] = [
    {
      id: firstId,
      type: "generation",
      x: baseX,
      y: segment.y,
      title: "首帧生成",
      prompt: "",
      model: "",
      size: "1024x1792",
      count: 1,
      status: "idle",
      comicFrameRole: "first-frame"
    },
    {
      id: lastId,
      type: "generation",
      x: baseX + 380,
      y: segment.y,
      title: "尾帧生成",
      prompt: "",
      model: "",
      size: "1024x1792",
      count: 1,
      status: "idle",
      comicFrameRole: "last-frame"
    },
    {
      id: videoId,
      type: "video-generation",
      x: baseX + 760,
      y: segment.y,
      title: "片段视频",
      prompt: "",
      model: "",
      duration,
      aspectRatio: "9:16",
      resolution: "720p",
      generateAudio: false,
      status: "draft"
    }
  ];
  const connections: BoardConnection[] = [
    ...[firstId, lastId, videoId].map((target): BoardConnection => ({
      id: crypto.randomUUID(),
      source: segment.id,
      target,
      sourceHandle: "source-right",
      targetHandle: target === videoId ? "target-reference" : "target-left",
      kind: "reference",
      versionBinding: { mode: "follow-active" },
      label: "片段上下文"
    })),
    connection(firstId, lastId, "target-left", "已采用首帧"),
    connection(firstId, videoId, "target-start-frame", "首帧"),
    connection(lastId, videoId, "target-end-frame", "尾帧")
  ];
  return mutationPlan(snapshot, nodes, connections, [{
    id: crypto.randomUUID(),
    title: `片段 ${String(segment.order).padStart(2, "0")} 制作`,
    nodeIds: [segment.id, firstId, lastId, videoId],
    x: segment.x - 20,
    y: segment.y - 36,
    width: 1_500,
    height: 700
  }], [], `创建片段 ${segment.order} 的媒体链`);
}

function mutationPlan(
  snapshot: ComicDramaBoardSnapshot,
  nodes: BoardMutationPlan["additions"]["nodes"],
  connections: BoardConnection[],
  groups: BoardMutationPlan["additions"]["groups"],
  updates: ComicDramaBoardNode[],
  title: string
): BoardMutationPlan {
  return {
    planId: crypto.randomUUID(),
    boardId: snapshot.boardId,
    baseRevision: snapshot.revision,
    preview: {
      title,
      additions: {
        nodes: nodes.length,
        connections: connections.length,
        groups: groups.length
      },
      ...(updates.length ? { updates: { nodes: updates.length } } : {}),
      impact: "由漫剧 Agent 通过领域工具原子执行，可从操作回执撤销。",
      cost: "本操作不调用图片或视频 Provider。"
    },
    additions: { nodes, connections, groups },
    ...(updates.length ? { updates: { nodes: updates } } : {})
  };
}

function requireReadySetting(snapshot: ComicDramaBoardSnapshot): ComicSettingNode {
  const setting = snapshot.nodes.find((node): node is ComicSettingNode => node.type === "comic-setting");
  if (!setting || nodeBlockers(setting).length > 0) {
    throw toolError("COMIC_STAGE_BLOCKED", "请先完成并保存漫剧设定。");
  }
  return setting;
}

function characterFields(input: CharacterInput | CharacterUpdateInput): ComicCharacterFields {
  return {
    role: input.role.trim(),
    profile: input.profile.trim(),
    appearanceAnchors: [...new Set(input.appearanceAnchors.map((value) => value.trim()).filter(Boolean))],
    visualPrompt: input.visualPrompt.trim()
  };
}

function segmentFields(input: SegmentInput): ComicSegmentScriptFields {
  return {
    purpose: input.purpose.trim(),
    scene: input.scene.trim(),
    action: input.action.trim(),
    dialogue: input.dialogue.trim(),
    emotion: input.emotion.trim(),
    visualDirection: input.visualDirection.trim(),
    cameraDirection: input.cameraDirection.trim(),
    durationSeconds: input.durationSeconds
  };
}

function referenceConnection(
  source: ComicDramaBoardNode,
  target: ComicDramaBoardNode,
  label: string
): BoardConnection {
  return {
    id: crypto.randomUUID(),
    source: source.id,
    target: target.id,
    sourceHandle: "source-right",
    targetHandle: "target-left",
    kind: "reference",
    versionBinding: { mode: "pinned", versionId: source.activeVersionId },
    label,
    locked: true
  };
}

function connection(source: string, target: string, targetHandle: string, label: string): BoardConnection {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    sourceHandle: "source-right",
    targetHandle,
    kind: "reference",
    label
  };
}

function canonicalInputHash(args: JsonObject): string {
  const semantic = Object.fromEntries(
    Object.entries(args).filter(([key]) => key !== "idempotencyKey")
  );
  return createHash("sha256").update(stableJson(semantic)).digest("hex");
}

function normalizeMediaOperation(operation: ComicMediaOperation): ComicMediaOperation {
  return {
    kind: operation.kind,
    targetNodeId: operation.targetNodeId.trim(),
    prompt: operation.prompt.trim(),
    ...(operation.providerId?.trim() ? { providerId: operation.providerId.trim() } : {}),
    ...(operation.model?.trim() ? { model: operation.model.trim() } : {}),
    ...(operation.kind === "video"
      ? {
          durationSeconds: Math.max(1, Math.min(60, Math.trunc(operation.durationSeconds ?? 5))),
          resolution: operation.resolution?.trim() || "720p",
          generateAudio: operation.generateAudio === true
        }
      : {
          count: Math.max(1, Math.min(4, Math.trunc(operation.count ?? 1))),
          size: operation.size?.trim() || "1024x1792"
        })
  };
}

function assertMediaTarget(
  snapshot: ComicDramaBoardSnapshot,
  operation: ComicMediaOperation
): void {
  const node = snapshot.nodes.find((candidate) => candidate.id === operation.targetNodeId);
  if (!node || node.type === "video-sequence-entry") {
    throw toolError("COMIC_NODE_NOT_FOUND", "媒体操作目标不在当前漫剧画板中。");
  }
  if (operation.kind === "character-image" && node.type !== "comic-character") {
    throw toolError("COMIC_VALIDATION_FAILED", "角色图片只能绑定角色卡。");
  }
  if (operation.kind !== "character-image" && node.type !== "comic-segment-script") {
    throw toolError("COMIC_VALIDATION_FAILED", "首帧、尾帧和视频只能绑定片段脚本。");
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function cleanOptionalObject<T extends JsonObject>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function comicDramaState(
  snapshot: ComicDramaBoardSnapshot,
  selectedNodeIds: readonly string[]
): JsonObject {
  const setting = snapshot.nodes.find((node): node is ComicSettingNode => node.type === "comic-setting");
  const characters = snapshot.nodes.filter((node): node is ComicCharacterNode => node.type === "comic-character");
  const segments = snapshot.nodes.filter((node): node is ComicSegmentScriptNode => node.type === "comic-segment-script");
  const selected = snapshot.nodes.filter((node) => selectedNodeIds.includes(node.id));
  const blockers = [
    ...(setting ? nodeBlockers(setting) : [{ code: "SETTING_MISSING", message: "尚未创建漫剧设定。" }]),
    ...characters.flatMap(nodeBlockers),
    ...segments.flatMap(nodeBlockers)
  ];
  const stage = !setting || nodeBlockers(setting).length > 0
    ? "setting"
    : characters.length === 0 || characters.some((character) => nodeBlockers(character).length > 0)
      ? "character-design"
      : characters.some((character) => character.status !== "adopted")
        ? "character-generation"
        : segments.length === 0
          ? "segments"
          : "production";
  return {
    boardId: snapshot.boardId,
    revision: snapshot.revision,
    stage,
    selectedNodeIds: selected.map((node) => node.id),
    setting,
    characters,
    segments,
    connections: snapshot.connections,
    groups: snapshot.groups,
    blockers,
    recommendedActions: recommendedActions(stage, selected)
  };
}

function recommendedActions(stage: string, selected: ComicDramaBoardSnapshot["nodes"]): string[] {
  if (stage === "setting") return ["补充并保存故事设定"];
  if (stage === "character-design") return ["创建或完善角色卡"];
  if (stage === "character-generation") return ["检查角色卡并生成、采用角色形象"];
  if (stage === "segments") return ["创建第一个片段脚本"];
  return selected.some((node) => node.type === "comic-segment-script")
    ? ["检查片段连续性", "创建当前片段媒体链"]
    : ["选择或创建片段脚本"];
}

function nodeBlockers(node: ComicDramaBoardNode): Array<{ code: string; message: string; nodeId: string }> {
  const version = activeVersion(node);
  if (node.type === "comic-setting") {
    const fields = version.fields as ComicSettingNode["versions"][number]["fields"];
    return fields.title.trim() && fields.title !== "未命名漫剧" && fields.synopsis.trim()
      ? []
      : [{ code: "SETTING_INCOMPLETE", message: "设定缺少有效剧名或故事梗概。", nodeId: node.id }];
  }
  if (node.type === "comic-character") {
    const fields = version.fields as ComicCharacterNode["versions"][number]["fields"];
    return fields.role.trim()
      && fields.profile.trim()
      && fields.visualPrompt.trim()
      && fields.appearanceAnchors.length >= 2
      ? []
      : [{ code: "CHARACTER_INCOMPLETE", message: `角色「${node.name}」缺少完整设定或稳定外观锚点。`, nodeId: node.id }];
  }
  const fields = version.fields as ComicSegmentScriptNode["versions"][number]["fields"];
  return fields.purpose.trim() && fields.scene.trim() && fields.action.trim() && fields.durationSeconds > 0
    ? []
    : [{ code: "SEGMENT_INCOMPLETE", message: `片段 ${node.order} 缺少目的、场景、动作或有效时长。`, nodeId: node.id }];
}

function validateContinuity(snapshot: ComicDramaBoardSnapshot, segmentNodeId?: string): JsonObject {
  const issues: Array<{ code: string; message: string; nodeId?: string }> = [];
  const characters = snapshot.nodes.filter((node): node is ComicCharacterNode => node.type === "comic-character");
  for (const character of characters) issues.push(...nodeBlockers(character));
  const segments = snapshot.nodes
    .filter((node): node is ComicSegmentScriptNode => node.type === "comic-segment-script")
    .filter((node) => !segmentNodeId || node.id === segmentNodeId);
  if (segmentNodeId && segments.length === 0) {
    throw toolError("COMIC_NODE_NOT_FOUND", "当前漫剧画板中不存在指定片段。");
  }
  for (const segment of segments) {
    issues.push(...nodeBlockers(segment));
    const fields = activeVersion(segment).fields as ComicSegmentScriptNode["versions"][number]["fields"];
    if (fields.durationSeconds <= 3 && fields.dialogue.trim().length > 40) {
      issues.push({
        code: "DIALOGUE_TOO_LONG",
        message: `片段 ${segment.order} 的对白相对 ${fields.durationSeconds} 秒时长过长。`,
        nodeId: segment.id
      });
    }
    const incoming = snapshot.connections.filter((connection) => connection.target === segment.id);
    if (incoming.length === 0) {
      issues.push({
        code: "SEGMENT_CONTEXT_MISSING",
        message: `片段 ${segment.order} 尚未连接设定或角色上下文。`,
        nodeId: segment.id
      });
    }
  }
  return {
    boardId: snapshot.boardId,
    revision: snapshot.revision,
    segmentNodeId,
    valid: issues.length === 0,
    issues
  };
}

async function requireComicSnapshot(
  host: ComicDramaAgentToolHost,
  boardId: string
): Promise<ComicDramaBoardSnapshot> {
  try {
    return await host.getSnapshot(boardId);
  } catch (error) {
    throw toolError(
      "COMIC_BOARD_UNAVAILABLE",
      error instanceof Error ? error.message : "无法读取当前漫剧画板。"
    );
  }
}

function activeVersion(node: ComicDramaBoardNode): ComicDramaBoardNode["versions"][number] {
  return node.versions.find((version) => version.versionId === node.activeVersionId) ?? node.versions[0];
}

function assertBoardScope(requestedBoardId: string, boundBoardId: string): void {
  if (requestedBoardId !== boundBoardId) {
    throw toolError("COMIC_BOARD_SCOPE_VIOLATION", `漫剧 Agent 只能操作当前画板 ${boundBoardId}。`);
  }
}

function assertActive(context: ComicDramaAgentToolContext): void {
  if (context.signal?.aborted) throw toolError("REQUEST_CANCELLED", "漫剧 Agent 请求已停止。");
}

function resultContent(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
  details: JsonObject;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    details: isRecord(value) ? value : {}
  };
}

function toolError(code: string, message: string): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
