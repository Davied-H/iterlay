import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import type { GenerateImageInput, ProviderConfig } from "@shared/types";
import { PromptDock } from "@/components/workbench/PromptDock";
import { I18nProvider } from "@/i18n";
import { PRESET_SCENES } from "@/lib/scene-library";
import "@/styles.css";

const provider: ProviderConfig = {
  id: "preview",
  name: "Codex / ChatGPT",
  type: "codex-oauth",
  baseUrl: "",
  generationEndpoint: "",
  model: "gpt-image-2",
  supportsReferenceImages: true
};

const editScene = PRESET_SCENES.find((scene) => scene.id === "preset:edit-object")!;

function Preview(): React.ReactElement {
  const [input, setInput] = useState<GenerateImageInput>({
    workflowMode: "edit",
    useCase: editScene.useCase,
    sceneId: editScene.id,
    prompt: "把桌上的红色水杯改成透明玻璃杯，其他内容保持不变",
    model: provider.model,
    size: "auto",
    n: 1,
    quality: "high",
    referenceImages: []
  });

  return (
    <main className="relative h-screen overflow-hidden bg-muted">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--background))_0,hsl(var(--muted))_70%)]" />
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
        providers={[provider]}
        activeProviderId={provider.id}
        creditStatus={null}
        creditLoading={false}
        officialRequiredCredits={0}
        onSelectProvider={() => undefined}
        rightRailOpen={false}
        autoCollapse
        boardSmartSuggestionsEnabled={false}
        assistantEnabled={false}
        assistantAwarenessEnabled={false}
        assistantIntentSuggestionsEnabled={false}
        assistantIntentSuggestionCount={3}
        editSmartSuggestionsEnabled={false}
        memoryEnabled={false}
        memoryUsageLevel="balanced"
        editTarget={{ path: "/preview/edit-target.png", dataUrl: "" }}
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
          workflowMode: scene.mode,
          useCase: scene.useCase,
          sceneId: scene.id
        }))}
        onToggleFavoriteScene={() => undefined}
        onSaveScene={() => undefined}
        onResolveTemplatePrompt={async (scene, request) => scene.prompt.replace("【要改动的部分】", request)}
        onResolveUiDesignBrief={async (request) => ({
          goal: request,
          surface: "桌面端产品界面",
          structure: "核心任务优先的信息结构",
          visualDirection: "克制、专业的产品界面",
          constraints: "保持清晰层级和真实产品密度",
          generationPrompt: request
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
        onRemoveReference={() => undefined}
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
