import { describe, expect, it, vi } from "vitest";
import { ManagerProductAnalyticsClient } from "../electron/product-analytics-client";
import { LicenseService } from "../electron/licensing/service";

describe("optional backend analytics", () => {
  it.each(["", "   "])("does not touch licensing or the network with an empty URL (%j)", async (url) => {
    const license = new LicenseService();
    const status = vi.spyOn(license, "getStatus");
    const fetchImpl = vi.fn();
    await new ManagerProductAnalyticsClient(license, url, fetchImpl).track("app.opened");
    expect(status).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the configured anonymous endpoint for the open-source app without commercial signing", async () => {
    const license = new LicenseService();
    const sign = vi.spyOn(license, "createSignedRequest");
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const client = new ManagerProductAnalyticsClient(license, "https://backend.example/api/v1/", fetchImpl);
    await client.track("app.opened");
    await client.track("board.created");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://backend.example/api/v1/analytics/anonymous-events");
    const first = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    const second = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(first.anonymousId).toMatch(/^[a-f0-9]{64}$/);
    expect(first.anonymousId).toBe(second.anonymousId);
    expect(first.events[0].name).toBe("app.opened");
    expect(sign).not.toHaveBeenCalled();
  });

  it("does not interrupt the app if the configured backend is unavailable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    await expect(new ManagerProductAnalyticsClient(new LicenseService(), "https://backend.example/api/v1", fetchImpl).track("app.opened")).resolves.toBeUndefined();
  });
});
