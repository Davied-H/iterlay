import { open } from "node:fs/promises";
export interface ImageDimensions { width: number; height: number }
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
/** Read dimensions without allocating a decoded full-size bitmap. */
export function imageDimensionsFromHeader(bytes: Buffer): ImageDimensions | null {
  let width = 0, height = 0;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR") {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (bytes.length >= 10 && /^GIF8[79]a$/u.test(bytes.toString("ascii", 0, 6))) {
    width = bytes.readUInt16LE(6); height = bytes.readUInt16LE(8);
  } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (JPEG_SOF.has(marker) && length >= 7) {
        height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break;
      }
      offset += length;
    }
  } else if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3); }
    else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff;
    } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    }
  }
  return width > 0 && height > 0 && width <= 100_000 && height <= 100_000 ? { width, height } : null;
}

export async function readImageDimensions(file: string, fallback: () => Promise<ImageDimensions | null>): Promise<ImageDimensions | null> {
  try {
    const handle = await open(file, "r");
    try {
      const buffer = Buffer.alloc(256 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const dimensions = imageDimensionsFromHeader(buffer.subarray(0, bytesRead));
      if (dimensions) return dimensions;
    } finally { await handle.close(); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  return fallback();
}
