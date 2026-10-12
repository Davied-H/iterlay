import { describe, expect, it } from "vitest";
import { thumbHashToApproximateAspectRatio, thumbHashToRGBA } from "thumbhash";
import { bgraToRgba, detectAlpha, encodeThumbHashEntry } from "../electron/thumbhash-encoder";

/** 构造 w x h 的纯色 straight RGBA 图。 */
function solidRgba(width: number, height: number, [r, g, b, a]: number[]): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  }
  return rgba;
}

describe("bgraToRgba", () => {
  it("swaps the R/B channels for opaque pixels", () => {
    // BGRA: B=10 G=20 R=30 A=255
    const rgba = bgraToRgba(new Uint8Array([10, 20, 30, 255]));
    expect([...rgba]).toEqual([30, 20, 10, 255]);
  });

  it("un-premultiplies semi-transparent pixels", () => {
    // straight RGB=(200,100,50) A=128 → premultiplied BGRA ≈ (25,50,100,128)
    const rgba = bgraToRgba(new Uint8Array([25, 50, 100, 128]));
    expect(rgba[3]).toBe(128);
    expect(Math.abs(rgba[0] - 199)).toBeLessThanOrEqual(2);
    expect(Math.abs(rgba[1] - 100)).toBeLessThanOrEqual(2);
    expect(Math.abs(rgba[2] - 50)).toBeLessThanOrEqual(2);
  });

  it("keeps fully transparent pixels at zero without dividing by zero", () => {
    const rgba = bgraToRgba(new Uint8Array([0, 0, 0, 0]));
    expect([...rgba]).toEqual([0, 0, 0, 0]);
    expect(rgba.every(Number.isFinite)).toBe(true);
  });

  it("clamps channels that exceed alpha after rounding", () => {
    // 病态输入：通道值大于 alpha（非法 premultiplied），应被夹到 255 而非溢出。
    const rgba = bgraToRgba(new Uint8Array([200, 200, 200, 100]));
    expect(rgba[0]).toBe(255);
  });
});

describe("detectAlpha", () => {
  it("returns false for fully opaque images", () => {
    expect(detectAlpha(solidRgba(4, 4, [255, 0, 0, 255]))).toBe(false);
  });

  it("tolerates near-opaque rounding noise", () => {
    expect(detectAlpha(solidRgba(4, 4, [255, 0, 0, 252]))).toBe(false);
  });

  it("returns true when any pixel is transparent", () => {
    const rgba = solidRgba(4, 4, [255, 0, 0, 255]);
    rgba[7] = 0;
    expect(detectAlpha(rgba)).toBe(true);
  });
});

describe("encodeThumbHashEntry", () => {
  it("produces a stable base64 hash that decodes with the expected aspect ratio", () => {
    const width = 96;
    const height = 72; // 4:3
    const rgba = solidRgba(width, height, [120, 180, 240, 255]);
    const first = encodeThumbHashEntry(rgba, width, height);
    const second = encodeThumbHashEntry(rgba, width, height);

    expect(first.hash).toBe(second.hash);
    expect(first.hasAlpha).toBe(false);

    const bytes = Uint8Array.from(Buffer.from(first.hash, "base64"));
    // thumbhash 的比例是近似值，允许 15% 误差。
    expect(Math.abs(thumbHashToApproximateAspectRatio(bytes) - 4 / 3)).toBeLessThan((4 / 3) * 0.15);
    const decoded = thumbHashToRGBA(bytes);
    expect(decoded.w).toBeGreaterThan(0);
    expect(decoded.h).toBeGreaterThan(0);
  });

  it("flags transparency so the renderer can show a checkerboard", () => {
    const rgba = solidRgba(64, 64, [255, 255, 255, 255]);
    for (let i = 3; i < rgba.length / 2; i += 4) rgba[i] = 0;
    expect(encodeThumbHashEntry(rgba, 64, 64).hasAlpha).toBe(true);
  });
});
