// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageDeliveryDialog, type ImageDeliveryApi } from "../src/components/workbench/ImageDeliveryDialog";
import type { BoardData } from "../shared/types";
import type { ImageDeliveryRecipe } from "../shared/image-delivery";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const initial: BoardData = {
  id: "board", name: "Test", createdAt: "2026-10-19", updatedAt: "2026-10-19",
  nodes: [{ id: "image", type: "image", imagePath: "/v3.png", jobId: "v3", source: "generated", x: 0, y: 0,
    versions: [1, 2, 3].map((index) => ({ imagePath: `/v${index}.png`, jobId: `v${index}` })),
    activeVersion: 2, finalVersion: { imagePath: "/v2.png", jobId: "v2" } }]
};
let root: Root;
let host: HTMLDivElement;
let board: BoardData;
let api: ImageDeliveryApi;
const onOpenChange = vi.fn();
const onBoardChanged = vi.fn();
const button = (text: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === text);
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
};
async function render(initialRecipe?: ImageDeliveryRecipe): Promise<void> {
  await act(async () => root.render(createElement(ImageDeliveryDialog, { open: true, board, api, onOpenChange, onBoardChanged, initialRecipe })));
}
async function input(label: string, value: string): Promise<void> {
  const element = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  document.documentElement.lang = "zh-CN";
  board = structuredClone(initial);
  api = {
    setFinalVersion: vi.fn(async ({ nodeId, version }) => {
      board = { ...board, nodes: board.nodes.map((node) => node.id === nodeId ? { ...node, finalVersion: version ?? undefined } : node) };
      return board;
    }),
    saveRecipe: vi.fn(async ({ recipe }) => {
      board = { ...board, deliveryRecipes: [{ ...recipe, updatedAt: "saved" }] };
      return board;
    }),
    removeRecipe: vi.fn(async () => ({ ...board, deliveryRecipes: [] })),
    exportRecipe: vi.fn(async () => ({ ok: true, path: "/delivery.zip" }))
  };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });

describe("final version and delivery editing", () => {
  it("opens a FIELD recipe as an unsaved draft and preserves user edits when its object is recreated", async () => {
    const initialRecipe: ImageDeliveryRecipe = { id: "field", name: "FIELD", updatedAt: "now", items: [{
      id: "hero", nodeId: "image", sourceVersion: { imagePath: "/v2.png", jobId: "v2" }, purpose: "Hero", relativePath: "hero.png", format: "png"
    }] };
    await render(initialRecipe);
    expect(api.saveRecipe).not.toHaveBeenCalled();
    expect(api.exportRecipe).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("配方有未保存更改");
    await input("文件 1 路径", "custom/hero.png");
    await render(structuredClone(initialRecipe));
    expect(document.querySelector<HTMLInputElement>('input[aria-label="文件 1 路径"]')?.value).toBe("custom/hero.png");
  });
  it("creates and exports a recipe pinned to v2 while v3 remains the current preview", async () => {
    await render();
    expect(document.body.textContent).toContain("当前预览 v3");
    await act(async () => button("新建配方").click());
    await act(async () => button("添加交付文件").click());
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="文件 1 固定源版本"]')?.value).toBe("1");
    await input("文件 1 用途", "Landing page hero");
    await input("文件 1 路径", "public/images/hero.png");
    await input("文件 1 宽度", "1280");
    await act(async () => button("保存并导出 ZIP").click());
    expect(api.saveRecipe).toHaveBeenCalledWith({ boardId: "board", recipe: expect.objectContaining({ items: [expect.objectContaining({
      sourceVersion: { imagePath: "/v2.png", jobId: "v2" }, purpose: "Landing page hero", relativePath: "public/images/hero.png", width: 1280
    })] }) });
    expect(api.exportRecipe).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("交付包已导出");
  });
  it("blocks traversal and does not save or export invalid files", async () => {
    await render();
    await act(async () => button("新建配方").click());
    await act(async () => button("添加交付文件").click());
    await input("文件 1 路径", "../hero.png");
    await act(async () => button("保存并导出 ZIP").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("安全的相对文件路径");
    expect(api.saveRecipe).not.toHaveBeenCalled();
    expect(api.exportRecipe).not.toHaveBeenCalled();
  });
  it("asks before abandoning an edited recipe", async () => {
    await render();
    await act(async () => button("新建配方").click());
    await act(async () => button("添加交付文件").click());
    await act(async () => button("新建配方").click());
    expect(document.body.textContent).toContain("确认继续？");
    await act(async () => button("继续编辑").click());
    expect(document.querySelector('input[aria-label="文件 1 路径"]')).not.toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
