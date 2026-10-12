import { afterEach, describe, expect, it, vi } from "vitest";
import { copyImageDataUrlToClipboard } from "../src/lib/clipboard-images";

const ONE_PIXEL_GIF = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "imageWorkbench");
  vi.unstubAllGlobals();
});

describe("image clipboard output", () => {
  it("preserves source GIF bytes and uses the native clipboard bridge", async () => {
    const writeClipboardImage = vi.fn().mockResolvedValue({ ok: true });
    Object.assign(globalThis, { imageWorkbench: { writeClipboardImage } });

    await copyImageDataUrlToClipboard(`data:image/gif;base64,${ONE_PIXEL_GIF}`, "gif");

    expect(writeClipboardImage).toHaveBeenCalledOnce();
    const request = writeClipboardImage.mock.calls[0][0] as { mimeType: string; bytes: ArrayBuffer };
    expect(request.mimeType).toBe("image/gif");
    expect(Buffer.from(request.bytes).toString("base64")).toBe(ONE_PIXEL_GIF);
  });

  it("encodes a static image as a valid single-frame GIF", async () => {
    const writeClipboardImage = vi.fn().mockResolvedValue({ ok: true });
    Object.assign(globalThis, { imageWorkbench: { writeClipboardImage } });
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1, height: 1, close }));
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 255]) })
        })
      })
    });

    await copyImageDataUrlToClipboard("data:image/png;base64,AA==", "gif");

    const request = writeClipboardImage.mock.calls[0][0] as { bytes: ArrayBuffer };
    expect(Buffer.from(request.bytes).subarray(0, 4).toString("ascii")).toBe("GIF8");
    expect(close).toHaveBeenCalledOnce();
  });

  it("requests PNG clipboard access before asynchronous image loading completes", async () => {
    let resolveFetch: ((response: { ok: boolean; blob: () => Promise<Blob> }) => void) | undefined;
    const pendingFetch = new Promise<{ ok: boolean; blob: () => Promise<Blob> }>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => pendingFetch));

    class TestClipboardItem {
      constructor(readonly items: Record<string, Promise<Blob>>) {}
    }
    const write = vi.fn(async ([item]: TestClipboardItem[]) => {
      await item.items["image/png"];
    });
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write } });

    const copying = copyImageDataUrlToClipboard("data:image/png;base64,AA==", "png");
    expect(write).toHaveBeenCalledOnce();

    resolveFetch?.({
      ok: true,
      blob: async () => new Blob([new Uint8Array([0])], { type: "image/png" })
    });
    await copying;
  });
});
