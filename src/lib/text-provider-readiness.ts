import type { CreditStatus, TextProviderConfig } from "@shared/types";

export type TextProviderReadinessStatus = "ready" | "checking" | "unavailable" | "unconfigured";

export function shouldOpenTextProviderSettings(status: TextProviderReadinessStatus | undefined): boolean {
  return status === undefined || status === "unconfigured";
}

export function resolveTextProviderReadiness(
  provider: TextProviderConfig | undefined,
  providerKeyStatus: Record<string, boolean>,
  creditStatus: CreditStatus | null,
  creditError: string | null
): TextProviderReadinessStatus {
  if (!provider) return "unconfigured";

  if (provider.type === "official") {
    if (creditStatus?.textAvailable === true) return "ready";
    if (creditStatus?.textAvailable === false) return "unavailable";
    // Older status responses did not include textAvailable. Let the text request
    // remain authoritative instead of treating a valid official selection as missing.
    if (creditStatus) return "ready";
    return creditError ? "unavailable" : "checking";
  }

  if (provider.type === "codex-oauth") {
    return provider.model.trim() && providerKeyStatus[provider.id] ? "ready" : "unconfigured";
  }

  return provider.baseUrl.trim() && provider.model.trim() && providerKeyStatus[provider.id]
    ? "ready"
    : "unconfigured";
}

/** Community Agent mode uses the configured text connection, never a retired wallet. */
export function canUseTextAgent(provider: TextProviderConfig | undefined, keyStatus: Record<string, boolean>): boolean {
  return provider?.type !== "official" && resolveTextProviderReadiness(provider, keyStatus, null, null) === "ready";
}
