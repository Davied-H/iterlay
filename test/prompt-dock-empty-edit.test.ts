// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptDock } from "../src/components/workbench/PromptDock";
import { I18nProvider } from "../src/i18n";
import { COMMUNITY_IMAGE_PROVIDER } from "../shared/community-providers";
import type { UiDesignBrief } from "../shared/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("prompt dock empty edit lifecycle", () => {
  it("renders a normal board and only opens AI conversations on explicit actions", async () => {
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
      const html = renderToString(createElement(I18nProvider, null, createElement(PromptDock, props)));
      expect(html).toContain('data-fusion-mode="generate"');
      expect(html).toContain('data-assistant-enabled="false"');
      expect(html).toContain("prompt-fusion-direct-editor");
      expect(html).not.toContain('role="switch"');
      expect(html).not.toContain("prompt-dock-layer");
      expect(html).not.toContain("prompt-dock-assistant-button");
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      const render = async (boardId: string, aiMode = true) => {
        await act(async () => root.render(createElement(I18nProvider, null, createElement(PromptDock, {
          ...props, boardId, assistantEnabled: true, assistantAgentModeEnabled: aiMode
        }))));
      };
      const expanded = () => container.querySelector(".prompt-fusion")?.getAttribute("data-fusion-expanded");
      try {
        await render("one");
        expect(expanded()).toBe("false");
        await act(async () => container.querySelector<HTMLButtonElement>(".prompt-fusion-expand-handle")!.click());
        expect(expanded()).toBe("true");
        await render("two");
        expect(expanded()).toBe("false");
        await render("two", false);
        await render("two");
        expect(expanded()).toBe("false");
      } finally {
        await act(async () => root.unmount());
        container.remove();
      }
    } finally { localStorage.removeItem("iterlay:language"); }
  });
});
