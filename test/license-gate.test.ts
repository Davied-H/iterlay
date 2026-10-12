// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageWorkbenchApi } from "../electron/preload/preload";
import type { LicenseCapabilities, LicenseState, LicenseStatusSnapshot } from "../shared/licensing";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({
  toast: { error: toastError }
}));

import { LicenseGate, StartupLoading } from "../src/components/licensing/LicenseGate";
import { useLicense } from "../src/components/licensing/license-context";

const readOnlyCapabilities: LicenseCapabilities = {
  mode: "read-only",
  canView: true,
  canExport: true,
  canGenerate: false,
  canEdit: false,
  canImport: false,
  canStartTrial: true,
  canActivate: true
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("LicenseGate action failures", () => {
  it("uses the branded startup state without exposing license verification copy", async () => {
    const api = createApi(snapshot("UNACTIVATED"), {
      getLicenseStatus: vi.fn(() => new Promise<LicenseStatusSnapshot>(() => undefined))
    });
    await renderGate(api);

    const loading = document.body.querySelector(".license-loading");
    expect(loading?.textContent).toContain("Iterlay");
    expect(loading?.textContent).not.toContain("授权");
    expect(loading?.textContent).not.toContain("验证");
    expect(document.body.querySelectorAll(".license-loading__layer")).toHaveLength(3);

    window.dispatchEvent(new Event("focus"));
    await act(async () => settle());
    expect(api.checkLicense).not.toHaveBeenCalled();
  });

  it("keeps a single startup animation when loading is delegated to the app", async () => {
    const api = createApi(snapshot("UNACTIVATED"), {
      getLicenseStatus: vi.fn(() => new Promise<LicenseStatusSnapshot>(() => undefined))
    });
    vi.stubGlobal("imageWorkbench", api);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(
          LicenseGate,
          { delegateStartupLoading: true },
          createElement(StartupLoading)
        )
      );
      await settle();
    });

    expect(document.body.querySelectorAll(".license-loading")).toHaveLength(1);
    expect(document.body.querySelectorAll(".license-loading__layer")).toHaveLength(3);
  });

  it("shows a toast for a failed trial start and keeps the error for the activation dialog", async () => {
    const api = createApi(snapshot("UNACTIVATED"), {
      startLicenseTrial: vi.fn().mockRejectedValue(undefined)
    });
    await renderGate(api);

    await clickButton("打开授权中心");
    await clickButton("开始 3 天试用");

    expect(toastError).toHaveBeenCalledWith("暂时无法开始试用。");
    await clickButton("输入激活码");
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe("暂时无法开始试用。");
  });

  it("shows a friendly toast and inline error when activation receives an invalid device public key", async () => {
    const api = createApi(snapshot("UNACTIVATED"), {
      activateLicense: vi.fn().mockRejectedValue(
        new Error("Error invoking remote method 'license:activate': Error: invalid device public key")
      )
    });
    await renderGate(api);
    await clickButton("打开授权中心");
    await clickButton("输入激活码");

    await changeInput(0, "buyer@example.com");
    await changeInput(1, "ITER-AAAA-BBBB-CCCC");
    await act(async () => {
      document.body.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await settle();
    });

    const message = "设备验证信息无效，请重启 Iterlay 后重试。";
    expect(api.activateLicense).toHaveBeenCalledWith("buyer@example.com", "ITER-AAAA-BBBB-CCCC");
    expect(toastError).toHaveBeenCalledWith(message);
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(message);
  });

  it("guides users to reset a forgotten activation code in the customer portal", async () => {
    const api = createApi(snapshot("UNACTIVATED"), {});
    await renderGate(api);
    await clickButton("打开授权中心");
    await clickButton("输入激活码");

    const resetLink = [...document.body.querySelectorAll<HTMLAnchorElement>("a")].find((link) =>
      link.textContent?.includes("忘记激活码")
    );
    expect(resetLink?.href).toBe("https://iterlay.daived.com:31243/portal");
    expect(resetLink?.target).toBe("_blank");
    expect(resetLink?.rel).toContain("noreferrer");
  });

  it("shows a toast when an explicit online license check fails", async () => {
    const api = createApi(snapshot("OFFLINE_GRACE", {
      offlineValidUntil: "2026-08-30T00:00:00.000Z"
    }), {
      checkLicense: vi.fn().mockRejectedValue(undefined)
    });
    await renderGate(api);

    await clickButton("打开授权中心");
    expect(document.body.textContent).toContain("最晚联网时间");
    await clickButton("立即复核");

    expect(toastError).toHaveBeenCalledWith("授权服务暂时不可用。");
  });

  it("shows the trial remaining time, exact deadline, and production purchase URL", async () => {
    const api = createApi(snapshot("TRIAL_ACTIVE", {
      offlineValidUntil: "2099-01-02T03:04:00.000Z"
    }), {});
    await renderGate(api);

    await clickButton("打开授权中心");

    expect(document.body.textContent).toContain("试用中");
    expect(document.body.textContent).toContain("剩余时间");
    expect(document.body.textContent).toContain("截止时间");
    expect(document.body.textContent).toContain("2099年");
    expect(document.body.textContent).toContain("输入激活码");
    expect(document.body.textContent).toContain("立即购买");
    expect(document.body.querySelector<HTMLAnchorElement>('a[href="https://iterlay.daived.com:31243/buy"]')).not.toBeNull();
  });

  it("shows annual plan expiry and next online check for a licensed device", async () => {
    const api = createApi(snapshot("LICENSED", {
      licenseEmail: "buyer@example.com",
      activatedAt: "2026-07-16T13:18:00.000Z",
      planType: "annual",
      validUntil: "2027-07-16T00:00:00.000Z",
      nextCheckAt: "2026-08-15T00:00:00.000Z"
    }), {});
    await renderGate(api);

    await clickButton("打开授权中心");

    expect(document.body.textContent).toContain("已授权");
    expect(document.body.textContent).toContain("授权邮箱");
    expect(document.body.textContent).toContain("buyer@example.com");
    expect(document.body.textContent).toContain("激活时间");
    expect(document.body.textContent).toContain("年度授权");
    expect(document.body.textContent).toContain("年度到期");
    expect(document.body.textContent).toContain("下次联网复核");
    expect(document.body.textContent).not.toContain("激活其他授权");
    expect(document.body.textContent).not.toContain("输入激活码");
    expect(document.body.textContent).not.toContain("查看当前授权状态并处理激活与联网复核。");
    expect(document.body.querySelector("[role=dialog] > .sr-only")?.textContent).toContain("授权中心");
  });

  it("opens the customer portal through the authenticated desktop channel", async () => {
    const api = createApi(snapshot("LICENSED"), {});
    await renderGate(api);

    await clickButton("打开授权中心");
    await clickButton("管理授权");

    expect(api.openLicensePortal).toHaveBeenCalledOnce();
    expect(document.body.querySelector<HTMLAnchorElement>('a[href="https://iterlay.daived.com:31243/portal"]')).toBeNull();
  });

  it("enters from local status before applying a background revocation check", async () => {
    const revoked = snapshot("REVOKED", {
      reason: "revoked_by_server",
      message: "当前设备授权已失效。"
    });
    let resolveCheck: (status: LicenseStatusSnapshot) => void = () => undefined;
    const checkResult = new Promise<LicenseStatusSnapshot>((resolve) => {
      resolveCheck = resolve;
    });
    const api = createApi(snapshot("LICENSED"), {
      checkLicense: vi.fn().mockReturnValue(checkResult)
    });
    await renderGate(api);

    expect(document.body.querySelector("[data-license-state]")?.textContent).toBe("LICENSED");
    await vi.waitFor(() => expect(api.checkLicense).toHaveBeenCalledOnce());
    expect(document.body.querySelector("[data-license-state]")?.textContent).toBe("LICENSED");
    await act(async () => {
      resolveCheck(revoked);
      await settle();
    });

    expect(document.body.querySelector("[data-license-state]")?.textContent).toBe("REVOKED");
    expect(document.body.textContent).toContain("授权已停用");
  });

  it("opens the activation form from the expired read-only banner", async () => {
    const api = createApi(snapshot("RESTRICTED", {
      reason: "trial_expired"
    }), {});
    await renderGate(api);

    const banner = document.body.querySelector(".license-banner");
    expect(banner?.className).toContain("[-webkit-app-region:no-drag]");
    await clickButton("处理授权");

    expect(document.body.querySelector("[role=dialog]")?.textContent).toContain("输入激活码");
  });
});

function snapshot(state: LicenseState, overrides: Partial<LicenseStatusSnapshot> = {}): LicenseStatusSnapshot {
  const fullAccess = state === "TRIAL_ACTIVE" || state === "LICENSED" || state === "OFFLINE_GRACE";
  return {
    state,
    reason: state === "OFFLINE_GRACE" ? "check_due" : "not_activated",
    capabilities: fullAccess
      ? { ...readOnlyCapabilities, mode: "full", canGenerate: true, canEdit: true, canImport: true }
      : readOnlyCapabilities,
    ...overrides
  };
}

function createApi(
  initialStatus: LicenseStatusSnapshot,
  overrides: Partial<ImageWorkbenchApi>
): ImageWorkbenchApi {
  return {
    getLicenseStatus: vi.fn().mockResolvedValue(initialStatus),
    startLicenseTrial: vi.fn(),
    activateLicense: vi.fn(),
    checkLicense: vi.fn().mockResolvedValue(initialStatus),
    openLicensePortal: vi.fn(),
    ...overrides
  } as unknown as ImageWorkbenchApi;
}

async function renderGate(api: ImageWorkbenchApi): Promise<void> {
  vi.stubGlobal("imageWorkbench", api);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(LicenseGate, null, createElement(LicenseTestEntry)));
    await settle();
  });
}

function LicenseTestEntry(): React.ReactElement {
  const license = useLicense();
  return createElement(
    "div",
    null,
    createElement("span", { "data-license-state": true }, license.status?.state ?? ""),
    createElement("button", { type: "button", onClick: license.openCenter }, "打开授权中心")
  );
}

async function clickButton(label: string): Promise<void> {
  const button = [...document.body.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label
  );
  expect(button, `button ${label}`).toBeDefined();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
  });
}

async function changeInput(index: number, value: string): Promise<void> {
  const input = document.body.querySelectorAll("input")[index];
  expect(input, `input ${index}`).toBeDefined();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
