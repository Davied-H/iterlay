import { describe, expect, it } from "vitest";
import { removeConnectedBackground } from "../shared/background-removal";

function createPixels(width: number, height: number, color: [number, number, number, number]): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels.set(color, index * 4);
  }
  return pixels;
}

function setPixel(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: [number, number, number, number]
): void {
  pixels.set(color, (y * width + x) * 4);
}

function alphaAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4 + 3];
}

describe("removeConnectedBackground", () => {
  it("removes a corner-connected background and preserves a separated subject", () => {
    const width = 9;
    const height = 9;
    const pixels = createPixels(width, height, [240, 240, 240, 255]);
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) setPixel(pixels, width, x, y, [30, 60, 90, 255]);
    }

    const result = removeConnectedBackground(pixels, width, height);

    expect(alphaAt(result.pixels, width, 0, 0)).toBe(0);
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) {
        expect(alphaAt(result.pixels, width, x, y)).toBe(255);
      }
    }
    expect(result.removedPixels).toBeGreaterThan(width * height * 0.7);
    expect(result.removedPixels).toBeLessThanOrEqual(width * height - 9);
    expect(result.alreadyTransparent).toBe(false);
  });

  it("follows a gradual background while stopping at a high-contrast edge", () => {
    const width = 12;
    const height = 10;
    const pixels = createPixels(width, height, [0, 0, 0, 255]);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const shade = 80 + x * 5 + y * 3;
        setPixel(pixels, width, x, y, [shade, shade, 220, 255]);
      }
    }
    for (let y = 3; y <= 6; y += 1) {
      for (let x = 4; x <= 7; x += 1) setPixel(pixels, width, x, y, [10, 10, 10, 255]);
    }

    const result = removeConnectedBackground(pixels, width, height);

    expect(alphaAt(result.pixels, width, 1, 5)).toBe(0);
    expect(alphaAt(result.pixels, width, 5, 4)).toBe(255);
  });

  it("keeps an already transparent image unchanged", () => {
    const pixels = createPixels(6, 6, [120, 80, 40, 255]);
    for (const [x, y] of [[0, 0], [5, 0], [0, 5], [5, 5]]) {
      setPixel(pixels, 6, x, y, [0, 0, 0, 0]);
    }

    const result = removeConnectedBackground(pixels, 6, 6);

    expect(result.alreadyTransparent).toBe(true);
    expect(result.pixels).toEqual(pixels);
  });

  it("rejects malformed pixel buffers", () => {
    expect(() => removeConnectedBackground(new Uint8Array(4), 2, 2)).toThrow("像素数据长度无效");
  });
});
