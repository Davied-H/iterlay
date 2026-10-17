import type { BoardMutationPlan, ComicDramaBoardNode, ComicDramaBoardSnapshot, ComicSettingFields, ComicCharacterFields, ComicSegmentScriptFields } from "../../../shared/comic-drama";
export type Stage = "story" | "characters" | "shots" | "production";
export const stages: Array<{ id: Stage; label: string; number: string }> = [
  { id: "story", label: "故事", number: "01" }, { id: "characters", label: "角色", number: "02" }, { id: "shots", label: "分镜", number: "03" }, { id: "production", label: "制作", number: "04" }
];
export function fields(node: ComicDramaBoardNode) { return node.versions.find(v => v.versionId === node.activeVersionId)?.fields ?? node.versions[0]?.fields; }
export function createNode(type: ComicDramaBoardNode["type"], snapshot: ComicDramaBoardSnapshot): ComicDramaBoardNode {
  const id = crypto.randomUUID(), versionId = crypto.randomUUID(), createdAt = new Date().toISOString();
  const base = { id, x: snapshot.nodes.length * 60, y: snapshot.nodes.length * 340, width: 320, height: 300, status: "draft" as const, activeVersionId: versionId };
  if (type === "comic-setting") return { ...base, type, versions: [{ versionId, createdAt, fields: { title: "", synopsis: "", genre: "", tone: "", worldRules: [], constraints: [], visualStyle: "", aspectRatio: "9:16", targetDurationSeconds: 30 } }] };
  if (type === "comic-character") return { ...base, type, name: "新角色", versions: [{ versionId, createdAt, fields: { role: "", profile: "", appearanceAnchors: [], visualPrompt: "" } }] };
  return { ...base, type, title: "新分镜", order: snapshot.nodes.filter(n => n.type === type).length + 1, versions: [{ versionId, createdAt, fields: { purpose: "", scene: "", action: "", dialogue: "", emotion: "", visualDirection: "", cameraDirection: "", durationSeconds: 6 } }] };
}
export function savePlan(snapshot: ComicDramaBoardSnapshot, node: ComicDramaBoardNode, values: Record<string, string>): BoardMutationPlan {
  const versionId = crypto.randomUUID();
  const next = structuredClone(node);
  const previous = fields(node)!;
  let data: ComicSettingFields | ComicCharacterFields | ComicSegmentScriptFields;
  if (node.type === "comic-setting") {
    const f = previous as ComicSettingFields;
    if (!values.title?.trim() || !values.synopsis?.trim()) throw new Error("请填写剧名和故事梗概。");
    data = { ...f, ...values, worldRules: (values.worldRules ?? "").split("\n").filter(Boolean), constraints: f.constraints, targetDurationSeconds: Number(values.targetDurationSeconds) };
    if (!Number.isFinite(data.targetDurationSeconds) || data.targetDurationSeconds < 1 || data.targetDurationSeconds > 3600) throw new Error("目标时长应在 1–3600 秒之间。");
  } else if (node.type === "comic-character") {
    if (!values.name?.trim()) throw new Error("请填写角色名称。");
    data = { role: values.role ?? "", profile: values.profile ?? "", visualPrompt: values.visualPrompt ?? "", appearanceAnchors: (values.appearanceAnchors ?? "").split("\n").filter(Boolean) };
    if (next.type === "comic-character") next.name = values.name.trim();
  } else {
    if (!values.title?.trim() || !values.action?.trim()) throw new Error("请填写分镜标题和画面动作。");
    data = { ...(previous as ComicSegmentScriptFields), ...values, durationSeconds: Number(values.durationSeconds) };
    if (!Number.isFinite(data.durationSeconds) || data.durationSeconds < 1 || data.durationSeconds > 120) throw new Error("单个分镜时长应在 1–120 秒之间。");
    if (next.type === "comic-segment-script") next.title = values.title.trim();
  }
  next.activeVersionId = versionId; next.status = "saved";
  // Branches above preserve each node's corresponding field schema.
  next.versions = [...node.versions, { versionId, createdAt: new Date().toISOString(), fields: data }] as typeof next.versions;
  const existing = snapshot.nodes.some(n => n.id === node.id);
  const sources = !existing ? snapshot.nodes.filter(n => n.type === "comic-setting" || (node.type === "comic-segment-script" && n.type === "comic-character")) : [];
  return {
    planId: crypto.randomUUID(), boardId: snapshot.boardId, baseRevision: snapshot.revision,
    preview: { title: "保存制作内容", ...(existing ? { updates: { nodes: 1 } } : {}), additions: { nodes: existing ? 0 : 1, connections: sources.length, groups: 0 }, impact: "保存文本新版本，不自动生成媒体。", cost: "不调用媒体模型" },
    additions: { nodes: existing ? [] : [next], connections: sources.map(source => ({ id: crypto.randomUUID(), source: source.id, target: node.id, sourceHandle: "source-right", targetHandle: "target-left", kind: "reference", locked: true, versionBinding: { mode: "follow-active" } })), groups: [] },
    ...(existing ? { updates: { nodes: [next] } } : {})
  };
}
