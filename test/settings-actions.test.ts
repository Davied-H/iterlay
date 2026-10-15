import { describe, expect, it, vi } from "vitest";
import { createSettingsActions, type SettingsActionDependencies } from "../src/features/settings/create-settings-actions";
describe("community text Agent settings", () => {
  it.each([true, false])("uses actual provider readiness when key configured=%s", async (configured) => {
    const setEnabled = vi.fn(), updateSettings = vi.fn(async () => ({ ok: true }));
    const actions = createSettingsActions({
      settings: { providerKeyStatus: configured ? { text: true } : {}, setBoardAssistantAgentModeEnabled: setEnabled, setSetupComplete: vi.fn() },
      activeTextProvider: { id: "text", type: "openai-compatible", baseUrl: "https://fixture.invalid", model: "fixture" },
      getWorkbenchApi: () => ({ updateSettings }), reportWorkbenchError: vi.fn()
    } as unknown as SettingsActionDependencies);
    actions.changeBoardAssistantAgentModeEnabled(true);
    expect(setEnabled).toHaveBeenCalledWith(configured);
    await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ assistantAgentModeEnabled: configured, boardAssistantAgentModeEnabled: configured }));
  });
});
