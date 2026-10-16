// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent } from "../src/components/ui/dialog";
import { AiModelsSettings } from "../src/components/workbench/settings/AiModelsSettings";
import type { ProviderConfig } from "../shared/types";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  testProvider: vi.fn(),
  onSaved: vi.fn()
}));
vi.mock("../src/lib/image-workbench-api", () => ({
  getImageWorkbenchApi: () => mocks,
  getWorkbenchErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const account: ProviderConfig = {
  id: "account",
  name: "个人图片账号",
  type: "codex-oauth",
  baseUrl: "",
  generationEndpoint: "",
  model: "gpt-image-2",
  supportsReferenceImages: true
};
let root: Root;
let host: HTMLDivElement;
function button(text: string): HTMLButtonElement {
  const element = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent?.trim() === text || node.getAttribute("aria-label") === text
  );
  if (!element) throw new Error(`Button not found: ${text}`);
  return element;
}
async function rename(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('[aria-label="显示名称"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function render(provider = account): Promise<void> {
  await act(async () =>
    root.render(
      createElement(
        Dialog,
        { open: true },
        createElement(
          DialogContent,
          null,
          createElement(AiModelsSettings, {
            providers: [provider],
            activeProviderId: provider.id,
            textProviders: [],
            activeTextProviderId: "",
            videoProviders: [],
            activeVideoProviderId: "",
            providerKeyStatus: { [provider.id]: true },
            bridgeError: null,
            portalContainer: null,
            onSaved: mocks.onSaved
          })
        )
      )
    )
  );
  await act(async () => button(`编辑 ${provider.name}`).click());
}
beforeEach(() => {
  document.documentElement.lang = "zh-CN";
  mocks.getSettings.mockResolvedValue({
    codexAuthStatusByProviderId: {
      account: { state: "connected", email: "demo@example.com", planType: "Plus" }
    }
  });
  mocks.testProvider.mockResolvedValue({ ok: true, message: "测试连接成功" });
  mocks.onSaved.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("focused model service details", () => {
  it("distinguishes account login from verification and describes a fixed platform model accurately", async () => {
    await render();
    const editor = document.querySelector(".model-editor")!;
    expect(document.querySelector(".model-editor-title h2")?.textContent).toBe(account.name);
    expect(editor.textContent).toContain("账号已登录");
    expect(editor.textContent).toContain("尚未验证连接");
    expect(editor.textContent).toContain("模型由账号提供，无需手动配置。");
    expect(editor.textContent).not.toContain("选择或添加此服务提供的模型");
    expect(document.querySelector(".model-detail-save")).toBeNull();
    expect(document.querySelector(".model-editor-footer")).toBeNull();
  });
  it("preserves a successful verification after a name change and only saves through the explicit action", async () => {
    await render();
    await act(async () => button("验证连接").click());
    expect(document.body.textContent).toContain("连接已验证");
    await rename("新的显示名称");
    expect(document.body.textContent).toContain("连接已验证");
    expect(mocks.onSaved).not.toHaveBeenCalled();
    await act(async () => button("保存更改").click());
    expect(mocks.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: [expect.objectContaining({ id: account.id, name: "新的显示名称" })]
      })
    );
  });
  it("invalidates verification when API connection fields change", async () => {
    await render({
      ...account,
      id: "api",
      name: "API 图片",
      type: "openai-compatible",
      baseUrl: "https://api.example.com",
      generationEndpoint: "/v1/responses"
    });
    await act(async () => button("验证连接").click());
    expect(document.body.textContent).toContain("连接已验证");
    const input = document.querySelector<HTMLInputElement>('[aria-label="服务地址"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "https://changed.example.com"
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).not.toContain("连接已验证");
    expect(document.body.textContent).toContain("尚未验证连接");
  });
  it("keeps a failed save in the editor and still protects the draft when going back", async () => {
    await render();
    mocks.onSaved.mockRejectedValueOnce(new Error("保存失败测试"));
    await rename("尚未保存");
    await act(async () => button("保存更改").click());
    expect(document.body.textContent).toContain("保存失败测试");
    expect(document.querySelector<HTMLInputElement>('[aria-label="显示名称"]')?.value).toBe("尚未保存");
    await act(async () => button("返回服务列表").click());
    expect(document.body.textContent).toContain("保存更改？");
    expect(document.body.textContent).toContain("继续编辑");
  });
  it("keeps account authorization distinct from a failed model connection", async () => {
    mocks.testProvider.mockResolvedValueOnce({ ok: false, message: "当前模型连接失败" });
    await render();
    await act(async () => button("验证连接").click());
    expect(document.body.textContent).toContain("账号已登录");
    expect(document.body.textContent).toContain("验证未通过");
    expect(document.body.textContent).toContain("当前模型连接失败");
    expect(document.querySelector(".model-detail-save")).toBeNull();
  });
  it("offers sign-in recovery without suggesting an expired account is ready to use", async () => {
    mocks.getSettings.mockResolvedValueOnce({
      codexAuthStatusByProviderId: { account: { state: "expired", email: "demo@example.com" } }
    });
    await render();
    expect(document.body.textContent).toContain("请重新登录以恢复账号授权。");
    expect(button("重新登录").disabled).toBe(false);
    expect(document.body.textContent).not.toContain("已授权，可使用账号提供的模型");
    expect(document.querySelector(".model-connection-check")).toBeNull();
  });
});
