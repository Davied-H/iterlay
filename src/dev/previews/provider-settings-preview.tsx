import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import type { ImageWorkbenchApi } from "../../../electron/preload/preload";
import type {
  FalModelCategory,
  OnlineShareSession,
  ProviderConfig,
  TextProviderConfig,
  VideoProviderConfig
} from "@shared/types";
import type { CodingAgentIntegrationStatus } from "@shared/agent-integration";
import type { ProviderSettingsDialogProps } from "@/components/workbench/settings/provider-settings-components";
import type { LicenseStatusSnapshot } from "@shared/licensing";
import { LicenseContext } from "@/components/licensing/license-context";
import { ProviderSettingsDialog } from "@/components/workbench/ProviderSettingsDialog";
import { OnlineShareManagerDialog } from "@/components/workbench/OnlineShareManagerDialog";
import { I18nProvider, useI18n } from "@/i18n";
import { LegacyI18nBridge } from "@/i18n/LegacyI18nBridge";
import sceneMasterAvatar from "@/assets/scene-master-avatar.png";
import "@/styles.css";

const EMPTY_IMAGE_PROVIDERS: ProviderConfig[] = [];
const EMPTY_TEXT_PROVIDERS: TextProviderConfig[] = [];
const EMPTY_VIDEO_PROVIDERS: VideoProviderConfig[] = [];

const imageProviders: ProviderConfig[] = [
  {
    id: "fal-personal",
    name: "fal.ai 工作室",
    type: "fal",
    baseUrl: "https://queue.fal.run",
    generationEndpoint: "",
    referenceEndpoint: "",
    model: "fal-ai/nano-banana-pro",
    models: ["fal-ai/nano-banana-pro", "fal-ai/flux-pro/kontext/max"],
    referenceModel: "fal-ai/nano-banana-pro/edit",
    supportsReferenceImages: true
  },
  {
    id: "me-image",
    name: "自定义 API",
    type: "openai-compatible",
    apiMode: "responses",
    baseUrl: "https://api.example.com",
    generationEndpoint: "/v1/responses",
    referenceEndpoint: "",
    model: "gpt-image-2",
    models: ["gpt-image-2", "ideogram/v4", "bytedance-seed/seedream-4.5"],
    supportsReferenceImages: true
  },
  {
    id: "codex-personal",
    name: "Codex / ChatGPT",
    type: "codex-oauth",
    apiMode: "responses",
    baseUrl: "",
    generationEndpoint: "",
    referenceEndpoint: "",
    model: "gpt-image-2",
    supportsReferenceImages: true
  }
];

const textProviders: TextProviderConfig[] = [
  {
    id: "me-text",
    name: "日常文本",
    type: "openai-compatible",
    baseUrl: "https://api.example.com/",
    model: "gpt-5.5"
  },
  {
    id: "text-codex-personal",
    name: "Codex / ChatGPT",
    type: "codex-oauth",
    authProviderId: "codex-personal",
    baseUrl: "",
    model: "gpt-5.4-mini"
  }
];

const videoProviders: VideoProviderConfig[] = [
  {
    id: "volcengine-ark-video",
    name: "火山方舟",
    type: "ark",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-seedance-1-5-pro-250528",
    models: ["doubao-seedance-1-5-pro-250528", "doubao-seedance-2-0-pro-250528"]
  },
  {
    id: "fal-video-shared",
    name: "fal.ai 视频",
    type: "fal",
    connectionProviderId: "fal-personal",
    baseUrl: "https://queue.fal.run",
    model: "fal-ai/kling-video/v2.1/standard/text-to-video"
  },
  {
    id: "openrouter-video-shared",
    name: "OpenRouter 视频",
    type: "openrouter",
    baseUrl: "https://openrouter.ai/api",
    model: "google/veo-3.1-fast",
    models: ["google/veo-3.1-fast", "bytedance/seedance-2.0-fast"]
  }
];

let previewAppIcon: "default" | "mascot" | `custom:${string}` = "mascot";
let previewCustomAppIcons = [{
  id: "preview-avatar",
  name: "灵感伙伴",
  dataUrl: sceneMasterAvatar,
  createdAt: "2026-07-23T00:00:00.000Z"
}];
let previewOnlineShare: OnlineShareSession | null = {
  id: "preview-share",
  kind: "image",
  title: "summer-campaign-final-product-image-v12.png",
  url: "https://share.iterlay.example/preview-share",
  startedAt: Date.now() - 4 * 60_000,
  expiresAt: Date.now() + 56 * 60_000,
  origin: {
    boardId: "preview-board",
    nodeIds: ["preview-node-1", "preview-node-2", "preview-node-3"]
  }
};

const previewLicenseStatus: LicenseStatusSnapshot = {
  state: "LICENSED",
  reason: "license_active",
  licenseEmail: "preview@iterlay.app",
  activatedAt: "2026-07-18T08:30:00.000Z",
  capabilities: {
    mode: "full",
    canView: true,
    canExport: true,
    canGenerate: true,
    canEdit: true,
    canImport: true,
    canStartTrial: false,
    canActivate: false
  }
};

const previewCodingStatus: CodingAgentIntegrationStatus = {
  development: true,
  cli: { installed: true, pathConfigured: true, path: "/Users/preview/.local/bin/iterlay" },
  clients: [
    { id: "codex", detected: true, detection: "installed", skillInstalled: false, skillManaged: false, skillPath: "/Users/preview/.codex/skills/iterlay-workspace", legacyConfigured: false },
    { id: "claude-code", detected: true, detection: "installed", skillInstalled: true, skillManaged: true, skillPath: "/Users/preview/.claude/skills/iterlay-workspace", legacyConfigured: false }
  ]
};

const previewApi = {
  getCodingAgentStatus: async () => structuredClone(previewCodingStatus),
  installCli: async () => structuredClone(previewCodingStatus),
  installAgentSkill: async (id: "codex" | "claude-code") => {
    const client = previewCodingStatus.clients.find((item) => item.id === id);
    if (client) { client.skillInstalled = true; client.skillManaged = true; client.legacyConfigured = false; }
    return structuredClone(previewCodingStatus);
  },
  removeAgentSkill: async (id: "codex" | "claude-code") => {
    const client = previewCodingStatus.clients.find((item) => item.id === id);
    if (client) client.skillInstalled = false;
    return structuredClone(previewCodingStatus);
  },
  listMemories: async () => [],
  testProvider: async () => ({ ok: true, message: "示例连接验证成功（预览结果）。" }),
  testTextProvider: async () => ({ ok: true, message: "示例连接验证成功（预览结果）。" }),
  testVideoProvider: async () => ({ ok: true, message: "示例连接验证成功（预览结果）。" }),
  onPiAgentLog: () => () => undefined,
  getPiAgentLogs: async () => ({ entries: [], logPath: "/Users/preview/Library/Logs/Iterlay/pi-agent.log" }),
  getPiAgentResources: async () => ({
    builtinTools: [
      { name: "read", description: "读取工作目录中的文件。", risk: "read" },
      { name: "bash", description: "执行本地 Shell 命令。", risk: "execute" }
    ],
    iterlayTools: [
      { name: "get_active_board", description: "读取当前画板。" },
      { name: "generate_image", description: "使用当前 Provider 生成图片。" }
    ],
    skills: Array.from({ length: 19 }, (_, index) => ({
      id: `/Users/preview/.pi/agent/skills/skill-${index + 1}/SKILL.md`,
      kind: "skill",
      name: index === 0 ? "visual-direction" : `creative-skill-${String(index + 1).padStart(2, "0")}`,
      description: index === 0
        ? "为画板提供视觉方向和提示词结构。"
        : `用于第 ${index + 1} 类创作任务的工作流和检查规则。`,
      path: `/Users/preview/.pi/agent/skills/skill-${index + 1}/SKILL.md`,
      source: index % 4 === 0 ? "package" : index % 3 === 0 ? "project" : "system",
      packageName: index % 4 === 0 ? "pi-creative-pack" : undefined
    })),
    extensions: Array.from({ length: 12 }, (_, index) => ({
      id: `/Users/preview/.pi/agent/extensions/extension-${index + 1}.ts`,
      kind: "extension",
      name: index === 0 ? "review" : `extension-${String(index + 1).padStart(2, "0")}`,
      description: index === 0 ? "检查工具调用并补充运行日志。" : `提供第 ${index + 1} 组本地 Agent 扩展能力。`,
      path: `/Users/preview/.pi/agent/extensions/extension-${index + 1}.ts`,
      source: index % 3 === 0 ? "package" : "system",
      packageName: index % 3 === 0 ? "pi-extension-pack" : undefined,
      warning: "扩展是本地可执行代码。"
    })),
    warnings: []
  }),
  getPiAgentResourceDetail: async (resourcePath: string) => ({
    id: resourcePath,
    kind: resourcePath.endsWith(".ts") ? "extension" : "skill",
    name: resourcePath.endsWith(".ts") ? "review" : "visual-direction",
    description: resourcePath.endsWith(".ts")
      ? "在 Agent 执行前检查工具调用，并补充运行日志。"
      : "为画板提供视觉方向和提示词结构。",
    path: resourcePath,
    source: "system",
    warning: resourcePath.endsWith(".ts") ? "扩展是本地可执行代码，仅启用可信来源。" : undefined,
    content: resourcePath.endsWith(".ts")
      ? "export default function reviewExtension(pi) {\n  // Register review hooks and tools.\n}"
      : "---\nname: visual-direction\ndescription: 为画板提供视觉方向和提示词结构。\n---\n\n# Visual Direction"
  }),
  listAssistantSkills: async () => [{
    id: "iterlay-board-image",
    name: "iterlay-board-image",
    description: "画板图片创作、提示词与方向建议。",
    hasOverride: false,
    activePath: "/Applications/Iterlay/resources/skills/iterlay-board-image/SKILL.md"
  }],
  getAssistantSkill: async (id: string) => ({
    id,
    name: id,
    description: "Preview assistant Skill",
    hasOverride: false,
    activePath: `/Applications/Iterlay/resources/skills/${id}/SKILL.md`,
    content: `---\nname: ${id}\ndescription: Preview assistant Skill\n---\n\n# Instructions\n`,
    builtInContent: `---\nname: ${id}\ndescription: Preview assistant Skill\n---\n\n# Instructions\n`
  }),
  saveAssistantSkill: async (id: string, content: string) => ({
    id,
    name: id,
    description: "Preview assistant Skill",
    hasOverride: true,
    activePath: `/Users/preview/assistant-skills/${id}/SKILL.md`,
    content,
    builtInContent: content
  }),
  resetAssistantSkill: async (id: string) => ({
    id,
    name: id,
    description: "Preview assistant Skill",
    hasOverride: false,
    activePath: `/Applications/Iterlay/resources/skills/${id}/SKILL.md`,
    content: `---\nname: ${id}\ndescription: Preview assistant Skill\n---\n`,
    builtInContent: `---\nname: ${id}\ndescription: Preview assistant Skill\n---\n`
  }),
  clearPiAgentLogs: async () => ({ ok: true }),
  getSettings: async () => ({
    downloadDirectory: "",
    appIcon: previewAppIcon,
    customAppIcons: previewCustomAppIcons,
    codexAuthStatusByProviderId: {
      "codex-personal": {
        state: "connected",
        email: "preview@example.com",
        planType: "Plus"
      }
    }
  }),
  getMemoryStats: async () => ({ eventCount: 24, activeMemoryCount: 8, candidateMemoryCount: 2 }),
  clearAppCache: async () => ({ ok: true }),
  openPath: async () => ({ ok: true }),
  getActiveOnlineShare: async () => previewOnlineShare,
  stopOnlineShare: async () => {
    previewOnlineShare = null;
    return { ok: true };
  },
  setAppIcon: async (appIcon: typeof previewAppIcon) => {
    previewAppIcon = appIcon;
    return { ok: true, appIcon };
  },
  uploadAppIcon: async ({ name, dataUrl }: { name: string; dataUrl: string }) => {
    const icon = { id: crypto.randomUUID(), name, dataUrl, createdAt: new Date().toISOString() };
    previewCustomAppIcons = [...previewCustomAppIcons, icon];
    previewAppIcon = `custom:${icon.id}`;
    return { appIcon: previewAppIcon, customAppIcons: previewCustomAppIcons };
  },
  deleteAppIcon: async (id: string) => {
    previewCustomAppIcons = previewCustomAppIcons.filter((icon) => icon.id !== id);
    if (previewAppIcon === `custom:${id}`) previewAppIcon = "mascot";
    return { appIcon: previewAppIcon, customAppIcons: previewCustomAppIcons };
  },
  listProviderModels: async () => [
    { id: "gpt-image-2", ownedBy: "OpenAI" },
    { id: "ideogram/v4", ownedBy: "Ideogram" },
    { id: "bytedance-seed/seedream-4.5", ownedBy: "ByteDance" },
    { id: "black-forest-labs/flux.2-pro", ownedBy: "Black Forest Labs" }
  ],
  listVideoProviderModels: async () => [
    { id: "google/veo-3.1", ownedBy: "google" },
    { id: "google/veo-3.1-fast", ownedBy: "google" },
    { id: "bytedance/seedance-2.0", ownedBy: "bytedance" },
    { id: "openai/sora-2-pro", ownedBy: "openai" }
  ],
  listFalModels: async (category: FalModelCategory) => category === "text-to-video" ? [
    { endpointId: "fal-ai/kling-video/v2.1/standard/text-to-video", displayName: "Kling Video 2.1 Standard", category: "text-to-video", price: { unitPrice: 0.05, unit: "second", currency: "USD" } },
    { endpointId: "fal-ai/veo3.1/fast", displayName: "Veo 3.1 Fast", category: "text-to-video", price: { unitPrice: 0.15, unit: "second", currency: "USD" } }
  ] : category === "image-to-video" ? [
    { endpointId: "fal-ai/kling-video/v2.1/standard/image-to-video", displayName: "Kling Video 2.1 Image to Video", category: "image-to-video", price: { unitPrice: 0.05, unit: "second", currency: "USD" } }
  ] : [
    { endpointId: "fal-ai/nano-banana-pro", displayName: "Nano Banana Pro", category: "text-to-image" },
    { endpointId: "fal-ai/flux-pro/kontext/max", displayName: "FLUX Kontext Max", category: "text-to-image" },
    { endpointId: "fal-ai/recraft/v3/text-to-image", displayName: "Recraft V3", category: "text-to-image" }
  ]
} as unknown as ImageWorkbenchApi;

(globalThis as typeof globalThis & { imageWorkbench: ImageWorkbenchApi }).imageWorkbench = previewApi;

type PreviewPreferences = Pick<ProviderSettingsDialogProps,
  "promptDockAutoCollapse" |
  "advancedVideoModesEnabled" |
  "canvasThumbnailPreview" |
  "canvasMinimapVisible" |
  "boardCommentsEnabled" |
  "boardGalleryEnabled" |
  "canvasImageToolbarOnHover" |
  "canvasRelationshipHoverHighlight" |
  "wechatStickerExportEnabled" |
  "onlineImageSharingEnabled" |
  "copyImageFormat" |
  "boardSmartSuggestionsEnabled" |
  "boardAssistantEnabled" |
  "boardAssistantAgentModeEnabled" |
  "piAgentBuiltinTools" |
  "piAgentIterlayTools" |
  "piAgentSkillPaths" |
  "piAgentExtensionPaths" |
  "piAgentCustomSkillPaths" |
  "piAgentCustomExtensionPaths" |
  "piAgentMaxTurns" |
  "piAgentWebSearchMaxResults" |
  "boardAssistantAwarenessEnabled" |
  "boardAssistantIntentSuggestionsEnabled" |
  "boardAssistantIntentSuggestionCount" |
  "editSmartSuggestionsEnabled" |
  "memoryEnabled" |
  "memoryUsageLevel" |
  "editInfoMode" |
  "imageDoubleClickAction" |
  "versionSeparationMode" |
  "generateButtonStyle" |
  "downloadDirectory"
>;

function Preview(): React.ReactElement {
  const params = new URLSearchParams(window.location.search);
  const [theme, setTheme] = useState<"light" | "dark">(params.get("theme") === "dark" ? "dark" : "light");
  const [open, setOpen] = useState(true);
  const [shareManagerOpen, setShareManagerOpen] = useState(false);
  const { language, setLanguage } = useI18n();
  const [preferences, setPreferences] = useState<PreviewPreferences>({
    promptDockAutoCollapse: true,
    advancedVideoModesEnabled: false,
    canvasThumbnailPreview: false,
    canvasMinimapVisible: true,
    boardCommentsEnabled: false,
    boardGalleryEnabled: false,
    canvasImageToolbarOnHover: false,
    canvasRelationshipHoverHighlight: false,
    wechatStickerExportEnabled: false,
    onlineImageSharingEnabled: false,
    copyImageFormat: "png",
    boardSmartSuggestionsEnabled: true,
    boardAssistantEnabled: true,
    boardAssistantAgentModeEnabled: false,
    piAgentBuiltinTools: ["read", "grep", "find", "ls"],
    piAgentIterlayTools: [],
    piAgentSkillPaths: [],
    piAgentExtensionPaths: [],
    piAgentCustomSkillPaths: [],
    piAgentCustomExtensionPaths: [],
    piAgentMaxTurns: 12,
    piAgentWebSearchMaxResults: 5,
    boardAssistantAwarenessEnabled: false,
    boardAssistantIntentSuggestionsEnabled: true,
    boardAssistantIntentSuggestionCount: 3,
    editSmartSuggestionsEnabled: false,
    memoryEnabled: true,
    memoryUsageLevel: "balanced",
    editInfoMode: "panel",
    imageDoubleClickAction: "focus",
    versionSeparationMode: "copy",
    generateButtonStyle: "folded",
    downloadDirectory: ""
  });
  function setPreference<K extends keyof PreviewPreferences>(key: K, value: PreviewPreferences[K]): void {
    setPreferences((current) => ({ ...current, [key]: value }));
  }
  const empty = params.get("scenario") === "empty";
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (requested === "en-US" || requested === "zh-CN") setLanguage(requested);
  }, [setLanguage]);
  const entryPoint = new URLSearchParams(window.location.search).get("entryPoint") === "model-management"
    ? "model-management"
    : "default";
  return (
    <main className="min-h-screen bg-muted p-8 text-foreground">
      <div className="flex gap-2">
        <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => setOpen(true)}>
          打开设置
        </button>
        <button type="button" className="rounded-md border border-border bg-background px-3 py-2 text-sm" onClick={() => setShareManagerOpen(true)}>
          打开在线分享管理
        </button>
      </div>
      <LicenseContext.Provider value={{
        status: previewLicenseStatus,
        busy: false,
        openCenter: () => undefined,
        openActivation: () => undefined
      }}>
        <ProviderSettingsDialog
          open={open}
          onOpenChange={setOpen}
          entryPoint={entryPoint}
          providers={empty ? EMPTY_IMAGE_PROVIDERS : imageProviders}
          activeProviderId="fal-personal"
          textProviders={empty ? EMPTY_TEXT_PROVIDERS : textProviders}
          activeTextProviderId="me-text"
          videoProviders={empty ? EMPTY_VIDEO_PROVIDERS : videoProviders}
          activeVideoProviderId="volcengine-ark-video"
          providerKeyStatus={{
            "fal-personal": true,
            "me-image": true,
            "me-text": true,
            "codex-personal": true,
            "text-codex-personal": true,
            "volcengine-ark-video": true,
            "fal-video-shared": true,
            "openrouter-video-shared": true
          }}
          bridgeError={null}
          language={language}
          onLanguageChange={setLanguage}
          theme={theme}
          onThemeChange={(value) => setTheme(value === "dark" ? "dark" : "light")}
           promptDockAutoCollapse={preferences.promptDockAutoCollapse}
           onPromptDockAutoCollapseChange={(value) => setPreference("promptDockAutoCollapse", value)}
           advancedVideoModesEnabled={preferences.advancedVideoModesEnabled}
           onAdvancedVideoModesEnabledChange={(value) => setPreference("advancedVideoModesEnabled", value)}
           canvasThumbnailPreview={preferences.canvasThumbnailPreview}
          onCanvasThumbnailPreviewChange={(value) => setPreference("canvasThumbnailPreview", value)}
          canvasMinimapVisible={preferences.canvasMinimapVisible}
          onCanvasMinimapVisibleChange={(value) => setPreference("canvasMinimapVisible", value)}
          boardCommentsEnabled={preferences.boardCommentsEnabled}
          onBoardCommentsEnabledChange={(value) => setPreference("boardCommentsEnabled", value)}
          boardGalleryEnabled={preferences.boardGalleryEnabled}
          onBoardGalleryEnabledChange={(value) => setPreference("boardGalleryEnabled", value)}
          canvasImageToolbarOnHover={preferences.canvasImageToolbarOnHover}
          onCanvasImageToolbarOnHoverChange={(value) => setPreference("canvasImageToolbarOnHover", value)}
          canvasRelationshipHoverHighlight={preferences.canvasRelationshipHoverHighlight}
          onCanvasRelationshipHoverHighlightChange={(value) => setPreference("canvasRelationshipHoverHighlight", value)}
          wechatStickerExportEnabled={preferences.wechatStickerExportEnabled}
          onWechatStickerExportEnabledChange={(value) => setPreference("wechatStickerExportEnabled", value)}
          onlineImageSharingEnabled={preferences.onlineImageSharingEnabled}
          onOnlineImageSharingEnabledChange={(value) => setPreference("onlineImageSharingEnabled", value)}
          copyImageFormat={preferences.copyImageFormat}
          onCopyImageFormatChange={(value) => setPreference("copyImageFormat", value)}
          boardSmartSuggestionsEnabled={preferences.boardSmartSuggestionsEnabled}
          onBoardSmartSuggestionsEnabledChange={(value) => setPreference("boardSmartSuggestionsEnabled", value)}
          boardAssistantEnabled={preferences.boardAssistantEnabled}
          onBoardAssistantEnabledChange={(value) => setPreference("boardAssistantEnabled", value)}
          boardAssistantAgentModeEnabled={preferences.boardAssistantAgentModeEnabled}
          boardAssistantAgentModeAvailable
          boardAssistantAgentModeModel="gpt-5.5"
          onBoardAssistantAgentModeEnabledChange={(value) => setPreference("boardAssistantAgentModeEnabled", value)}
          piAgentBuiltinTools={preferences.piAgentBuiltinTools}
          onPiAgentBuiltinToolsChange={(value) => setPreference("piAgentBuiltinTools", value)}
          piAgentIterlayTools={preferences.piAgentIterlayTools}
          onPiAgentIterlayToolsChange={(value) => setPreference("piAgentIterlayTools", value)}
          piAgentSkillPaths={preferences.piAgentSkillPaths}
          onPiAgentSkillPathsChange={(value) => setPreference("piAgentSkillPaths", value)}
          piAgentExtensionPaths={preferences.piAgentExtensionPaths}
          onPiAgentExtensionPathsChange={(value) => setPreference("piAgentExtensionPaths", value)}
          piAgentCustomSkillPaths={preferences.piAgentCustomSkillPaths}
          onPiAgentCustomSkillPathsChange={(value) => setPreference("piAgentCustomSkillPaths", value)}
          piAgentCustomExtensionPaths={preferences.piAgentCustomExtensionPaths}
          onPiAgentCustomExtensionPathsChange={(value) => setPreference("piAgentCustomExtensionPaths", value)}
          piAgentMaxTurns={preferences.piAgentMaxTurns}
          onPiAgentMaxTurnsChange={(value) => setPreference("piAgentMaxTurns", value)}
          piAgentWebSearchMaxResults={preferences.piAgentWebSearchMaxResults}
          onPiAgentWebSearchMaxResultsChange={(value) => setPreference("piAgentWebSearchMaxResults", value)}
          boardAssistantAwarenessEnabled={preferences.boardAssistantAwarenessEnabled}
          onBoardAssistantAwarenessEnabledChange={(value) => setPreference("boardAssistantAwarenessEnabled", value)}
          boardAssistantIntentSuggestionsEnabled={preferences.boardAssistantIntentSuggestionsEnabled}
          onBoardAssistantIntentSuggestionsEnabledChange={(value) => setPreference("boardAssistantIntentSuggestionsEnabled", value)}
          boardAssistantIntentSuggestionCount={preferences.boardAssistantIntentSuggestionCount}
          onBoardAssistantIntentSuggestionCountChange={(value) => setPreference("boardAssistantIntentSuggestionCount", value)}
          editSmartSuggestionsEnabled={preferences.editSmartSuggestionsEnabled}
          editSmartSuggestionsAvailable
          onEditSmartSuggestionsEnabledChange={(value) => setPreference("editSmartSuggestionsEnabled", value)}
          memoryEnabled={preferences.memoryEnabled}
          onMemoryEnabledChange={(value) => setPreference("memoryEnabled", value)}
          memoryUsageLevel={preferences.memoryUsageLevel}
          onMemoryUsageLevelChange={(value) => setPreference("memoryUsageLevel", value)}
          editInfoMode={preferences.editInfoMode}
          onEditInfoModeChange={(value) => setPreference("editInfoMode", value)}
          imageDoubleClickAction={preferences.imageDoubleClickAction}
          onImageDoubleClickActionChange={(value) => setPreference("imageDoubleClickAction", value)}
          versionSeparationMode={preferences.versionSeparationMode}
          onVersionSeparationModeChange={(value) => setPreference("versionSeparationMode", value)}
          generateButtonStyle={preferences.generateButtonStyle}
          onGenerateButtonStyleChange={(value) => setPreference("generateButtonStyle", value)}
          downloadDirectory={preferences.downloadDirectory}
          onDownloadDirectoryChange={(value) => setPreference("downloadDirectory", value)}
          onSaved={async () => {
            if (params.get("scenario") === "save-error") throw new Error("预览：模拟保存失败。");
          }}
        />
      </LicenseContext.Provider>
      <OnlineShareManagerDialog
        open={shareManagerOpen}
        onOpenChange={setShareManagerOpen}
        onLocate={() => setShareManagerOpen(false)}
      />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <LegacyI18nBridge>
        <Preview />
      </LegacyI18nBridge>
    </I18nProvider>
  </React.StrictMode>
);
