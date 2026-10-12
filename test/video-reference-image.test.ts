import type { NativeImage } from "electron";
import { describe, expect, it } from "vitest";
import {
  OFFICIAL_VIDEO_REFERENCE_MAX_BYTES,
  OFFICIAL_VIDEO_REFERENCES_MAX_TOTAL_BYTES,
  createVideoSubmitInputNormalizer,
  normalizeOfficialVideoReferenceImage
} from "../electron/video-reference-image.js";
import { OFFICIAL_REFERENCE_MAX_EDGE, OFFICIAL_REFERENCE_MAX_PIXELS } from "../shared/reference-image-limits.js";

function fakeNativeImage(width: number, height: number, bytesPerPixel = 0.4): NativeImage {
  const image = {
    isEmpty: () => false,
    getSize: () => ({ width, height }),
    resize: (options: { width?: number; height?: number }) => fakeNativeImage(
      options.width ?? width,
      options.height ?? height,
      bytesPerPixel
    ),
    toJPEG: (quality: number) => Buffer.alloc(Math.max(1, Math.ceil(width * height * bytesPerPixel * quality / 100)))
  };
  return image as unknown as NativeImage;
}

describe("official video reference normalization", () => {
  it("keeps an already-safe image byte-for-byte", () => {
    const bytes = Buffer.from("safe-image");
    const normalized = normalizeOfficialVideoReferenceImage(
      bytes,
      "image/png",
      () => fakeNativeImage(1_920, 1_080)
    );

    expect(normalized).toEqual({
      bytes,
      mimeType: "image/png",
      width: 1_920,
      height: 1_080,
      resized: false
    });
  });

  it("automatically bounds oversized dimensions and payload bytes", () => {
    const normalized = normalizeOfficialVideoReferenceImage(
      Buffer.alloc(OFFICIAL_VIDEO_REFERENCE_MAX_BYTES + 1),
      "image/png",
      () => fakeNativeImage(6_000, 6_000)
    );

    expect(normalized.resized).toBe(true);
    expect(normalized.mimeType).toBe("image/jpeg");
    expect(Math.max(normalized.width, normalized.height)).toBeLessThanOrEqual(OFFICIAL_REFERENCE_MAX_EDGE);
    expect(normalized.width * normalized.height).toBeLessThanOrEqual(OFFICIAL_REFERENCE_MAX_PIXELS);
    expect(normalized.bytes.length).toBeLessThanOrEqual(OFFICIAL_VIDEO_REFERENCE_MAX_BYTES);
  });

  it("normalizes only official image inputs without mutating the source request", async () => {
    const sourceBytes = Buffer.alloc(OFFICIAL_VIDEO_REFERENCE_MAX_BYTES + 1);
    const input = {
      prompt: "推进镜头",
      inputs: [{
        id: "first",
        kind: "image" as const,
        role: "first-frame" as const,
        name: "first.png",
        mimeType: "image/png",
        bytes: sourceBytes
      }]
    };
    const normalize = createVideoSubmitInputNormalizer(() => fakeNativeImage(1_920, 1_080, 0.1));
    const official = await normalize(input, { provider: "official", model: "official" });
    const ark = await normalize(input, { provider: "ark", apiKey: "key", model: "ark" });

    expect(official).not.toBe(input);
    expect(official.inputs?.[0]).toMatchObject({ name: "first.jpg", mimeType: "image/jpeg", width: 1_920, height: 1_080 });
    expect(official.inputs?.[0].bytes?.length).toBeLessThanOrEqual(OFFICIAL_VIDEO_REFERENCE_MAX_BYTES);
    expect(ark).toBe(input);
    expect(input.inputs[0].bytes).toBe(sourceBytes);
  });

  it("shares the transport budget across first and last frames", async () => {
    const input = {
      prompt: "自然过渡",
      inputs: ["first", "last"].map((id, index) => ({
        id,
        kind: "image" as const,
        role: (index === 0 ? "first-frame" : "last-frame") as "first-frame" | "last-frame",
        name: `${id}.png`,
        mimeType: "image/png",
        bytes: Buffer.alloc(OFFICIAL_VIDEO_REFERENCES_MAX_TOTAL_BYTES)
      }))
    };
    const normalize = createVideoSubmitInputNormalizer(() => fakeNativeImage(1_920, 1_080, 0.3));
    const normalized = await normalize(input, { provider: "official", model: "official" });
    const imageBytes = normalized.inputs?.map((media) => media.bytes?.length ?? 0) ?? [];
    const serializedPayload = JSON.stringify({
      inputs: normalized.inputs?.map((media) => ({ dataBase64: media.bytes?.toString("base64") }))
    });

    expect(imageBytes.every((size) => size <= OFFICIAL_VIDEO_REFERENCES_MAX_TOTAL_BYTES / 2)).toBe(true);
    expect(imageBytes.reduce((total, size) => total + size, 0)).toBeLessThanOrEqual(OFFICIAL_VIDEO_REFERENCES_MAX_TOTAL_BYTES);
    expect(Buffer.byteLength(serializedPayload)).toBeLessThan(900 * 1024);
  });
});
