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

  async track(name: ProductAnalyticsEventName, properties: Record<string, string> = {}): Promise<void> {
    const payload = JSON.stringify({ events: [{ id: randomUUID(), name, occurredAt: new Date().toISOString(), properties }] });
    try {
      const status = this.license.getStatus();
      if (status.state === "UNACTIVATED") {
        const deviceId = await this.license.getDeviceId();
        const anonymousId = createHash("sha256").update(`iterlay-analytics-v1\x00${deviceId}`).digest("hex");
        await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, "")}/analytics/anonymous-events`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ anonymousId, appVersion: "desktop", events: JSON.parse(payload).events }),
          signal: AbortSignal.timeout(5_000)
        });
        return;
      }
      const auth = await this.license.createSignedRequest("analytics.events", payload);
      await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, "")}/analytics/events`, {
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
