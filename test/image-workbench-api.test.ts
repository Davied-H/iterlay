import { describe, expect, it, vi } from "vitest";
import type { ImageWorkbenchApi } from "../electron/preload/preload";
import {
  getImageWorkbenchApi,
  getWorkbenchErrorMessage,
  hasImageWorkbenchApi,
  missingImageWorkbenchMessage
} from "../src/lib/image-workbench-api";

describe("image workbench API bridge", () => {
  it("throws a descriptive error when the Electron preload bridge is missing", () => {
    expect(() => getImageWorkbenchApi({})).toThrow(missingImageWorkbenchMessage);
  });

  it("returns the injected preload bridge when it is available", () => {
    const api = {
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      testProvider: vi.fn(),
      generateImage: vi.fn(),
      listHistory: vi.fn(),
      reuseHistory: vi.fn(),
      saveAsset: vi.fn(),
      deleteAsset: vi.fn()
    } as unknown as ImageWorkbenchApi;

    expect(hasImageWorkbenchApi({ imageWorkbench: api })).toBe(true);
    expect(getImageWorkbenchApi({ imageWorkbench: api })).toBe(api);
  });

  it("removes Electron IPC prefixes from user-facing errors", () => {
    expect(
      getWorkbenchErrorMessage(
        new Error("Error invoking remote method 'image:generate': ProviderError: model request failed")
      )
    ).toBe("model request failed");
  });

  it("removes custom API error class prefixes", () => {
    expect(
      getWorkbenchErrorMessage(
        new Error("TemplateSubmissionApiError: 服务暂时不可用")
      )
    ).toBe("服务暂时不可用");
  });

  it("translates fal exhausted-balance errors", () => {
    expect(
      getWorkbenchErrorMessage(
        new Error(
          "Error invoking remote method 'image:generate': ProviderError: User is locked. Reason: Exhausted balance."
        )
      )
    ).toBe("fal.ai 账户余额不足，请前往 https://fal.ai/dashboard/billing 充值后重试。");
  });

  it("translates invalid device public keys without exposing implementation details", () => {
    expect(
      getWorkbenchErrorMessage(
        new Error("Error invoking remote method 'license:activate': Error: invalid device public key")
      )
    ).toBe("设备验证信息无效，请重启 Iterlay 后重试。");
  });
});
