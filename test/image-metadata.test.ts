import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { imageDimensionsFromHeader, readImageDimensions } from "../electron/media/image-metadata";
describe("bounded image metadata reads", () => {
  it("reads a real JPEG without decoding its bitmap", async () => {
    const bytes = await readFile(new URL("../demo-assets/lamp-studio.jpg", import.meta.url));
    const size = imageDimensionsFromHeader(bytes);
    expect(size?.width).toBeGreaterThan(0);
    expect(size?.height).toBeGreaterThan(0);
    expect(await readImageDimensions(new URL("../demo-assets/lamp-studio.jpg", import.meta.url).pathname, async () => { throw new Error("unnecessary decode"); })).toEqual(size);
  });
  it("handles PNG dimensions and truncated headers", () => {
    const bytes = Buffer.alloc(24);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
    bytes.write("IHDR", 12);
    bytes.writeUInt32BE(2048, 16); bytes.writeUInt32BE(1024, 20);
    expect(imageDimensionsFromHeader(bytes)).toEqual({ width: 2048, height: 1024 });
    expect(imageDimensionsFromHeader(bytes.subarray(0, 20))).toBeNull();
    expect(imageDimensionsFromHeader(Buffer.from([0xff,0xd8,0xff,0xc0,0,20]))).toBeNull();
  });
});
