// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AssistantPermissionCard } from "../src/components/assistant/AssistantPermissionCard";
import { OPEN_ASSISTANT_PERMISSIONS_EVENT } from "../shared/screen-access";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const interaction = { type: "permission", capability: "screen-capture", title: "允许助手查看当前屏幕？", description: "识别桌面内容", providerLabel: "我的模型" } as const;

describe("screen authorization card", () => {
  it.each([
    ["允许", false, "allow_once"],
    ["允许", true, "allow_always"],
    ["拒绝", true, "deny"],
  ] as const)("sends one explicit decision for %s (remember: %s)", async (label, remember, expected) => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); const onDecision = vi.fn(); const openSettings = vi.fn();
    window.addEventListener(OPEN_ASSISTANT_PERMISSIONS_EVENT, openSettings);
    try {
      await act(async () => root.render(createElement(AssistantPermissionCard, { interaction, onDecision })));
      const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      expect(checkbox.checked).toBe(false);
      expect(container.textContent).toContain("我的模型");
      expect(container.querySelectorAll(".assistant-permission-actions button")).toHaveLength(2);
      if (remember) await act(async () => checkbox.click());
      expect(onDecision).not.toHaveBeenCalled();
      const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
      await act(async () => { button.click(); button.click(); });
      expect(onDecision).toHaveBeenCalledOnce();
      expect(onDecision).toHaveBeenCalledWith(expected);
      expect(checkbox.disabled).toBe(true);
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="在设置中管理权限"]')?.click());
      expect(openSettings).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); container.remove(); window.removeEventListener(OPEN_ASSISTANT_PERMISSIONS_EVENT, openSettings); }
  });

  it("does not accept authorization while disabled", async () => {
    const container = document.createElement("div"); const root = createRoot(container); const onDecision = vi.fn();
    try {
      await act(async () => root.render(createElement(AssistantPermissionCard, { interaction, disabled: true, onDecision })));
      expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
      await act(async () => container.querySelector<HTMLButtonElement>('[data-primary="true"]')?.click());
      expect(onDecision).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); }
  });
});
