// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BoardSummary,
  CollaborateSceneRequest,
  CollaborateSceneResult
} from "../shared/types";
import {
  CreateChatPage,
  type CreateChatGenerationPlan,
  type CreateChatResult
} from "../src/components/workbench/CreateChatPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = "2026-08-20T10:00:00.000Z";
const boards: BoardSummary[] = [
  { id: "board-1", name: "人物肖像", createdAt: now, updatedAt: now, imageCount: 2 }
];

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  Reflect.deleteProperty(globalThis, "imageWorkbench");
  vi.clearAllMocks();
});

async function renderPage(
  onCreate: (plan: CreateChatGenerationPlan) => Promise<CreateChatResult>,
  onInterpret: (request: CollaborateSceneRequest) => Promise<CollaborateSceneResult> = async (request) => ({
    message: "方案已经整理好，请确认。",
    intent: "direct",
    suggestedName: "新创作",
    fields: [{ label: "提示词", value: request.instruction }]
  })
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(CreateChatPage, {
        boards,
        activeBoardId: "board-1",
        onInterpret,
        onCreate,
        onOpenBoard: vi.fn(),
        onOpenSettings: vi.fn()
      })
    );
  });
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim() === label || button.getAttribute("aria-label") === label);
}

async function setComposer(value: string): Promise<void> {
  const textarea = container?.querySelector<HTMLTextAreaElement>("#create-chat-input");
  await act(async () => {
    if (!textarea) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("CreateChatPage", () => {
  it("loads varied starter prompts from the dedicated suggestion agent and can refresh them", async () => {
    const firstSuggestions = [
      "拍摄一组雨夜霓虹下的透明机械花",
      "创作一幅海底图书馆的复古科普插画",
      "设计一组清晨集市里的非人类角色定格动画"
    ];
    const refreshedSuggestions = [
      "用木刻版画表现极地邮差穿越风暴",
      "创作一辆可信的未来公共交通工具",
      "拍摄一组有使用痕迹的厨房器物静物"
    ];
    const suggestAssistantIntents = vi.fn()
      .mockResolvedValueOnce({ suggestions: firstSuggestions })
      .mockResolvedValueOnce({ suggestions: refreshedSuggestions });
    Object.defineProperty(globalThis, "imageWorkbench", {
      configurable: true,
      value: { suggestAssistantIntents }
    });

    await renderPage(vi.fn());

    expect(suggestAssistantIntents).toHaveBeenCalledWith(expect.objectContaining({
      assistantSurface: "canvas-prompt",
      suggestionCount: 3,
      suggestionMode: "contextual",
      variationSeed: expect.any(String)
    }));
    expect(container?.textContent).toContain(firstSuggestions[0]);

    await act(async () => findButton("换一批灵感")?.click());

    expect(suggestAssistantIntents).toHaveBeenLastCalledWith(expect.objectContaining({
      suggestionMode: "divergent",
      previousSuggestions: firstSuggestions,
      variationSeed: expect.any(String)
    }));
    expect(container?.textContent).toContain(refreshedSuggestions[0]);
    expect(container?.textContent).not.toContain(firstSuggestions[0]);
  });

  it("interprets a direct request and waits for confirmation before creating", async () => {
    const onInterpret = vi.fn(async (request: CollaborateSceneRequest) => ({
      message: "我整理了一版可执行方案。",
      intent: "direct" as const,
      suggestedName: "香水视觉",
      fields: [{ label: "提示词", value: request.instruction }]
    }));
    const onCreate = vi.fn(async () => ({
      boardId: "new-board",
      boardName: "香水视觉",
      images: [{ id: "image-1", dataUrl: "data:image/png;base64,AA==" }]
    }));
    await renderPage(onCreate, onInterpret);

    await act(async () => findButton("一组克制高级的香水产品摄影，深色背景与硬光")?.click());
    await act(async () => findButton("发送给 Pi Agent")?.click());

    expect(onInterpret).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("创作方案已准备好");

    await act(async () => findButton("确认生成")?.click());

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "一组克制高级的香水产品摄影，深色背景与硬光",
      targetBoardId: null,
      suggestedName: "香水视觉"
    }));
    expect(container?.textContent).toContain("已生成并保存到「香水视觉」");
    expect(container?.querySelector('button[aria-label="打开画板查看第 1 张生成图片"]')).not.toBeNull();
  });

  it("renders ask-question and does not create until the answers produce a confirmed plan", async () => {
    const onInterpret = vi.fn(async (request: CollaborateSceneRequest): Promise<CollaborateSceneResult> => {
      if (request.clarificationRounds === 0) {
        return {
          message: "先确认角色和风格。",
          intent: "creative",
          fields: [],
          interaction: {
            type: "form",
            title: "先确定两个关键点",
            submitLabel: "继续",
            fields: [
              {
                id: "character",
                label: "角色",
                type: "text",
                required: true,
                placeholder: "例如：橘猫"
              },
              {
                id: "style",
                label: "风格",
                type: "select",
                required: true,
                options: [{ label: "可爱手绘", value: "可爱手绘" }]
              }
            ]
          }
        };
      }
      return {
        message: "表情包方案已准备好。",
        intent: "direct",
        fields: [{ label: "提示词", value: "圆滚滚的橘猫，可爱手绘表情包" }]
      };
    });
    const onCreate = vi.fn(async () => ({
      boardId: "stickers",
      boardName: "表情包",
      images: [{ id: "image-1", dataUrl: "data:image/png;base64,AA==" }]
    }));
    await renderPage(onCreate, onInterpret);

    await setComposer("我想做个表情包");
    await act(async () => findButton("发送给 Pi Agent")?.click());

    expect(container?.textContent).toContain("先确定两个关键点");
    expect(onCreate).not.toHaveBeenCalled();

    const characterInput = [...document.body.querySelectorAll<HTMLTextAreaElement>("textarea")]
      .find((textarea) => textarea.placeholder === "例如：橘猫");
    await act(async () => {
      if (!characterInput) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(characterInput, "圆滚滚的橘猫");
      characterInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => findButton("可爱手绘")?.click());
    await act(async () => findButton("继续")?.click());

    expect(onInterpret).toHaveBeenCalledTimes(2);
    expect(onInterpret.mock.calls[1]?.[0]).toMatchObject({ clarificationRounds: 1 });
    expect(onCreate).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("创作方案已准备好");

    await act(async () => findButton("确认生成")?.click());
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("passes the selected existing board only after confirmation", async () => {
    const onCreate = vi.fn(async (plan: CreateChatGenerationPlan) => ({
      boardId: plan.targetBoardId ?? "new-board",
      boardName: "人物肖像",
      images: [{ id: "image-1", dataUrl: "data:image/png;base64,AA==" }]
    }));
    await renderPage(onCreate);

    const targetTrigger = findButton("新建画板");
    await act(async () => {
      targetTrigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    });
    const boardItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.includes("人物肖像"));
    await act(async () => boardItem?.click());

    await setComposer("生成一组自然光肖像");
    await act(async () => findButton("发送给 Pi Agent")?.click());

    expect(onCreate).not.toHaveBeenCalled();
    await act(async () => findButton("确认生成")?.click());
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "生成一组自然光肖像",
      targetBoardId: "board-1"
    }));
  });

  it("shows the same elapsed and remaining estimate used on the canvas while generating", async () => {
    let resolveCreate: ((result: CreateChatResult) => void) | undefined;
    const onCreate = vi.fn(() => new Promise<CreateChatResult>((resolve) => {
      resolveCreate = resolve;
    }));
    await renderPage(onCreate);

    await setComposer("生成一组自然光肖像");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await act(async () => findButton("确认生成")?.click());

    expect(container?.textContent).toContain("已用 00:00");
    expect(container?.textContent).toContain("预计剩余 02:00");

    await act(async () => resolveCreate?.({
      boardId: "new-board",
      boardName: "新创作",
      images: [{ id: "image-1", dataUrl: "data:image/png;base64,AA==" }]
    }));
  });

  it("opens the history drawer and restores a selected conversation", async () => {
    const listAssistantConversations = vi.fn().mockResolvedValue([{
      id: "record-1",
      conversationId: "conversation-history",
      surface: "canvas-prompt",
      instruction: "生成一个复古头像",
      response: "我整理了一版复古胶片头像方案。",
      generatedPrompt: "复古胶片人像，柔和侧光，纯色背景",
      occurredAt: now,
      boardId: "board-1"
    }]);
    Object.defineProperty(globalThis, "imageWorkbench", {
      configurable: true,
      value: { listAssistantConversations }
    });
    await renderPage(vi.fn());

    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    await act(async () => findButton("查看会话历史")?.click());

    expect(listAssistantConversations).toHaveBeenCalledWith({ surface: "canvas-prompt" });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(container?.textContent).toContain("会话历史");
    expect(container?.textContent).toContain("生成一个复古头像");

    const conversationScroll = container?.querySelector<HTMLDivElement>(".overflow-y-auto.px-5");
    const smoothScroll = vi.fn();
    if (conversationScroll) {
      Object.defineProperty(conversationScroll, "scrollHeight", { configurable: true, value: 800 });
      conversationScroll.scrollTo = smoothScroll;
      conversationScroll.scrollTop = 0;
    }
    await act(async () => findButton("打开会话：生成一个复古头像")?.click());

    expect(container?.textContent).toContain("我整理了一版复古胶片头像方案。");
    expect(container?.textContent).toContain("已执行的创作方案");
    expect(findButton("人物肖像")).toBeDefined();
    expect(conversationScroll?.scrollTop).toBe(800);
    expect(smoothScroll).not.toHaveBeenCalled();
  });
});


describe("CreateChatPage comic drama entry", () => {
  it("uses the free board-start action for a comic drama idea", async () => {
    let resolveCreate: ((result: CreateChatResult) => void) | undefined;
    const onCreate = vi.fn(() => new Promise<CreateChatResult>((resolve) => {
      resolveCreate = resolve;
    }));
    await renderPage(onCreate);
    await setComposer("做一部雨夜悬疑漫剧，主角收到十年前的信");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    expect(onCreate).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("本步不生成图片或视频，不产生媒体费用");
    await act(async () => findButton("在画板中开始")?.click());
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ comicDrama: true }));
    expect(container?.textContent).toContain("正在创建普通画板并添加 1 张漫剧设定卡，不会调用媒体模型");
    await act(async () => resolveCreate?.({ boardId: "comic-board", boardName: "雨夜来信", comicDrama: true, images: [] }));
    expect(container?.textContent).toContain("已添加 1 张漫剧设定卡");
  });
});
