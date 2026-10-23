export const PLUGIN_API_VERSION = 1;
export const SHORT_DRAMA_PLUGIN_ID = "dev.iterlay.short-drama";
export const PLUGIN_PERMISSIONS = ["board:read", "board:write", "storage", "assistant:comic-drama", "creation:present"] as const;
export type PluginPermission = typeof PLUGIN_PERMISSIONS[number];
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: 1;
  type: "tool";
  description: string;
  author: string;
  entry: "index.html";
  permissions: PluginPermission[];
  settings?: boolean;
  surface?: "panel" | "workspace";
  creationArtifacts?: Array<{ kind: string; label: string; mediaType: "image" | "video" | "project" }>;
}
export interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  installedAt: string;
}
export interface PluginPackage { manifest: PluginManifest; html: string }
export interface PluginContext {
  boardId: string;
  selectedNodeIds: string[];
  theme: "light" | "dark";
  locale: string;
}
export function validatePluginManifest(input: unknown): PluginManifest {
  if (!input || typeof input !== "object") throw new Error("插件描述文件无效。");
  const m = input as Record<string, unknown>;
  if (typeof m.id !== "string" || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(m.id) || m.id.length > 100) throw new Error("插件 ID 无效。");
  for (const key of ["name", "description", "author", "version"] as const) {
    if (typeof m[key] !== "string" || !m[key].trim() || m[key].length > 1000) throw new Error(`插件 ${key} 无效。`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(m.version as string)) throw new Error("插件版本必须使用 x.y.z 格式。");
  if (m.apiVersion !== PLUGIN_API_VERSION) throw new Error("插件 API 版本不兼容，请更新插件或 Iterlay。");
  if (m.type !== "tool" || m.entry !== "index.html") throw new Error("当前支持入口为 index.html 的工具插件。");
  if (!Array.isArray(m.permissions) || m.permissions.some(p => !PLUGIN_PERMISSIONS.includes(p))) throw new Error("插件请求了未知权限。");
  if (m.surface !== undefined && !["panel", "workspace"].includes(String(m.surface))) throw new Error("插件界面类型无效。");
  const artifactKinds = m.creationArtifacts;
  if (artifactKinds !== undefined && (!Array.isArray(artifactKinds) || artifactKinds.length > 16 || artifactKinds.some((value) =>
    !value || typeof value !== "object" || typeof value.kind !== "string" || !value.kind.startsWith(`${m.id}:`)
    || value.kind.length > 140 || typeof value.label !== "string" || !value.label.trim() || value.label.length > 80
    || !["image", "video", "project"].includes(value.mediaType)))) throw new Error("插件创作产物类型无效。");
  return { id: m.id, name: (m.name as string).trim(), description: (m.description as string).trim(), author: (m.author as string).trim(), version: m.version as string, apiVersion: 1, type: "tool", entry: "index.html", permissions: [...new Set(m.permissions)] as PluginPermission[], settings: m.settings === true, ...(m.surface ? { surface: m.surface as "panel" | "workspace" } : {}),
    ...(artifactKinds ? { creationArtifacts: artifactKinds.map((value) => ({ kind: value.kind, label: value.label.trim(), mediaType: value.mediaType })) } : {}) };
}
