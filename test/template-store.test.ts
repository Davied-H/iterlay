import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TemplateStore } from "../electron/storage/template-store";
import { workspaceFixture } from "./helpers/workspace-fixture";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-templates-")); dirs.push(dir);
  const file = path.join(dir, "templates.json"); return { file, store: new TemplateStore(file) };
}
describe("shared reusable templates", () => {
  it("persists across restarts and serializes simultaneous creates", async () => {
    const { store, file } = await fixture();
    const templates = await Promise.all(["A", "B"].map(name => store.create({ name, prompt: "保持留白" })));
    expect(await new TemplateStore(file).list()).toHaveLength(2);
    expect(await store.get(templates[0].id)).toMatchObject({ source: "custom", mode: "generate", name: "A" });
  });
  it("rejects invalid data without replacing valid templates", async () => {
    const { store } = await fixture();
    const t = await store.create({ name: "A", prompt: "rules" });
    await expect(store.update(t.id, { prompt: " " })).rejects.toThrow("模板字段");
    await expect(store.create({ name: "A" })).rejects.toThrow();
    await expect(store.get("missing")).rejects.toThrow("不存在");
    expect((await store.get(t.id)).prompt).toBe("rules");
  });
  it("migrates without overwriting newer backend templates and preserves unrelated CLI additions", async () => {
    const { store } = await fixture();
    const old = await store.create({ name: "A", prompt: "old" });
    await store.update(old.id, { prompt: "new" });
    expect((await store.sync([], [old], true))[0].prompt).toBe("new");
    const current = await store.list();
    await store.create({ name: "B", prompt: "second" });
    const result = await store.sync(current, current.map(t => ({ ...t, name: "renamed" })));
    expect(result.map(t => t.name).sort()).toEqual(["B", "renamed"]);
  });
  it("rejects stale renderer and CLI edits; removes deleted UI templates", async () => {
    const { store } = await fixture(); const t = await store.create({ name: "A", prompt: "old" });
    await store.update(t.id, { prompt: "new" }, "old");
    await expect(store.update(t.id, { prompt: "stale" }, "old")).rejects.toThrow("已更新");
    await expect(store.sync([t], [{ ...t, name: "stale" }])).rejects.toThrow("其他位置");
    expect(await store.sync(await store.list(), [])).toEqual([]);
  });
  it("does not conceal corrupted storage", async () => {
    const { file, store } = await fixture(); await writeFile(file, "broken");
    await expect(store.create({ name: "A", prompt: "rules" })).rejects.toThrow();
  });
  it("clears obsolete structured fields when rules change", async () => {
    const { store } = await fixture(); const t = await store.create({ name: "A", prompt: "old", fields: [{ id: "1", label: "style", value: "old" }] });
    expect(await store.update(t.id, { prompt: "new" })).not.toHaveProperty("fields");
  });
  it("applies fixed rules and content while preserving template provenance", async () => {
    const f = workspaceFixture();
    f.mocks.getTemplate.mockResolvedValue({ id: "custom:one", prompt: "蓝白配色", mode: "generate", useCase: "ads-marketing" });
    await f.commands.call("generate_image", { boardId: "board", templateId: "custom:one", prompt: "咖啡海报" });
    await vi.waitFor(() => expect(f.mocks.generateImage).toHaveBeenCalled());
    expect(f.mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({ sceneId: "custom:one", useCase: "ads-marketing", prompt: "模板固定规则：\n蓝白配色\n\n本次创作内容：\n咖啡海报" }));
    expect(f.mocks.updateTemplate).not.toHaveBeenCalled();
  });
  it("fails before generation for missing or mismatched templates", async () => {
    const f = workspaceFixture(); f.mocks.getTemplate.mockRejectedValueOnce(new Error("模板不存在"));
    await expect(f.commands.call("generate_image", { templateId: "missing", prompt: "content" })).rejects.toThrow("不存在");
    f.mocks.getTemplate.mockResolvedValue({ mode: "edit" });
    await expect(f.commands.call("generate_image", { templateId: "edit", prompt: "content" })).rejects.toThrow("不匹配");
    expect(f.mocks.generateImage).not.toHaveBeenCalled(); expect(f.mocks.createBoard).not.toHaveBeenCalled();
  });
  it("notifies the renderer after saving and filters caller metadata", async () => {
    const f = workspaceFixture();
    await f.commands.call("create_template", { name: "A", prompt: "rule", id: "bad", source: "preset" });
    expect(f.mocks.createTemplate).toHaveBeenCalledWith({ name: "A", prompt: "rule" });
    expect(f.emit).toHaveBeenCalledWith({ type: "templates-updated" });
  });
});
