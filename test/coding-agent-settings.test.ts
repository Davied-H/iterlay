// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodingAgentSettings } from "../src/components/workbench/settings/CodingAgentSettings";
import type { CodingAgentIntegrationStatus } from "../shared/agent-integration";
const mock = vi.hoisted(() => ({ getCodingAgentStatus: vi.fn(), installAgentSkill: vi.fn(), installCli: vi.fn(), removeAgentSkill: vi.fn() }));
vi.mock("../src/lib/image-workbench-api", () => ({ getImageWorkbenchApi: () => mock, getWorkbenchErrorMessage: (error: Error) => error.message }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const state: CodingAgentIntegrationStatus = { development: true, cli: { installed: true, pathConfigured: true, path: "/test/bin/iterlay" }, clients: [{ id: "codex", detected: true, detection: "installed", skillInstalled: false, skillManaged: false, skillPath: "/test/skills/iterlay-workspace", legacyConfigured: true }] };
afterEach(() => { vi.resetAllMocks(); });
async function render(options: { providerReady?: boolean; state?: CodingAgentIntegrationStatus } = {}) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); const onOpenModels = vi.fn();
  mock.getCodingAgentStatus.mockResolvedValue(structuredClone(options.state ?? state));
  await act(async () => { root.render(createElement(CodingAgentSettings, { disabled: false, providerReady: options.providerReady ?? true, onOpenModels })); });
  const click = async (label: string) => { const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label); expect(button).toBeDefined(); await act(async () => button!.click()); };
  const dispose = async () => { await act(async () => root.unmount()); container.remove(); };
  return { container, click, onOpenModels, dispose };
}
describe("Coding Agent setup", () => {
  it("migrates the selected Agent and reports installed Skill without claiming a verified session", async () => {
    const f = await render();
    mock.installAgentSkill.mockResolvedValue({ ...state, clients: [{ ...state.clients[0], skillInstalled: true, skillManaged: true, legacyConfigured: false }] });
    await f.click("迁移并安装");
    expect(mock.installAgentSkill).toHaveBeenCalledWith("codex");
    expect(f.container.textContent).toContain("Skill 已安装");
    expect(f.container.textContent).toContain("新开 Agent 会话");
    expect(f.container.textContent).not.toContain("连接已验证");
    await f.dispose();
  });
  it("keeps the failed setup actionable and exposes its actual error", async () => {
    const f = await render(); mock.installAgentSkill.mockRejectedValue(new Error("配置文件不可写"));
    await f.click("迁移并安装");
    expect(f.container.querySelector('[role="alert"]')?.textContent).toContain("配置文件不可写");
    const retry = [...f.container.querySelectorAll("button")].find((b) => b.textContent === "迁移并安装");
    expect(retry?.disabled).toBe(false);
    await f.dispose();
  });
  it("opens model setup directly when image credentials are missing", async () => {
    const f = await render({ providerReady: false }); await f.click("配置图片服务"); expect(f.onOpenModels).toHaveBeenCalledOnce(); await f.dispose();
  });
  it("starts at the missing environment step and allows forward and backward navigation", async () => {
    const f = await render({ state: { ...state, cli: { ...state.cli, installed: false } } });
    expect(f.container.querySelector('[aria-current="step"]')?.textContent).toContain("准备环境");
    await f.click("下一步：安装 Skill");
    expect(f.container.querySelector('[aria-current="step"]')?.textContent).toContain("安装 Skill");
    expect(f.container.textContent).toContain("迁移并安装");
    await f.click("上一步");
    expect(f.container.querySelector('[aria-current="step"]')?.textContent).toContain("准备环境");
    expect(mock.installAgentSkill).not.toHaveBeenCalled();
    await f.dispose();
  });
  it("opens the usage step for an already configured Agent", async () => {
    const f = await render({ state: { ...state, clients: [{ ...state.clients[0], skillInstalled: true, skillManaged: true, legacyConfigured: false }] } });
    expect(f.container.querySelector('[aria-current="step"]')?.textContent).toContain("开始使用");
    expect(f.container.querySelector('[aria-label="复制试用提示词"]')).not.toBeNull();
    await f.click("配置其他 Agent");
    expect(f.container.querySelector('[aria-current="step"]')?.textContent).toContain("安装 Skill");
    await f.dispose();
  });

});
