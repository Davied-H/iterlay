import { describe, expect, it } from "vitest";
import {
  fromDevBrowserAssetUrl,
  mapDevBrowserAssetUrls,
  toDevBrowserAssetUrl
} from "../shared/dev-asset-url.js";

const assetUrl = "iterlay-asset://local/YXNzZXQ_-123";
const browserUrl = "/__iterlay_dev/assets/YXNzZXQ_-123";

describe("development browser asset URLs", () => {
  it("round-trips signed tokens through a relative same-origin endpoint", () => {
    expect(toDevBrowserAssetUrl(assetUrl)).toBe(browserUrl);
    expect(fromDevBrowserAssetUrl(browserUrl)).toBe(assetUrl);
    expect(fromDevBrowserAssetUrl(`http://127.0.0.1:5180${browserUrl}`, "http://127.0.0.1:5180")).toBe(assetUrl);
  });

  it("converts nested JSON values without changing text, encoded data, or its input", () => {
    const payload = {
      url: assetUrl,
      children: [{ thumbnailUrl: assetUrl }, [assetUrl, null, 2, false]],
      prompt: `Please use ${assetUrl} for the image.`,
      serialized: JSON.stringify({ url: assetUrl }),
      dataBase64: Buffer.from(assetUrl).toString("base64"),
      dataUrl: `data:text/plain,${assetUrl}`,
      bytes: new Uint8Array([1, 2])
    };

    const converted = mapDevBrowserAssetUrls(payload, "to-browser");

    expect(converted.url).toBe(browserUrl);
    expect(converted.children).toEqual([{ thumbnailUrl: browserUrl }, [browserUrl, null, 2, false]]);
    expect(converted.prompt).toBe(payload.prompt);
    expect(converted.serialized).toBe(payload.serialized);
    expect(converted.dataBase64).toBe(payload.dataBase64);
    expect(converted.dataUrl).toBe(payload.dataUrl);
    expect(converted.bytes).toBe(payload.bytes);
    expect(payload.url).toBe(assetUrl);
    expect(mapDevBrowserAssetUrls(converted, "to-electron")).toEqual(payload);
  });

  it("leaves unrecognized schemes, origins, paths, and malformed tokens untouched", () => {
    for (const value of [
      "file:///etc/passwd",
      "iterlay-asset://other/YXNzZXQ_-123",
      `${assetUrl}/extra`,
      `${assetUrl}?path=/etc/passwd`,
      "iterlay-asset://local/../etc/passwd",
      `prefix ${assetUrl}`
    ]) {
      expect(toDevBrowserAssetUrl(value)).toBe(value);
    }
    for (const value of [
      `https://example.com${browserUrl}`,
      `//example.com${browserUrl}`,
      `${browserUrl}/extra`,
      "/__iterlay_dev/assets/%2e%2e%2fetc%2fpasswd",
      `http://127.0.0.1:5180${browserUrl}?path=/etc/passwd`
    ]) {
      expect(fromDevBrowserAssetUrl(value, "http://127.0.0.1:5180")).toBe(value);
    }
    expect(fromDevBrowserAssetUrl(`http://127.0.0.1:5180${browserUrl}`)).toBe(`http://127.0.0.1:5180${browserUrl}`);
  });
});
