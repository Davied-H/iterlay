import { describe, expect, it } from "vitest";
import {
  OFFICIAL_TEXT_PROVIDER_CONFIG,
  type CreditStatus,
  type TextProviderConfig
} from "../shared/types";
import {
  resolveTextProviderReadiness,
  shouldOpenTextProviderSettings
} from "../src/lib/text-provider-readiness";

const creditStatus = (textAvailable?: boolean): CreditStatus => ({
  credits: {
    walletId: "wallet-test",
    balance: 10,
    lifetimeGranted: 10,
    lifetimeSpent: 0,
    unitCost: 1,
    status: "active",
    updatedAt: "2026-07-24T00:00:00.000Z"
  },
  providerAvailable: true,
  ...(textAvailable === undefined ? {} : { textAvailable })
});

describe("resolveTextProviderReadiness", () => {
  it("treats an official provider as checking before status arrives", () => {
    expect(resolveTextProviderReadiness(OFFICIAL_TEXT_PROVIDER_CONFIG, {}, null, null)).toBe("checking");
  });

  it("reports an official status request failure as unavailable, not unconfigured", () => {
    expect(resolveTextProviderReadiness(
      OFFICIAL_TEXT_PROVIDER_CONFIG,
      {},
      null,
      "无法读取官方状态"
    )).toBe("unavailable");
  });

  it("uses an explicit official text availability result", () => {
    expect(resolveTextProviderReadiness(
      OFFICIAL_TEXT_PROVIDER_CONFIG,
      {},
      creditStatus(true),
      null
    )).toBe("ready");
    expect(resolveTextProviderReadiness(
      OFFICIAL_TEXT_PROVIDER_CONFIG,
      {},
      creditStatus(false),
      null
    )).toBe("unavailable");
  });

  it("keeps older official status responses without textAvailable compatible", () => {
    expect(resolveTextProviderReadiness(
      OFFICIAL_TEXT_PROVIDER_CONFIG,
      {},
      creditStatus(),
      null
    )).toBe("ready");
  });

  it("requires local configuration for non-official providers", () => {
    const custom: TextProviderConfig = {
      id: "text-custom",
      name: "Custom",
      type: "openai-compatible",
      baseUrl: "https://text.example.com",
      model: "gpt-4o-mini"
    };

    expect(resolveTextProviderReadiness(custom, {}, null, null)).toBe("unconfigured");
    expect(resolveTextProviderReadiness(custom, { "text-custom": true }, null, null)).toBe("ready");
  });

  it("opens settings only when configuration is actually missing", () => {
    expect(shouldOpenTextProviderSettings("unconfigured")).toBe(true);
    expect(shouldOpenTextProviderSettings("checking")).toBe(false);
    expect(shouldOpenTextProviderSettings("unavailable")).toBe(false);
    expect(shouldOpenTextProviderSettings("ready")).toBe(false);
  });
});
