import type { ComicCharacterNode, ComicDramaBoardSnapshot } from "../../../shared/comic-drama";

/** Character art direction belongs to the plugin, including the legacy canvas entry. */
export function prepareCharacterGeneration(character: ComicCharacterNode) {
  const version = character.versions.find(item => item.versionId === character.activeVersionId) ?? character.versions[0];
  if (!version) throw new Error("角色缺少可生成的版本。");
  return {
    prompt: [character.name, version.fields.role, version.fields.profile, version.fields.visualPrompt, ...version.fields.appearanceAnchors].filter(Boolean).join("，"),
    size: "1024x1792",
    useCase: "illustration-story" as const,
    creationMode: "general" as const,
    n: 1,
    successStatus: "review" as const,
    failureStatus: "failed" as const
  };
}

export function assistantCurrentFields(snapshot: ComicDramaBoardSnapshot, selectedNodeIds: readonly string[]) {
  return [
    { label: "完整漫剧节点快照", value: JSON.stringify(snapshot.nodes) },
    { label: "选中节点快照", value: JSON.stringify(snapshot.nodes.filter(node => selectedNodeIds.includes(node.id))) },
    { label: "画板 revision", value: String(snapshot.revision) },
    { label: "引用连接与分组摘要", value: JSON.stringify({ connections: snapshot.connections, groups: snapshot.groups }) }
  ];
}

export function initializeProject({ snapshot, instruction }: { snapshot: ComicDramaBoardSnapshot; instruction: string }): import("../../../shared/comic-drama").BoardMutationPlan {
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  return {
    planId: crypto.randomUUID(), boardId: snapshot.boardId, baseRevision: snapshot.revision,
    action: { kind: "create-setting" },
    preview: { title: "添加 1 张漫剧设定卡", additions: { nodes: 1, connections: 0, groups: 0 }, impact: "不会创建角色、片段或媒体生成节点", cost: "不调用媒体模型；添加节点不产生媒体费用" },
    additions: { nodes: [{ id, type: "comic-setting", x: 80, y: 80, status: "draft", activeVersionId: versionId,
      versions: [{ versionId, createdAt: new Date().toISOString(), fields: {
        title: instruction.trim().replace(/\s+/g, " ").slice(0, 40) || "未命名漫剧", synopsis: instruction.trim(),
        genre: "剧情", tone: "待完善", worldRules: [], visualStyle: "待完善", constraints: [], aspectRatio: "9:16", targetDurationSeconds: 30
      } }]
    }], connections: [], groups: [] }
  };
}
