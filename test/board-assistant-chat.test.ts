// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n";
import { AiAssistant, type AiAssistantProps } from "../src/components/assistant/AiAssistant";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let unmount: (() => Promise<void>) | undefined;
afterEach(async () => { await unmount?.(); unmount = undefined; });
async function render(extra: Partial<AiAssistantProps> = {}) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const props: AiAssistantProps = { variant: "floating", hideComposer: true, value: "", messages: [], onValueChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn(), ...extra };
  window.localStorage.setItem("iterlay:language", "zh-CN");
  unmount = async () => { await act(async () => root.unmount()); container.remove(); };
  await act(async () => root.render(createElement(I18nProvider, null, createElement(AiAssistant, props))));
  return { container, props, rerender: (patch: Partial<AiAssistantProps>) => act(async () => root.render(createElement(I18nProvider, null, createElement(AiAssistant, { ...props, ...patch })))) };
}
const button = (container: HTMLElement, text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text || item.getAttribute("aria-label") === text);

describe("canvas assistant with the workbench conversation style", () => {
  it("keeps tool-only rounds compact and does not render empty streaming placeholders", async () => {
    const page = await render({ streaming: true, activityLabel: "正在分析你的需求…", messages: [
      { id: "tools", role: "assistant", content: "", toolCalls: [{ id: "read", name: "read_board", status: "completed" }] },
      { id: "pending", role: "assistant", content: "", streaming: true }
    ] });
    expect(page.container.querySelectorAll('[data-assistant-message="assistant"]')).toHaveLength(2);
    expect(page.container.querySelector('.create-chat-response')).toBeNull();
    expect(page.container.querySelector('.assistant-chain')).not.toBeNull();
    expect(page.container.querySelector('[data-assistant-activity]')).toBeNull();
    await page.rerender({ messages: [{ id: "pending", role: "assistant", content: "已读取画板", streaming: true }] });
    await vi.waitFor(async () => {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(page.container.querySelector('.create-chat-response')?.textContent).toContain("已读取画板");
    });
  });
  it("uses the workbench chat surface and hides the greeting after the conversation starts", async () => {
    const greeting = { id: "fusion-greeting", role: "assistant" as const, content: "欢迎开始创作" };
    const page = await render({ messages: [greeting] });
    expect(page.container.querySelector(".assistant-chat.create-chat")).not.toBeNull();
    expect(page.container.textContent).toContain("模板共创助手");
    expect(page.container.querySelector("header img")).toBeNull();
    await page.rerender({ messages: [greeting, { id: "user", role: "user", content: "设计咖啡海报" }, { id: "assistant", role: "assistant", content: "先梳理品牌方向", streaming: true }] });
    expect(page.container.querySelector(".create-chat-user")?.textContent).toContain("设计咖啡海报");
    await vi.waitFor(async () => {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(page.container.querySelector(".create-chat-response")?.textContent).toContain("先梳理品牌方向");
    });
    expect(page.container.textContent).not.toContain("欢迎开始创作");
  });
  it("keeps history scope, restore and new-conversation callbacks", async () => {
    const onHistoryOpen = vi.fn(), onHistorySelect = vi.fn(), onHistoryScopeChange = vi.fn(), onNewConversation = vi.fn();
    const record = { id: "conversation", title: "咖啡广告", preview: "保留自然光", updatedAt: "2026-10-20T01:00:00Z", exchangeCount: 2, boardId: "board", boardName: "咖啡", messages: [] };
    const { container } = await render({ onHistoryOpen, onHistorySelect, onHistoryScopeChange, onNewConversation, history: [record] });
    await act(async () => button(container, "查看对话历史")?.click());
    expect(onHistoryOpen).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => button(container, "全部画板")?.click());
    expect(onHistoryScopeChange).toHaveBeenCalledWith("all");
    await act(async () => container.querySelector<HTMLButtonElement>(".assistant-chat-history-list > button")?.click());
    expect(onHistorySelect).toHaveBeenCalledWith(record);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => button(container, "开始新会话")?.click());
    expect(onNewConversation).toHaveBeenCalledOnce();
  });
  it("preserves permission decisions while streaming", async () => {
    const onInteractionSubmit = vi.fn();
    const { container } = await render({ streaming: true, onInteractionSubmit, interaction: { id: "permission", interaction: { type: "permission", capability: "screen-capture", title: "允许查看屏幕？", description: "用于本次分析", providerLabel: "我的模型" } } });
    expect(button(container, "允许")?.disabled).toBe(false);
    await act(async () => button(container, "允许")?.click());
    expect(onInteractionSubmit).toHaveBeenCalledWith({ permissionDecision: "allow_once" });
  });
  it("uses the shared question card and retains custom supplements", async () => {
    const onInteractionSubmit = vi.fn();
    const { container } = await render({ streaming: true, onInteractionSubmit, interaction: { id: "form", interaction: { type: "form", title: "选择风格", fields: [{ id: "style", label: "画面风格", type: "select", required: true, options: [{ label: "自然", value: "natural" }, { label: "戏剧", value: "dramatic" }] }] } } });
    expect(container.querySelector(".ct-question")).not.toBeNull();
    await act(async () => container.querySelector<HTMLInputElement>('input[value="natural"]')?.click());
    expect(container.querySelector('textarea[aria-label="补充说明：画面风格"]')).not.toBeNull();
    await act(async () => button(container, "继续")?.click());
    expect(onInteractionSubmit).toHaveBeenCalledWith({ style: "natural" });
  });
  it("keeps generated prompts collapsed with apply and direction actions", async () => {
    const onApplyGeneratedPrompt = vi.fn(), onApply = vi.fn(), onGenerate = vi.fn();
    const { container } = await render({ onApplyGeneratedPrompt, messages: [{ id: "plan", role: "assistant", content: "方案已经准备好", generatedPrompt: "咖啡杯与自然光", directions: [{ id: "natural", title: "自然方向", onApply, onGenerate }] }] });
    expect(container.querySelector(".assistant-chat-prompt-content")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>(".assistant-chat-prompt-toggle")?.click());
    expect(container.querySelector(".assistant-chat-prompt-content")?.textContent).toContain("咖啡杯与自然光");
    await act(async () => container.querySelector<HTMLButtonElement>(".assistant-chat-prompt-content .ct-button-primary")?.click());
    expect(onApplyGeneratedPrompt).toHaveBeenCalledWith("咖啡杯与自然光");
    await act(async () => container.querySelector<HTMLButtonElement>(".assistant-chat-directions .ct-button-primary")?.click());
    expect(onGenerate).toHaveBeenCalledOnce();
  });
  it("passes video type and settings from the exact prompt card being applied", async () => {
    const onApplyGeneratedPrompt = vi.fn();
    const video = { id: "video", role: "assistant" as const, content: "已准备视频方案",
      generatedPrompt: "镜头缓慢推进", mediaType: "video" as const,
      videoSettings: { durationSeconds: 15, aspectRatio: "9:16" } };
    const { container } = await render({ onApplyGeneratedPrompt, messages: [video,
      { id: "later", role: "assistant", content: "另一张图片", generatedPrompt: "静态插画" }] });
    await act(async () => container.querySelector<HTMLButtonElement>(".assistant-chat-prompt-toggle")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>(".assistant-chat-prompt-content .ct-button-primary")?.click());
    expect(onApplyGeneratedPrompt).toHaveBeenCalledWith("镜头缓慢推进", video);
  });

});
