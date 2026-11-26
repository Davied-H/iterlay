import { describe, expect, it, vi } from "vitest";
import {
  createSettingsActions,
  type SettingsActionDependencies
} from "../src/features/settings/create-settings-actions";
describe("community text Agent settings", () => {
  it.each([true, false])("persists AI selection independently of text key readiness=%s", async (configured) => {
    const setEnabled = vi.fn(), updateSettings = vi.fn(async () => ({ ok: true }));
    const actions = createSettingsActions({
      settings: { boardAssistantEnabled: true, providerKeyStatus: configured ? { text: true } : {},
        setBoardAssistantAgentModeEnabled: setEnabled, setSetupComplete: vi.fn() },
      activeTextProvider: { id: "text", type: "openai-compatible", baseUrl: "https://fixture.invalid", model: "fixture" },
      getWorkbenchApi: () => ({ updateSettings }), reportWorkbenchError: vi.fn()
    } as unknown as SettingsActionDependencies);
    actions.changeBoardAssistantAgentModeEnabled(true);
    expect(setEnabled).toHaveBeenLastCalledWith(true);
    await vi.waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      assistantAgentModeEnabled: true, boardAssistantAgentModeEnabled: true
    }));
    actions.changeBoardAssistantAgentModeEnabled(false);
    expect(setEnabled).toHaveBeenLastCalledWith(false);
    await vi.waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      assistantAgentModeEnabled: false, boardAssistantAgentModeEnabled: false
    }));
  });

  it("also persists assistant availability when selecting AI from a disabled assistant", async () => {
    const setMode = vi.fn(), setAssistant = vi.fn(), updateSettings = vi.fn(async () => ({}));
    const actions = createSettingsActions({
      settings: { boardAssistantEnabled: false, providerKeyStatus: {}, setBoardAssistantAgentModeEnabled: setMode,
        setBoardAssistantEnabled: setAssistant, setSetupComplete: vi.fn() },
      activeTextProvider: undefined,
      getWorkbenchApi: () => ({ updateSettings }), reportWorkbenchError: vi.fn()
    } as unknown as SettingsActionDependencies);
    actions.changeBoardAssistantAgentModeEnabled(true);
    expect(setMode).toHaveBeenCalledWith(true);
    expect(setAssistant).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      assistantAgentModeEnabled: true, boardAssistantAgentModeEnabled: true, boardAssistantEnabled: true
    }));
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
