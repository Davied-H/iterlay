import { describe, expect, it, vi } from "vitest";
import {
  createSettingsActions,
  type SettingsActionDependencies
} from "../src/features/settings/create-settings-actions";
describe("community text Agent settings", () => {
  it.each([true, false])("uses actual provider readiness when key configured=%s", async (configured) => {
    const setEnabled = vi.fn(),
      updateSettings = vi.fn(async () => ({ ok: true }));
    const actions = createSettingsActions({
      settings: {
        providerKeyStatus: configured ? { text: true } : {},
        setBoardAssistantAgentModeEnabled: setEnabled,
        setSetupComplete: vi.fn()
      },
      activeTextProvider: {
        id: "text",
        type: "openai-compatible",
        baseUrl: "https://fixture.invalid",
        model: "fixture"
      },
      getWorkbenchApi: () => ({ updateSettings }),
      reportWorkbenchError: vi.fn()
    } as unknown as SettingsActionDependencies);
    actions.changeBoardAssistantAgentModeEnabled(true);
    expect(setEnabled).toHaveBeenCalledWith(configured);
    await vi.waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        assistantAgentModeEnabled: configured,
        boardAssistantAgentModeEnabled: configured
      })
    );
  });
});

describe("model configuration persistence", () => {
  it("propagates save failures so the editor can retain its draft and show an error", async () => {
    const error = new Error("disk full");
    const report = vi.fn();
    const actions = createSettingsActions({
      settings: {},
      getWorkbenchApi: () => ({
        saveSettings: vi.fn().mockRejectedValue(error)
      }),
      reportWorkbenchError: report
    } as unknown as SettingsActionDependencies);
    await expect(
      actions.persistProviders({
        providers: [],
        activeProviderId: "",
        textProviders: [],
        activeTextProviderId: "",
        videoProviders: [],
        activeVideoProviderId: ""
      })
    ).rejects.toBe(error);
    expect(report).toHaveBeenCalledWith(error);
  });
});
