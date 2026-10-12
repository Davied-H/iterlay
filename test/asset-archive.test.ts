import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { buildAssetArchive, buildNamedArchive } from "../electron/asset-archive";

describe("asset ZIP archive", () => {
  it("keeps image bytes and makes duplicate base names unique", async () => {
    const archive = await buildAssetArchive([
      { sourcePath: "/first/image.png", bytes: Buffer.from("first") },
      { sourcePath: "/second/image.png", bytes: Buffer.from("second") },
      { sourcePath: "/third/photo.webp", bytes: Buffer.from("third") }
    ]);
    const zip = new AdmZip(archive);
    const files = new Map(zip.getEntries().map((entry) => [entry.entryName, entry.getData().toString("utf8")]));

    expect(Object.fromEntries(files)).toEqual({
      "image.png": "first",
      "image-1.png": "second",
      "photo.webp": "third"
    });
  });
});

describe("named ZIP archive", () => {
  it("preserves safe relative directories for WeChat packages", async () => {
    const archive = await buildNamedArchive([
      { name: "stickers/01.png", bytes: Buffer.from("sticker") },
      { name: "preview/01-thumb.png", bytes: Buffer.from("preview") },
      { name: "manifest.json", bytes: Buffer.from("manifest") }
    ]);
    const zip = new AdmZip(archive);
    expect(zip.getEntries().map((entry) => entry.entryName)).toEqual([
      "stickers/01.png",
      "preview/01-thumb.png",
      "manifest.json"
    ]);
  });
});
