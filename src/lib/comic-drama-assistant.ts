import type {
  BoardConnection,
  BoardMutationPlan,
  ComicCharacterDraft,
  ComicCharacterNode,
  ComicDramaBoardNode,
  ComicDramaBoardSnapshot,
  ComicSegmentScriptNode,
  ComicSettingNode
} from "@shared/types";

const now = (): string => new Date().toISOString();
const id = (): string => crypto.randomUUID();

export interface ComicDramaAssistantGuide {
  stage: "setting" | "character-design" | "character-generation" | "segments" | "production";
  message: string;
  suggestions: string[];
  placeholder: string;
}

export type ComicDramaAgentOperation =
  | "update-setting"
  | "propose-characters"
  | "update-character"
  | "create-segment"
  | "update-segment"
  | "create-media-chain";

export function comicDramaAssistantGuide(
  snapshot: ComicDramaBoardSnapshot,
  selectedNodeIds: readonly string[]
): ComicDramaAssistantGuide {
  const setting = snapshot.nodes.find((node): node is ComicSettingNode => node.type === "comic-setting");
  const characters = snapshot.nodes.filter((node) => node.type === "comic-character");
  const segments = snapshot.nodes.filter((node) => node.type === "comic-segment-script");
  const selectedSegment = snapshot.nodes.some((node) => node.type === "comic-segment-script" && selectedNodeIds.includes(node.id));

  if (!setting || !isComicSettingReady(setting)) {
    return {
      stage: "setting",
      message: "你好，我是你的漫剧助手。我们先聊聊你想做的故事，我会边听边帮你整理成可以直接制作的设定。\n\n你可以从任何一个点开始：故事、主角，或者一种感觉都可以。不确定也没关系，我可以先给你几个方向。\n\n比如：\n> 一个失忆的女孩在雨夜寻找哥哥，悬疑、电影感。\n\n只有保存设定后，我再陪你进入角色设计。",
      suggestions: ["我有一个故事想法", "先给我 3 个漫剧方向"],
      placeholder: "补充故事简介、世界观、基调或视觉风格…"
    };
  }
  if (characters.length === 0) {
    return {
      stage: "character-design",
      message: "设定已经保存。下一步可以规划角色阵容；我会预填角色定位、人物设定、稳定外观锚点和视觉提示词，确认后只添加角色卡。",
      suggestions: ["规划角色阵容", "我想先调整故事设定"],
      placeholder: "继续补充设定，或输入“规划角色阵容”…"
    };
  }
  const incompleteCharacters = characters.filter((character) => !isComicCharacterDetailReady(character));
  if (incompleteCharacters.length > 0) {
    return {
      stage: "character-design",
      message: `${incompleteCharacters.length} 张角色卡还缺少人物设定、稳定外观锚点或视觉提示词。请先选中角色，让我补齐完整设定；细节完整后才进入形象生成。`,
      suggestions: ["帮我检查这个角色", "继续完善角色设定"],
      placeholder: "描述要补充的角色背景、性格、动机或外观细节…"
    };
  }
  const pendingCharacterCount = characters.filter((character) => character.status !== "adopted").length;
  if (pendingCharacterCount > 0) {
    return {
      stage: "character-generation",
      message: `${characters.length} 张角色卡的设定细节已经就绪。下一步请先在画板中检查角色卡，然后逐个点击“生成形象”并采用满意版本；完成主要角色后再创建片段脚本。`,
      suggestions: ["检查所有角色", "我想先调整角色设定"],
      placeholder: "可以继续调整某个角色，或在角色卡上生成形象…"
    };
  }
  if (segments.length === 0) {
    return {
      stage: "segments",
      message: `设定和 ${characters.length} 个角色已就绪。下一步可以创建第一个片段脚本；每次只预览一个片段，不会自动生成全剧或调用媒体模型。`,
      suggestions: ["创建第一个片段"],
      placeholder: "描述第一个片段的剧情目的、场景和动作…"
    };
  }
  return {
    stage: "production",
    message: selectedSegment
      ? "当前已选中片段脚本。可以继续修改片段，或明确创建首帧、尾帧和视频节点；应用节点计划本身不会调用媒体模型。"
      : `当前已有 ${segments.length} 个片段。请选择一个片段继续制作，或描述要新增的下一个片段。`,
    suggestions: selectedSegment ? ["创建当前片段的首尾帧与视频节点"] : [],
    placeholder: selectedSegment ? "调整当前片段，或创建首尾帧与视频节点…" : "描述要新增或调整的漫剧内容…"
  };
}

export function isComicSettingReady(setting: ComicSettingNode): boolean {
  const fields = activeSettingVersion(setting).fields;
  return setting.status === "saved"
    && Boolean(fields.title.trim() && fields.title !== "未命名漫剧")
    && Boolean(fields.synopsis.trim());
}

export function comicDramaAssistantContext(
  snapshot: ComicDramaBoardSnapshot,
  selectedNodeIds: readonly string[]
): string {
  const selected = snapshot.nodes.filter((node) => selectedNodeIds.includes(node.id));
  if (selected.length === 0) {
    const settings = snapshot.nodes.filter((node) => node.type === "comic-setting").length;
    const characters = snapshot.nodes.filter((node) => node.type === "comic-character").length;
    const segments = snapshot.nodes.filter((node) => node.type === "comic-segment-script").length;
    return `当前画板 · ${settings} 个设定 · ${characters} 个角色 · ${segments} 个片段`;
  }
  return selected.map((node) => {
    if (node.type === "comic-setting") return `漫剧设定 · ${versionLabel(node)}`;
    if (node.type === "comic-character") return `角色：${node.name} · ${versionLabel(node)}`;
    if (node.type === "comic-segment-script") return `片段 ${String(node.order).padStart(2, "0")} · ${versionLabel(node)}`;
    return `成片序列 · ${node.name}`;
  }).join(" / ");
}

export function createComicDramaMutationPlan(input: {
  snapshot: ComicDramaBoardSnapshot;
  selectedNodeIds: readonly string[];
  instruction: string;
  operation?: ComicDramaAgentOperation;
  characterDrafts?: Array<Pick<ComicCharacterDraft, "name" | "role" | "profile" | "appearanceAnchors" | "visualPrompt" | "visualDescription" | "required">>;
}): BoardMutationPlan {
  const { snapshot } = input;
  const selected = snapshot.nodes.filter((node): node is ComicDramaBoardNode => (
    input.selectedNodeIds.includes(node.id) && node.type !== "video-sequence-entry"
  ));
  const setting = snapshot.nodes.find((node): node is ComicSettingNode => node.type === "comic-setting");
  const characters = snapshot.nodes.filter((node): node is ComicCharacterNode => node.type === "comic-character");
  const selectedSetting = selected.find((node): node is ComicSettingNode => node.type === "comic-setting");
  const selectedCharacters = selected.filter((node): node is ComicCharacterNode => node.type === "comic-character");
  const segment = selected.find((node): node is ComicSegmentScriptNode => node.type === "comic-segment-script");

  if (input.operation) {
    if (input.operation === "update-setting") {
      if (!setting) return initializationPlan(snapshot, input.instruction);
      return settingUpdatePlan(snapshot, setting, input.instruction);
    }
    if (input.operation === "propose-characters") {
      if (!setting || !isComicSettingReady(setting)) throw new Error("请先完成并保存漫剧设定。");
      if (!input.characterDrafts?.length) throw new Error("漫剧 Agent 没有返回有效的结构化角色阵容，请重新规划。");
      return characterPlan(snapshot, setting, input.instruction, input.characterDrafts);
    }
    if (input.operation === "update-character") {
      const target = selectedCharacters[0] ?? characters[0];
      if (!target) throw new Error("请先选择要调整的角色卡。");
      if (!input.characterDrafts?.[0]) throw new Error("漫剧 Agent 没有返回完整的角色设定，请重新完善。");
      return characterUpdatePlan(snapshot, target, input.instruction, input.characterDrafts[0]);
    }
    if (input.operation === "create-segment") {
      if (!setting || characters.length === 0) throw new Error("创建片段前需要已保存的设定和至少一个角色。");
      return segmentPlan(snapshot, setting, selectedCharacters.length ? selectedCharacters : characters.slice(0, 8), input.instruction);
    }
    if (input.operation === "update-segment") {
      if (!segment) throw new Error("请先选择要调整的片段脚本卡。");
      return segmentUpdatePlan(snapshot, segment, input.instruction);
    }
    if (!segment) throw new Error("请先选择要创建媒体链的片段脚本卡。");
    return mediaIntentPlan(snapshot, segment);
  }

  if (segment) {
    return isMediaPlanningIntent(input.instruction)
      ? mediaIntentPlan(snapshot, segment)
      : segmentUpdatePlan(snapshot, segment, input.instruction);
  }
  if (selectedCharacters.length > 0) {
    return isSegmentPlanningIntent(input.instruction)
      ? segmentPlan(snapshot, setting, selectedCharacters, input.instruction)
      : characterUpdatePlan(snapshot, selectedCharacters[0], input.instruction);
  }
  if (selectedSetting) {
    if (isComicSettingReady(selectedSetting) && isCharacterPlanningIntent(input.instruction)) {
      return characterPlan(snapshot, selectedSetting, input.instruction);
    }
    if (characters.length > 0 && isSegmentPlanningIntent(input.instruction)) {
      return segmentPlan(snapshot, selectedSetting, characters.slice(0, 8), input.instruction);
    }
    return settingUpdatePlan(snapshot, selectedSetting, input.instruction);
  }
  if (setting && isComicSettingReady(setting) && isCharacterPlanningIntent(input.instruction)) {
    return characterPlan(snapshot, setting, input.instruction);
  }
  if (setting && characters.length > 0) {
    return segmentPlan(snapshot, setting, characters.slice(0, 8), input.instruction);
  }
  if (setting) return settingUpdatePlan(snapshot, setting, input.instruction);
  return initializationPlan(snapshot, input.instruction);
}

function initializationPlan(snapshot: ComicDramaBoardSnapshot, instruction: string): BoardMutationPlan {
  const createdAt = now();
  const settingId = id();
  const settingVersionId = id();
  const title = compactTitle(instruction) || "未命名漫剧";
  const setting: ComicSettingNode = {
    id: settingId, type: "comic-setting", x: 80, y: 80, status: "draft", activeVersionId: settingVersionId,
    versions: [{ versionId: settingVersionId, createdAt, fields: {
      title, synopsis: instruction.trim(), genre: "剧情", tone: "待完善", worldRules: [], visualStyle: "待完善",
      constraints: [], aspectRatio: "9:16", targetDurationSeconds: 30
    } }]
  };
  return plan(snapshot, "添加 1 张漫剧设定卡", [setting], [], [], "不会创建角色、片段或媒体生成节点", { kind: "create-setting" });
}

function characterPlan(
  snapshot: ComicDramaBoardSnapshot,
  setting: ComicSettingNode,
  instruction: string,
  structuredDrafts?: Array<Pick<ComicCharacterDraft, "name" | "role" | "profile" | "appearanceAnchors" | "visualPrompt" | "visualDescription" | "required">>
): BoardMutationPlan {
  const names = structuredDrafts
    ? []
    : instruction
        .replace(/(?:请|帮我|规划|创建|生成|设计|一个|一套|角色|人物|阵容|方案)/gu, " ")
        .match(/[\p{Script=Han}A-Za-z0-9]{1,20}/gu)?.slice(0, 6) ?? [];
  const characterNames = names.length >= 2 ? names : ["主角", "搭档", "对手"];
  const settingFields = activeSettingVersion(setting).fields;
  const drafts: ComicCharacterDraft[] = structuredDrafts
    ? structuredDrafts.map((draft) => ({
        id: id(),
        ...draft,
        imageCount: 1,
        estimatedCost: 1
      }))
    : characterNames.map((name, index) => ({
        id: id(), name, role: index === 0 ? "推动主线的核心角色" : "与主角形成关系和冲突",
        profile: index === 0 ? "承担故事主要目标并推动剧情发展。" : "围绕主角目标形成协作、阻力或情感关系。",
        appearanceAnchors: index === 0 ? ["青年", "深色短发", "清晰面部轮廓", "固定深色外套"] : ["青年", "稳定发型", "明确脸部特征", "固定标志服装"],
        visualPrompt: `${name}，${index === 0 ? "核心主角" : "重要关系角色"}，延续《${settingFields.title}》的${settingFields.visualStyle}视觉风格，角色设定图，正面清晰，全身，外观一致`,
        visualDescription: "延续《" + settingFields.title + "》的" + settingFields.visualStyle + "视觉风格",
        required: index < 2, imageCount: 1, estimatedCost: 1
      }));
  const result = plan(snapshot, "角色阵容方案 · " + drafts.length + " 人", [], [], [], "默认选择必需角色；编辑选择后才进入付费确认", { kind: "propose-characters", characterDrafts: drafts });
  result.preview.cost = "预计每个角色 1 张图片；所选角色将在确认页逐项报价，当前提交数为 0";
  return result;
}

function settingUpdatePlan(
  snapshot: ComicDramaBoardSnapshot,
  setting: ComicSettingNode,
  instruction: string
): BoardMutationPlan {
  const current = activeSettingVersion(setting).fields;
  const normalizedInstruction = instruction.trim();
  const nextFields = {
    ...current,
    title: current.title && current.title !== "未命名漫剧"
      ? current.title
      : compactTitle(normalizedInstruction).slice(0, 20) || "未命名漫剧",
    synopsis: mergeSettingText(current.synopsis, normalizedInstruction),
    genre: inferSettingValue(normalizedInstruction, ["悬疑", "爱情", "喜剧", "科幻", "奇幻", "剧情", "古风", "校园"], current.genre),
    tone: inferSettingValue(normalizedInstruction, ["克制", "温暖", "轻松", "紧张", "荒诞", "治愈", "热血", "黑暗"], current.tone),
    visualStyle: inferVisualStyle(normalizedInstruction, current.visualStyle)
  };
  const nextVersionId = id();
  const updated: ComicSettingNode = {
    ...setting,
    status: "saved",
    activeVersionId: nextVersionId,
    versions: [...setting.versions, { versionId: nextVersionId, createdAt: now(), fields: nextFields }]
  };
  return {
    planId: id(),
    boardId: snapshot.boardId,
    baseRevision: snapshot.revision,
    action: { kind: "update-setting", settingNodeId: setting.id },
    preview: {
      title: "保存漫剧设定新版本",
      additions: { nodes: 0, connections: 0, groups: 0 },
      updates: { nodes: 1 },
      details: [
        { label: "剧名", value: nextFields.title },
        { label: "梗概", value: nextFields.synopsis },
        { label: "题材与基调", value: [nextFields.genre, nextFields.tone].filter(Boolean).join(" · ") || "待继续补充" },
        { label: "视觉风格", value: nextFields.visualStyle || "待继续补充" },
        { label: "规格", value: `${nextFields.aspectRatio} · ${nextFields.targetDurationSeconds} 秒` }
      ],
      impact: "更新 1 张设定卡；不会创建角色。已有下游节点不会被覆盖或自动重跑，后续生成前仍需确认输入版本。",
      cost: "仅保存文本设定，不调用图片或视频模型"
    },
    additions: { nodes: [], connections: [], groups: [] },
    updates: { nodes: [updated] }
  };
}

function characterUpdatePlan(
  snapshot: ComicDramaBoardSnapshot,
  character: ComicCharacterNode,
  instruction: string,
  structuredDraft?: Pick<ComicCharacterDraft, "role" | "profile" | "appearanceAnchors" | "visualPrompt">
): BoardMutationPlan {
  const current = activeCharacterVersion(character).fields;
  const nextFields = structuredDraft ? {
    role: structuredDraft.role,
    profile: structuredDraft.profile,
    appearanceAnchors: structuredDraft.appearanceAnchors,
    visualPrompt: structuredDraft.visualPrompt
  } : {
    ...current,
    profile: mergeSettingText(current.profile, instruction.trim())
  };
  const nextVersionId = id();
  const updated: ComicCharacterNode = {
    ...character,
    status: "saved",
    activeVersionId: nextVersionId,
    versions: [...character.versions, {
      versionId: nextVersionId,
      createdAt: now(),
      fields: nextFields
    }]
  };
  return updatePlan(snapshot, updated, {
    kind: "update-character",
    characterNodeId: character.id
  }, `保存角色「${character.name}」新版本`, [
    { label: "角色定位", value: current.role || "待继续补充" },
    { label: "人物设定", value: activeCharacterVersion(updated).fields.profile || "待继续补充" }
  ], "更新 1 张角色卡；不会创建片段或调用媒体模型");
}

function segmentUpdatePlan(
  snapshot: ComicDramaBoardSnapshot,
  segment: ComicSegmentScriptNode,
  instruction: string
): BoardMutationPlan {
  const current = activeSegmentVersion(segment).fields;
  const nextVersionId = id();
  const updated: ComicSegmentScriptNode = {
    ...segment,
    status: "saved",
    activeVersionId: nextVersionId,
    versions: [...segment.versions, {
      versionId: nextVersionId,
      createdAt: now(),
      fields: {
        ...current,
        action: mergeSettingText(current.action, instruction.trim())
      }
    }]
  };
  const nextFields = activeSegmentVersion(updated).fields;
  return updatePlan(snapshot, updated, {
    kind: "update-segment",
    segmentNodeId: segment.id
  }, `保存片段 ${String(segment.order).padStart(2, "0")} 新版本`, [
    { label: "剧情目的", value: nextFields.purpose || "待继续补充" },
    { label: "动作与事件", value: nextFields.action || "待继续补充" },
    { label: "对白", value: nextFields.dialogue || "待继续补充" },
    { label: "规格", value: `${nextFields.durationSeconds} 秒` }
  ], "更新 1 张片段脚本卡；不会创建首尾帧、视频节点或调用媒体模型");
}

function updatePlan(
  snapshot: ComicDramaBoardSnapshot,
  updated: ComicDramaBoardNode,
  action: NonNullable<BoardMutationPlan["action"]>,
  title: string,
  details: Array<{ label: string; value: string }>,
  impact: string
): BoardMutationPlan {
  return {
    planId: id(),
    boardId: snapshot.boardId,
    baseRevision: snapshot.revision,
    action,
    preview: {
      title,
      additions: { nodes: 0, connections: 0, groups: 0 },
      updates: { nodes: 1 },
      details,
      impact,
      cost: "仅保存文本版本，不调用图片或视频模型"
    },
    additions: { nodes: [], connections: [], groups: [] },
    updates: { nodes: [updated] }
  };
}

export function createComicCharactersMutationPlan(input: { snapshot: ComicDramaBoardSnapshot; settingNodeId: string; drafts: ComicCharacterDraft[]; characterDraftIds: string[] }): BoardMutationPlan {
  const setting = input.snapshot.nodes.find((node): node is ComicSettingNode => node.type === "comic-setting" && node.id === input.settingNodeId);
  if (!setting) throw new Error("漫剧设定卡不存在。");
  const selected = input.drafts.filter((draft) => input.characterDraftIds.includes(draft.id));
  if (!selected.length) throw new Error("请至少选择一个角色。");
  const createdAt = now();
  const nodes = selected.map((draft, index): ComicCharacterNode => {
    const versionId = id();
    return { id: id(), type: "comic-character", x: setting.x + 340, y: setting.y + index * 300, name: draft.name, status: "draft", activeVersionId: versionId,
      versions: [{ versionId, createdAt, fields: {
        role: draft.role,
        profile: draft.profile,
        appearanceAnchors: draft.appearanceAnchors,
        visualPrompt: draft.visualPrompt
      } }] };
  });
  const connections = nodes.map((node): BoardConnection => ({
    id: id(), source: setting.id, target: node.id, sourceHandle: "source-right", targetHandle: "target-left", kind: "reference",
    versionBinding: { mode: "pinned", versionId: setting.activeVersionId }, label: "由此设定派生",
    locked: true,
    sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
    targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
    style: { dash: "solid", endMarker: "arrow", markerSize: 9, width: 2 },
    routing: { mode: "auto", kind: "curved", waypoints: [] }
  }));
  const result = plan(input.snapshot, "添加所选角色卡 · " + nodes.length, nodes, connections, [], "只添加角色卡及设定引用；角色形象由每张角色卡单独进入生成确认", { kind: "create-characters", characterDraftIds: selected.map((draft) => draft.id) });
  result.preview.cost = "添加角色卡不调用媒体模型；生成角色形象时再逐项确认 Provider、模型与费用";
  return result;
}

function segmentPlan(snapshot: ComicDramaBoardSnapshot, setting: ComicSettingNode | undefined, characters: ComicCharacterNode[], instruction: string): BoardMutationPlan {
  const createdAt = now();
  const versionId = id();
  const order = snapshot.nodes.filter((node) => node.type === "comic-segment-script").length + 1;
  const node: ComicSegmentScriptNode = {
    id: id(), type: "comic-segment-script", x: 760, y: 120 + (order - 1) * 340, order,
    title: compactTitle(instruction) || `片段 ${String(order).padStart(2, "0")}`, status: "draft", activeVersionId: versionId,
    versions: [{ versionId, createdAt, fields: {
      purpose: instruction.trim() || "推进剧情", scene: "待完善", action: "待完善", dialogue: "", emotion: "待完善",
      visualDirection: "", cameraDirection: "", durationSeconds: 6
    } }]
  };
  const sources = [...(setting ? [setting] : []), ...characters].slice(0, 9);
  const firstId = id();
  const lastId = id();
  const videoId = id();
  const baseX = node.x + 360;
  const mediaNodes: BoardMutationPlan["additions"]["nodes"] = [
    { id: firstId, type: "generation", x: baseX, y: node.y, title: "首帧生成", prompt: "", model: "", size: "1024x1792", count: 1, status: "idle", comicFrameRole: "first-frame" },
    { id: lastId, type: "generation", x: baseX + 380, y: node.y, title: "尾帧生成", prompt: "", model: "", size: "1024x1792", count: 1, status: "idle", comicFrameRole: "last-frame" },
    { id: videoId, type: "video-generation", x: baseX + 760, y: node.y, title: "片段视频", prompt: "", model: "", duration: 6, aspectRatio: "9:16", resolution: "720p", generateAudio: false, status: "draft" }
  ];
  const connections: BoardConnection[] = [
    ...sources.map((source) => referenceConnection(source, node)),
    ...[firstId, lastId, videoId].map((target): BoardConnection => ({ id: id(), source: node.id, target, sourceHandle: "source-right", targetHandle: target === videoId ? "target-reference" : "target-left", kind: "reference", versionBinding: { mode: "follow-active" }, label: "片段上下文" })),
    { id: id(), source: firstId, target: lastId, sourceHandle: "source-right", targetHandle: "target-left", kind: "reference", label: "已采用首帧" },
    { id: id(), source: firstId, target: videoId, sourceHandle: "source-right", targetHandle: "target-start-frame", kind: "reference", label: "首帧" },
    { id: id(), source: lastId, target: videoId, sourceHandle: "source-right", targetHandle: "target-end-frame", kind: "reference", label: "尾帧" }
  ];
  const result = plan(snapshot, "添加指定片段及首尾帧视频链", [node, ...mediaNodes], connections, [{ id: id(), title: "片段 " + String(order).padStart(2, "0"), nodeIds: [node.id, firstId, lastId, videoId], x: node.x - 20, y: node.y - 36, width: 1500, height: 700 }], "只创建当前指定片段；不会调用媒体 Provider", { kind: "create-segment", segmentNodeId: node.id });
  result.preview.costItems = [
    { stage: "first-frame", amount: 0, currency: "pending-quote", authoritative: false },
    { stage: "last-frame", amount: 0, currency: "pending-quote", authoritative: false },
    { stage: "video", amount: 0, currency: "pending-quote", authoritative: false }
  ];
  return result;
}

function mediaIntentPlan(snapshot: ComicDramaBoardSnapshot, segment: ComicSegmentScriptNode): BoardMutationPlan {
  const firstId = id();
  const lastId = id();
  const videoId = id();
  const baseX = segment.x + 360;
  const nodes: BoardMutationPlan["additions"]["nodes"] = [
    { id: firstId, type: "generation", x: baseX, y: segment.y, title: "首帧生成", prompt: "", model: "", size: "1024x1792", count: 1, status: "idle", comicFrameRole: "first-frame" },
    { id: lastId, type: "generation", x: baseX + 380, y: segment.y, title: "尾帧生成", prompt: "", model: "", size: "1024x1792", count: 1, status: "idle", comicFrameRole: "last-frame" },
    { id: videoId, type: "video-generation", x: baseX + 760, y: segment.y, title: "片段视频", prompt: "", model: "", duration: activeSegmentVersion(segment).fields.durationSeconds, aspectRatio: "9:16", resolution: "720p", generateAudio: false, status: "draft" }
  ];
  const connections: BoardConnection[] = [
    ...[firstId, lastId, videoId].map((target): BoardConnection => ({
      id: id(), source: segment.id, target, sourceHandle: "source-right", targetHandle: target === videoId ? "target-reference" : "target-left",
      kind: "reference", versionBinding: { mode: "follow-active" }, label: "片段上下文"
    })),
    { id: id(), source: firstId, target: lastId, sourceHandle: "source-right", targetHandle: "target-left", kind: "reference", label: "已采用首帧" },
    { id: id(), source: firstId, target: videoId, sourceHandle: "source-right", targetHandle: "target-start-frame", kind: "reference", label: "首帧" },
    { id: id(), source: lastId, target: videoId, sourceHandle: "source-right", targetHandle: "target-end-frame", kind: "reference", label: "尾帧" }
  ];
  const result = plan(snapshot, "添加首帧、尾帧与视频生成意图", nodes, connections, [{
    id: id(), title: `片段 ${String(segment.order).padStart(2, "0")} 制作`, nodeIds: [segment.id, firstId, lastId, videoId],
    x: segment.x - 20, y: segment.y - 36, width: 1500, height: 700
  }], "不会执行图片或视频生成；首帧采用前，尾帧与视频保持阻塞");
  result.preview.cost = "添加计划不产生媒体费用；首帧图片费用、尾帧图片费用与视频费用将在各自生成前分别报价";
  result.preview.costItems = [
    { stage: "first-frame", amount: 0, currency: "pending-quote", authoritative: false },
    { stage: "last-frame", amount: 0, currency: "pending-quote", authoritative: false },
    { stage: "video", amount: 0, currency: "pending-quote", authoritative: false }
  ];
  return result;
}

function plan(snapshot: ComicDramaBoardSnapshot, title: string, nodes: BoardMutationPlan["additions"]["nodes"], connections: BoardConnection[], groups: BoardMutationPlan["additions"]["groups"], impact: string, action?: BoardMutationPlan["action"]): BoardMutationPlan {
  return {
    planId: id(), boardId: snapshot.boardId, baseRevision: snapshot.revision, ...(action ? { action } : {}),
    preview: { title, additions: { nodes: nodes.length, connections: connections.length, groups: groups.length }, impact, cost: "不调用媒体模型；添加节点不产生媒体费用" },
    additions: { nodes, connections, groups }
  };
}

function referenceConnection(source: ComicDramaBoardNode, target: ComicDramaBoardNode): BoardConnection {
  return { id: id(), source: source.id, target: target.id, sourceHandle: "source-right", targetHandle: "target-left", kind: "reference", versionBinding: { mode: "pinned", versionId: source.activeVersionId } };
}

function versionLabel(node: ComicDramaBoardNode): string {
  return `v${Math.max(1, node.versions.findIndex((version) => version.versionId === node.activeVersionId) + 1)}`;
}

function compactTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function isCharacterPlanningIntent(value: string): boolean {
  return /(?:规划|创建|生成|设计|给出|开始).{0,8}(?:角色|人物|阵容)|(?:角色|人物).{0,6}(?:阵容|方案)/u.test(value);
}

function isSegmentPlanningIntent(value: string): boolean {
  return /(?:创建|新增|生成|开始|拆分).{0,8}(?:片段|脚本|分镜)|(?:片段|脚本|分镜).{0,6}(?:方案|草稿)/u.test(value);
}

function isMediaPlanningIntent(value: string): boolean {
  return /(?:创建|新增|生成|添加).{0,10}(?:首帧|尾帧|视频|媒体链)|(?:首尾帧|媒体链).{0,6}(?:节点|方案)/u.test(value);
}

function mergeSettingText(current: string, next: string): string {
  if (!next) return current;
  if (!current || current === next) return next;
  return `${current}\n${next}`.slice(0, 600);
}

function inferSettingValue(instruction: string, candidates: readonly string[], current: string): string {
  return candidates.find((candidate) => instruction.includes(candidate)) ?? current;
}

function inferVisualStyle(instruction: string, current: string): string {
  const explicit = instruction.match(/(?:采用|使用|保持)([\p{Script=Han}A-Za-z0-9]{2,12})(?:视觉)?风格/u);
  const direct = instruction.match(/([\p{Script=Han}A-Za-z0-9]{2,12})(?:视觉)?风格/u);
  return explicit?.[1] ?? direct?.[1] ?? current;
}

function activeSettingVersion(node: ComicSettingNode): ComicSettingNode["versions"][number] {
  return node.versions.find((version) => version.versionId === node.activeVersionId) ?? node.versions[0];
}

function activeSegmentVersion(node: ComicSegmentScriptNode): ComicSegmentScriptNode["versions"][number] {
  return node.versions.find((version) => version.versionId === node.activeVersionId) ?? node.versions[0];
}

function activeCharacterVersion(node: ComicCharacterNode): ComicCharacterNode["versions"][number] {
  return node.versions.find((version) => version.versionId === node.activeVersionId) ?? node.versions[0];
}

function isComicCharacterDetailReady(node: ComicCharacterNode): boolean {
  const fields = activeCharacterVersion(node).fields;
  return Boolean(fields.role.trim() && fields.profile.trim() && fields.visualPrompt.trim() && fields.appearanceAnchors.length >= 2);
}
