import { describe, expect, it, vi } from "vitest";
import { validateSceneCollaborationRequest } from "../electron/ipc";
import { buildSceneCollaborationMessages } from "../electron/providers/text-assistant";
vi.mock("electron", () => ({
  app: { getPath: () => "/tmp", getVersion: () => "0.1.0" },
  BrowserWindow: {}, clipboard: {}, dialog: {}, ipcMain: {}, nativeImage: {}, nativeTheme: {}, net: {}, shell: {},
  Notification: class {}, safeStorage: { isEncryptionAvailable: () => false }
}));

const request = { instruction: "Show an otter underwater", workflowMode: "generate", assistantSurface: "canvas-prompt", referenceImages: [], currentFields: [] };
describe("assistant request language boundary", () => {
  it.each(["en-US", "zh-CN"] as const)("preserves %s through request validation and prompt construction", (locale) => {
    const validated = validateSceneCollaborationRequest({ ...request, locale });
    expect(validated.locale).toBe(locale);
    const system = String(buildSceneCollaborationMessages(validated)[0].content);
    expect(system).toContain(locale === "en-US" ? "must be written in natural English" : "所有面向用户的 message");
  });
  it("keeps the default for older callers and rejects invalid locale values", () => {
    expect(validateSceneCollaborationRequest(request).locale).toBe("zh-CN");
    expect(() => validateSceneCollaborationRequest({ ...request, locale: "fr-FR" })).toThrow("界面语言");
  });
});
