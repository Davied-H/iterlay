import { parentPort } from "node:worker_threads";
import { writePsdBuffer } from "ag-psd";
export interface PsdLayerInput { name: string; left: number; top: number; width: number; height: number; bgra: Uint8Array }
export interface PsdEncodeInput { width: number; height: number; layers: PsdLayerInput[] }
export function encodePsd(input: PsdEncodeInput): Uint8Array {
  const children = input.layers.map(({ bgra, width, height, name, left, top }) => {
    for (let i = 0; i < bgra.length; i += 4) {
      const blue = bgra[i]; bgra[i] = bgra[i + 2]; bgra[i + 2] = blue;
    }
    return { name, left, top, imageData: { width, height, data: new Uint8ClampedArray(bgra.buffer, bgra.byteOffset, bgra.byteLength) } };
  });
  return Uint8Array.from(writePsdBuffer({ width: input.width, height: input.height, children }, { generateThumbnail: false }));
}
parentPort?.once("message", (input: PsdEncodeInput) => {
  try { const bytes = encodePsd(input); parentPort?.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]); }
  catch (error) { parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
});
