import { describe, expect, it } from "vitest";
import {
  extractConnectedPhotoSubject,
  extractChromaticPhotoSubject,
  fillPhotoLayerInterior,
  hasLostProtectedOpaqueEdge,
  inpaintPhotoBackground,
  intersectPhotoLayerMask,
  measureOpaqueBounds,
  measureOpaqueEdgeFractions,
  measureOpaqueFraction,
  subtractPhotoLayerMask
} from "../electron/photo-layer-segmentation.js";

describe("photo layer segmentation", () => {
  it("measures opaque pixels touching each crop edge", () => {
    const width = 4;
    const height = 4;
    const pixels = new Uint8Array(width * height * 4);
    for (const [x, y] of [[1, 0], [3, 2], [2, 3], [0, 1]]) {
      pixels[(y * width + x) * 4 + 3] = 255;
    }

    expect(measureOpaqueEdgeFractions(pixels, width, height, 1)).toEqual({
      top: 0.25,
      right: 0.25,
      bottom: 0.25,
      left: 0.25
    });
  });

  it("rejects generated cutouts that lose an original canvas-edge contact", () => {
    const local = { top: 0.4, right: 0.7, bottom: 0, left: 0 };
    const generated = { top: 0.35, right: 0.1, bottom: 0, left: 0 };

    expect(hasLostProtectedOpaqueEdge(local, generated, { top: true, right: true })).toBe(true);
    expect(hasLostProtectedOpaqueEdge(local, generated, { top: true })).toBe(false);
  });

  it("rejects malformed BGRA buffers", () => {
    expect(() => measureOpaqueEdgeFractions(new Uint8Array(4), 2, 2)).toThrow("像素数据无效");
  });

  it("measures subject coverage before accepting a segmented asset", () => {
    const pixels = new Uint8Array(4 * 4 * 4);
    pixels[3] = 255;
    pixels[7] = 64;
    expect(measureOpaqueFraction(pixels, 4, 4)).toBe(0.125);
  });

  it("measures whether a generated subject spans a complete object footprint", () => {
    const pixels = new Uint8Array(10 * 8 * 4);
    for (let y = 2; y <= 6; y += 1) {
      for (let x = 3; x <= 8; x += 1) pixels[(y * 10 + x) * 4 + 3] = 255;
    }

    expect(measureOpaqueBounds(pixels, 10, 8)).toEqual({
      minX: 3,
      minY: 2,
      maxX: 8,
      maxY: 6,
      widthFraction: 0.6,
      heightFraction: 0.625
    });
    expect(measureOpaqueBounds(new Uint8Array(10 * 8 * 4), 10, 8)).toBeNull();
  });

  it("removes person overlap from a non-person photo layer", () => {
    const source = new Uint8Array(2 * 4).fill(255);
    const mask = new Uint8Array(2 * 4);
    mask[3] = 255;
    mask[7] = 64;

    const output = subtractPhotoLayerMask(source, mask, 2, 1);

    expect(output[3]).toBe(0);
    expect(output[7]).toBe(0);
    expect(source[3]).toBe(255);
  });

  it("removes connected background pixels without softening the subject alpha", () => {
    const source = new Uint8Array([
      10, 20, 30, 180,
      40, 50, 60, 255
    ]);
    const connectedMask = new Uint8Array([
      0, 0, 0, 0,
      0, 0, 0, 255
    ]);

    expect([...intersectPhotoLayerMask(source, connectedMask, 2, 1)]).toEqual([
      10, 20, 30, 0,
      40, 50, 60, 255
    ]);
  });

  it("keeps the centered object while removing border background and stray details", () => {
    const width = 9;
    const height = 9;
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      pixels.set([220, 140, 30, 255], index * 4);
    }
    for (let y = 0; y <= 6; y += 1) {
      for (let x = 3; x <= 5; x += 1) pixels.set([20, 30, 230, 255], (y * width + x) * 4);
    }
    pixels.set([10, 10, 10, 255], (7 * width + 1) * 4);

    const output = extractConnectedPhotoSubject(pixels, width, height, { top: true });

    expect(output[(4 * width + 4) * 4 + 3]).toBe(255);
    expect(output[(7 * width + 1) * 4 + 3]).toBe(0);
    expect(output[(4 * width + 0) * 4 + 3]).toBe(0);
  });

  it("does not erase a contrasting solid object that touches an unprotected crop edge", () => {
    const width = 8;
    const height = 6;
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      pixels.set([220, 140, 30, 255], index * 4);
    }
    for (let y = 1; y <= 4; y += 1) {
      for (let x = 4; x < width; x += 1) pixels.set([20, 30, 230, 255], (y * width + x) * 4);
    }

    const output = extractConnectedPhotoSubject(pixels, width, height);

    expect(output[(2 * width + 7) * 4 + 3]).toBe(255);
    expect(output[(2 * width + 0) * 4 + 3]).toBe(0);
  });

  it("isolates a saturated sign rim from a chromatic background and dark wire", () => {
    const width = 12;
    const height = 10;
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      pixels.set([210, 140, 20, 255], index * 4);
    }
    for (let x = 0; x < width; x += 1) pixels.set([15, 15, 15, 255], (6 * width + x) * 4);
    for (let y = 1; y <= 8; y += 1) {
      for (let x = 5; x < width; x += 1) {
        const rim = y === 1 || y === 8 || x === 5 || x === width - 1;
        pixels.set(rim ? [30, 30, 220, 255] : [230, 230, 230, 255], (y * width + x) * 4);
      }
    }

    const rim = extractChromaticPhotoSubject(pixels, width, height, { right: true });
    const solid = fillPhotoLayerInterior(rim, width, height);

    expect(solid[(4 * width + 8) * 4 + 3]).toBe(255);
    expect(solid[(6 * width + 1) * 4 + 3]).toBe(0);
  });

  it("fills transparent color details inside a solid object silhouette", () => {
    const width = 5;
    const pixels = new Uint8Array(width * 4);
    for (let x = 0; x < width; x += 1) pixels.set([30, 40, 50, 0], x * 4);
    pixels[3] = 255;
    pixels[(width - 1) * 4 + 3] = 255;

    const output = fillPhotoLayerInterior(pixels, width, 1);

    expect(Array.from({ length: width }, (_, x) => output[x * 4 + 3])).toEqual([255, 255, 255, 255, 255]);
  });

  it("fills an open solid silhouette through protected source-image edges", () => {
    const width = 5;
    const height = 4;
    const pixels = new Uint8Array(width * height * 4);
    pixels[(1 * width + 2) * 4 + 3] = 255;
    pixels[(2 * width + 1) * 4 + 3] = 255;
    pixels[(2 * width + 2) * 4 + 3] = 255;

    const output = fillPhotoLayerInterior(pixels, width, height, 32, {
      top: true,
      right: true
    });

    expect(output[(0 * width + 2) * 4 + 3]).toBe(255);
    expect(output[(1 * width + 4) * 4 + 3]).toBe(255);
    expect(output[(3 * width + 2) * 4 + 3]).toBe(0);
  });

  it("creates an opaque clean background behind extracted subjects", () => {
    const width = 5;
    const height = 5;
    const source = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      source[index * 4] = 220;
      source[index * 4 + 1] = 120;
      source[index * 4 + 2] = 20;
      source[index * 4 + 3] = 255;
    }
    const centerOffset = (2 * width + 2) * 4;
    source[centerOffset] = 10;
    source[centerOffset + 1] = 20;
    source[centerOffset + 2] = 240;
    const subject = new Uint8Array([10, 20, 240, 255]);

    const output = inpaintPhotoBackground(source, width, height, [{
      bgra: subject,
      x: 2,
      y: 2,
      width: 1,
      height: 1
    }], 0, 0);

    expect([...output.slice(centerOffset, centerOffset + 4)]).toEqual([220, 120, 20, 255]);
    expect(output.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
  });
});
