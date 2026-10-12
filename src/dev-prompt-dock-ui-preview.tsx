import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import type { GenerateImageInput, ProviderConfig } from "@shared/types";
import { PromptDock } from "@/components/workbench/PromptDock";
import { I18nProvider } from "@/i18n";
import { PRESET_SCENES } from "@/lib/scene-library";
import "@/styles.css";

const providers: ProviderConfig[] = [
  {
    id: "preview-official",
    name: "Iterlay 官方",
    type: "official",
    baseUrl: "",
    generationEndpoint: "",
    model: "官方图片模型",
    supportsReferenceImages: true
  },
  {
    id: "preview-fal",
    name: "tao / fal",
    type: "fal",
    baseUrl: "https://queue.fal.run",
    generationEndpoint: "",
    model: "fal-ai/nano-banana-pro",
    models: ["fal-ai/nano-banana-pro", "fal-ai/flux-pro/kontext/max"],
    supportsReferenceImages: true
  },
  {
    id: "preview",
    name: "Codex / ChatGPT",
    type: "codex-oauth",
    baseUrl: "",
    generationEndpoint: "",
    model: "gpt-image-2",
    supportsReferenceImages: true
  }
];

const uiScene = PRESET_SCENES.find((scene) => scene.id === "preset:ad-poster")!;
const previewCreationMode = new URLSearchParams(window.location.search).get("creationMode") === "general"
  ? "general"
  : "ui-design";

function Preview(): React.ReactElement {
  const [activeProviderId, setActiveProviderId] = useState(providers[1].id);
  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0];
  const [input, setInput] = useState<GenerateImageInput>({
    workflowMode: "generate",
    creationMode: previewCreationMode,
    useCase: previewCreationMode === "ui-design" ? "ui-mockup" : uiScene.useCase,
    sceneId: uiScene.id,
    prompt: "",
    model: activeProvider.model,
    size: "auto",
    n: 1,
    quality: "high",
    referenceImages: [{
      id: "prd-preview",
      name: "充电站首页-PRD.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrWQAAAAASUVORK5CYII=",
      role: "reference",
      semanticRole: "prd"
    }]
  });

  return (
    <main className="relative h-screen overflow-hidden bg-muted">
      <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:20px_20px]" />
      <PromptDock
        boardId="preview-board"
        input={input}
        scenes={PRESET_SCENES}
        favoriteSceneIds={[]}
        activeCount={0}
        canGenerate
        generateButtonStyle="folded"
        needsProviderSetup={false}
        providerBlocksGenerateReferences={false}
        providers={providers}
        activeProviderId={activeProviderId}
        creditStatus={{
          credits: {
            walletId: "preview-wallet",
            balance: 128,
            lifetimeGranted: 200,
            lifetimeSpent: 72,
            unitCost: 10,
            status: "active",
            updatedAt: new Date().toISOString()
          },
          providerAvailable: true
        }}
        creditLoading={false}
        officialRequiredCredits={10}
        onSelectProvider={(id, model) => {
          setActiveProviderId(id);
          setInput((current) => ({ ...current, model: model ?? providers.find((provider) => provider.id === id)?.model ?? current.model }));
        }}
        rightRailOpen={false}
        autoCollapse
        boardSmartSuggestionsEnabled={false}
        assistantEnabled
        assistantAwarenessEnabled={false}
        assistantIntentSuggestionsEnabled={false}
        assistantIntentSuggestionCount={3}
        editSmartSuggestionsEnabled={false}
        memoryEnabled={false}
        memoryUsageLevel="balanced"
        editTarget={null}
        boardImages={[]}
        suggestingEdits={false}
        suggestedEdits={[]}
        canSuggestEdits={false}
        supportsPromptEnhancement
        assistantShortcutEnabled={false}
        onExitEdit={() => undefined}
        onOpenAdvancedEdit={() => undefined}
        onApplyScene={(scene) => setInput((current) => ({
          ...current,
          useCase: scene.useCase,
          sceneId: scene.id
        }))}
        onToggleFavoriteScene={() => undefined}
        onSaveScene={() => undefined}
        onResolveTemplatePrompt={async (_scene, request) => request}
        onResolveUiDesignBrief={async () => ({
          goal: "帮助用户快速查找并比较附近充电站",
          surface: "移动端充电服务首页",
          structure: "顶部服务入口，中部消息与活动，主体为附近电站列表，底部主导航",
          visualDirection: "清晰、轻量的绿色能源服务界面",
          constraints: "保留真实列表密度，突出距离、价格和营业状态",
          generationPrompt: "生成一张移动端充电服务首页 UI 设计图"
        })}
        onOpenSceneLibrary={() => undefined}
        onPromptChange={(prompt) => setInput((current) => ({ ...current, prompt }))}
        onApplySuggestedEdit={() => undefined}
        onRegenerateSuggestedEdits={() => undefined}
        onInputChange={(patch) => setInput((current) => ({ ...current, ...patch }))}
        onReferenceFiles={() => undefined}
        onPasteCanvasReferences={() => undefined}
        onPasteImages={() => undefined}
        onAddCanvasReference={() => undefined}
        onRemoveReference={(id) => setInput((current) => ({
          ...current,
          referenceImages: current.referenceImages.filter((image) => image.id !== id)
        }))}
        onGenerate={() => undefined}
        onGeneratePrompts={() => undefined}
        onOpenSettings={() => undefined}
        onOpenModelManagement={() => undefined}
      />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <Preview />
    </I18nProvider>
  </React.StrictMode>
);
