// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareCharacterGeneration, assistantCurrentFields } from "../plugins/short-drama/src/production";
import { createNode } from "../plugins/short-drama/src/model";
import { validateImageRecipe } from "../src/features/plugins/validate-image-recipe";
import { requestPluginCapability } from "../src/features/plugins/request-plugin-capability";
import type { ComicCharacterNode, ComicDramaBoardSnapshot } from "../shared/comic-drama";
const api = vi.hoisted(() => ({ listPlugins: vi.fn(async () => [{ enabled: true, manifest: { id: "dev.iterlay.short-drama", version: "1.3.2" } }]), authorizePlugin: vi.fn(async () => undefined), getPluginFrameUrl: vi.fn(async () => "http://localhost/plugin") }));
vi.mock("../src/lib/image-workbench-api", () => ({ getImageWorkbenchApi: () => api }));
const snapshot: ComicDramaBoardSnapshot = { boardId: "board", revision: 3, nodes: [], connections: [], groups: [] };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.querySelectorAll("iframe").forEach(frame => frame.remove()); });
describe("installed short drama production capability", () => {
  it("keeps active-version art direction in the plugin and accepts only generation parameters", () => {
    const character = createNode("comic-character", snapshot) as ComicCharacterNode;
    character.name = "林雨"; character.versions[0].fields = { role: "主角", profile: "找寻哥哥", visualPrompt: "角色设定图", appearanceAnchors: ["短发", "灰外套"] };
    const recipe = prepareCharacterGeneration(character);
    expect(recipe.prompt).toBe("林雨，主角，找寻哥哥，角色设定图，短发，灰外套");
    expect(validateImageRecipe({ ...recipe, providerId: "malicious", quoteId: "bypass", boardId: "other" })).toEqual({ prompt: recipe.prompt, size: "1024x1792", useCase: "illustration-story", creationMode: "general" });
    expect(() => validateImageRecipe({ ...recipe, size: "100000x100000" })).toThrow();
    expect(() => validateImageRecipe({ ...recipe, prompt: "" })).toThrow();
    expect(() => validateImageRecipe({ ...recipe, useCase: "injected" })).toThrow();
  });
  it("builds selected-node context inside the plugin", () => {
    const selected = createNode("comic-character", snapshot); const other = createNode("comic-setting", snapshot);
    const fields = assistantCurrentFields({ ...snapshot, nodes: [selected, other] }, [selected.id]);
    expect(JSON.parse(fields[1].value)).toEqual([selected]);
    expect(fields[2].value).toBe("3");
  });
  it("accepts capability output only from the installed sandbox and cleans it up", async () => {
    let requestId = "";
    const pending = requestPluginCapability("dev.iterlay.short-drama", "character.prepareGeneration", { id: "character" });
    await vi.waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
    const frame = document.querySelector("iframe")!;
    const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(message => { requestId = message.id; });
    frame.dispatchEvent(new Event("load"));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ capability: "character.prepareGeneration" }), "*");
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { source: "iterlay-plugin", type: "capability-result", id: requestId, result: "spoofed" } }));
    expect(frame.isConnected).toBe(true);
    window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, data: { source: "iterlay-plugin", type: "capability-result", id: requestId, result: { prompt: "real", size: "1024x1792", useCase: "illustration-story", creationMode: "general" } } }));
    await expect(pending).resolves.toEqual({ prompt: "real", size: "1024x1792", useCase: "illustration-story", creationMode: "general" });
    expect(document.querySelector("iframe")).toBeNull();
    expect(api.authorizePlugin).toHaveBeenCalledWith("dev.iterlay.short-drama", "assistant:comic-drama");
  });
});

describe("capability lifecycle and installed-package compatibility", () => {
  it("rejects a stale installed version before creating an iframe", async () => {
    api.listPlugins.mockResolvedValueOnce([{ enabled: true, manifest: { id: "dev.iterlay.short-drama", version: "1.3.1" } }]);
    await expect(requestPluginCapability("dev.iterlay.short-drama", "character.prepareGeneration", {})).rejects.toThrow("更新至 1.3.2");
    expect(document.querySelector("iframe")).toBeNull();
  });
  it("removes a pending sandbox immediately when its owner aborts", async () => {
    const owner = new AbortController();
    const pending = requestPluginCapability("dev.iterlay.short-drama", "character.prepareGeneration", {}, { signal: owner.signal });
    const rejected = expect(pending).rejects.toThrow("取消");
    await vi.waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
    owner.abort(); await rejected;
    expect(document.querySelector("iframe")).toBeNull();
  });
  it("does not accept a recipe after the plugin loses authorization", async () => {
    const pending = requestPluginCapability("dev.iterlay.short-drama", "character.prepareGeneration", {});
    const rejected = expect(pending).rejects.toThrow("停用");
    await vi.waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
    const frame = document.querySelector("iframe")!;
    let requestId = ""; vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(message => { requestId = message.id; });
    frame.dispatchEvent(new Event("load"));
    api.authorizePlugin.mockRejectedValueOnce(new Error("插件已停用"));
    window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, data: { source: "iterlay-plugin", type: "capability-result", id: requestId, result: { prompt: "real", size: "1024x1792", useCase: "illustration-story", creationMode: "general" } } }));
    await rejected;
    expect(document.querySelector("iframe")).toBeNull();
  });
});
