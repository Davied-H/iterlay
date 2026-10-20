import { createHash, randomUUID } from "node:crypto";
import type { LicenseService } from "./licensing/service.js";

export type ProductAnalyticsEventName =
  | "app.opened" | "board.created" | "board.opened" | "board.exported"
  | "asset.imported" | "asset.exported" | "image.generated" | "image.generation_failed"
  | "image.edited" | "image.sliced" | "scene.created" | "scene.generated"
  | "template.applied" | "template.submitted" | "assistant.opened" | "assistant.completed"
  | "share.created" | "settings.updated" | "onboarding.completed";

/** Fail-open telemetry transport. The application workflow must never wait for analytics. */
export class ManagerProductAnalyticsClient {
  constructor(
    private readonly license: Pick<LicenseService, "createSignedRequest" | "getDeviceId" | "getStatus">,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private readonly sessionAnonymousId = createHash("sha256").update(randomUUID()).digest("hex");

  async track(name: ProductAnalyticsEventName, properties: Record<string, string> = {}): Promise<void> {
    if (!this.baseUrl.trim()) return;
    const payload = JSON.stringify({ events: [{ id: randomUUID(), name, occurredAt: new Date().toISOString(), properties }] });
    try {
      const status = this.license.getStatus();
      if (status.state === "UNACTIVATED" || status.reason === "free_open_source") {
        const anonymousId = status.reason === "free_open_source"
          ? this.sessionAnonymousId
          : createHash("sha256").update(`iterlay-analytics-v1\x00${await this.license.getDeviceId()}`).digest("hex");
        await this.fetchImpl(`${this.baseUrl.trim().replace(/\/+$/, "")}/analytics/anonymous-events`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ anonymousId, appVersion: "desktop", events: JSON.parse(payload).events }),
          signal: AbortSignal.timeout(5_000)
        });
        return;
      }
      const auth = await this.license.createSignedRequest("analytics.events", payload);
      await this.fetchImpl(`${this.baseUrl.trim().replace(/\/+$/, "")}/analytics/events`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: `{"auth":${JSON.stringify(auth)},"payload":${payload}}`,
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      // Network and authorization failures are intentionally silent; no user operation is affected.
    }
  }
}
