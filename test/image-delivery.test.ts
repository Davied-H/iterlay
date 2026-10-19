import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import { BoardStore } from "../electron/storage/board-store";
import { buildImageDelivery, writeImageDeliveryArchive } from "../electron/image-delivery";
import { buildBoardArchive, parseBoardArchive } from "../electron/board-archive";
import { hydrateGeneratedImage, serializeGeneratedImage } from "../src/lib/board-node-image";
import { separateImageVersions } from "../src/components/canvas/image-versions";
import { hasDeliveryReferencesToMovedVersions, remapFinalVersion, remapImageDeliveryMetadata, resolveDeliverySource, validateImageDeliveryRecipe, type ImageDeliveryRecipe } from "../shared/image-delivery";
import { isBoardImageNode, type BoardData, type BoardNodeSnapshot } from "../shared/types";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2mcAAAAASUVORK5CYII=", "base64");
const node: BoardNodeSnapshot = {
  id: "image", type: "image", imagePath: "/tmp/v3.png", jobId: "v3", source: "generated", x: 0, y: 0,
  versions: [1, 2, 3].map((version) => ({ imagePath: `/tmp/v${version}.png`, jobId: `v${version}`, width: 1, height: 1 })),
  activeVersion: 2, finalVersion: { imagePath: "/tmp/v2.png", jobId: "v2" }
};
const recipe: ImageDeliveryRecipe = {
  id: "recipe", name: "Website", updatedAt: "2026-10-19", items: [{
    id: "hero", nodeId: node.id, sourceVersion: node.finalVersion!, purpose: "Hero", relativePath: "assets/hero.png", format: "png"
  }]
};
const board: BoardData = { id: "board", name: "Test", createdAt: "2026-10-19", updatedAt: "2026-10-19", nodes: [node], deliveryRecipes: [recipe] };
let directory: string;
beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-delivery-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("final version and delivery identity", () => {
  it("keeps v2 fixed while previewing and appending newer versions, including after reopening", async () => {
    const store = new BoardStore(directory);
    const created = await store.createBoard("Test");
    await store.saveBoard({ id: created.id, nodes: [node] });
    await store.setImageFinalVersion(created.id, node.id, node.finalVersion!);
    await store.saveImageDeliveryRecipe(created.id, recipe);
    await store.appendVersions(created.id, node.id, [{ imagePath: "/tmp/v4.png", jobId: "v4" }]);
    await store.setImageNodeVersion(created.id, node.id, 0);
    const reopened = (await new BoardStore(directory).getBoard(created.id))!;
    expect(reopened.nodes[0]).toMatchObject({ imagePath: "/tmp/v1.png", finalVersion: node.finalVersion });
    expect(resolveDeliverySource(reopened, reopened.deliveryRecipes![0].items[0])).toMatchObject({ imagePath: "/tmp/v2.png", jobId: "v2" });
  });
  it("keeps an unavailable final marker and refuses delivery instead of silently falling back", async () => {
    const store = new BoardStore(directory);
    const created = await store.createBoard("Test");
    await store.saveBoard({ id: created.id, nodes: [node] });
    await store.saveImageDeliveryRecipe(created.id, recipe);
    await store.saveBoard({ id: created.id, nodes: [{ ...node, versions: node.versions!.filter((version) => version.jobId !== "v2") }] });
    const saved = (await store.getBoard(created.id))!;
    expect(saved.nodes[0]).toMatchObject({ finalVersion: node.finalVersion });
    const read = vi.fn();
    await expect(buildImageDelivery(saved, recipe, read, vi.fn())).rejects.toThrow("不会自动改用当前版本");
    expect(read).not.toHaveBeenCalled();
    await expect(store.setImageFinalVersion(created.id, node.id, node.finalVersion!)).rejects.toThrow("固定源版本已移除");
  });
  it("preserves the final identity across serialization and moves it with its actual separated version", () => {
    const generated = hydrateGeneratedImage(node, { "/tmp/v1.png": "url1", "/tmp/v2.png": "url2", "/tmp/v3.png": "url3" })!;
    expect(serializeGeneratedImage(generated, { x: 0, y: 0 }).finalVersion).toEqual(node.finalVersion);
    const separated = separateImageVersions(generated, () => crypto.randomUUID())!;
    expect(separated.find((image) => image.path === node.finalVersion!.imagePath)?.finalVersion).toEqual(node.finalVersion);
    expect(separated.find((image) => image.id === node.id)?.finalVersion).toBeUndefined();
  });
  it("detects precisely which moves would invalidate fixed delivery sources", () => {
    expect(hasDeliveryReferencesToMovedVersions([recipe], node.id)).toBe(true);
    expect(hasDeliveryReferencesToMovedVersions([recipe], node.id, [{ imagePath: "/tmp/v1.png", jobId: "v1" }])).toBe(false);
    expect(hasDeliveryReferencesToMovedVersions([recipe], node.id, [node.finalVersion!])).toBe(true);
    expect(hasDeliveryReferencesToMovedVersions([recipe], "other-node")).toBe(false);
  });
  it("does not let an otherwise matching path substitute another job identity", () => {
    expect(() => resolveDeliverySource(board, { ...recipe.items[0], sourceVersion: { ...node.finalVersion!, jobId: "other-job" } })).toThrow("无法唯一解析");
  });
});

describe("delivery recipe validation", () => {
  it.each(["../hero.png", "/hero.png", "assets/../hero.png", "assets//hero.png", "C:/hero.png", "assets\\hero.png", "CON.png", "assets/NUL.png", "assets/a\u0000.png", "assets/name./hero.png"])("rejects unsafe output path %s", (relativePath) => {
    expect(() => validateImageDeliveryRecipe({ ...recipe, items: [{ ...recipe.items[0], relativePath }] })).toThrow();
  });
  it("rejects extension mismatches, case-insensitive duplicates and invalid dimensions", () => {
    expect(() => validateImageDeliveryRecipe({ ...recipe, items: [{ ...recipe.items[0], format: "jpeg" }] })).toThrow("扩展名");
    expect(() => validateImageDeliveryRecipe({ ...recipe, items: [...recipe.items, { ...recipe.items[0], id: "two", relativePath: "ASSETS/HERO.PNG" }] })).toThrow("文件名重复");
    expect(() => validateImageDeliveryRecipe({ ...recipe, items: [{ ...recipe.items[0], width: 0 }] })).toThrow("整数");
    expect(() => validateImageDeliveryRecipe({ ...recipe, items: [{ ...recipe.items[0], width: 16384, height: 16384 }] })).toThrow("像素");
  });
  it("remaps source paths, job IDs and node IDs together on archive import", () => {
    const remapped = remapImageDeliveryMetadata([recipe], () => "/managed/import.png", () => "import-node", () => "import-job")!;
    expect(remapped[0].items[0]).toMatchObject({ nodeId: "import-node", sourceVersion: { imagePath: "/managed/import.png", jobId: "import-job" } });
    expect(remapFinalVersion(node.finalVersion, () => "/managed/import.png", () => "import-job")).toEqual({ imagePath: "/managed/import.png", jobId: "import-job" });
  });
});

describe("real delivery bytes and no-overwrite behavior", () => {
  it("writes a ZIP containing the pinned source and a manifest with actual format, dimensions and hashes", async () => {
    const read = vi.fn().mockResolvedValue(png);
    const result = await buildImageDelivery(board, recipe, read, async (bytes) => ({ bytes, mimeType: "image/png", width: 1, height: 1 }));
    const files = unzipSync(result.archive);
    expect(read).toHaveBeenCalledWith("/tmp/v2.png");
    expect(Buffer.from(files["assets/hero.png"])).toEqual(png);
    expect(JSON.parse(Buffer.from(files["manifest.json"]).toString())).toMatchObject({ files: [{
      path: "assets/hero.png", purpose: "Hero", sourceVersion: { jobId: "v2", fileName: "v2.png" }, mimeType: "image/png", width: 1, height: 1, bytes: png.length
    }] });
    expect(result.manifest.files[0].sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(result.manifest)).not.toContain("/tmp/");
    const output = path.join(directory, "delivery.zip");
    await writeImageDeliveryArchive(output, result.archive);
    await expect(writeImageDeliveryArchive(output, Buffer.from("replacement"))).rejects.toThrow("不会覆盖");
    expect(await readFile(output)).toEqual(result.archive);
  });
  it("rejects a fake image MIME and a fabricated resize before a ZIP is produced", async () => {
    await expect(buildImageDelivery(board, recipe, async () => png, async () => ({ bytes: Buffer.from("error"), mimeType: "image/png", width: 1, height: 1 }))).rejects.toThrow("格式、尺寸不一致");
    await expect(buildImageDelivery(board, { ...recipe, items: [{ ...recipe.items[0], width: 100 }] }, async () => png, async () => ({ bytes: png, mimeType: "image/png", width: 1, height: 1 }))).rejects.toThrow("指定尺寸");
  });
  it("round-trips final and recipe metadata through a board package without leaking absolute paths", async () => {
    const source = path.join(directory, "source.png");
    await writeFile(source, png);
    const storedNode = { ...node, imagePath: source, jobId: "v2", versions: undefined, activeVersion: undefined, finalVersion: { imagePath: source, jobId: "v2" } };
    const storedRecipe = { ...recipe, items: [{ ...recipe.items[0], sourceVersion: storedNode.finalVersion }] };
    const archive = await buildBoardArchive({ ...board, nodes: [storedNode], deliveryRecipes: [storedRecipe] }, [], "test");
    const parsed = await parseBoardArchive(archive);
    const imported = parsed.board.nodes.find(isBoardImageNode)!;
    expect(imported.finalVersion).toEqual({ imagePath: imported.imagePath, jobId: "v2" });
    expect(parsed.board.deliveryRecipes![0].items[0].sourceVersion).toEqual(imported.finalVersion);
    expect(JSON.stringify(parsed.board)).not.toContain(directory);
    expect(parsed.images.get(imported.finalVersion!.imagePath)).toEqual(png);
  });
});
