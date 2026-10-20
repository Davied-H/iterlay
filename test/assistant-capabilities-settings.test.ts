// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PiAgentSettingsPanel } from "../src/components/workbench/settings/PiAgentSettingsPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function props(): ComponentProps<typeof PiAgentSettingsPanel> {
  return { available: false, enabled: false, model: "chat-model", inventory: {
    builtinTools: [{ name: "read", description: "读取文件", risk: "read" }], iterlayTools: [], skills: [], extensions: [], warnings: [] },
    resourceError: null, assistantSkills: [], builtinTools: ["read"], iterlayTools: [], skillPaths: [], extensionPaths: [],
    customSkillPaths: [], customExtensionPaths: [], maxTurns: 12, webSearchMaxResults: 5,
    onEnabledChange: vi.fn(), onConfigureModel: vi.fn(), onBuiltinToolsChange: vi.fn(), onIterlayToolsChange: vi.fn(),
    onSkillPathsChange: vi.fn(), onExtensionPathsChange: vi.fn(), onCustomSkillPathsChange: vi.fn(),
    onCustomExtensionPathsChange: vi.fn(), onMaxTurnsChange: vi.fn(), onWebSearchMaxResultsChange: vi.fn(),
    onRefresh: vi.fn(), onEditAssistantSkill: vi.fn() };
}

describe("understandable assistant capabilities", () => {
  it("labels the switch, explains model readiness, and preserves a saved preference while unavailable", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    const input = { ...props(), enabled: true };
    try {
      await act(async () => root.render(createElement(PiAgentSettingsPanel, input)));
      const toggle = container.querySelector<HTMLButtonElement>('.pi-agent-mode [role="switch"]')!;
      expect(toggle.disabled).toBe(true);
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(container.querySelector(`label[for="${toggle.id}"]`)?.textContent).toBe("允许助手执行操作");
      expect(container.querySelector(".settings-page-header [role='switch']")).toBeNull();
      expect(container.textContent).toContain("关闭时只进行对话");
      expect(container.querySelector(".pi-overview-summary")?.textContent).toContain("等待配置模型");
      const configure = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "配置对话模型")!;
      await act(async () => configure.click());
      expect(input.onConfigureModel).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); }
  });

  it("allows inspecting actions without a configured model and keeps grants separate from the execution switch", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    const input = props();
    try {
      await act(async () => root.render(createElement(PiAgentSettingsPanel, input)));
      const tab = [...container.querySelectorAll<HTMLButtonElement>(".pi-resource-tabs button")].find((button) => button.textContent?.startsWith("可执行操作"))!;
      await act(async () => tab.click());
      expect(container.querySelector(".pi-resource-list")?.textContent).toContain("读取文件");
      expect(container.querySelector(".pi-resource-intro")?.textContent).toContain("关闭的操作不会被调用");
      expect(input.onEnabledChange).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); }
  });

  it("can enable actions when ready and shows a recovery message instead of an endless loading state", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    const input = { ...props(), available: true, inventory: null, resourceError: "读取失败" };
    try {
      await act(async () => root.render(createElement(PiAgentSettingsPanel, input)));
      await act(async () => container.querySelector<HTMLButtonElement>('.pi-agent-mode [role="switch"]')!.click());
      expect(input.onEnabledChange).toHaveBeenCalledWith(true);
      const steps = container.querySelector<HTMLSelectElement>('select[aria-label="单次任务步数"]')!;
      const references = container.querySelector<HTMLSelectElement>('select[aria-label="搜索参考数量"]')!;
      await act(async () => { steps.value = "8"; steps.dispatchEvent(new Event("change", { bubbles: true })); });
      await act(async () => { references.value = "10"; references.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(input.onMaxTurnsChange).toHaveBeenCalledWith(8);
      expect(input.onWebSearchMaxResultsChange).toHaveBeenCalledWith(10);
      const tab = [...container.querySelectorAll<HTMLButtonElement>(".pi-resource-tabs button")].find((button) => button.textContent?.startsWith("可执行操作"))!;
      await act(async () => tab.click());
      expect(container.querySelector(".pi-resource-list")?.textContent).toContain("请点击上方刷新重试");
      expect(container.querySelector(".pi-resource-list")?.textContent).not.toContain("正在读取");
    } finally { await act(async () => root.unmount()); }
  });
});
