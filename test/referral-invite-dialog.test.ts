// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getGiftActivationOverview: vi.fn(),
  recordGiftActivationShare: vi.fn(),
  getReferralOverview: vi.fn()
}));

vi.mock("@/lib/image-workbench-api", () => ({
  getImageWorkbenchApi: () => apiMocks,
  getWorkbenchErrorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
}));

import { ReferralInviteDialog } from "../src/components/workbench/ReferralInviteDialog";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ReferralInviteDialog", () => {
  it("shows gift activation codes first and copies the complete invitation", async () => {
    apiMocks.getGiftActivationOverview.mockResolvedValue({
      campaign: {
        id: "default",
        name: "好友激活礼",
        enabled: true,
        redemptionEnabled: true,
        defaultQuota: 5,
        totalCodeLimit: 0,
        maxMajorVersion: 1,
        maxDevices: 2,
        activationCredits: 0,
        shareMessage: "送你一份 Iterlay 永久授权",
        status: "active",
        codesIssued: true,
        redemptionEndsAt: "2026-08-31T15:59:59Z"
      },
      eligible: true,
      totalQuota: 5,
      availableCount: 1,
      redeemedCount: 0,
      codes: [{
        id: "code-1",
        sequence: 1,
        code: "ABCD-EFGH-IJKL-MNOP",
        codePrefix: "ABCD",
        status: "available",
        shareCount: 0,
        createdAt: "2026-07-22T00:00:00Z"
      }]
    });
    apiMocks.recordGiftActivationShare.mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(ReferralInviteDialog, {
        open: true,
        onOpenChange: vi.fn(),
        eligible: true,
        onActivate: vi.fn()
      }));
    });
    await act(async () => { await vi.dynamicImportSettled(); });

    expect(document.body.textContent).toContain("Iterlay 1.x 永久授权 · 2 台设备");
    expect(document.body.textContent).toContain("ABCD-EFGH-IJKL-MNOP");
    const copyButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("复制邀请")
    );
    await act(async () => copyButton?.click());

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("好友激活码：ABCD-EFGH-IJKL-MNOP"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("送你一份 Iterlay 永久授权"));
    expect(apiMocks.recordGiftActivationShare).toHaveBeenCalledWith("code-1");
  });

  it("keeps the activation entry for users without an activated license", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(ReferralInviteDialog, {
        open: true,
        onOpenChange: vi.fn(),
        eligible: false,
        onActivate: vi.fn()
      }));
    });

    await act(async () => { await vi.dynamicImportSettled(); });

    expect(document.body.textContent).toContain("激活授权后即可参与邀请活动");
    expect(apiMocks.getGiftActivationOverview).not.toHaveBeenCalled();
  });

  it("stops loading after a failed gift request without retrying automatically", async () => {
    apiMocks.getGiftActivationOverview.mockRejectedValue(new Error("活动服务暂时不可用"));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(ReferralInviteDialog, {
        open: true,
        onOpenChange: vi.fn(),
        eligible: true,
        onActivate: vi.fn()
      }));
    });
    await act(async () => { await vi.dynamicImportSettled(); });

    expect(apiMocks.getGiftActivationOverview).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("好友激活礼加载失败");
    expect(document.body.textContent).toContain("活动服务暂时不可用");
    expect(document.body.textContent).not.toContain("正在读取好友激活码");
  });
});
