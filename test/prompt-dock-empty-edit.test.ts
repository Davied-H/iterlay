// @vitest-environment jsdom
import { createElement, type ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptDock } from "../src/components/workbench/PromptDock";
import { I18nProvider } from "../src/i18n";
import { COMMUNITY_IMAGE_PROVIDER } from "../shared/community-providers";
import type { UiDesignBrief } from "../shared/types";
describe("prompt dock empty edit lifecycle", () => {
  it("renders a normal board before an edit target exists", () => {
    localStorage.setItem("iterlay:language", "zh-CN");
    const noop = () => undefined;
    const props: ComponentProps<typeof PromptDock> = {
      boardId: "board", input: { workflowMode: "generate", prompt: "", model: "gpt-image-1", size: "auto", n: 1, referenceImages: [] },
      scenes: [], favoriteSceneIds: [], activeCount: 0, canGenerate: false, generateButtonStyle: "folded",
      needsProviderSetup: true, providerBlocksGenerateReferences: false, providers: [COMMUNITY_IMAGE_PROVIDER], activeProviderId: COMMUNITY_IMAGE_PROVIDER.id,
      creditStatus: null, creditLoading: false, officialRequiredCredits: 0, onSelectProvider: noop,
      rightRailOpen: false, autoCollapse: false, boardSmartSuggestionsEnabled: false,
      assistantEnabled: false, assistantAwarenessEnabled: false, assistantIntentSuggestionsEnabled: false,
      assistantIntentSuggestionCount: 3, editSmartSuggestionsEnabled: false, memoryEnabled: false, memoryUsageLevel: "balanced",
      editTarget: null, boardImages: [], suggestingEdits: false, suggestedEdits: [], canSuggestEdits: false,
      supportsPromptEnhancement: false, assistantShortcutEnabled: false,
      onExitEdit: noop, onOpenAdvancedEdit: noop, onApplyScene: noop, onToggleFavoriteScene: noop, onSaveScene: noop,
      onResolveTemplatePrompt: async () => "", onResolveUiDesignBrief: async () => ({} as UiDesignBrief),
      onOpenSceneLibrary: noop, onPromptChange: noop, onApplySuggestedEdit: noop, onRegenerateSuggestedEdits: noop,
      onInputChange: noop, onReferenceFiles: noop, onPasteCanvasReferences: noop, onPasteImages: noop,
      onAddCanvasReference: noop, onRemoveReference: noop, onGenerate: noop, onGeneratePrompts: noop,
      onOpenSettings: noop, onOpenModelManagement: noop
    };
    try {
      expect(renderToString(createElement(I18nProvider, null, createElement(PromptDock, props))).length).toBeGreaterThan(500);
    } finally { localStorage.removeItem("iterlay:language"); }
  });
});
