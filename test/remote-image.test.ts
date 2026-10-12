import { describe, expect, it, vi } from "vitest";
import { detectRemoteImageMime, downloadRemoteImage } from "../electron/remote-image";

describe("remote image downloads", () => {
  it("downloads image responses and identifies PNG bytes", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fetchImpl = vi.fn(async () =>
      new Response(png, { status: 200, headers: { "content-type": "image/png" } })
    ) as unknown as typeof fetch;

    const result = await downloadRemoteImage("https://example.com/image", { fetchImpl });

    expect(result.bytes).toEqual(png);
    expect(detectRemoteImageMime(result.bytes)).toBe("image/png");
  });

  it("rejects non-image responses", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("not an image", { status: 200, headers: { "content-type": "text/html" } })
    ) as unknown as typeof fetch;

    await expect(downloadRemoteImage("https://example.com/page", { fetchImpl })).rejects.toThrow(
      "链接内容不是图片"
    );
  });

  it("stops downloads that exceed the byte limit", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(Buffer.alloc(12), { status: 200, headers: { "content-type": "image/png" } })
    ) as unknown as typeof fetch;

    await expect(
      downloadRemoteImage("https://example.com/large.png", { fetchImpl, maxBytes: 8 })
    ).rejects.toThrow("图片不能超过 0 MB");
  });
});
