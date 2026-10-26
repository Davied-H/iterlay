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
  CreationAssistantPage,
  type CreationAssistantGenerationPlan,
  type CreationAssistantResult,
  type CreationAssistantStreamOptions
} from "../src/components/workbench/CreationAssistantPage";
import { makeCreationSession } from "../src/lib/creation-workspace";

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
  window.localStorage.removeItem("iterlay:creation:active");
  window.localStorage.removeItem("iterlay:creation:projects");
  vi.clearAllMocks();
});

async function renderPage(
  onCreate: (plan: CreationAssistantGenerationPlan) => Promise<CreationAssistantResult>,
  onInterpret: (request: CollaborateSceneRequest, stream?: CreationAssistantStreamOptions) => Promise<CollaborateSceneResult> = async (request) => ({
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
      createElement(CreationAssistantPage, {
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

describe("CreationAssistantPage", () => {
  it("moves sent references into message history and clears the composer", async () => {
    const session = makeCreationSession();
    session.references = [{ id: "ref-1", kind: "upload", role: "reference", name: "孩子照片",
      mimeType: "image/png", imagePath: "/references/child.png" }];
    window.localStorage.setItem("iterlay:creation:active", session.id);
    const save = vi.fn().mockImplementation(async (value) => value);
    Object.defineProperty(globalThis, "imageWorkbench", { configurable: true, value: {
      listCreationSessions: vi.fn().mockResolvedValue([session]), saveCreationSession: save,
      creationReferenceUrl: vi.fn().mockResolvedValue("data:image/png;base64,YQ=="),
      readAssetDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,YQ=="),
      suggestAssistantIntents: vi.fn().mockResolvedValue({ suggestions: [] })
    } });
    const interpret = vi.fn().mockResolvedValue({ message: "已收到照片", fields: [] });
    await renderPage(vi.fn(), interpret);
    await setComposer("制作成长纪念书");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    expect(interpret.mock.calls[0]?.[0].referenceImages).toHaveLength(1);
    expect(container?.querySelector('[aria-label="创作参考素材"]')).toBeNull();
    expect(container?.querySelector('[aria-label="已发送素材"]')?.textContent).toContain("孩子照片");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    const saved = save.mock.calls.at(-1)?.[0];
    expect(saved.references).toEqual([]);
    expect(saved.messages.find((message: { role: string }) => message.role === "user").references[0].imagePath)
      .toBe("/references/child.png");
  });

  it.each([undefined, "manual" as const])("summarizes after two completed rounds unless manually named (%s)", async (source) => {
    const session = makeCreationSession();
    session.title = "你好";
    session.titleSource = source;
    session.messages = [
      { id: "u1", role: "user", content: "你好" },
      { id: "a1", role: "assistant", content: "你好，请说说想法" },
      { id: "u2", role: "user", content: "想给儿子做一本书" },
      { id: "a2", role: "assistant", content: "我们来设计亲子绘本" }
    ];
    window.localStorage.setItem("iterlay:creation:active", session.id);
    const summarize = vi.fn().mockResolvedValue("为儿子创作亲子绘本");
    Object.defineProperty(globalThis, "imageWorkbench", { configurable: true, value: {
      listCreationSessions: vi.fn().mockResolvedValue([session]),
      saveCreationSession: vi.fn().mockImplementation(async (value) => value),
      summarizeCreationTitle: summarize,
      suggestAssistantIntents: vi.fn().mockResolvedValue({ suggestions: [] })
    } });
    await renderPage(vi.fn());
    expect(summarize).toHaveBeenCalledTimes(source ? 0 : 1);
    if (!source) expect(container?.textContent).toContain("为儿子创作亲子绘本");
  });

  it("continues and retries saved conversations containing invisible empty replies", async () => {
    const session = makeCreationSession();
    session.title = "把风画成一匹半透明的马";
    session.messages = [
      { id: "original", role: "user", content: session.title },
      { id: "empty-reply", role: "assistant", content: "", prompt: "" },
      { id: "continue", role: "user", content: "继续" },
      { id: "blank-reply", role: "assistant", content: " \n ", prompt: " " },
      { id: "error", role: "error", content: "第 2 条对话记录内容无效。" }
    ];
    Object.defineProperty(globalThis, "imageWorkbench", { configurable: true, value: {
      listCreationSessions: vi.fn().mockResolvedValue([session]),
      saveCreationSession: vi.fn().mockImplementation(async (value) => value),
      suggestAssistantIntents: vi.fn().mockResolvedValue({ suggestions: [] })
    } });
    const onInterpret = vi.fn()
      .mockRejectedValueOnce(new Error("临时连接失败"))
      .mockResolvedValue({ message: "已继续创作", intent: "chat", fields: [] });
    await renderPage(vi.fn(), onInterpret);
    await act(async () => findButton(session.title)?.click());
    await setComposer("继续创作");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    expect(onInterpret.mock.calls[0]?.[0].conversation).toEqual([
      { role: "user", content: session.title },
      { role: "user", content: "继续" }
    ]);
    await act(async () => findButton("重试")?.click());
    expect(onInterpret).toHaveBeenCalledTimes(2);
    expect(onInterpret.mock.calls[1]?.[0].conversation).toEqual([
      { role: "user", content: session.title },
      { role: "user", content: "继续" },
      { role: "user", content: "继续创作" }
    ]);
    expect(container?.textContent).toContain("已继续创作");
  });

  it("keeps existing sessions in place after selection, autosave and external updates", async () => {
    const sessions = ["first", "second", "third"].map((id) => ({
      ...makeCreationSession(), id, title: id,
      messages: [{ id: `${id}-message`, role: "user" as const, content: id }]
    }));
    const saveCreationSession = vi.fn().mockImplementation(async (session) => session);
    Object.defineProperty(globalThis, "imageWorkbench", { configurable: true, value: {
      listCreationSessions: vi.fn().mockResolvedValue(sessions), saveCreationSession,
      suggestAssistantIntents: vi.fn().mockResolvedValue({ suggestions: [] })
    } });
    await renderPage(vi.fn());
    const order = () => [...container!.querySelectorAll<HTMLElement>("[data-session-id]")]
      .map((row) => row.dataset.sessionId);
    await act(async () => findButton("third")?.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    expect(saveCreationSession).toHaveBeenCalledWith(expect.objectContaining({ id: "third" }));
    expect(order()).toEqual(["first", "second", "third"]);
    expect(container?.querySelector('[data-session-id="third"] [aria-current="page"]')).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new CustomEvent("iterlay:creation:updated", { detail: { ...sessions[1], title: "renamed" } }));
    });
    expect(order()).toEqual(["first", "second", "third"]);
    await act(async () => {
      window.dispatchEvent(new CustomEvent("iterlay:creation:updated", { detail: { ...makeCreationSession(), id: "new" } }));
    });
    expect(order()).toEqual(["new", "first", "second", "third"]);
  });

  it("creates a project directory in the creation assistant sidebar", async () => {
    await renderPage(vi.fn());
    await act(async () => findButton("新建项目")?.click());
    const input = container?.querySelector<HTMLInputElement>('input[aria-label="项目名称"]');
      expect(input).not.toBeNull();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "咖啡广告");
        input?.dispatchEvent(new Event("input", { bubbles: true }));
        input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(JSON.parse(window.localStorage.getItem("iterlay:creation:projects") ?? "[]")).toEqual([
        expect.objectContaining({ name: "咖啡广告" }),
      ]);
    expect(container?.textContent).toContain("咖啡广告");
  });
  it.each(["click", "enter"])("automatically steers an active run through normal send (%s)", async (method) => {
    let finish: ((value: CollaborateSceneResult) => void) | undefined;
    const steer = vi.fn().mockResolvedValue(true);
    const onInterpret = vi.fn((_request: CollaborateSceneRequest, stream?: CreationAssistantStreamOptions) => {
      stream?.onSteerAvailable?.(steer);
      return new Promise<CollaborateSceneResult>((resolve) => { finish = resolve; });
    });
    await renderPage(vi.fn(), onInterpret);
    await setComposer("做一张咖啡海报");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await setComposer("强调晨光");
    expect(findButton("补充当前执行")).toBeUndefined();
    expect(container?.querySelector(".creation-steer-button")).toBeNull();
    await act(async () => {
      if (method === "click") findButton("发送给 Pi Agent")?.click();
      else container?.querySelector("#create-chat-input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(steer).toHaveBeenCalledWith("强调晨光");
    expect(onInterpret).toHaveBeenCalledTimes(1);
    expect(container?.textContent).toContain("强调晨光");
    await act(async () => finish?.({ message: "方案完成", intent: "chat", fields: [] }));
  });

  it.each(["unavailable", "declined", "failed", "media-started"])("queues normal send when steering is %s", async (state) => {
    let finish: ((value: CollaborateSceneResult) => void) | undefined;
    const steer = state === "failed" ? vi.fn().mockRejectedValue(new Error("window closed")) : vi.fn().mockResolvedValue(false);
    const onInterpret = vi.fn((_request: CollaborateSceneRequest, stream?: CreationAssistantStreamOptions) => {
      if (state !== "unavailable") stream?.onSteerAvailable?.(steer);
      if (state === "media-started") stream?.onTool?.({ id: "media", name: "generate_image", status: "running" });
      return new Promise<CollaborateSceneResult>((resolve) => { finish = resolve; });
    });
    await renderPage(vi.fn(), onInterpret);
    await setComposer("做一张咖啡海报");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await setComposer("强调晨光");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    expect(steer).toHaveBeenCalledTimes(state === "declined" || state === "failed" ? 1 : 0);
    expect(onInterpret).toHaveBeenCalledTimes(1);
    expect(container?.querySelector(".creation-queue")?.textContent).toContain("强调晨光");
    expect(container?.querySelector<HTMLTextAreaElement>("#create-chat-input")?.value).toBe("");
    await act(async () => finish?.({ message: "方案完成", intent: "chat", fields: [] }));
  });

  it("shows media created by an Agent tool without submitting it again", async () => {
    const job = { id: "video-job", status: "completed", outputVideoPath: "video.mp4", input: { boardId: "board-1" } };
    Object.defineProperty(globalThis, "imageWorkbench", { configurable: true, value: {
      listCreationSessions: vi.fn().mockResolvedValue([]), saveCreationSession: vi.fn().mockImplementation(async (session) => session),
      listPlugins: vi.fn().mockResolvedValue([]), getVideoJob: vi.fn().mockResolvedValue(job),
      getBoard: vi.fn().mockResolvedValue({ id: "board-1", name: "人物肖像", nodes: [{ id: "video-node", type: "video", videoPath: "video.mp4", jobId: "video-job" }],
        images: {}, media: { "video.mp4": "iterlay-asset://local/video" } }),
      suggestAssistantIntents: vi.fn().mockResolvedValue({ suggestions: [] })
    } });
    const onCreate = vi.fn();
    const onInterpret = vi.fn(async (_request: CollaborateSceneRequest, stream?: CreationAssistantStreamOptions) => {
      stream?.onTool?.({ id: "tool", name: "generate_video", status: "completed",
        input: JSON.stringify({ boardId: "board-1", prompt: "慢镜头" }),
        output: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ videoGenerationId: "video-job" }) }] }) });
      return { message: "视频已完成", intent: "chat" as const, fields: [] };
    });
    await renderPage(onCreate, onInterpret);
    await setComposer("生成一个慢镜头视频");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
    expect(onCreate).not.toHaveBeenCalled();
    expect(container?.querySelector('.creation-artifact-panel video')).not.toBeNull();
    expect(container?.textContent).toContain("1 项工具调用");
  });
  it("restores queued follow-ups without executing them before the user resumes", async () => {
    const session = makeCreationSession("aaaa1111-2222-3333-4444-555566667777");
    session.queued = ["生成一张新的封面"];
    session.messages = [{ id: "u", role: "user", content: "咖啡短片" }];
    session.activeRunId = "interrupted-run";
    window.localStorage.setItem("iterlay:creation:active", session.id);
    Object.defineProperty(globalThis, "imageWorkbench", { configurable: true, value: {
      listCreationSessions: vi.fn().mockResolvedValue([session]), getBoard: vi.fn().mockResolvedValue(null),
      saveCreationSession: vi.fn().mockResolvedValue(session), suggestAssistantIntents: vi.fn().mockResolvedValue({ suggestions: [] })
    } });
    const onInterpret = vi.fn().mockResolvedValue({ message: "已收到", intent: "chat", fields: [] });
    await renderPage(vi.fn(), onInterpret);
    expect(container?.textContent).toContain("生成一张新的封面");
    expect(onInterpret).not.toHaveBeenCalled();
    await act(async () => findButton("继续处理补充")?.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
    expect(onInterpret).toHaveBeenCalledOnce();
  });
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

  it("replaces an edited first message and removes its old replies from future model context", async () => {
    const onInterpret = vi.fn(async (request: CollaborateSceneRequest): Promise<CollaborateSceneResult> => ({
      message: `答复：${request.instruction}`,
      intent: "chat",
      fields: []
    }));
    const onCreate = vi.fn();
    await renderPage(onCreate, onInterpret);

    await setComposer("旧问题：给咖啡馆设计海报");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await setComposer("原来的后续要求：使用红色");
    await act(async () => findButton("发送给 Pi Agent")?.click());

    await act(async () => findButton("编辑消息")?.click());
    expect(container?.querySelector<HTMLTextAreaElement>("#create-chat-input")?.value).toBe("旧问题：给咖啡馆设计海报");
    await setComposer("更新的问题：设计绿色的书店海报");
    await act(async () => findButton("发送给 Pi Agent")?.click());

    expect(onInterpret).toHaveBeenCalledTimes(3);
    expect(onInterpret.mock.calls[2]?.[0]).toMatchObject({
      instruction: "更新的问题：设计绿色的书店海报",
      conversation: []
    });
    expect(container?.textContent).not.toContain("旧问题：给咖啡馆设计海报");
    expect(container?.textContent).not.toContain("原来的后续要求：使用红色");
    expect(container?.textContent).toContain("答复：更新的问题：设计绿色的书店海报");
    expect(findButton("取消编辑")).toBeUndefined();

    await setComposer("继续完善更新后的海报");
    await act(async () => findButton("发送给 Pi Agent")?.click());

    expect(onInterpret.mock.calls[3]?.[0].conversation).toEqual([
      { role: "user", content: "更新的问题：设计绿色的书店海报" },
      { role: "assistant", content: "答复：更新的问题：设计绿色的书店海报" }
    ]);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("cancels message editing without changing the conversation or its pending plan", async () => {
    const onInterpret = vi.fn(async (request: CollaborateSceneRequest): Promise<CollaborateSceneResult> => ({
      message: `创作建议：${request.instruction}`,
      intent: "direct",
      fields: [{ label: "提示词", value: request.instruction }]
    }));
    const onCreate = vi.fn();
    await renderPage(onCreate, onInterpret);

    await setComposer("为陶瓷花瓶设计一幅静物照片");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await setComposer("保留窗边的柔和自然光");
    await act(async () => findButton("发送给 Pi Agent")?.click());

    await act(async () => findButton("编辑消息")?.click());
    await setComposer("这段编辑内容应当被放弃");
    await act(async () => findButton("取消编辑")?.click());

    expect(onInterpret).toHaveBeenCalledTimes(2);
    expect(container?.querySelector<HTMLTextAreaElement>("#create-chat-input")?.value).toBe("");
    expect(container?.textContent).toContain("为陶瓷花瓶设计一幅静物照片");
    expect(container?.textContent).toContain("创作建议：保留窗边的柔和自然光");
    expect(container?.textContent).not.toContain("这段编辑内容应当被放弃");
    expect(findButton("取消编辑")).toBeUndefined();
    expect(findButton("确认生成")?.disabled).toBe(false);

    await setComposer("继续添加亚麻桌布");
    await act(async () => findButton("发送给 Pi Agent")?.click());

    expect(onInterpret.mock.calls[2]?.[0].conversation).toEqual([
      { role: "user", content: "为陶瓷花瓶设计一幅静物照片" },
      { role: "assistant", content: "创作建议：为陶瓷花瓶设计一幅静物照片\n为陶瓷花瓶设计一幅静物照片" },
      { role: "user", content: "保留窗边的柔和自然光" },
      { role: "assistant", content: "创作建议：保留窗边的柔和自然光\n保留窗边的柔和自然光" }
    ]);
    expect(onCreate).not.toHaveBeenCalled();
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

    const characterInput = document.body.querySelector<HTMLInputElement>('input[placeholder="例如：橘猫"]');
    await act(async () => {
      if (!characterInput) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(characterInput, "圆滚滚的橘猫");
      characterInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => findButton("下一题")?.click());
    await act(async () => document.body.querySelector<HTMLInputElement>('input[type="radio"][value="可爱手绘"]')?.click());
    await act(async () => findButton("继续")?.click());

    expect(onInterpret).toHaveBeenCalledTimes(2);
    expect(onInterpret.mock.calls[1]?.[0]).toMatchObject({ clarificationRounds: 1 });
    expect(onCreate).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("创作方案已准备好");

    await act(async () => findButton("确认生成")?.click());
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("passes the selected existing board only after confirmation", async () => {
    const onCreate = vi.fn(async (plan: CreationAssistantGenerationPlan) => ({
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
    let resolveCreate: ((result: CreationAssistantResult) => void) | undefined;
    const onCreate = vi.fn(() => new Promise<CreationAssistantResult>((resolve) => {
      resolveCreate = resolve;
    }));
    await renderPage(onCreate);

    await setComposer("生成一组自然光肖像");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    expect(container?.querySelector('[aria-label="复制回复"]')).not.toBeNull();
    await act(async () => findButton("确认生成")?.click());

    expect(container?.textContent).toContain("已用 00:00");
    expect(container?.textContent).toContain("预计剩余 02:00");
    expect(container?.querySelector('[aria-label="复制回复"]')).toBeNull();

    await act(async () => resolveCreate?.({
      boardId: "new-board",
      boardName: "新创作",
      images: [{ id: "image-1", dataUrl: "data:image/png;base64,AA==" }]
    }));
    expect(container?.querySelector('[aria-label="复制回复"]')).not.toBeNull();
  });

  it("keeps conversation navigation in the sidebar without duplicate header actions", async () => {
    const session = makeCreationSession();
    session.id = "conversation-history";
    session.title = "生成一个复古头像";
    session.boardId = "board-1";
    session.messages = [
      { id: "user", role: "user", content: session.title },
      { id: "assistant", role: "assistant", content: "我整理了一版复古胶片头像方案。" }
    ];
    Object.defineProperty(globalThis, "imageWorkbench", { configurable: true, value: {
      listCreationSessions: vi.fn().mockResolvedValue([session])
    } });
    await renderPage(vi.fn());
    const header = container?.querySelector(".create-chat-header");
    expect(header?.querySelector('[aria-label="查看会话历史"]')).toBeNull();
    expect(header?.querySelector(".create-chat-new")).toBeNull();
    await act(async () => findButton(session.title)?.click());
    expect(container?.textContent).toContain("我整理了一版复古胶片头像方案。");
    expect(findButton("人物肖像")).toBeDefined();
    await act(async () => findButton("新建聊天")?.click());
    expect(container?.textContent).not.toContain("我整理了一版复古胶片头像方案。");
  });

  it.each([
    { destination: "history", outcome: "success" },
    { destination: "history", outcome: "failure" },
    { destination: "new", outcome: "success" },
    { destination: "new", outcome: "failure" }
  ] as const)("keeps a $destination conversation unchanged when a previous generation ends in $outcome", async ({ destination, outcome }) => {
    let resolveCreate: ((result: CreationAssistantResult) => void) | undefined;
    let rejectCreate: ((error: Error) => void) | undefined;
    const onCreate = vi.fn<(plan: CreationAssistantGenerationPlan) => Promise<CreationAssistantResult>>(() => new Promise<CreationAssistantResult>((resolve, reject) => {
      resolveCreate = resolve;
      rejectCreate = reject;
    }));
    const onInterpret = vi.fn(async (request: CollaborateSceneRequest): Promise<CollaborateSceneResult> => ({
      message: "本次创作方案。",
      intent: "direct",
      fields: [{ label: "提示词", value: request.instruction }]
    }));
    const session = makeCreationSession();
    session.id = "restored-conversation";
    session.title = "讨论咖啡馆的光线";
    session.boardId = "board-1";
    session.messages = [
      { id: "user", role: "user", content: session.title },
      { id: "assistant", role: "assistant", content: "可以先从窗边的自然光开始。" }
    ];
    Object.defineProperty(globalThis, "imageWorkbench", {
      configurable: true,
      value: { listCreationSessions: vi.fn().mockResolvedValue([session]) }
    });
    await renderPage(onCreate, onInterpret);

    await setComposer("生成一张旧会话的风景图");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await act(async () => findButton("确认生成")?.click());
    expect(onCreate).toHaveBeenCalledOnce();

    await act(async () => {
      findButton(destination === "history" ? "讨论咖啡馆的光线" : "新建聊天")?.click();
    });
    expect(container?.textContent).not.toContain("生成一张旧会话的风景图");

    await act(async () => {
      if (outcome === "success") {
        resolveCreate?.({
          boardId: "old-result-board",
          boardName: "旧会话生成结果",
          images: [{ id: "old-image", dataUrl: "data:image/png;base64,AA==" }]
        });
      } else {
        rejectCreate?.(new Error("旧会话的生成失败了"));
      }
    });

    expect(container?.textContent).not.toContain("旧会话生成结果");
    expect(container?.textContent).not.toContain("旧会话的生成失败了");
    expect(container?.querySelector('button[aria-label="打开画板查看第 1 张生成图片"]')).toBeNull();
    if (destination === "history") {
      expect(container?.textContent).toContain("讨论咖啡馆的光线");
      expect(container?.textContent).toContain("可以先从窗边的自然光开始。");
      expect(findButton("人物肖像")).toBeDefined();
    } else {
      expect(container?.querySelector<HTMLTextAreaElement>("#create-chat-input")?.value).toBe("");
      expect(findButton("新建画板")).toBeDefined();
    }

    await setComposer("继续当前会话");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    expect(onInterpret).toHaveBeenCalledTimes(2);
    expect(onInterpret.mock.calls[1]?.[0]).toMatchObject({
      conversationId: destination === "history" ? "restored-conversation" : expect.any(String),
      memoryQuery: destination === "history" ? { boardId: "board-1" } : undefined
    });
    expect(onInterpret.mock.calls[1]?.[0].conversationId).not.toBe(onCreate.mock.calls[0]?.[0].conversationId);
  });

  it("retries a failed generation with the same confirmed prompt and destination", async () => {
    const onCreate = vi.fn<(plan: CreationAssistantGenerationPlan) => Promise<CreationAssistantResult>>()
      .mockRejectedValueOnce(new Error("图像模型暂时繁忙"))
      .mockResolvedValueOnce({
        boardId: "retry-board",
        boardName: "重试成功的画板",
        images: [{ id: "retry-image", dataUrl: "data:image/png;base64,AA==" }]
      });
    await renderPage(onCreate);

    await setComposer("自然光中的银色花瓶，细腻胶片颗粒");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await act(async () => findButton("确认生成")?.click());

    expect(container?.textContent).toContain("图像模型暂时繁忙");
    expect(container?.textContent).toContain("自然光中的银色花瓶，细腻胶片颗粒");
    expect(findButton("确认生成")?.disabled).toBe(false);

    await act(async () => findButton("确认生成")?.click());

    expect(onCreate).toHaveBeenCalledTimes(2);
    const { onProgress: firstProgress, onArtifact: firstArtifact, ...firstPlan } = onCreate.mock.calls[0]![0];
    const { onProgress: retryProgress, onArtifact: retryArtifact, ...retryPlan } = onCreate.mock.calls[1]![0];
    expect(firstProgress).toBeTypeOf("function");
    expect(retryProgress).toBeTypeOf("function");
    expect(firstArtifact).toBeTypeOf("function");
    expect(retryArtifact).toBeTypeOf("function");
    expect(retryPlan).toEqual(firstPlan);
    expect(container?.textContent).toContain("已生成并保存到「重试成功的画板」");
  });
});


describe("CreationAssistantPage comic drama entry", () => {
  it("uses the free board-start action for a comic drama idea", async () => {
    let resolveCreate: ((result: CreationAssistantResult) => void) | undefined;
    const onCreate = vi.fn(() => new Promise<CreationAssistantResult>((resolve) => {
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


describe("creation progress", () => {
  it("places execution details below errors", async () => {
    await renderPage(vi.fn(), async (_request, options) => {
      options?.onActivity("正在分析需求");
      throw new Error("助手未返回有效回复");
    });
    await setComposer("重试");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    const error = container?.querySelector('.create-chat-error');
    const process = container?.querySelector('.assistant-process');
    expect(error).not.toBeNull();
    expect(process).toBeNull();
  });

  it("retains process details and settles running tools after a failed request", async () => {
    await renderPage(vi.fn(), async (_request, stream) => {
      stream?.onReasoningSummary?.("先确认画板。");
      stream?.onActivity("正在读取画板");
      stream?.onTool?.({ id: "read", name: "read_board", status: "running" });
      throw new Error("连接中断");
    });
    await setComposer("继续生成");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await act(async () => container?.querySelector<HTMLButtonElement>('.assistant-chain button')?.click());
    expect(container?.querySelector('.assistant-process-reasoning')?.textContent).toContain("先确认画板");
    expect(container?.querySelector('.assistant-tool--error')).not.toBeNull();
    expect(container?.querySelector('.assistant-tool--running')).toBeNull();
    expect(container?.textContent).toContain("连接中断");
  });
  it("keeps reasoning and progress separate from the final reply and persists them", async () => {
    const saveCreationSession = vi.fn(async (session) => session);
    Object.defineProperty(globalThis, "imageWorkbench", { configurable: true, value: {
      listCreationSessions: vi.fn().mockResolvedValue([]), saveCreationSession,
      suggestAssistantIntents: vi.fn().mockResolvedValue({ suggestions: [] })
    } });
    let finish!: (result: CollaborateSceneResult) => void;
    let stream: CreationAssistantStreamOptions | undefined;
    await renderPage(vi.fn(), (_request, options) => {
      stream = options;
      return new Promise((resolve) => { finish = resolve; });
    });
    await setComposer("生成动物图卡");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await act(async () => {
      stream?.onReasoningSummary?.("选择清晰的六格布局。");
      stream?.onReasoningSummary?.("使用大字标题。");
      stream?.onActivity("正在创建画板");
      stream?.onActivity("正在创建画板");
      stream?.onActivity("正在生成图片");
    });
    expect(container?.querySelector('.create-chat-response')).toBeNull();
    await act(async () => container?.querySelector<HTMLButtonElement>('.assistant-chain-trigger')?.click());
    expect(container?.querySelector('.assistant-process-reasoning')?.textContent).toContain("选择清晰的六格布局。使用大字标题。");
    expect(container?.querySelectorAll('.assistant-process-activity')).toHaveLength(2);
    expect(container?.querySelector('.assistant-chain button')?.getAttribute('aria-expanded')).toBe('true');
    await act(async () => finish({ message: "图卡已生成。", intent: "chat", fields: [] }));
    expect(container?.querySelector('.create-chat-response')?.textContent).toBe("图卡已生成。");
    const response = container?.querySelector('.create-chat-response');
    const process = container?.querySelector('.assistant-process');
    expect(Boolean(response && process && (response.compareDocumentPosition(process) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    expect(container?.querySelector('.assistant-process-reasoning')?.textContent).toContain("六格布局");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(saveCreationSession).toHaveBeenLastCalledWith(expect.objectContaining({ messages: expect.arrayContaining([
      expect.objectContaining({ role: "assistant", content: "图卡已生成。", reasoningSummary: "选择清晰的六格布局。使用大字标题。", activitySteps: ["正在创建画板", "正在生成图片"] })
    ]) }));
  });
  it("shows incremental text before the plan arrives and only creates video after confirmation", async () => {
    let finish!: (result: CollaborateSceneResult) => void;
    let stream: CreationAssistantStreamOptions | undefined;
    const onInterpret = vi.fn((_request: CollaborateSceneRequest, options?: CreationAssistantStreamOptions) => {
      stream = options;
      return new Promise<CollaborateSceneResult>((resolve) => { finish = resolve; });
    });
    const onCreate = vi.fn(async () => ({ boardId: "video-board", boardName: "咖啡视频", images: [], videoJobId: "video-job", videoPending: true }));
    await renderPage(onCreate, onInterpret);
    await setComposer("直接生成一个5秒咖啡视频");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    expect(container?.querySelector('.assistant-chain-status')).not.toBeNull();
    expect(container?.querySelectorAll('[data-assistant-process] [role="status"], [data-assistant-process][role="status"]')).toHaveLength(1);
    expect(container?.querySelector('[aria-label="复制回复"]')).toBeNull();
    await act(async () => stream?.onDelta("正在整理咖啡视频的需求"));
    expect(container?.textContent).not.toContain("正在整理咖啡视频的需求");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(container?.querySelector("[data-assistant-message-body]")?.textContent).toBe("正");
    expect(container?.querySelector('[data-assistant-message-body][data-streaming="true"]')).not.toBeNull();
    expect(container?.querySelector('.create-chat-thinking')).toBeNull();
    expect(container?.querySelector('[aria-label="复制回复"]')).toBeNull();
    expect(container?.querySelector('.creation-run-strip, .creation-run-details')).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
    expect(findButton("确认生成")).toBeUndefined();
    await act(async () => finish({ message: "5秒咖啡视频，镜头缓慢推进，16:9。", intent: "direct", mediaType: "video", videoSettings: { durationSeconds: 5 }, fields: [{ label: "提示词", value: "咖啡蒸汽缓缓升起，镜头推进" }] }));
    expect(container?.querySelector('[data-assistant-message-body][data-streaming="true"]')).toBeNull();
    expect(container?.querySelector('[aria-label="复制回复"]')).not.toBeNull();
    expect(container?.querySelector('.creation-run-strip, .creation-run-details')).toBeNull();
    await act(async () => findButton("确认生成")?.click());
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ mediaType: "video", videoSettings: { durationSeconds: 5 } }));
    expect(container?.textContent).toContain("视频任务已提交");
    expect(container?.textContent).not.toContain("没有生成可用图片");
    expect(container?.textContent).not.toContain("已生成并保存到");
  });
  it("aborts an in-flight stream when leaving the creation page", async () => {
    let signal: AbortSignal | undefined;
    await renderPage(vi.fn(), (_request, options) => {
      signal = options?.signal;
      return new Promise(() => {});
    });
    await setComposer("帮我做一个创作方案");
    await act(async () => findButton("发送给 Pi Agent")?.click());
    await act(async () => root?.unmount());
    root = undefined;
    expect(signal?.aborted).toBe(true);
  });
});

it("does not submit generation from legacy final-result metadata", async () => {
  const onCreate = vi.fn(async () => ({ boardId: "direct", boardName: "直接生成", images: [] }));
  await renderPage(onCreate, async () => ({ message: "我会按已明确的需求生成。", intent: "direct", commitment: "execute_now", mediaType: "image", generationCount: 3, fields: [{ label: "提示词", value: "自然光中的咖啡杯" }] }));
  await setComposer("直接生成三张咖啡图片");
  await act(async () => findButton("发送给 Pi Agent")?.click());
  expect(onCreate).not.toHaveBeenCalled();
  expect(findButton("确认生成")).toBeDefined();
});

it("does not resubmit media already attempted through an agent tool", async () => {
  const onCreate = vi.fn();
  await renderPage(onCreate, async (_request, stream) => {
    stream?.onTool?.({ id: "video-tool", name: "generate_video", status: "completed" });
    return { message: "视频任务已提交，正在等待服务商处理。", intent: "direct", commitment: "execute_now", mediaType: "video", fields: [{ label: "提示词", value: "镜头向前推进" }] };
  });
  await setComposer("直接生成视频");
  await act(async () => findButton("发送给 Pi Agent")?.click());
  expect(onCreate).not.toHaveBeenCalled();
  expect(findButton("确认生成")).toBeUndefined();
  expect(container?.textContent).toContain("视频任务已提交");
});

it("answers a live agent form in the same run while the request is streaming", async () => {
  const saveCreationSession = vi.fn(async (session) => session);
  Object.defineProperty(globalThis, "imageWorkbench", { configurable: true, value: {
    listCreationSessions: vi.fn().mockResolvedValue([]), saveCreationSession,
    suggestAssistantIntents: vi.fn().mockResolvedValue({ suggestions: [] })
  } });
  const respond = vi.fn();
  let finish!: (result: CollaborateSceneResult) => void;
  const onInterpret = vi.fn((_request: CollaborateSceneRequest, stream?: CreationAssistantStreamOptions) => {
    stream?.onInteraction?.({ type: "form", title: "补充品牌调性", fields: [{ id: "style", label: "风格", type: "select", required: true, options: [{ label: "自然", value: "natural" }, { label: "戏剧", value: "dramatic" }] }] }, respond);
    return new Promise<CollaborateSceneResult>((resolve) => { finish = resolve; });
  });
  await renderPage(vi.fn(), onInterpret);
  await setComposer("帮我规划咖啡广告");
  await act(async () => findButton("发送给 Pi Agent")?.click());
  const radio = container?.querySelector<HTMLInputElement>('input[value="natural"]');
  expect(radio?.disabled).toBe(false);
  await act(async () => radio?.click());
  await act(async () => findButton("继续")?.click());
  expect(respond).toHaveBeenCalledWith("submit", { style: "natural" });
  expect(onInterpret).toHaveBeenCalledOnce();
  const answer = [...(container?.querySelectorAll('.create-chat-user') ?? [])].find((node) => node.textContent?.includes("风格：自然"));
  expect(answer).toBeDefined();
  await act(async () => finish({ message: "已根据自然调性继续规划。", intent: "chat", fields: [] }));
  expect(container?.textContent).toContain("风格：自然");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  expect(saveCreationSession).toHaveBeenLastCalledWith(expect.objectContaining({ messages: expect.arrayContaining([
    expect.objectContaining({ role: "user", content: expect.stringContaining("风格：自然") })
  ]) }));
});
