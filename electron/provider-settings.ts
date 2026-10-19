import { randomUUID } from "node:crypto";
import type { AudioProviderConfig, VideoProviderConfig } from "../shared/types.js";
import type { SettingsStore } from "./storage/settings-store.js";

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new Error(`${label} 必须是非空字符串（最多 4096 字符）。`);
  return value.trim();
}

/** 在同一事务内读取最新设置并修改，避免 CLI 并发更新覆盖其它 Provider。 */
export async function configureProvider(store: SettingsStore, input: Record<string, unknown>) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("配置参数必须是对象。");
  const allowed = new Set(["kind", "action", "providerId", "name", "type", "baseUrl", "model", "models", "voice", "speechEndpoint", "connectionProviderId", "apiKey", "setDefault"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("未知 Provider 配置字段。");
  if (input.kind !== "video" && input.kind !== "audio") throw new Error("配置 kind 必须为 video 或 audio。");
  const kind = input.kind;
  const action = input.action ?? "upsert";
  if (typeof action !== "string" || !["upsert", "default", "remove"].includes(action)) throw new Error("未知 Provider 配置操作。");
  if (input.setDefault !== undefined && typeof input.setDefault !== "boolean") throw new Error("setDefault 必须为布尔值。");
  if (input.apiKey !== undefined && (typeof input.apiKey !== "string" || input.apiKey.length > 100_000)) throw new Error("API Key 格式无效。");
  return store.transaction(() => {
    const settings = store.getSettings();
    const list = kind === "video" ? settings.videoProviders : settings.audioProviders ?? [];
    const id = input.providerId === undefined ? `${kind}-${randomUUID()}` : text(input.providerId, "Provider ID");
    if (!/^[\w.-]+$/u.test(id)) throw new Error("Provider ID 只能包含字母、数字、下划线、点和连字符。");
    const previous = list.find((p) => p.id === id);
    const all = [...settings.providers, ...settings.textProviders, ...settings.videoProviders, ...(settings.audioProviders ?? [])];
    if (!previous && all.some((p) => p.id === id)) throw new Error("Provider ID 已用于其它类型。");
    if (previous?.type === "official") throw new Error("不能修改内置官方 Provider。");
    if (action !== "upsert" && !previous) throw new Error("Provider 不存在。");
    let config: VideoProviderConfig | AudioProviderConfig | undefined = previous;
    if (action === "upsert") {
      const type = input.type ?? previous?.type ?? (kind === "audio" ? "openai-compatible" : undefined);
      if (!(kind === "audio" ? ["openai-compatible"] : ["ark", "fal", "openrouter", "minimax"]).includes(String(type))) throw new Error("Provider 类型无效。");
      if (previous && type !== previous.type) throw new Error("不能更改已有 Provider 的协议类型，请新增 Provider。");
      const baseUrl = text(input.baseUrl ?? previous?.baseUrl, "baseUrl");
      let url: URL;
      try { url = new URL(baseUrl); } catch { throw new Error("baseUrl 必须是 HTTP(S) 地址。"); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("baseUrl 必须是无凭证、查询参数和片段的 HTTP(S) 地址。");
      const model = text(input.model ?? previous?.model, "model");
      const models = input.models ?? previous?.models ?? [];
      if (!Array.isArray(models) || models.length > 1000) throw new Error("models 必须是最多 1000 项的数组。");
      config = { ...previous, id, name: text(input.name ?? previous?.name ?? id, "name"), type, baseUrl, model,
        models: [...new Set([model, ...models.map((m) => text(m, "model"))])] } as VideoProviderConfig | AudioProviderConfig;
      if (kind === "audio") {
        if (input.connectionProviderId !== undefined) throw new Error("音频 Provider 不支持复用图片连接。");
        const old = previous as AudioProviderConfig | undefined;
        const endpoint = text(input.speechEndpoint ?? old?.speechEndpoint ?? "/v1/audio/speech", "speechEndpoint");
        if (!/^\/(?!\/)[^?#\\\s]*$/u.test(endpoint) || endpoint.includes("..")) throw new Error("speechEndpoint 必须是接口相对路径。");
        config = { ...config, type: "openai-compatible", voice: text(input.voice ?? old?.voice ?? "alloy", "voice"), speechEndpoint: endpoint };
      } else {
        if (input.voice !== undefined || input.speechEndpoint !== undefined) throw new Error("voice 和 speechEndpoint 仅用于 audio。");
        if (input.connectionProviderId !== undefined) (config as VideoProviderConfig).connectionProviderId = typeof input.connectionProviderId === "string" ? input.connectionProviderId.trim() : text(input.connectionProviderId, "connectionProviderId");
        const ownerId = (config as VideoProviderConfig).connectionProviderId;
        if (ownerId && (!["fal", "openrouter"].includes(String(type)) || !settings.providers.some((p) => p.id === ownerId && p.type === type))) throw new Error("关联图片 Provider 不存在或类型不匹配。");
        if (ownerId && input.apiKey !== undefined) throw new Error("此视频 Provider 复用图片凭证；请先清空 connectionProviderId 再设置独立密钥。");
      }
    } else if (Object.keys(input).some((key) => !["kind", "action", "providerId"].includes(key))) throw new Error("默认/删除操作不接受其它配置字段。");
    const next: Array<VideoProviderConfig | AudioProviderConfig> = action === "remove"
      ? list.filter((p) => p.id !== id)
      : previous ? list.map((p) => p.id === id ? config! : p) : [...list, config!];
    const active = kind === "video" ? settings.activeVideoProviderId : settings.activeAudioProviderId;
    const activeId = action === "default" || input.setDefault === true || !active ? id : active;
    store.updateSettings(kind === "video"
      ? { videoProviders: next as VideoProviderConfig[], activeVideoProviderId: activeId }
      : { audioProviders: next as AudioProviderConfig[], activeAudioProviderId: activeId });
    if (action === "upsert" && typeof input.apiKey === "string") store.setApiKey(id, input.apiKey);
    return { providerId: id, kind, removed: action === "remove", authConfigured: Boolean(store.getKeyStatus()[id]) };
  });
}
