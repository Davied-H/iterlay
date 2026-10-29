import { describe, expect, it } from "vitest";
import { MAX_INLINE_MEDIA_BYTES, MAX_INLINE_MEDIA_DATA_URL_LENGTH, parseInlineMediaDataUrl } from "../shared/media-import";
import { listWorkspaceTools } from "../electron/workspace-tools";
import { workspaceFixture } from "./helpers/workspace-fixture";

describe("inline media budgets", () => {
  it.each(["image", "video"] as const)("accepts the exact byte limit for %s while staying within the HTTP body limit", (kind) => {
    const dataBase64 = Buffer.alloc(MAX_INLINE_MEDIA_BYTES, 1).toString("base64");
    const dataUrl = `data:${kind === "image" ? "image/png" : "video/mp4"};base64,${dataBase64}`;
    expect(parseInlineMediaDataUrl(dataUrl, kind).dataBase64.length).toBe(dataBase64.length);
    expect(Buffer.byteLength(JSON.stringify({ method: `import_${kind}`, args: { dataUrl, boardId: "board" } }))).toBeLessThan(32 * 1024 * 1024);
  });

  it.each(["image", "video"] as const)("rejects one byte over the %s limit even when Base64 has the same length", (kind) => {
    // 20 MiB leaves remainder 2 modulo 3: +1 byte has the same encoded length.
    const dataBase64 = Buffer.alloc(MAX_INLINE_MEDIA_BYTES + 1, 1).toString("base64");
    const dataUrl = `data:${kind === "image" ? "image/png" : "video/mp4"};base64,${dataBase64}`;
    expect(dataUrl.length).toBeLessThan(MAX_INLINE_MEDIA_DATA_URL_LENGTH);
    expect(() => parseInlineMediaDataUrl(dataUrl, kind)).toThrow("20 MiB");
  });

  it.each([
    [undefined, "字符串"],
    [123, "字符串"],
    ["https://example.com/image.png", "data URL"],
    ["data:video/mp4;base64,YQ==", "data URL"],
    ["data:image/png;base64,", "为空"],
    ["data:image/png;base64,A", "Base64"],
    ["data:image/png;base64,YQ=", "Base64"],
    ["data:image/png;base64,=AAA", "Base64"],
    ["data:image/png;base64,!!!!", "Base64"],
    ["data:image/png;base64,YQ===", "Base64"]
  ])("rejects malformed image data before any import or board mutation (%s)", async (dataUrl, error) => {
    const f = workspaceFixture();
    await expect(f.commands.call("import_image", { dataUrl, boardId: "board" })).rejects.toThrow(String(error));
    expect(f.mocks.importUploadedImage).not.toHaveBeenCalled();
    expect(f.mocks.appendBoardNodes).not.toHaveBeenCalled();
    expect(f.flush).not.toHaveBeenCalled();
    expect(f.emit).not.toHaveBeenCalled();
  });

  it("accepts unpadded Base64 and rejects invalid or oversized video envelopes", async () => {
    expect(parseInlineMediaDataUrl("data:image/png;base64,YQ", "image").dataBase64).toBe("YQ");
    expect(parseInlineMediaDataUrl("data:video/mp4;base64,YWI", "video").dataBase64).toBe("YWI");
    const f = workspaceFixture();
    for (const dataUrl of ["data:image/png;base64,YQ==", "data:video/avi;base64,YQ==", "data:video/mp4;base64,AA=", "x".repeat(MAX_INLINE_MEDIA_DATA_URL_LENGTH + 1)]) {
      await expect(f.commands.call("import_video", { dataUrl })).rejects.toThrow(/视频/u);
    }
    expect(f.mocks.importVideo).not.toHaveBeenCalled();
    expect(f.flush).not.toHaveBeenCalled();
  });

  it("still rejects oversized text independently of media imports", async () => {
    const f = workspaceFixture();
    await expect(f.commands.call("generate_image", { boardId: "board", prompt: "a".repeat(100_001) })).rejects.toThrow("100000 字符");
    expect(f.mocks.generateImage).not.toHaveBeenCalled();
  });

  it("advertises the media budget in both tool schemas", () => {
    for (const name of ["import_image", "import_video"]) {
      const tool = listWorkspaceTools().find((entry) => entry.name === name);
      expect(tool).toMatchObject({ description: expect.stringContaining("20 MiB"), inputSchema: { properties: { dataUrl: { type: "string", maxLength: MAX_INLINE_MEDIA_DATA_URL_LENGTH } } } });
    }
  });
});
