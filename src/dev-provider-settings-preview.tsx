import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import type { ImageWorkbenchApi } from "../electron/preload/preload";
import type {
  FalModelCategory,
  OnlineShareSession,
  ProviderConfig,
  TextProviderConfig,
  VideoProviderConfig
} from "@shared/types";
import type { LicenseStatusSnapshot } from "@shared/licensing";
import { LicenseContext } from "@/components/licensing/license-context";
import { ProviderSettingsDialog } from "@/components/workbench/ProviderSettingsDialog";
import { OnlineShareManagerDialog } from "@/components/workbench/OnlineShareManagerDialog";
import { I18nProvider, useI18n } from "@/i18n";
import { LegacyI18nBridge } from "@/i18n/LegacyI18nBridge";
import sceneMasterAvatar from "@/assets/scene-master-avatar.png";
import "@/styles.css";

const imageProviders: ProviderConfig[] = [
  {
    id: "iterlay-official",
    name: "Iterlay 官方",
    type: "official",
    baseUrl: "",
    generationEndpoint: "",
    model: "官方图片模型",
    supportsReferenceImages: true
  },
  {
    id: "fal-personal",
    name: "tao / fal",
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
    name: "me",
    type: "openai-compatible",
    apiMode: "responses",
    baseUrl: "https://sub2api.daived.com:31243",
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
  { id: "iterlay-official-text", name: "Iterlay 官方", type: "official", baseUrl: "", model: "" },
  {
    id: "me-text",
    name: "me",
    type: "openai-compatible",
    baseUrl: "https://sub2api.daived.com:31243/",
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
  { id: "iterlay-official-video", name: "Iterlay 官方", type: "official", baseUrl: "", model: "官方视频模型" },
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

const previewApi = {
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
      ? "export default function reviewExtension(pi) {\\n  // Register review hooks and tools.\\n}"
      : "---\\nname: visual-direction\\ndescription: 为画板提供视觉方向和提示词结构。\\n---\\n\\n# Visual Direction"
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
  getMcpIntegrationStatus: async () => ({
    clients: [
      { id: "codex", configured: true, configPath: "~/.codex/config.toml", skillInstalled: true, skillPath: "~/.codex/skills/iterlay-workspace" },
      { id: "claude-code", configured: false, configPath: "~/.claude.json", skillInstalled: false, skillPath: "~/.claude/skills/iterlay-workspace" }
    ]
  }),
  getSettings: async () => ({
    downloadDirectory: "",
    appIcon: previewAppIcon,
    customAppIcons: previewCustomAppIcons,
    codexAuthStatusByProviderId: {
      "codex-personal": {
        state: "connected",
        email: "daived1998@126.com",
        planType: "Plus"
      }
    }
  }),
  getMemoryStats: async () => ({ eventCount: 24, activeMemoryCount: 8, candidateMemoryCount: 2 }),
  clearAppCache: async () => ({ ok: true }),
  exportMcpPluginPackage: async (client: "codex" | "claude-code") => ({
    ok: true,
    path: `/Users/preview/Downloads/iterlay-workspace-${client}-plugin-v0.1.48.zip`
  }),
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

function Preview(): React.ReactElement {
  const [open, setOpen] = useState(true);
  const [shareManagerOpen, setShareManagerOpen] = useState(false);
  const { language, setLanguage } = useI18n();
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
          providers={imageProviders}
          activeProviderId="iterlay-official"
          textProviders={textProviders}
          activeTextProviderId="me-text"
          videoProviders={videoProviders}
          activeVideoProviderId="volcengine-ark-video"
          providerKeyStatus={{
            "iterlay-official": true,
            "iterlay-official-text": true,
            "fal-personal": true,
            "me-image": true,
            "me-text": true,
            "codex-personal": true,
            "text-codex-personal": true,
            "iterlay-official-video": true,
            "volcengine-ark-video": true,
            "fal-video-shared": true,
            "openrouter-video-shared": true
          }}
          bridgeError={null}
          language={language}
          onLanguageChange={setLanguage}
          theme="light"
          onThemeChange={() => undefined}
           promptDockAutoCollapse
           onPromptDockAutoCollapseChange={() => undefined}
           advancedVideoModesEnabled={false}
           onAdvancedVideoModesEnabledChange={() => undefined}
           canvasThumbnailPreview={false}
          onCanvasThumbnailPreviewChange={() => undefined}
          canvasMinimapVisible
          onCanvasMinimapVisibleChange={() => undefined}
          canvasImageToolbarOnHover={false}
          onCanvasImageToolbarOnHoverChange={() => undefined}
          canvasRelationshipHoverHighlight={false}
          onCanvasRelationshipHoverHighlightChange={() => undefined}
          wechatStickerExportEnabled={false}
          onWechatStickerExportEnabledChange={() => undefined}
          onlineImageSharingEnabled={false}
          onOnlineImageSharingEnabledChange={() => undefined}
          copyImageFormat="png"
          onCopyImageFormatChange={() => undefined}
          boardSmartSuggestionsEnabled
          onBoardSmartSuggestionsEnabledChange={() => undefined}
          boardAssistantEnabled={false}
          onBoardAssistantEnabledChange={() => undefined}
          boardAssistantAgentModeEnabled={false}
          boardAssistantAgentModeAvailable
          boardAssistantAgentModeModel="gpt-5.5"
          onBoardAssistantAgentModeEnabledChange={() => undefined}
          piAgentBuiltinTools={["read", "grep", "find", "ls"]}
          onPiAgentBuiltinToolsChange={() => undefined}
          piAgentIterlayTools={[]}
          onPiAgentIterlayToolsChange={() => undefined}
          piAgentSkillPaths={[]}
          onPiAgentSkillPathsChange={() => undefined}
          piAgentExtensionPaths={[]}
          onPiAgentExtensionPathsChange={() => undefined}
          piAgentCustomSkillPaths={[]}
          onPiAgentCustomSkillPathsChange={() => undefined}
          piAgentCustomExtensionPaths={[]}
          onPiAgentCustomExtensionPathsChange={() => undefined}
          piAgentMaxTurns={12}
          onPiAgentMaxTurnsChange={() => undefined}
          piAgentWebSearchMaxResults={5}
          onPiAgentWebSearchMaxResultsChange={() => undefined}
          boardAssistantAwarenessEnabled={false}
          onBoardAssistantAwarenessEnabledChange={() => undefined}
          boardAssistantIntentSuggestionsEnabled
          onBoardAssistantIntentSuggestionsEnabledChange={() => undefined}
          boardAssistantIntentSuggestionCount={3}
          onBoardAssistantIntentSuggestionCountChange={() => undefined}
          editSmartSuggestionsEnabled={false}
          editSmartSuggestionsAvailable
          onEditSmartSuggestionsEnabledChange={() => undefined}
          memoryEnabled
          onMemoryEnabledChange={() => undefined}
          memoryUsageLevel="balanced"
          onMemoryUsageLevelChange={() => undefined}
          editInfoMode="panel"
          onEditInfoModeChange={() => undefined}
          imageDoubleClickAction="focus"
          onImageDoubleClickActionChange={() => undefined}
          versionSeparationMode="copy"
          onVersionSeparationModeChange={() => undefined}
          generateButtonStyle="folded"
          onGenerateButtonStyleChange={() => undefined}
          downloadDirectory=""
          onDownloadDirectoryChange={() => undefined}
          onSaved={async () => undefined}
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
