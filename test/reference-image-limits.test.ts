import { describe, expect, it } from "vitest";
import {
  OFFICIAL_REFERENCE_MAX_EDGE,
  OFFICIAL_REFERENCE_MAX_PIXELS,
  constrainReferenceImageDimensions,
  formatReferenceImageLimitMessage,
  getAssistantReferenceByteBudget,
  getReferenceImageLimitViolation
} from "../shared/reference-image-limits.js";

describe("reference image limits", () => {
  it("keeps normal reference images unchanged", () => {
    expect(constrainReferenceImageDimensions(2048, 2048)).toEqual({ width: 2048, height: 2048 });
    expect(getReferenceImageLimitViolation(2048, 2048)).toBeNull();
  });

  it("shares the total assistant payload budget across all references", () => {
    expect(getAssistantReferenceByteBudget(1)).toBe(8 * 1024 * 1024);
    expect(getAssistantReferenceByteBudget(4)).toBe(3 * 1024 * 1024);
    expect(getAssistantReferenceByteBudget(4) * 4).toBe(12 * 1024 * 1024);
  });

  it("bounds ultra-tall screenshots by their long edge", () => {
    const result = constrainReferenceImageDimensions(1200, 12_000);
    expect(result.height).toBe(OFFICIAL_REFERENCE_MAX_EDGE);
    expect(result.width).toBe(409);
    expect(result.width * result.height).toBeLessThanOrEqual(OFFICIAL_REFERENCE_MAX_PIXELS);
    expect(getReferenceImageLimitViolation(1200, 12_000)).toEqual({
      exceedsPixels: true,
      exceedsEdge: true
    });
  });

  it("bounds large square images by total pixels", () => {
    const result = constrainReferenceImageDimensions(6000, 6000);
    expect(result.width).toBe(result.height);
    expect(result.width * result.height).toBeLessThanOrEqual(OFFICIAL_REFERENCE_MAX_PIXELS);
    expect(Math.max(result.width, result.height)).toBeLessThan(OFFICIAL_REFERENCE_MAX_EDGE);
  });

  it("gives a recovery-oriented error instead of suggesting file compression", () => {
    const message = formatReferenceImageLimitMessage(1200, 12_000, 0);
    expect(message).toContain("第 1 张参考图分辨率/总像素过大");
    expect(message).toContain("缩小尺寸或切分图片");
    expect(message).not.toContain("压缩");
  });
});
