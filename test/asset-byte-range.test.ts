import { describe, expect, it } from "vitest";
import { parseAssetByteRange } from "../electron/asset-byte-range.js";

describe("asset byte ranges", () => {
  it("parses bounded, open-ended, and suffix ranges", () => {
    expect(parseAssetByteRange("bytes=100-199", 1_000)).toEqual({ start: 100, end: 199 });
    expect(parseAssetByteRange("bytes=900-", 1_000)).toEqual({ start: 900, end: 999 });
    expect(parseAssetByteRange("bytes=-128", 1_000)).toEqual({ start: 872, end: 999 });
  });

  it("clamps the end and rejects unsatisfiable or multi-part ranges", () => {
    expect(parseAssetByteRange("bytes=900-1200", 1_000)).toEqual({ start: 900, end: 999 });
    expect(parseAssetByteRange("bytes=1000-", 1_000)).toBeNull();
    expect(parseAssetByteRange("bytes=200-100", 1_000)).toBeNull();
    expect(parseAssetByteRange("bytes=0-1,4-5", 1_000)).toBeNull();
    expect(parseAssetByteRange(null, 1_000)).toBeNull();
  });
});
