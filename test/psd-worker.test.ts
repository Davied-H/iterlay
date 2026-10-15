import { describe, expect, it } from "vitest";
import { initializeCanvas, readPsd } from "ag-psd";
import { encodePsdInWorker } from "../electron/media/psd-worker-client";
initializeCanvas(() => { throw new Error("Canvas is not required for image data decoding"); }, undefined,
  (width, height) => ({ width, height, colorSpace: "srgb", data: new Uint8ClampedArray(width * height * 4) }));
describe("PSD media encoding", () => {
  it("round-trips layer positions and BGRA colors without renderer canvas", async () => {
    const bytes = await encodePsdInWorker({ width: 10, height: 10, layers: [
      { name: "red", left: 2, top: 3, width: 1, height: 1, bgra: Uint8Array.from([0, 0, 255, 255]) }
    ] });
    const psd = readPsd(bytes, { useImageData: true, skipCompositeImageData: true });
    expect([psd.width, psd.height]).toEqual([10, 10]);
    expect(psd.children?.[0]).toMatchObject({ name: "red", left: 2, top: 3 });
    expect(Array.from(psd.children?.[0].imageData?.data ?? [])).toEqual([255, 0, 0, 255]);
  });
  it("cancels before encoding or transferring layer buffers", async () => {
    const signal = AbortSignal.abort();
    await expect(encodePsdInWorker({ width: 1, height: 1, layers: [] }, signal)).rejects.toThrow("已取消");
  });

});
