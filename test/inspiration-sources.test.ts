import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalInspirationClient } from "../electron/inspiration-client";
import sources from "../shared/inspiration-sources.json";

afterEach(() => vi.unstubAllGlobals());

describe("bundled inspiration sources", () => {
  it("lists the NAS catalogue with bundled icons without network access", async () => {
    const fetchImpl = vi.fn(() => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetchImpl);
    const client = new LocalInspirationClient();
    const items = await client.list();
    expect(items).toHaveLength(18);
    expect(items.map((item) => item.id)).toEqual(sources.filter((item) => item.enabled).map((item) => item.id));
    expect(items.every((item) => !item.iconUrl || item.iconUrl.startsWith("data:image/"))).toBe(true);
    expect(items.map((item) => item.sortOrder)).toEqual(items.map((item) => item.sortOrder).sort((a, b) => a - b));
    await expect(client.urlFor("aiart-pics")).resolves.toBe("https://aiart.pics/");
    await expect(client.urlFor("https://example.com")).rejects.toThrow("不存在或已停用");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns copies so callers cannot mutate the bundled catalogue", async () => {
    const client = new LocalInspirationClient();
    const items = await client.list();
    items[0].url = "https://example.com/";
    await expect(client.urlFor("aiart-pics")).resolves.toBe("https://aiart.pics/");
  });
});
