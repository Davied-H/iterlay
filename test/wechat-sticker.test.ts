import { describe, expect, it } from "vitest";
import {
  buildWechatPersonalPackage,
  assertWechatStickerFile,
  WECHAT_QUICK_ADD_TARGET_BYTES,
  normalizeWechatGifDelay,
  sanitizeWechatStickerName,
  validateWechatAlbumCount,
  type WechatStickerOutput
} from "../src/lib/wechat-sticker";

function sticker(overrides: Partial<WechatStickerOutput> = {}): WechatStickerOutput {
  return {
    sourceId: "source-1",
    fileName: "01.gif",
    mimeType: "image/gif",
    bytes: new Uint8Array([1, 2, 3]),
    previewPngBytes: new Uint8Array([1, 2, 3]),
    width: 240,
    height: 240,
    animated: false,
    frameCount: 1,
    originalBytes: 3,
    warnings: [],
    ...overrides
  };
}

describe("wechat sticker packaging", () => {
  it("keeps the personal quick-add target below the official submission limit", () => {
    expect(WECHAT_QUICK_ADD_TARGET_BYTES).toBe(96 * 1024);
    expect(WECHAT_QUICK_ADD_TARGET_BYTES).toBeLessThan(500 * 1024);
  });

  it("normalizes editable GIF frame delays", () => {
    expect(normalizeWechatGifDelay(Number.NaN)).toBe(400);
    expect(normalizeWechatGifDelay(5)).toBe(20);
    expect(normalizeWechatGifDelay(437)).toBe(440);
    expect(normalizeWechatGifDelay(20_000)).toBe(10_000);
  });

  it("rejects corrupt or incorrectly sized sticker binaries", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(png.buffer).setUint32(16, 240);
    new DataView(png.buffer).setUint32(20, 240);
    expect(() => assertWechatStickerFile(png, "image/png")).not.toThrow();
    new DataView(png.buffer).setUint32(20, 239);
    expect(() => assertWechatStickerFile(png, "image/png")).toThrow(/240×240/);
    expect(() => assertWechatStickerFile(new Uint8Array([1, 2, 3]), "image/png")).toThrow(/有效的 PNG/);
  });

  it("validates the official album count range", () => {
    expect(validateWechatAlbumCount(7)).toMatch(/8 至 24/);
    expect(validateWechatAlbumCount(8)).toBeNull();
    expect(validateWechatAlbumCount(24)).toBeNull();
    expect(validateWechatAlbumCount(25)).toMatch(/8 至 24/);
  });

  it("sanitizes package names for local files", () => {
    expect(sanitizeWechatStickerName('  我的\\微信/表情:*?"<>|  ')).toBe("我的微信表情");
    expect(sanitizeWechatStickerName("   ", "默认表情")).toBe("默认表情");
  });

  it("builds all personal sticker files as GIF, including static stickers", () => {
    const result = buildWechatPersonalPackage([
      sticker(),
      sticker({
        sourceId: "source-2",
        fileName: "02.gif",
        mimeType: "image/gif",
        bytes: new Uint8Array([4, 5]),
        animated: true,
        frameCount: 2
      })
    ]);
    expect(result.files.map((file) => file.relativePath)).toEqual([
      "stickers/01.gif",
      "stickers/02.gif",
      "manifest.json",
      "README.txt"
    ]);
    expect(result.manifest).toMatchObject({ count: 2 });
    const readme = new TextDecoder().decode(result.files.find((file) => file.relativePath === "README.txt")?.bytes);
    expect(readme).toContain("系统相册");
    expect(readme).toContain("添加的单个表情");
    expect(readme).toContain("不要把 ZIP");
    expect(readme).toContain("单帧 GIF");
  });
});
