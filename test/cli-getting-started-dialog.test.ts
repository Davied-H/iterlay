// @vitest-environment jsdom
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CliGettingStartedDialog } from "../src/components/workbench/CliGettingStartedDialog";
import type { CodingAgentIntegrationStatus } from "../shared/agent-integration";
import { loadUiTextCatalog } from "../src/i18n/ui-text";

const api = vi.hoisted(() => ({ getCodingAgentStatus: vi.fn(), getSettings: vi.fn(), listBoards: vi.fn(), installCli: vi.fn(), installAgentSkill: vi.fn(), createBoard: vi.fn(), generateImage: vi.fn() }));
vi.mock("../src/lib/image-workbench-api", () => ({ getImageWorkbenchApi: () => api, getWorkbenchErrorMessage: (cause: Error | string) => typeof cause === "string" ? cause : cause.message }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
const ready: CodingAgentIntegrationStatus = { development: false, cli: { installed: true, pathConfigured: true, path: "/test/bin/iterlay" }, clients: [
  { id: "codex", detected: true, detection: "installed", skillInstalled: true, skillManaged: true, skillPath: "/test/codex", legacyConfigured: false },
  { id: "claude-code", detected: true, detection: "installed", skillInstalled: false, skillManaged: false, skillPath: "/test/claude", legacyConfigured: false }
] };
const board = { id: "cli", name: "CLI 创作", createdAt: "", updatedAt: "", imageCount: 0 };

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove(); root = null; host = null;
  vi.resetAllMocks(); document.documentElement.lang = "zh-CN";
});

async function render(options: { status?: CodingAgentIntegrationStatus; boardId?: string; empty?: boolean; reject?: boolean; providerConfigured?: boolean } = {}) {
  api.getCodingAgentStatus.mockImplementation(() => options.reject ? Promise.reject(new Error("服务未连接")) : Promise.resolve(structuredClone(options.status ?? ready)));
  api.getSettings.mockResolvedValue({ setupComplete: options.providerConfigured !== false, activeProviderId: "images", providerKeyStatus: { images: options.providerConfigured !== false }, cliDefaultBoardId: options.boardId ?? "", defaultCodingAgent: "codex" });
  api.listBoards.mockResolvedValue(options.empty ? [] : [board]);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const callbacks = { onOpenChange: vi.fn(), onOpenSettings: vi.fn(), onOpenBoard: vi.fn(), onOpenBoards: vi.fn() };
  await act(async () => { root!.render(createElement(CliGettingStartedDialog, { open: true, ...callbacks, returnFocusRef: createRef<HTMLButtonElement>() })); });
  return { ...callbacks, writeText };
}

async function click(label: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button:not([hidden])'));
  const button = buttons.find((item) => (item.textContent?.trim() === label || item.getAttribute("aria-label") === label) && !item.closest('[hidden]'));
  expect(button, label).toBeDefined();
  await act(async () => {
    if (button!.getAttribute("role") === "tab") button!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    button!.click();
  });
}

describe("CLI getting-started dialog", () => {
  it("reads real status and copies a one-image command without installing or generating", async () => {
    const f = await render();
    expect(document.body.textContent).toContain("图片服务已配置");
    await click("复制图片生成命令");
    expect(f.writeText).toHaveBeenCalledWith('iterlay image generate --prompt "极简咖啡杯插画" --n 1 --out ./cup.png');
    expect(api.installCli).not.toHaveBeenCalled(); expect(api.installAgentSkill).not.toHaveBeenCalled();
    expect(api.generateImage).not.toHaveBeenCalled(); expect(api.createBoard).not.toHaveBeenCalled();
    await click("查看画板"); expect(f.onOpenBoard).toHaveBeenCalledWith("cli");
  });

  it("sends an unavailable default board to settings without silently selecting another board", async () => {
    const f = await render({ boardId: "deleted" });
    expect(document.body.textContent).toContain("默认画板已不可用");
    await click("重新选择");
    expect(f.onOpenChange).toHaveBeenCalledWith(false); expect(f.onOpenSettings).toHaveBeenCalledWith("coding-agent");
    expect(f.onOpenBoard).not.toHaveBeenCalled(); expect(api.createBoard).not.toHaveBeenCalled();
  });

  it("keeps first-time users in the library without creating a board just for browsing", async () => {
    const f = await render({ empty: true });
    await click("前往画板库"); expect(f.onOpenBoards).toHaveBeenCalledOnce(); expect(api.createBoard).not.toHaveBeenCalled();
  });

  it("allows retry after detection fails while retaining the tutorial and avoiding a false ready state", async () => {
    await render({ reject: true });
    expect(document.body.textContent).toContain("环境检测未完成");
    expect(document.body.textContent).toContain("新开终端，检查连接");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("服务未连接");
    api.getCodingAgentStatus.mockResolvedValue(ready);
    await click("重新检测");
    expect(document.body.textContent).toContain("图片服务已配置");
  });

  it("repairs missing PATH only after a click and updates copyable commands", async () => {
    const f = await render({ status: { ...ready, cli: { ...ready.cli, pathConfigured: false, path: "/test path/iterlay" } } });
    await click("复制检查连接命令"); expect(f.writeText).toHaveBeenLastCalledWith("'/test path/iterlay' status --json");
    api.installCli.mockResolvedValue(ready); await click("修复命令路径");
    expect(api.installCli).toHaveBeenCalledOnce();
    await click("复制检查连接命令"); expect(f.writeText).toHaveBeenLastCalledWith("iterlay status --json");
  });

  it("keeps a failed Skill installation retryable and copies the selected Agent's guarded task", async () => {
    const f = await render(); await click("Coding Agent"); await click("Claude Code");
    api.installAgentSkill.mockRejectedValueOnce(new Error("配置目录不可写")); await click("安装 Skill");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("配置目录不可写");
    api.installAgentSkill.mockResolvedValue({ ...ready, clients: ready.clients.map((client) => ({ ...client, skillInstalled: true })) });
    await click("安装 Skill"); expect(api.installAgentSkill).toHaveBeenLastCalledWith("claude-code");
    await click("生成第一张图"); await click("复制生成任务");
    const prompt = f.writeText.mock.calls.at(-1)![0] as string;
    expect(prompt).toMatch(/^\/using-iterlay/u); expect(prompt).toContain("在我确认之前不要提交生成");
    expect(document.body.textContent).not.toContain("会话已连接"); expect(api.generateImage).not.toHaveBeenCalled();
  });

  it("reveals the full task for manual copying when clipboard permission is denied", async () => {
    const f = await render(); await click("Coding Agent"); f.writeText.mockRejectedValue(new Error("Clipboard denied"));
    await click("复制检查任务");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("复制失败");
    expect(document.querySelector<HTMLDetailsElement>('.cli-guide-prompt details')?.open).toBe(true);
  });

  it("opens model settings when no image provider credentials have been saved", async () => {
    const f = await render({ providerConfigured: false });
    expect(document.body.textContent).toContain("图片服务待配置");
    await click("配置模型"); expect(f.onOpenSettings).toHaveBeenCalledWith("model-management");
  });

  it("localizes terminal commands and real Agent tasks into English", async () => {
    document.documentElement.lang = "en-US"; await loadUiTextCatalog();
    const f = await render();
    await click("Copy Image generation"); expect(f.writeText.mock.calls[0][0]).toContain('"Minimalist coffee cup illustration"');
    await click("Coding Agent"); await click("Copy readiness task");
    expect(f.writeText.mock.calls.at(-1)![0]).toContain("This is a read-only readiness check");
  });
});
