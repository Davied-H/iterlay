import { normalizeScreenAccessPolicy } from "../../shared/screen-access.js";
import { safeStorage } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { MutationQueue, writeJsonAtomic, writeJsonAtomicSync } from "./atomic-json.js";
import path from "node:path";
import { COMMUNITY_IMAGE_PROVIDER, COMMUNITY_TEXT_PROVIDER } from '../../shared/community-providers.js';
import { normalizeAppLanguage, type AppLanguage } from "../../shared/i18n.js";
import { getProviderModels } from "../../shared/provider-models.js";
import type {
  AppIconLibrary,
  AppIconPreference,
  AppSettings,
  AppSettingsPatch,
  AudioProviderConfig,
  AssistantIntentSuggestionCount,
  BoardTrashRetentionDays,
  CopyImageFormat,
  CustomAppIcon,
  GenerateButtonStyle,
  ImageDoubleClickAction,
  MemoryUsageLevel,
  PiAgentBuiltinToolName,
  ProviderConfig,
  TextProviderConfig,
  VersionSeparationMode,
  VideoProviderConfig
} from "../../shared/types.js";
import {
  DEFAULT_VIDEO_PROVIDER_CONFIG,
  DEFAULT_VIDEO_PROVIDER_ID,
  OFFICIAL_PROVIDER_CONFIG,
  OFFICIAL_PROVIDER_ID,
  OFFICIAL_TEXT_PROVIDER_CONFIG,
  OFFICIAL_TEXT_PROVIDER_ID,
  OFFICIAL_VIDEO_PROVIDER_CONFIG,
  OFFICIAL_VIDEO_PROVIDER_ID,
  PI_AGENT_DEFAULT_ITERLAY_TOOLS
} from "../../shared/types.js";

interface SettingsSchema {
  schemaVersion?: 1;
  providers: ProviderConfig[];
  activeProviderId: string;
  textProviders?: TextProviderConfig[];
  activeTextProviderId?: string;
  videoProviders?: VideoProviderConfig[];
  activeVideoProviderId?: string;
  audioProviders?: AudioProviderConfig[];
  activeAudioProviderId?: string;
  /** 按 provider id 存放加密后的 API Key（base64），图片、文本、视频与音频 Provider 共用此表。 */
  encryptedApiKeys?: Record<string, string>;
  language?: AppLanguage;
  theme: "light" | "dark" | "system";
  promptDockAutoCollapse?: boolean;
  advancedVideoModesEnabled?: boolean;
  canvasThumbnailPreview?: boolean;
  canvasMinimapVisible?: boolean;
  boardCommentsEnabled?: boolean;
  boardGalleryEnabled?: boolean;
  canvasImageToolbarOnHover?: boolean;
  canvasRelationshipHoverHighlight?: boolean;
  wechatStickerExportEnabled?: boolean;
  onlineImageSharingEnabled?: boolean;
  copyImageFormat?: CopyImageFormat;
  boardSmartSuggestionsEnabled?: boolean;
  boardAssistantEnabled?: boolean;
  boardAssistantAgentModeEnabled?: boolean;
  assistantAgentModeEnabled?: boolean;
  piAgentBuiltinTools?: PiAgentBuiltinToolName[];
  piAgentIterlayTools?: string[];
  piAgentSkillPaths?: string[];
  piAgentExtensionPaths?: string[];
  piAgentCustomSkillPaths?: string[];
  piAgentCustomExtensionPaths?: string[];
  piAgentMaxTurns?: number;
  piAgentWebSearchMaxResults?: number;
  assistantScreenAccess?: import("../../shared/screen-access.js").ScreenAccessPolicy;
  boardAssistantAwarenessEnabled?: boolean;
  boardAssistantIntentSuggestionsEnabled?: boolean;
  boardAssistantIntentSuggestionCount?: AssistantIntentSuggestionCount;
  editSmartSuggestionsEnabled?: boolean;
  memoryEnabled?: boolean;
  memoryUsageLevel?: MemoryUsageLevel;
  editInfoMode?: "flip" | "panel";
  imageDoubleClickAction?: ImageDoubleClickAction;
  downloadDirectory?: string;
  cliDefaultBoardId?: string;
  defaultCodingAgent?: import("../../shared/agent-integration.js").CodingAgentId;
  versionSeparationMode?: VersionSeparationMode;
  generateButtonStyle?: GenerateButtonStyle;
  appIcon?: AppIconPreference;
  customAppIcons?: CustomAppIcon[];
  boardTrashRetentionDays?: BoardTrashRetentionDays;
}

/** 旧版落盘结构（单 provider / 单 key、provider 内嵌 promptModel），仅用于迁移。 */
interface LegacySettingsSchema {
  provider?: Partial<ProviderConfig> & { type?: string };
  encryptedApiKey?: string;
}

/** 旧版 provider 上寄生的文本模型字段，迁移为独立文本 Provider。 */
type LegacyProviderEntry = Partial<ProviderConfig> & { promptModel?: string };

const defaultProvider: ProviderConfig = {
  id: "sub2api",
  name: "Sub2API / OpenAI Compatible",
  type: "openai-compatible",
  apiMode: "responses",
  baseUrl: "http://127.0.0.1:3000",
  generationEndpoint: "/v1/responses",
  referenceEndpoint: "",
  model: "gpt-5.5",
  supportsReferenceImages: true
};

const defaultCodexProvider: ProviderConfig = {
  id: "codex-oauth",
  name: "Codex / ChatGPT",
  type: "codex-oauth",
  apiMode: "responses",
  baseUrl: "",
  generationEndpoint: "",
  referenceEndpoint: "",
  model: "gpt-image-2",
  supportsReferenceImages: true
};

const defaultFalProvider: ProviderConfig = {
  id: "fal-ai",
  name: "fal.ai",
  type: "fal",
  baseUrl: "https://queue.fal.run",
  generationEndpoint: "",
  referenceEndpoint: "",
  model: "fal-ai/nano-banana-pro",
  referenceModel: "fal-ai/nano-banana-pro/edit",
  falSizeMode: "aspect_ratio_and_resolution",
  falReferenceInput: "image_urls",
  supportsReferenceImages: true
};

const defaultOpenRouterProvider: ProviderConfig = {
  id: "openrouter",
  name: "OpenRouter",
  type: "openrouter",
  apiMode: "images",
  baseUrl: "https://openrouter.ai/api",
  generationEndpoint: "/v1/images",
  referenceEndpoint: "",
  model: "bytedance-seed/seedream-4.5",
  supportsReferenceImages: true
};

const defaultBailianProvider: ProviderConfig = {
  id: "bailian",
  name: "阿里云百炼",
  type: "bailian",
  baseUrl: "https://dashscope.aliyuncs.com",
  generationEndpoint: "/api/v1/services/aigc/multimodal-generation/generation",
  referenceEndpoint: "",
  model: "qwen-image-2.0-pro",
  supportsReferenceImages: true
};

const defaultArkProvider: ProviderConfig = {
  id: "ark",
  name: "火山方舟 Seedream",
  type: "ark",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  generationEndpoint: "/images/generations",
  referenceEndpoint: "",
  model: "doubao-seedream-5-0-pro-260628",
  supportsReferenceImages: true
};

const defaultPoeProvider: ProviderConfig = {
  id: "poe",
  name: "Poe",
  type: "poe",
  apiMode: "images",
  baseUrl: "https://api.poe.com",
  generationEndpoint: "/v1/images",
  referenceEndpoint: "",
  model: "nano-banana-2",
  supportsReferenceImages: false
};

export class SettingsStore {
  private readonly filePath: string;
  private cached: SettingsSchema | undefined;
  private saved: boolean;
  private readonly mutations = new MutationQueue();
  private staged: SettingsSchema | undefined;
  private staging = false;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "settings.json");
    this.saved = existsSync(this.filePath);
  }

  getSettings(): AppSettings {
    const current = this.readSettings();
    return {
      providers: current.providers.map((p) => ({ ...p, models: p.models ? [...p.models] : undefined })),
      activeProviderId: current.activeProviderId,
      textProviders: (current.textProviders ?? [{ ...COMMUNITY_TEXT_PROVIDER }]).map((p) => ({ ...p })),
      activeTextProviderId: current.activeTextProviderId ?? COMMUNITY_TEXT_PROVIDER.id,
      videoProviders: ensureVideoProviders(
        (current.videoProviders ?? [{ ...DEFAULT_VIDEO_PROVIDER_CONFIG }]).map((p) => ({ ...p, models: p.models ? [...p.models] : undefined }))
      ),
      activeVideoProviderId: current.activeVideoProviderId ?? DEFAULT_VIDEO_PROVIDER_ID,
      audioProviders: (current.audioProviders ?? []).map((p) => ({ ...p, models: p.models ? [...p.models] : undefined })),
      activeAudioProviderId: current.activeAudioProviderId ?? "",
      language: normalizeAppLanguage(current.language),
      theme: current.theme,
      promptDockAutoCollapse: current.promptDockAutoCollapse ?? false,
      advancedVideoModesEnabled: current.advancedVideoModesEnabled ?? false,
      canvasThumbnailPreview: current.canvasThumbnailPreview ?? true,
      canvasMinimapVisible: current.canvasMinimapVisible ?? true,
      boardCommentsEnabled: current.boardCommentsEnabled ?? false,
      boardGalleryEnabled: current.boardGalleryEnabled ?? false,
      canvasImageToolbarOnHover: current.canvasImageToolbarOnHover ?? false,
      canvasRelationshipHoverHighlight: current.canvasRelationshipHoverHighlight ?? false,
      wechatStickerExportEnabled: current.wechatStickerExportEnabled ?? false,
      onlineImageSharingEnabled: current.onlineImageSharingEnabled ?? false,
      copyImageFormat: normalizeCopyImageFormat(current.copyImageFormat),
      boardSmartSuggestionsEnabled: current.boardSmartSuggestionsEnabled ?? false,
      boardAssistantEnabled: current.boardAssistantEnabled ?? true,
      boardAssistantAgentModeEnabled: current.boardAssistantAgentModeEnabled ?? false,
      assistantAgentModeEnabled:
        current.assistantAgentModeEnabled ?? current.boardAssistantAgentModeEnabled ?? false,
      piAgentBuiltinTools: normalizePiAgentBuiltinTools(current.piAgentBuiltinTools),
      piAgentIterlayTools: current.piAgentIterlayTools === undefined
        ? [...PI_AGENT_DEFAULT_ITERLAY_TOOLS]
        : normalizeIterlayTools(current.piAgentIterlayTools),
      piAgentSkillPaths: normalizeStringList(current.piAgentSkillPaths),
      piAgentExtensionPaths: normalizeStringList(current.piAgentExtensionPaths),
      piAgentCustomSkillPaths: normalizeStringList(current.piAgentCustomSkillPaths),
      piAgentCustomExtensionPaths: normalizeStringList(current.piAgentCustomExtensionPaths),
      piAgentMaxTurns: normalizeInteger(current.piAgentMaxTurns, 4, 24, 12),
      piAgentWebSearchMaxResults: normalizeInteger(current.piAgentWebSearchMaxResults, 3, 10, 5),
      assistantScreenAccess: normalizeScreenAccessPolicy(current.assistantScreenAccess),
      boardAssistantAwarenessEnabled: current.boardAssistantAwarenessEnabled ?? true,
      boardAssistantIntentSuggestionsEnabled: current.boardAssistantIntentSuggestionsEnabled ?? true,
      boardAssistantIntentSuggestionCount: normalizeAssistantIntentSuggestionCount(
        current.boardAssistantIntentSuggestionCount
      ),
      editSmartSuggestionsEnabled: current.editSmartSuggestionsEnabled ?? true,
      memoryEnabled: current.memoryEnabled ?? true,
      memoryUsageLevel: normalizeMemoryUsageLevel(current.memoryUsageLevel),
      editInfoMode: current.editInfoMode ?? "flip",
      imageDoubleClickAction: current.imageDoubleClickAction ?? "edit",
      downloadDirectory: current.downloadDirectory ?? "",
      cliDefaultBoardId: current.cliDefaultBoardId ?? "",
      defaultCodingAgent: current.defaultCodingAgent ?? "codex",
      versionSeparationMode: current.versionSeparationMode ?? "copy",
      generateButtonStyle: current.generateButtonStyle ?? "folded",
      appIcon: normalizeStoredAppIcon(current.appIcon, current.customAppIcons),
      customAppIcons: normalizeCustomAppIcons(current.customAppIcons),
      boardTrashRetentionDays: normalizeBoardTrashRetentionDays(current.boardTrashRetentionDays)
    };
  }

  hasSavedSettings(): boolean {
    return this.saved;
  }

  /** Settings and encrypted keys commit together, or restore the prior snapshot. */
  transaction<T>(update: () => T): Promise<T> {
    return this.mutations.run(async () => {
      const previous = this.cached;
      const saved = this.saved;
      this.staging = true;
      this.staged = undefined;
      try {
        const result = update();
        if (this.staged) await writeJsonAtomic(this.filePath, this.staged);
        return result;
      } catch (error) {
        this.cached = previous;
        this.saved = saved;
        throw error;
      } finally {
        this.staging = false;
        this.staged = undefined;
      }
    });
  }

  saveSettings(settings: AppSettings): void {
    const current = this.readSettings();
    const providers = ensureImageProviders(
      settings.providers.length > 0 ? settings.providers.map((p) => normalizeProvider(p)) : []
    );
    const activeProviderId = providers.some((p) => p.id === settings.activeProviderId)
      ? settings.activeProviderId
      : providers[0].id;
    const textProviders = ensureCodexTextBindings(providers, ensureTextProviders(
      (settings.textProviders ?? []).map((p) => normalizeTextProvider(p))
    ));
    const activeTextProviderId = textProviders.some((p) => p.id === settings.activeTextProviderId)
      ? settings.activeTextProviderId
      : textProviders[0].id;
    const detachedVideoKeys: Record<string, string> = {};
    const videoProviders = ensureVideoProviders(
      (settings.videoProviders?.length ? settings.videoProviders : [DEFAULT_VIDEO_PROVIDER_CONFIG])
        .map((provider) => {
          const previous = current.videoProviders?.find((candidate) => candidate.id === provider.id);
          const ownerId = previous?.connectionProviderId;
          const source = ownerId ? current.providers.find((candidate) => candidate.id === ownerId) : undefined;
          const sourceRemoved = source && !providers.some((candidate) => candidate.id === source.id);
          // Detach only an existing relationship whose source was removed. A new
          // dangling reference must still surface as a configuration error.
          if (sourceRemoved && previous?.type === provider.type && source.type === provider.type
            && (!provider.connectionProviderId || provider.connectionProviderId === ownerId)) {
            const encryptedKey = current.encryptedApiKeys?.[source.id];
            if (encryptedKey) detachedVideoKeys[provider.id] = encryptedKey;
            return normalizeVideoProvider({ ...provider, baseUrl: source.baseUrl, connectionProviderId: undefined });
          }
          return normalizeVideoProvider(provider);
        })
    );
    const activeVideoProviderId = videoProviders.some((p) => p.id === settings.activeVideoProviderId)
      ? settings.activeVideoProviderId
      : videoProviders[0].id;
    const audioProviders = settings.audioProviders ?? current.audioProviders ?? [];
    const activeAudioProviderId = audioProviders.some((p) => p.id === (settings.activeAudioProviderId ?? current.activeAudioProviderId))
      ? (settings.activeAudioProviderId ?? current.activeAudioProviderId ?? "") : audioProviders[0]?.id ?? "";
    // 丢弃已删除 provider（图片、文本、视频与音频）的 key。
    const validIds = new Set([...providers.map((p) => p.id), ...textProviders.map((p) => p.id), ...videoProviders.map((p) => p.id), ...audioProviders.map((p) => p.id)]);
    const encryptedApiKeys = {
      ...Object.fromEntries(Object.entries(current.encryptedApiKeys ?? {}).filter(([id]) => validIds.has(id))),
      ...detachedVideoKeys
    };
    this.writeSettings({
      ...current,
      providers,
      activeProviderId,
      textProviders,
      activeTextProviderId,
      videoProviders,
      activeVideoProviderId,
      audioProviders,
      activeAudioProviderId,
      encryptedApiKeys,
      language: normalizeAppLanguage(settings.language),
      theme: settings.theme,
      promptDockAutoCollapse: settings.promptDockAutoCollapse,
      advancedVideoModesEnabled:
        settings.advancedVideoModesEnabled ?? current.advancedVideoModesEnabled ?? false,
      canvasThumbnailPreview: settings.canvasThumbnailPreview,
      canvasMinimapVisible: settings.canvasMinimapVisible ?? current.canvasMinimapVisible ?? true,
      boardCommentsEnabled: settings.boardCommentsEnabled ?? current.boardCommentsEnabled ?? false,
      boardGalleryEnabled: settings.boardGalleryEnabled ?? current.boardGalleryEnabled ?? false,
      canvasImageToolbarOnHover:
        settings.canvasImageToolbarOnHover ?? current.canvasImageToolbarOnHover ?? false,
      canvasRelationshipHoverHighlight:
        settings.canvasRelationshipHoverHighlight ?? current.canvasRelationshipHoverHighlight ?? false,
      wechatStickerExportEnabled:
        settings.wechatStickerExportEnabled ?? current.wechatStickerExportEnabled ?? false,
      onlineImageSharingEnabled:
        settings.onlineImageSharingEnabled ?? current.onlineImageSharingEnabled ?? false,
      copyImageFormat: normalizeCopyImageFormat(settings.copyImageFormat ?? current.copyImageFormat),
      boardSmartSuggestionsEnabled: settings.boardSmartSuggestionsEnabled ?? current.boardSmartSuggestionsEnabled ?? false,
      boardAssistantEnabled: settings.boardAssistantEnabled ?? current.boardAssistantEnabled ?? true,
      boardAssistantAgentModeEnabled:
        settings.boardAssistantAgentModeEnabled ?? current.boardAssistantAgentModeEnabled ?? false,
      assistantAgentModeEnabled:
        settings.assistantAgentModeEnabled
        ?? current.assistantAgentModeEnabled
        ?? settings.boardAssistantAgentModeEnabled
        ?? current.boardAssistantAgentModeEnabled
        ?? false,
      piAgentBuiltinTools: normalizePiAgentBuiltinTools(settings.piAgentBuiltinTools),
      piAgentIterlayTools: settings.piAgentIterlayTools === undefined
        ? [...PI_AGENT_DEFAULT_ITERLAY_TOOLS]
        : normalizeIterlayTools(settings.piAgentIterlayTools),
      piAgentSkillPaths: normalizeStringList(settings.piAgentSkillPaths),
      piAgentExtensionPaths: normalizeStringList(settings.piAgentExtensionPaths),
      piAgentCustomSkillPaths: normalizeStringList(settings.piAgentCustomSkillPaths),
      piAgentCustomExtensionPaths: normalizeStringList(settings.piAgentCustomExtensionPaths),
      piAgentMaxTurns: normalizeInteger(settings.piAgentMaxTurns, 4, 24, 12),
      piAgentWebSearchMaxResults: normalizeInteger(settings.piAgentWebSearchMaxResults, 3, 10, 5),
      assistantScreenAccess: normalizeScreenAccessPolicy(settings.assistantScreenAccess ?? current.assistantScreenAccess),
      boardAssistantAwarenessEnabled:
        settings.boardAssistantAwarenessEnabled ?? current.boardAssistantAwarenessEnabled ?? true,
      boardAssistantIntentSuggestionsEnabled:
        settings.boardAssistantIntentSuggestionsEnabled ?? current.boardAssistantIntentSuggestionsEnabled ?? true,
      boardAssistantIntentSuggestionCount: normalizeAssistantIntentSuggestionCount(
        settings.boardAssistantIntentSuggestionCount ?? current.boardAssistantIntentSuggestionCount
      ),
      editSmartSuggestionsEnabled: settings.editSmartSuggestionsEnabled ?? current.editSmartSuggestionsEnabled ?? true,
      memoryEnabled: settings.memoryEnabled ?? current.memoryEnabled ?? true,
      memoryUsageLevel: normalizeMemoryUsageLevel(settings.memoryUsageLevel ?? current.memoryUsageLevel),
      editInfoMode: settings.editInfoMode ?? current.editInfoMode ?? "flip",
      imageDoubleClickAction: settings.imageDoubleClickAction ?? current.imageDoubleClickAction ?? "edit",
      downloadDirectory: settings.downloadDirectory ?? current.downloadDirectory ?? "",
      cliDefaultBoardId: typeof settings.cliDefaultBoardId === "string" ? settings.cliDefaultBoardId.trim() : current.cliDefaultBoardId ?? "",
      defaultCodingAgent: settings.defaultCodingAgent === "codex" || settings.defaultCodingAgent === "claude-code" ? settings.defaultCodingAgent : current.defaultCodingAgent ?? "codex",
      versionSeparationMode: settings.versionSeparationMode ?? current.versionSeparationMode ?? "copy",
      generateButtonStyle: settings.generateButtonStyle ?? current.generateButtonStyle ?? "folded",
      appIcon: normalizeStoredAppIcon(
        settings.appIcon ?? current.appIcon,
        settings.customAppIcons ?? current.customAppIcons
      ),
      customAppIcons: normalizeCustomAppIcons(settings.customAppIcons ?? current.customAppIcons),
      boardTrashRetentionDays: normalizeBoardTrashRetentionDays(
        settings.boardTrashRetentionDays ?? current.boardTrashRetentionDays
      )
    });
  }

  updateSettings(patch: AppSettingsPatch): void {
    this.saveSettings({ ...this.getSettings(), ...patch });
  }

  setAppIcon(appIcon: AppIconPreference): void {
    const current = this.readSettings();
    this.writeSettings({
      ...current,
      appIcon: normalizeStoredAppIcon(appIcon, current.customAppIcons)
    });
  }

  addCustomAppIcon(icon: CustomAppIcon): AppIconLibrary {
    const current = this.readSettings();
    const customAppIcons = normalizeCustomAppIcons([
      ...(current.customAppIcons ?? []).filter((item) => item.id !== icon.id),
      icon
    ]);
    const appIcon = `custom:${icon.id}` as const;
    this.writeSettings({ ...current, appIcon, customAppIcons });
    return { appIcon, customAppIcons };
  }

  deleteCustomAppIcon(id: string): AppIconLibrary {
    const current = this.readSettings();
    const customAppIcons = normalizeCustomAppIcons(current.customAppIcons).filter((icon) => icon.id !== id);
    const appIcon = current.appIcon === `custom:${id}`
      ? "mascot"
      : normalizeStoredAppIcon(current.appIcon, customAppIcons);
    this.writeSettings({ ...current, appIcon, customAppIcons });
    return { appIcon, customAppIcons };
  }

  setDownloadDirectory(downloadDirectory: string): void {
    const current = this.readSettings();
    this.writeSettings({ ...current, downloadDirectory });
  }

  /** 取指定 provider（缺省为 active）的 API Key，无则返回空串。 */
  getApiKey(providerId?: string): string {
    const current = this.readSettings();
    const id = providerId ?? current.activeProviderId;
    const encrypted = current.encryptedApiKeys?.[id];
    if (!encrypted) return "";
    try {
      if (!safeStorage.isEncryptionAvailable()) return "";
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return "";
    }
  }

  /** 解析视频 Provider 实际使用的连接；fal.ai 可引用图片 Provider 的地址与密钥。 */
  resolveVideoProviderConnection(providerOrId: VideoProviderConfig | string): {
    baseUrl: string;
    apiKey: string;
    connectionProviderId: string;
  } {
    const current = this.readSettings();
    const provider = typeof providerOrId === "string"
      ? (current.videoProviders ?? []).find((candidate) => candidate.id === providerOrId)
      : providerOrId;
    if (!provider) throw new Error("视频 Provider 不存在或已被删除。");
    const connectionProviderId = provider.connectionProviderId?.trim();
    if (!connectionProviderId) {
      return { baseUrl: provider.baseUrl, apiKey: this.getApiKey(provider.id), connectionProviderId: provider.id };
    }
    if (provider.type !== "fal" && provider.type !== "openrouter") {
      throw new Error("只有 fal.ai 或 OpenRouter 视频服务可以复用图片服务连接。");
    }
    const imageProvider = current.providers.find((candidate) => candidate.id === connectionProviderId);
    if (!imageProvider || imageProvider.type !== provider.type) {
      throw new Error(`关联的 ${provider.type === "fal" ? "fal.ai" : "OpenRouter"} 图片服务不存在，请重新选择。`);
    }
    return {
      baseUrl: imageProvider.baseUrl,
      apiKey: this.getApiKey(imageProvider.id),
      connectionProviderId: imageProvider.id
    };
  }

  /** 每个 provider 是否已保存 key，供 UI 判断可用性。 */
  getKeyStatus(): Record<string, boolean> {
    const current = this.readSettings();
    const status: Record<string, boolean> = {};
    for (const p of current.providers) {
      status[p.id] = p.type === "official" || Boolean(current.encryptedApiKeys?.[p.id]);
    }
    for (const p of current.textProviders ?? []) {
      status[p.id] = p.type === "official" || Boolean(current.encryptedApiKeys?.[p.id]);
    }
    for (const p of current.videoProviders ?? []) {
      if (p.type === "official") {
        status[p.id] = true;
        continue;
      }
      const connectionId = (p.type === "fal" || p.type === "openrouter") && p.connectionProviderId?.trim()
        ? p.connectionProviderId.trim()
        : p.id;
      status[p.id] = Boolean(current.encryptedApiKeys?.[connectionId]);
    }
    for (const p of current.audioProviders ?? []) status[p.id] = Boolean(current.encryptedApiKeys?.[p.id]);
    return status;
  }

  setApiKey(providerId: string, apiKey: string): void {
    const current = this.readSettings();
    if (providerId === OFFICIAL_PROVIDER_ID || providerId === OFFICIAL_TEXT_PROVIDER_ID || providerId === OFFICIAL_VIDEO_PROVIDER_ID) return;
    const keys = { ...(current.encryptedApiKeys ?? {}) };
    if (!apiKey.trim()) {
      delete keys[providerId];
      this.writeSettings({ ...current, encryptedApiKeys: keys });
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("当前系统不支持 Electron safeStorage，无法安全保存 API Key。");
    }
    keys[providerId] = safeStorage.encryptString(apiKey).toString("base64");
    this.writeSettings({ ...current, encryptedApiKeys: keys });
  }

  private readSettings(): SettingsSchema {
    if (this.cached) return cloneSettings(this.cached);
    if (!this.saved) {
      return cloneSettings({
        providers: [{ ...COMMUNITY_IMAGE_PROVIDER }],
        activeProviderId: COMMUNITY_IMAGE_PROVIDER.id,
        textProviders: [{ ...COMMUNITY_TEXT_PROVIDER }],
        activeTextProviderId: COMMUNITY_TEXT_PROVIDER.id,
        videoProviders: [{ ...DEFAULT_VIDEO_PROVIDER_CONFIG }],
        activeVideoProviderId: DEFAULT_VIDEO_PROVIDER_ID,
        language: "system",
        theme: "system"
      });
    }
    const raw = readFileSync(this.filePath, "utf8");
    let parsed: Partial<SettingsSchema> & LegacySettingsSchema;
    try {
      parsed = JSON.parse(raw) as Partial<SettingsSchema> & LegacySettingsSchema;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("配置不是对象。");
      if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) throw new Error("配置版本不受支持。");
    } catch (error) {
      throw new Error(`设置文件损坏或版本不兼容：${this.filePath}。原文件已保留，请修复后重试。`, { cause: error });
    }
    this.cached = migrate(parsed);
    return cloneSettings(this.cached);
  }

  private writeSettings(settings: SettingsSchema): void {
    const next = { ...settings, schemaVersion: 1 as const };
    if (this.staging) this.staged = next;
    else writeJsonAtomicSync(this.filePath, next);
    this.cached = cloneSettings(next);
    this.saved = true;
  }
}

function normalizeCopyImageFormat(value: unknown): CopyImageFormat {
  return value === "gif" ? "gif" : "png";
}

function normalizeBoardTrashRetentionDays(value: unknown): BoardTrashRetentionDays {
  return value === 0 || value === 1 || value === 3 || value === 7 || value === 30 || value === 90 ? value : 3;
}

function cloneSettings(settings: SettingsSchema): SettingsSchema {
  return {
    ...settings,
    providers: settings.providers.map((p) => ({ ...p, models: p.models ? [...p.models] : undefined })),
    textProviders: (settings.textProviders ?? []).map((p) => ({ ...p })),
    videoProviders: (settings.videoProviders ?? []).map((p) => ({ ...p, models: p.models ? [...p.models] : undefined })),
    audioProviders: (settings.audioProviders ?? []).map((p) => ({ ...p, models: p.models ? [...p.models] : undefined })),
    encryptedApiKeys: { ...(settings.encryptedApiKeys ?? {}) },
    customAppIcons: normalizeCustomAppIcons(settings.customAppIcons)
  };
}

/** 落盘里可能残留的、已废弃的 local-codex 记录（type 字段此时是运行时字符串）。 */
function isLegacyLocalCodex(entry: unknown): boolean {
  return typeof entry === "object" && entry !== null && (entry as { type?: unknown }).type === "local-codex";
}

/** 把任意落盘结构（含旧单 provider）规整为多 provider schema，并剔除已废弃的 local-codex。 */
function migrate(parsed: Partial<SettingsSchema> & LegacySettingsSchema): SettingsSchema {
  const encryptedApiKeys: Record<string, string> = { ...(parsed.encryptedApiKeys ?? {}) };
  let providers: ProviderConfig[];
  let activeProviderId: string;

  if (Array.isArray(parsed.providers) && parsed.providers.length > 0) {
    providers = parsed.providers
      .filter((p) => !isLegacyLocalCodex(p))
      .map((p) => normalizeProvider(p));
    if (providers.length === 0) providers = [defaultProvider];
    activeProviderId = providers.some((p) => p.id === parsed.activeProviderId)
      ? (parsed.activeProviderId as string)
      : providers[0].id;
  } else if (parsed.provider && !isLegacyLocalCodex(parsed.provider)) {
    // 旧单 provider → 单元素数组；旧单 key → 挂到该 provider id 下。
    const migrated = normalizeProvider(parsed.provider);
    providers = [migrated];
    activeProviderId = migrated.id;
    if (parsed.encryptedApiKey && !encryptedApiKeys[migrated.id]) {
      encryptedApiKeys[migrated.id] = parsed.encryptedApiKey;
    }
  } else {
    providers = [defaultProvider];
    activeProviderId = defaultProvider.id;
  }

  providers = ensureImageProviders(providers);
  if (!providers.some(p => p.id === activeProviderId)) activeProviderId = providers[0].id;

  // 文本 Provider：优先取新 schema；否则从旧 provider.promptModel 派生（含 key 拷贝）。
  let textProviders: TextProviderConfig[];
  let activeTextProviderId: string;
  if (Array.isArray(parsed.textProviders) && parsed.textProviders.length > 0) {
    textProviders = ensureTextProviders(parsed.textProviders.map((p) => normalizeTextProvider(p)));
    activeTextProviderId = textProviders.some((p) => p.id === parsed.activeTextProviderId)
      ? (parsed.activeTextProviderId as string)
      : textProviders[0].id;
  } else {
    const derived = deriveTextProvidersFromLegacy(
      Array.isArray(parsed.providers) ? (parsed.providers as LegacyProviderEntry[]) : parsed.provider ? [parsed.provider as LegacyProviderEntry] : [],
      encryptedApiKeys
    );
    textProviders = ensureTextProviders(derived);
    const preferred = `text-${activeProviderId}`;
    activeTextProviderId = textProviders.some((p) => p.id === preferred) ? preferred : textProviders[0].id;
  }

  textProviders = ensureCodexTextBindings(providers, textProviders);

  const legacyVideoProviders = providers
    .filter((provider) => /ark|方舟|seedance/i.test(`${provider.name} ${provider.model}`) || /volces\.com/i.test(provider.baseUrl))
    .map((provider) => normalizeVideoProvider({
      id: provider.id,
      name: provider.name,
      type: "ark",
      baseUrl: provider.baseUrl,
      model: provider.model
    }));
  const customVideoProviders = Array.isArray(parsed.videoProviders) && parsed.videoProviders.length > 0
    ? parsed.videoProviders.map((provider) => normalizeVideoProvider(provider))
    : legacyVideoProviders.length > 0
      ? legacyVideoProviders
      : [{ ...DEFAULT_VIDEO_PROVIDER_CONFIG }];
  const videoProviders = ensureVideoProviders(customVideoProviders);
  const activeVideoProviderId = videoProviders.some((provider) => provider.id === parsed.activeVideoProviderId)
    ? parsed.activeVideoProviderId as string
    : videoProviders[0].id;

  const audioProviders = Array.isArray(parsed.audioProviders) ? parsed.audioProviders : [];
  const activeAudioProviderId = audioProviders.some((p) => p.id === parsed.activeAudioProviderId)
    ? parsed.activeAudioProviderId : audioProviders[0]?.id ?? "";
  // 仅保留仍存在的 provider（图片、文本、视频与音频）的 key。
  const validIds = new Set([...providers.map((p) => p.id), ...textProviders.map((p) => p.id), ...videoProviders.map((p) => p.id), ...audioProviders.map((p) => p.id)]);
  for (const id of Object.keys(encryptedApiKeys)) {
    if (!validIds.has(id)) delete encryptedApiKeys[id];
  }

  return {
    providers,
    activeProviderId,
    textProviders,
    activeTextProviderId,
    videoProviders,
    activeVideoProviderId,
    audioProviders,
    activeAudioProviderId,
    language: normalizeAppLanguage(parsed.language),
    encryptedApiKeys,
    theme: parsed.theme || "system",
    promptDockAutoCollapse: parsed.promptDockAutoCollapse,
    advancedVideoModesEnabled: parsed.advancedVideoModesEnabled ?? false,
    canvasThumbnailPreview: parsed.canvasThumbnailPreview,
    canvasMinimapVisible: parsed.canvasMinimapVisible,
    boardCommentsEnabled: parsed.boardCommentsEnabled ?? false,
    boardGalleryEnabled: parsed.boardGalleryEnabled ?? false,
    canvasImageToolbarOnHover: parsed.canvasImageToolbarOnHover,
    canvasRelationshipHoverHighlight: parsed.canvasRelationshipHoverHighlight,
    wechatStickerExportEnabled: parsed.wechatStickerExportEnabled ?? false,
    onlineImageSharingEnabled: parsed.onlineImageSharingEnabled ?? false,
    copyImageFormat: normalizeCopyImageFormat(parsed.copyImageFormat),
    boardSmartSuggestionsEnabled: parsed.boardSmartSuggestionsEnabled,
    boardAssistantEnabled: parsed.boardAssistantEnabled ?? true,
    boardAssistantAgentModeEnabled: parsed.boardAssistantAgentModeEnabled ?? false,
    assistantAgentModeEnabled:
      parsed.assistantAgentModeEnabled ?? parsed.boardAssistantAgentModeEnabled ?? false,
    piAgentBuiltinTools: normalizePiAgentBuiltinTools(parsed.piAgentBuiltinTools),
    piAgentIterlayTools: parsed.piAgentIterlayTools === undefined
      ? [...PI_AGENT_DEFAULT_ITERLAY_TOOLS]
      : normalizeIterlayTools(parsed.piAgentIterlayTools),
    piAgentSkillPaths: normalizeStringList(parsed.piAgentSkillPaths),
    piAgentExtensionPaths: normalizeStringList(parsed.piAgentExtensionPaths),
    piAgentCustomSkillPaths: normalizeStringList(parsed.piAgentCustomSkillPaths),
    piAgentCustomExtensionPaths: normalizeStringList(parsed.piAgentCustomExtensionPaths),
    piAgentMaxTurns: normalizeInteger(parsed.piAgentMaxTurns, 4, 24, 12),
    piAgentWebSearchMaxResults: normalizeInteger(parsed.piAgentWebSearchMaxResults, 3, 10, 5),
    assistantScreenAccess: normalizeScreenAccessPolicy(parsed.assistantScreenAccess),
    boardAssistantAwarenessEnabled: parsed.boardAssistantAwarenessEnabled ?? true,
    boardAssistantIntentSuggestionsEnabled: parsed.boardAssistantIntentSuggestionsEnabled,
    boardAssistantIntentSuggestionCount: normalizeAssistantIntentSuggestionCount(
      parsed.boardAssistantIntentSuggestionCount
    ),
    editSmartSuggestionsEnabled: parsed.editSmartSuggestionsEnabled ?? true,
    memoryEnabled: parsed.memoryEnabled ?? true,
    memoryUsageLevel: normalizeMemoryUsageLevel(parsed.memoryUsageLevel),
    editInfoMode: parsed.editInfoMode,
    imageDoubleClickAction: parsed.imageDoubleClickAction,
    downloadDirectory: parsed.downloadDirectory,
    cliDefaultBoardId: typeof parsed.cliDefaultBoardId === "string" ? parsed.cliDefaultBoardId.trim() : "",
    defaultCodingAgent: parsed.defaultCodingAgent === "claude-code" ? "claude-code" : "codex",
    versionSeparationMode: parsed.versionSeparationMode === "extract" ? "extract" : "copy",
    generateButtonStyle:
      parsed.generateButtonStyle === "glow" ||
      parsed.generateButtonStyle === "prismatic" ||
      parsed.generateButtonStyle === "send"
        ? parsed.generateButtonStyle
        : "folded",
    appIcon: normalizeStoredAppIcon(parsed.appIcon, parsed.customAppIcons),
    customAppIcons: normalizeCustomAppIcons(parsed.customAppIcons),
    boardTrashRetentionDays: normalizeBoardTrashRetentionDays(parsed.boardTrashRetentionDays)
  };
}

function normalizeCustomAppIcons(value: unknown): CustomAppIcon[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry): CustomAppIcon[] => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<CustomAppIcon>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 80) : "";
    const dataUrl = typeof candidate.dataUrl === "string" ? candidate.dataUrl : "";
    const createdAt = typeof candidate.createdAt === "string" ? candidate.createdAt : "";
    if (!id || seen.has(id) || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/u.test(dataUrl)) return [];
    seen.add(id);
    return [{ id, name: name || "自定义头像", dataUrl, createdAt }];
  });
}

function normalizeStoredAppIcon(value: unknown, customIcons: unknown): AppIconPreference {
  if (value === "mascot") return "mascot";
  if (typeof value === "string" && value.startsWith("custom:")) {
    const id = value.slice("custom:".length);
    if (normalizeCustomAppIcons(customIcons).some((icon) => icon.id === id)) return `custom:${id}`;
  }
  return "default";
}

function normalizeMemoryUsageLevel(value: unknown): MemoryUsageLevel {
  return value === "cautious" || value === "active" ? value : "balanced";
}

function normalizeAssistantIntentSuggestionCount(value: unknown): AssistantIntentSuggestionCount {
  return value === 4 || value === 5 ? value : 3;
}

const PI_AGENT_BUILTIN_TOOL_NAMES = new Set<PiAgentBuiltinToolName>([
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls"
]);

function normalizePiAgentBuiltinTools(value: unknown): PiAgentBuiltinToolName[] {
  if (!Array.isArray(value)) return ["read", "grep", "find", "ls"];
  return Array.from(new Set(value.filter(
    (item): item is PiAgentBuiltinToolName => typeof item === "string" && PI_AGENT_BUILTIN_TOOL_NAMES.has(item as PiAgentBuiltinToolName)
  )));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  )).slice(0, 256);
}

function normalizeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

/** 规整单个 provider：补平台默认值；未知/旧类型继续按 OpenAI-compatible 迁移。 */
export function normalizeProvider(provider?: Partial<ProviderConfig>): ProviderConfig {
  const normalized = normalizeProviderInternal(provider);
  normalized.models = getProviderModels(normalized);
  normalized.model = normalized.models[0] ?? normalized.model;
  // 旧 schema 把文本模型寄生在图片 provider 上；迁移为独立文本 Provider 后剥掉残留字段，避免再次落盘。
  delete (normalized as unknown as Record<string, unknown>).promptModel;
  return normalized;
}

export function normalizeVideoProvider(provider?: Partial<VideoProviderConfig>): VideoProviderConfig {
  if (provider?.type === "official" || provider?.id === OFFICIAL_VIDEO_PROVIDER_ID) {
    return { ...OFFICIAL_VIDEO_PROVIDER_CONFIG };
  }
  const type = provider?.type === "fal" || provider?.type === "openrouter" || provider?.type === "minimax" ? provider.type : "ark";
  const defaultBaseUrl = type === "fal"
    ? "https://queue.fal.run"
    : type === "openrouter"
      ? "https://openrouter.ai/api"
      : type === "minimax"
        ? "https://api.minimax.io"
      : DEFAULT_VIDEO_PROVIDER_CONFIG.baseUrl;
  const defaultModel = type === "fal"
    ? "fal-ai/kling-video/v2.1/standard/text-to-video"
    : type === "openrouter"
      ? "google/veo-3.1-fast"
      : type === "minimax"
        ? "MiniMax-H3"
      : DEFAULT_VIDEO_PROVIDER_CONFIG.model;
  const rawBaseUrl = provider?.baseUrl?.trim() || defaultBaseUrl;
  const baseUrl = type === "ark" && /ark\.cn-beijing\.volces\.com\/?$/i.test(rawBaseUrl)
    ? `${rawBaseUrl.replace(/\/+$/, "")}/api/v3`
    : rawBaseUrl.replace(/\/+$/, "");
  const connectionProviderId = type === "fal" || type === "openrouter" ? provider?.connectionProviderId?.trim() : "";
  const models = normalizeVideoModels(provider?.model, provider?.models, defaultModel);
  return {
    id: provider?.id?.trim() || `video-provider-${crypto.randomUUID().slice(0, 8)}`,
    name: provider?.name?.trim() || (type === "fal" ? "fal.ai" : type === "openrouter" ? "OpenRouter" : type === "minimax" ? "MiniMax" : DEFAULT_VIDEO_PROVIDER_CONFIG.name),
    type,
    ...(connectionProviderId ? { connectionProviderId } : {}),
    baseUrl,
    models,
    model: models[0]
  };
}

function normalizeVideoModels(model: string | undefined, models: string[] | undefined, fallback: string): string[] {
  const seen = new Set<string>();
  const configured = [model, ...(Array.isArray(models) ? models : [])];
  const values = configured.some((value) => Boolean(value?.trim())) ? configured : [fallback];
  return values.flatMap((value) => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [normalized];
  });
}

function ensureVideoProviders(providers: VideoProviderConfig[]): VideoProviderConfig[] {
  const custom = providers.filter((provider) => provider.id !== OFFICIAL_VIDEO_PROVIDER_ID && provider.type !== "official");
  return custom.length ? custom : [{ ...DEFAULT_VIDEO_PROVIDER_CONFIG }];
}

function normalizeProviderInternal(provider?: Partial<ProviderConfig>): ProviderConfig {
  if (provider?.type === "official" || provider?.id === OFFICIAL_PROVIDER_ID) {
    return { ...OFFICIAL_PROVIDER_CONFIG };
  }
  if (provider?.type === "fal") {
    const merged = { ...defaultFalProvider, ...provider, type: "fal" as const };
    return {
      ...merged,
      id: merged.id || defaultFalProvider.id,
      name: merged.name || "fal.ai",
      baseUrl: merged.baseUrl || defaultFalProvider.baseUrl,
      model: merged.model || defaultFalProvider.model,
      supportsReferenceImages: merged.supportsReferenceImages ?? true,
      apiMode: undefined,
      compatResponseFormat: undefined
    };
  }

  if (provider?.type === "codex-oauth") {
    const merged = { ...defaultCodexProvider, ...provider, type: "codex-oauth" as const };
    return {
      ...merged,
      id: merged.id || `codex-oauth-${Date.now()}`,
      name: merged.name?.trim() || defaultCodexProvider.name,
      apiMode: "responses",
      baseUrl: "",
      generationEndpoint: "",
      referenceEndpoint: "",
      model: merged.model?.trim() || defaultCodexProvider.model,
      supportsReferenceImages: true,
      compatResponseFormat: undefined,
      referenceModel: undefined,
      falSizeMode: undefined,
      falReferenceInput: undefined
    };
  }

  if (provider?.type === "openrouter") {
    return normalizeKnownProvider(provider, defaultOpenRouterProvider);
  }
  if (provider?.type === "bailian") {
    return normalizeKnownProvider(provider, defaultBailianProvider);
  }
  if (provider?.type === "ark") {
    return normalizeKnownProvider(provider, defaultArkProvider);
  }
  if (provider?.type === "poe") {
    return normalizeKnownProvider(provider, defaultPoeProvider);
  }

  const merged = { ...defaultProvider, ...provider, type: "openai-compatible" as const };
  // apiMode 优先取入参显式值；缺省时按 generation endpoint 推断（不沿用默认值，否则推断失效）。
  const apiMode: ProviderConfig["apiMode"] =
    provider?.apiMode || (/\/responses\/?$/.test(merged.generationEndpoint) ? "responses" : "images");
  return {
    ...merged,
    id: merged.id || defaultProvider.id,
    name: merged.name || merged.baseUrl || "Provider",
    apiMode,
    supportsReferenceImages: merged.supportsReferenceImages ?? true
  };
}

function ensureImageProviders(providers: ProviderConfig[]): ProviderConfig[] {
  const custom = providers.filter((provider) => provider.id !== OFFICIAL_PROVIDER_ID && provider.type !== "official");
  return custom.length ? custom : [{ ...COMMUNITY_IMAGE_PROVIDER }];
}

export function normalizeTextProvider(provider?: Partial<TextProviderConfig>): TextProviderConfig {
  if (provider?.type === "official" || provider?.id === OFFICIAL_TEXT_PROVIDER_ID) {
    return { ...OFFICIAL_TEXT_PROVIDER_CONFIG };
  }
  if (provider?.type === "codex-oauth") {
    const id = provider.id?.trim() || `text-codex-oauth-${Date.now()}`;
    return {
      id,
      name: provider.name?.trim() || "Codex / ChatGPT",
      type: "codex-oauth",
      authProviderId: provider.authProviderId?.trim() || id,
      baseUrl: "",
      model: provider.model?.trim() || "gpt-5.4-mini"
    };
  }
  return {
    id: provider?.id?.trim() || `text-provider-${Date.now()}`,
    name: provider?.name?.trim() || "文本 Provider",
    type: "openai-compatible",
    baseUrl: provider?.baseUrl?.trim().replace(/\/+$/, "") ?? "",
    model: provider?.model?.trim() ?? ""
  };
}

function ensureTextProviders(providers: TextProviderConfig[]): TextProviderConfig[] {
  const custom = providers.filter(
    (provider) => provider.id !== OFFICIAL_TEXT_PROVIDER_ID && provider.type !== "official"
  );
  return custom.length ? custom : [{ ...COMMUNITY_TEXT_PROVIDER }];
}

function ensureCodexTextBindings(
  imageProviders: ProviderConfig[],
  textProviders: TextProviderConfig[]
): TextProviderConfig[] {
  const next = [...textProviders];
  for (const imageProvider of imageProviders) {
    if (imageProvider.type !== "codex-oauth" || imageProvider.autoBindText === false) continue;
    if (next.some((provider) =>
      provider.type === "codex-oauth" && (provider.authProviderId || provider.id) === imageProvider.id
    )) continue;
    const preferredId = `text-${imageProvider.id}`;
    const id = next.some((provider) => provider.id === preferredId)
      ? `text-codex-${imageProvider.id}`
      : preferredId;
    next.push({
      id,
      name: imageProvider.name || "Codex / ChatGPT",
      type: "codex-oauth",
      authProviderId: imageProvider.id,
      baseUrl: "",
      model: "gpt-5.4-mini"
    });
  }
  return next;
}

/**
 * 旧版把文本模型（promptModel）寄生在图片 provider 上：
 * 为每个配置了 promptModel 的 provider 派生一个独立文本 Provider，
 * 并把它的 API Key 密文拷贝到新 id 下（bailian 需要补 /compatible-mode 前缀）。
 */
function deriveTextProvidersFromLegacy(
  entries: LegacyProviderEntry[],
  encryptedApiKeys: Record<string, string>
): TextProviderConfig[] {
  const derived: TextProviderConfig[] = [];
  for (const entry of entries) {
    const promptModel = entry.promptModel?.trim();
    const sourceId = entry.id?.trim();
    if (!promptModel || !sourceId || entry.type === "official" || entry.type === "fal") continue;
    const rawBase = (entry.baseUrl ?? "").trim().replace(/\/+$/, "");
    if (!rawBase) continue;
    const baseUrl = entry.type === "bailian" && !rawBase.includes("/compatible-mode")
      ? `${rawBase}/compatible-mode`
      : rawBase;
    const textId = `text-${sourceId}`;
    derived.push({
      id: textId,
      name: entry.name?.trim() || baseUrl,
      type: "openai-compatible",
      baseUrl,
      model: promptModel
    });
    if (encryptedApiKeys[sourceId] && !encryptedApiKeys[textId]) {
      encryptedApiKeys[textId] = encryptedApiKeys[sourceId];
    }
  }
  return derived;
}

function normalizeKnownProvider(provider: Partial<ProviderConfig>, defaults: ProviderConfig): ProviderConfig {
  const merged = { ...defaults, ...provider, type: defaults.type };
  return {
    ...merged,
    id: merged.id || defaults.id,
    name: merged.name || defaults.name,
    baseUrl: merged.baseUrl || defaults.baseUrl,
    generationEndpoint: merged.generationEndpoint || defaults.generationEndpoint,
    model: merged.model || defaults.model,
    supportsReferenceImages: merged.supportsReferenceImages ?? defaults.supportsReferenceImages,
    apiMode: defaults.apiMode,
    compatResponseFormat: undefined,
    falSizeMode: undefined,
    falReferenceInput: undefined
  };
}

function normalizeIterlayTools(value: unknown): string[] {
  const tools = normalizeStringList(value);
  const previousDefaults = PI_AGENT_DEFAULT_ITERLAY_TOOLS.filter(name => name !== "create_canvas" && name !== "update_canvas");
  // Upgrade the full former default set, preserving deliberately restricted lists.
  return previousDefaults.every(name => tools.includes(name)) ? [...new Set([...tools, "create_canvas", "update_canvas"])] : tools;
}
