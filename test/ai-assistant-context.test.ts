// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AiAssistant, AssistantImageContext } from "../src/components/assistant/AiAssistant";
import { I18nProvider } from "../src/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = vi.fn();
globalThis.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

function withI18n(element: ReactElement, language: "zh-CN" | "en-US" = "zh-CN"): ReactElement {
  window.localStorage.setItem("iterlay:language", language);
  return createElement(I18nProvider, null, element);
}

describe("AI assistant image context", () => {
  it("shows an expandable provider summary, preserves expansion during streaming, and falls back without one", async () => {
    const container = document.createElement("div"), root = createRoot(container);
    document.body.append(container);
    const render = async (summary: string | undefined, streaming = true) => {
      await act(async () => root.render(withI18n(createElement(AiAssistant, {
        variant: "docked", messages: [{ id: "summary", role: "assistant", content: streaming ? "" : "最终回复", reasoningSummary: summary, streaming }],
        value: "", onValueChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn()
      }))));
    };
    try {
      await render(undefined);
      expect(container.querySelector(".assistant-reasoning")).toBeNull();
      await render("先确认主体。");
      const details = container.querySelector<HTMLDetailsElement>(".assistant-reasoning")!;
      expect(details.open).toBe(false);
      expect(details.querySelector("summary")?.textContent).toContain("思考摘要");
      details.open = true;
      await render("先确认主体。再整理光线。");
      expect(container.querySelector(".assistant-reasoning")).toBe(details);
      expect(details.open).toBe(true);
      expect(details.textContent).toContain("再整理光线");
      await render("先确认主体。再整理光线。", false);
      expect(container.textContent).toContain("最终回复");
      expect(details.querySelector(".animate-spin")).toBeNull();
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
  it("collapses by default and reveals distinct image roles on demand", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onRemove = vi.fn();

    await act(async () => {
      root.render(withI18n(createElement(AssistantImageContext, {
        images: [
          {
            id: "target",
            src: "data:image/png;base64,AAAA",
            alt: "当前编辑图片",
            role: "edit-target"
          },
          {
            id: "reference",
            src: "data:image/png;base64,BBBB",
            alt: "辅助参考图",
            role: "reference",
            onRemove
          }
        ]
      })));
    });

    const expandButton = container.querySelector<HTMLButtonElement>('[aria-label="展开图片上下文"]');
    expect(expandButton?.getAttribute("aria-expanded")).toBe("false");
    expect(expandButton?.textContent).toContain("编辑 1 · 引用 1");
    const collapsedPreviewButton = container.querySelector<HTMLButtonElement>('[aria-label="查看图片 辅助参考图"]');
    expect(collapsedPreviewButton).not.toBeNull();
    expect(container.querySelector("figure")).toBeNull();

    await act(async () => collapsedPreviewButton?.click());
    expect(document.querySelector('[role="dialog"][aria-label="图片全屏预览"]')).not.toBeNull();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="关闭放大预览"]')?.click();
    });

    await act(async () => expandButton?.click());

    expect(container.querySelector('[aria-label="收起图片上下文"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="编辑：当前编辑图片"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="引用：辅助参考图"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="查看图片 当前编辑图片"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="查看图片 辅助参考图"]')).not.toBeNull();
    const removeButton = container.querySelector<HTMLButtonElement>('[aria-label="移除参考图 辅助参考图"]');
    expect(removeButton).not.toBeNull();
    expect(container.querySelector('[aria-label="移除参考图 当前编辑图片"]')).toBeNull();

    await act(async () => removeButton?.click());
    expect(onRemove).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("AI assistant new conversation", () => {
  it("keeps the failure visible and exposes a manual edit action without resubmitting", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onEdit = vi.fn();
    const onSubmit = vi.fn();
    try {
      await act(async () => root.render(withI18n(createElement(AiAssistant, {
        variant: "docked",
        messages: [{
          id: "failed", role: "assistant", content: "未校验草稿\n\n上游连接失败", tone: "error",
          receipt: {
            label: "对话已保留，请先核对任务状态。",
            actions: [{ label: "调整消息后重试", onAction: onEdit }]
          }
        }],
        value: "", onValueChange: vi.fn(), onSubmit, onStop: vi.fn()
      }))));
      expect(container.textContent).toContain("上游连接失败");
      expect(container.textContent).toContain("未校验草稿");
      const edit = [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "调整消息后重试");
      expect(edit).toBeDefined();
      await act(async () => edit?.click());
      expect(onEdit).toHaveBeenCalledOnce();
      expect(onSubmit).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("exposes a direct header action for starting a new conversation", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onNewConversation = vi.fn();

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "floating",
        title: "画板 AI 助手",
        messages: [],
        value: "",
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onClose: vi.fn(),
        onNewConversation
      })));
    });

    const startButton = container.querySelector<HTMLButtonElement>('[aria-label="开始新会话"]');
    expect(startButton).not.toBeNull();

    await act(async () => startButton?.click());
    expect(onNewConversation).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("AI assistant header actions", () => {
  it("renders caller-provided context actions in the chat header", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onClick = vi.fn();

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "docked",
        title: "模板共创助手",
        messages: [],
        value: "",
        headerActions: createElement("button", {
          type: "button",
          "aria-label": "选择模板示例",
          onClick
        }, "示例"),
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn()
      })));
    });

    const action = container.querySelector<HTMLButtonElement>('[aria-label="选择模板示例"]');
    expect(action).not.toBeNull();
    await act(async () => action?.click());
    expect(onClick).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("AI assistant activity state", () => {
  it("shows one unified activity indicator instead of a duplicate empty thinking bubble", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "docked",
        title: "AI 助手",
        compact: true,
        messages: [{
          id: "assistant-streaming",
          role: "assistant",
          content: "",
          streaming: true
        }],
        value: "",
        streaming: true,
        activityLabel: "正在读取漫剧画板",
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn()
      })));
    });

    expect(container.querySelectorAll("[data-assistant-activity]")).toHaveLength(1);
    expect(container.textContent).toContain("正在读取漫剧画板");
    expect(container.textContent).not.toContain("正在思考");

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps Agent interaction choices enabled while the stream waits for an answer", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onInteractionSubmit = vi.fn();

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "docked",
        title: "AI 助手",
        compact: true,
        messages: [{
          id: "assistant-streaming",
          role: "assistant",
          content: "",
          streaming: true
        }],
        value: "",
        streaming: true,
        interaction: {
          id: "story-choice",
          interaction: {
            type: "form",
            title: "补充一个关键点",
            submitLabel: "继续",
            fields: [{
              id: "storyGoal",
              label: "孙悟空这次的目标和主要冲突是什么？",
              type: "select",
              required: true,
              options: [
                { label: "护送取经队", value: "escort" },
                { label: "大闹天宫", value: "heaven" }
              ]
            }]
          }
        },
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onInteractionSubmit
      })));
    });

    const choice = container.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="false"]');
    expect(choice?.disabled).toBe(false);
    await act(async () => choice?.click());
    expect(choice?.getAttribute("aria-checked")).toBe("true");

    const continueButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "继续");
    expect(continueButton?.disabled).toBe(false);
    await act(async () => continueButton?.click());
    expect(onInteractionSubmit).toHaveBeenCalledWith({ storyGoal: "escort" });

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("AI assistant prompt review", () => {
  it("keeps generated prompts collapsed and exposes copy and apply actions when expanded", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onApplyGeneratedPrompt = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "floating",
        title: "画板 AI 助手",
        compact: true,
        messages: [{
          id: "assistant-1",
          role: "assistant",
          content: "我已经整理成可直接使用的提示词。",
          generatedPrompt: "生成一张 3×3 九宫格表情包，保持极简黑白手绘风格。"
        }],
        value: "",
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onClose: vi.fn(),
        onApplyGeneratedPrompt
      })));
    });

    const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="assistant-prompt-review-assistant-1"]');
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#assistant-prompt-review-assistant-1")).toBeNull();
    expect(container.querySelector('[aria-label="复制本轮提示词"]')).toBeNull();

    await act(async () => toggle?.click());

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#assistant-prompt-review-assistant-1")?.textContent)
      .toContain("生成一张 3×3 九宫格表情包");

    const copyButton = container.querySelector<HTMLButtonElement>('[aria-label="复制本轮提示词"]');
    const applyButton = container.querySelector<HTMLButtonElement>('[aria-label="应用本轮提示词"]');
    await act(async () => copyButton?.click());
    await act(async () => applyButton?.click());

    expect(writeText).toHaveBeenCalledWith("生成一张 3×3 九宫格表情包，保持极简黑白手绘风格。");
    expect(onApplyGeneratedPrompt).toHaveBeenCalledWith("生成一张 3×3 九宫格表情包，保持极简黑白手绘风格。");
    expect(container.querySelector('[aria-label="已复制本轮提示词"]')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("renders an expanded structured prompt as labeled fields", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "floating",
        title: "画板 AI 助手",
        compact: true,
        messages: [{
          id: "assistant-structured",
          role: "assistant",
          content: "我保留了原有的提示词结构。",
          generatedPrompt: "风格：黑白手绘表情包\n角色：两只戴墨镜的小狗\n分镜：四帧连续动作"
        }],
        value: "",
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onClose: vi.fn()
      })));
    });

    expect(container.querySelector('[aria-label="结构化提示词"]')).toBeNull();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="展开本轮提示词"]')?.click();
    });

    const structured = container.querySelector('[aria-label="结构化提示词"]');
    expect(structured?.textContent).toContain("风格");
    expect(structured?.textContent).toContain("黑白手绘表情包");
    expect(structured?.querySelectorAll("dt")).toHaveLength(3);

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("AI assistant confirmation refinement", () => {
  it("lets the user add a requirement without applying the pending prompt", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onInteractionSubmit = vi.fn();
    const onInteractionRefine = vi.fn();
    const onInteractionGenerate = vi.fn();

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "floating",
        title: "画板 AI 助手",
        compact: true,
        messages: [],
        value: "",
        interaction: {
          id: "confirm-prompt",
          interaction: {
            type: "confirm",
            title: "覆盖当前提示词？",
            confirmLabel: "应用提示词",
            cancelLabel: "保留我的版本"
          },
          confirmationPreview: {
            title: "将应用的提示词",
            items: [{ value: "一只拿着巧克力的小新头像" }]
          },
          canGenerateImmediately: true
        },
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onInteractionSubmit,
        onInteractionRefine,
        onInteractionGenerate
      })));
    });

    const refinement = container.querySelector<HTMLTextAreaElement>('[aria-label="补充修改要求"]');
    const sendButton = container.querySelector<HTMLButtonElement>('[aria-label="发送补充要求"]');
    expect(refinement).not.toBeNull();
    expect(sendButton?.disabled).toBe(true);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(refinement, "表情再夸张一点");
      refinement?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(sendButton?.disabled).toBe(false);
    await act(async () => sendButton?.click());

    expect(onInteractionRefine).toHaveBeenCalledWith("表情再夸张一点");
    expect(onInteractionSubmit).not.toHaveBeenCalled();

    const generateButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("立即生成"));
    expect(generateButton).toBeDefined();
    await act(async () => generateButton?.click());
    expect(onInteractionGenerate).toHaveBeenCalledOnce();
    expect(onInteractionSubmit).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("AI assistant composer", () => {
  it("sends with Enter while preserving IME confirmation and Shift+Enter", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "floating",
        title: "画板 AI 助手",
        compact: true,
        messages: [],
        value: "把背景换成纯白",
        onValueChange: vi.fn(),
        onSubmit,
        onStop: vi.fn()
      })));
    });

    const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="给 AI 助手发送消息"]');
    const composingEnter = new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
      cancelable: true
    });
    const newlineEnter = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    const sendEnter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    });

    await act(async () => composer?.dispatchEvent(composingEnter));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(composingEnter.defaultPrevented).toBe(false);

    await act(async () => composer?.dispatchEvent(newlineEnter));
    expect(newlineEnter.defaultPrevented).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => composer?.dispatchEvent(sendEnter));
    expect(sendEnter.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    container.remove();
  });

  it("forwards pasted images to the attachment pipeline", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onPasteImages = vi.fn();
    const image = new File([new Uint8Array([1, 2, 3])], "clipboard.png", { type: "image/png" });

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "floating",
        title: "画板 AI 助手",
        compact: true,
        messages: [],
        value: "",
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onPasteImages
      })));
    });

    const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="给 AI 助手发送消息"]');
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [{ kind: "file", getAsFile: () => image }],
        files: [image]
      }
    });

    await act(async () => composer?.dispatchEvent(pasteEvent));

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(onPasteImages).toHaveBeenCalledWith([image]);

    await act(async () => root.unmount());
    container.remove();
  });

  it("starts at one line and opens a body-level expanded editor", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "floating",
        title: "画板 AI 助手",
        compact: true,
        expandableComposer: true,
        messages: [],
        value: "保留瓶身，调整背景光线",
        onAttach: vi.fn(),
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onClose: vi.fn()
      })));
    });

    const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="给 AI 助手发送消息"]');
    expect(composer?.rows).toBe(1);
    expect(composer?.className).toContain("overflow-hidden");
    expect(composer?.style.height).toBe("32px");
    const composerLayout = container.querySelector<HTMLElement>('[data-composer-mode="single-line"]');
    expect(composerLayout?.getAttribute("data-composer-max-height")).toBe("128");

    const expandButton = container.querySelector<HTMLButtonElement>('[aria-label="放大编辑消息"]');
    expect(expandButton).not.toBeNull();
    await act(async () => expandButton?.click());

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(container.contains(dialog)).toBe(false);
    expect(dialog?.querySelector<HTMLTextAreaElement>('[aria-label="编辑 AI 助手消息"]')?.value)
      .toBe("保留瓶身，调整背景光线");

    await act(async () => root.unmount());
    container.remove();
  });

  it("moves controls below the textarea when the content becomes multiline", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "floating",
        title: "画板 AI 助手",
        compact: true,
        expandableComposer: true,
        messages: [],
        value: "保留主体\n调整背景光线",
        onAttach: vi.fn(),
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onClose: vi.fn()
      })));
    });

    const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="给 AI 助手发送消息"]');
    const composerLayout = container.querySelector<HTMLElement>('[data-composer-mode="multiline"]');
    expect(composer?.className).toContain("mb-9");
    expect(composer?.style.maxHeight).toBe("128px");
    expect(composerLayout).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("AI assistant i18n", () => {
  it("renders its default chrome and loading state in English", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "floating",
        messages: [],
        value: "",
        intentSuggestionsEnabled: true,
        intentSuggestionsLoading: true,
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onClose: vi.fn()
      }), "en-US"));
    });

    expect(container.textContent).toContain("Template Copilot");
    expect(container.textContent).toContain("Generating next-step suggestions…");
    expect(container.textContent).toContain("Keep describing, or ask the assistant to refine it…");
    expect(container.querySelector('[aria-label="Send a message to the AI assistant"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Close AI assistant"]')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});


describe("AI assistant comic drama plan", () => {
  it("renders the reusable node plan inside the existing assistant and exposes the concrete action", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onApply = vi.fn();
    const plan = {
      planId: "plan", boardId: "board", baseRevision: 2,
      preview: { title: "添加首帧与尾帧意图", additions: { nodes: 3, connections: 4, groups: 1 }, impact: "不会改变现有节点", cost: "不调用媒体模型" },
      additions: { nodes: [], connections: [], groups: [] }
    };

    await act(async () => {
      root.render(withI18n(createElement(AiAssistant, {
        variant: "docked",
        title: "漫剧助手",
        subtitle: "片段 03 · 脚本 v2",
        messages: [{
          id: "comic-plan", role: "assistant", content: "节点计划已准备好。",
          comicDramaPlan: {
            plan, contextLabel: "片段 03 · 脚本 v2", readiness: "首帧未采用，尾帧保持阻塞", status: "preview",
            onApply, onRefine: vi.fn(), onRetry: vi.fn()
          }
        }],
        value: "", onValueChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn()
      })));
    });

    expect(container.querySelector("[aria-label=\"节点计划预览\"]")?.textContent).toContain("将添加到画板");
    expect(container.textContent).toContain("3 个节点 · 4 条连接 · 1 个分组");
    expect(container.textContent).toContain("首帧未采用");
    const planSection = container.querySelector<HTMLElement>("[aria-label=\"节点计划预览\"]");
    const applyButton = planSection?.querySelectorAll<HTMLButtonElement>("button")[1];
    expect(applyButton).toBeDefined();
    await act(async () => applyButton?.click());
    expect(onApply).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    container.remove();
  });
  it("shows the progressive cast proposal with explicit single and batch actions", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container); const onApply = vi.fn();
    const drafts = [
      { id: "required", name: "林默", role: "主角", profile: "克制敏锐的旧物修复师。", appearanceAnchors: ["短黑发", "深色工作围裙"], visualPrompt: "短黑发旧物修复师，深色工作围裙，冷色手绘角色设定图", visualDescription: "短黑发", required: true, imageCount: 1, estimatedCost: 1 },
      { id: "optional", name: "寄信人", role: "悬念角色", profile: "身份成谜，掌握十年前事故线索。", appearanceAnchors: ["瘦高身形", "灰白长外套"], visualPrompt: "瘦高神秘人物，灰白长外套，背光轮廓，冷色手绘角色设定图", visualDescription: "背光轮廓", required: false, imageCount: 1, estimatedCost: 1 }
    ];
    await act(async () => root.render(withI18n(createElement(AiAssistant, { variant: "docked", title: "漫剧助手", messages: [{ id: "cast", role: "assistant", content: "角色方案", comicDramaPlan: { plan: { planId: "cast", boardId: "board", baseRevision: 1, action: { kind: "propose-characters", characterDrafts: drafts }, preview: { title: "角色阵容方案", additions: { nodes: 0, connections: 0, groups: 0 }, impact: "确认后创建", cost: "逐项报价" }, additions: { nodes: [], connections: [], groups: [] } }, contextLabel: "设定 v1", status: "preview", onApply, onRefine: vi.fn(), onRetry: vi.fn() } }], value: "", onValueChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn() }))));
    expect(container.querySelector("[aria-label=\"漫剧制作步骤\"]")?.textContent).toContain("设定");
    expect(container.querySelector("[aria-label=\"角色阵容方案\"]")?.textContent).toContain("寄信人");
    const batch = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("添加所选角色卡"));
    await act(async () => batch?.click());
    expect(onApply).toHaveBeenCalledWith(["required"]);
    await act(async () => root.unmount()); container.remove();
  });
});


describe("AI assistant comic drama plan recovery", () => {
  it("keeps a revision-conflicted preview recoverable in the same generic message", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onRetry = vi.fn();
    await act(async () => root.render(withI18n(createElement(AiAssistant, {
      variant: "docked", title: "漫剧助手", messages: [{
        id: "conflict", role: "assistant", content: "原计划仍保留。",
        comicDramaPlan: {
          plan: { planId: "plan", boardId: "board", baseRevision: 1, preview: { title: "添加角色卡", additions: { nodes: 3, connections: 0, groups: 0 }, impact: "不会改变现有节点", cost: "不调用媒体模型" }, additions: { nodes: [], connections: [], groups: [] } },
          contextLabel: "漫剧设定 v1", status: "conflict", onApply: vi.fn(), onRefine: vi.fn(), onRetry
        }
      }],
      value: "", onValueChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn()
    }))));
    expect(container.querySelector("[role=\"alert\"]")?.textContent).toContain("基于最新内容重新预览");
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("重新预览"));
    await act(async () => retry?.click());
    expect(onRetry).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    container.remove();
  });
});
