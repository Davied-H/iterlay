import { describe, expect, it } from "vitest";
import { ManagerInspirationClient } from "../electron/inspiration-client";

describe("inspiration sources", () => {
  it("loads enabled sources from Manager and resolves URLs by source ID", async () => {
    const fetchImpl = async () => new Response(JSON.stringify([
      { id: "aiart-pics", name: "AIART.PICS", url: "https://aiart.pics/", iconUrl: "https://manage.example/api/v1/inspiration-sources/aiart-pics/icon", category: "提示词与作品库", description: "案例", enabled: true, sortOrder: 10 },
      { id: "disabled", name: "Disabled", url: "https://example.com/", iconUrl: "https://manage.example/api/v1/inspiration-sources/disabled/icon", category: "", description: "", enabled: false, sortOrder: 20 }
    ]));
    const client = new ManagerInspirationClient("https://manage.example/api/v1", fetchImpl as typeof fetch);
    await expect(client.list()).resolves.toHaveLength(1);
    await expect(client.urlFor("aiart-pics")).resolves.toBe("https://aiart.pics/");
    await expect(client.urlFor("https://example.com")).rejects.toThrow("不可用");
  });

  it("accepts sources that have not received an icon yet", async () => {
    const fetchImpl = async () => new Response(JSON.stringify([
      { id: "source", name: "Source", url: "https://example.com/", iconUrl: "", category: "", description: "", enabled: true, sortOrder: 1 },
    ]));
    const client = new ManagerInspirationClient("https://manage.example/api/v1", fetchImpl as typeof fetch);
    await expect(client.list()).resolves.toHaveLength(1);
  });
});
