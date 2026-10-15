import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDevBrowserAssetResponse } from "../electron/dev-browser-assets.js";
import { AssetStore } from "../electron/storage/asset-store.js";
import { toDevBrowserAssetUrl } from "../shared/dev-asset-url.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-dev-assets-"));
  temporaryDirectories.push(directory);
  const store = new AssetStore(directory);
  const bytes = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
  const filePath = await store.saveVideoOutput("fixture", bytes, "video/mp4");
  const assetUrl = store.toAssetUrl(filePath);
  const url = `http://127.0.0.1:5180${toDevBrowserAssetUrl(assetUrl)}`;
  return { directory, store, bytes, assetUrl, url };
}

describe("development browser asset response", () => {
  it("streams a real managed video, preserving MIME and byte ranges", async () => {
    const { store, url } = await fixture();
    const response = await createDevBrowserAssetResponse(new Request(url, { headers: { Range: "bytes=8-15" } }), store);

    expect(response?.status).toBe(206);
    expect(response?.headers.get("content-type")).toBe("video/mp4");
    expect(response?.headers.get("content-range")).toBe("bytes 8-15/32");
    expect(response?.headers.get("content-length")).toBe("8");
    expect(response?.headers.get("accept-ranges")).toBe("bytes");
    expect(response?.headers.get("access-control-allow-origin")).toBeNull();
    expect(response?.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect([...new Uint8Array(await response!.arrayBuffer())]).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("supports complete image fetches, HEAD, and unsatisfiable ranges", async () => {
    const { store, url } = await fixture();
    const [imagePath] = await store.saveOutputs("image", [{ bytes: Buffer.from("png fixture"), mimeType: "image/png" }]);
    const imageUrl = `http://127.0.0.1:5180${toDevBrowserAssetUrl(store.toAssetUrl(imagePath))}`;
    const imageResponse = await createDevBrowserAssetResponse(new Request(imageUrl), store);
    expect(imageResponse?.status).toBe(200);
    expect(imageResponse?.headers.get("content-type")).toBe("image/png");
    expect(await imageResponse?.text()).toBe("png fixture");

    const head = await createDevBrowserAssetResponse(new Request(url, { method: "HEAD" }), store);
    expect(head?.status).toBe(200);
    expect(head?.headers.get("content-length")).toBe("32");
    expect(await head?.text()).toBe("");

    const invalidRange = await createDevBrowserAssetResponse(new Request(url, { headers: { Range: "bytes=32-" } }), store);
    expect(invalidRange?.status).toBe(416);
    expect(invalidRange?.headers.get("content-range")).toBe("bytes */32");
  });

  it("passes the original signed asset URL to a resolver callback", async () => {
    const { store, assetUrl, url } = await fixture();
    const resolver = vi.fn((candidate: string) => store.resolveAssetUrl(candidate));
    const response = await createDevBrowserAssetResponse(new Request(url), resolver);
    expect(resolver).toHaveBeenCalledWith(assetUrl);
    expect(response?.status).toBe(200);
    await response?.arrayBuffer();
  });

  it("rejects tampered tokens, arbitrary paths, and tokens issued by another store", async () => {
    const { directory, store, url } = await fixture();
    const tampered = url.slice(0, -2) + (url.at(-2) === "A" ? "B" : "A") + url.at(-1);
    const tamperedResponse = await createDevBrowserAssetResponse(new Request(tampered), store);
    const otherStoreResponse = await createDevBrowserAssetResponse(new Request(url), new AssetStore(directory));
    expect(tamperedResponse?.status).toBe(404);
    expect(otherStoreResponse?.status).toBe(404);

    const resolver = vi.fn(() => "/etc/passwd");
    for (const suffix of ["", "%2fetc%2fpasswd", "file:///etc/passwd", "token/extra"]) {
      const response = await createDevBrowserAssetResponse(new Request(`http://127.0.0.1:5180/__iterlay_dev/assets/${suffix}`), resolver);
      expect(response?.status).toBe(404);
    }
    expect(resolver).not.toHaveBeenCalled();
  });

  it("leaves unrelated middleware routes alone and disallows asset writes", async () => {
    const { store, url } = await fixture();
    expect(await createDevBrowserAssetResponse(new Request("http://127.0.0.1:5180/src/main.tsx"), store)).toBeNull();
    const response = await createDevBrowserAssetResponse(new Request(url, { method: "POST", body: "file" }), store);
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("GET, HEAD");
  });
});
