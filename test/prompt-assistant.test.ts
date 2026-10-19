import { describe, expect, it } from "vitest";
import {
  assistantInteractionSupplementKey,
  buildAssistantConfirmationPreview,
  buildAssistantActionConfirmInteraction,
  buildOverwriteConfirmInteraction,
  buildTemplateAssistantConfirmationPreview,
  buildTemplateExampleReviewConfirmationPreview,
  formatAssistantInteractionAnswers,
  resolveAssistantInteraction
} from "../src/lib/assistant-interaction";
import {
  buildPromptAssistantCurrentFields,
  buildPromptAssistantGreeting,
  resolveAssistantGenerationCount,
  sceneAssistantFieldsToPrompt,
  settleCancelledAssistantMessages,
  settleFailedAssistantMessage
} from "../src/lib/prompt-assistant";

describe("prompt assistant", () => {
  it("preserves partial output without hiding the actual failure", () => {
    expect(settleFailedAssistantMessage(
      { id: "partial", content: "已有草稿", streaming: true },
      "上游连接失败"
    )).toEqual({
      id: "partial", content: "已有草稿\n\n上游连接失败", streaming: false, tone: "error"
    });
    expect(settleFailedAssistantMessage({ content: "" }, "失败").content).toBe("失败");
    expect(settleFailedAssistantMessage({ content: "失败" }, "失败").content).toBe("失败");
  });
  it("removes empty streaming placeholders when a request is cancelled", () => {
    expect(settleCancelledAssistantMessages([
      { id: "intro", content: "已有消息" },
      { id: "pending", content: "", streaming: true }
    ])).toEqual([
      { id: "intro", content: "已有消息" }
    ]);
  });

  it("keeps partial assistant output when a request is cancelled", () => {
    expect(settleCancelledAssistantMessages([
      { id: "partial", content: "已经输出一部分", streaming: true }
    ])).toEqual([
      { id: "partial", content: "已经输出一部分", streaming: false }
    ]);
  });

  it("uses the current prompt in its opening context", () => {
    expect(buildPromptAssistantGreeting("一只白色陶瓷杯", { editing: false, referenceCount: 0 }))
      .toContain("当前提示词");
    expect(buildPromptAssistantGreeting("一只白色陶瓷杯", { editing: false, referenceCount: 1 }))
      .toContain("一只白色陶瓷杯");
    expect(buildPromptAssistantGreeting("一只白色陶瓷杯", { editing: false, referenceCount: 1 }))
      .toContain("1 张参考图");
    expect(buildPromptAssistantGreeting("", { editing: false, referenceCount: 2 }))
      .toContain("2 张参考图");
  });

  it("treats a selected template as a concrete starting point", () => {
    expect(buildPromptAssistantGreeting("", {
      editing: false,
      referenceCount: 0,
      templateName: "涂鸦笔记本人像海报"
    })).toContain("已选中「涂鸦笔记本人像海报」模板");
    expect(buildPromptAssistantGreeting("", {
      editing: false,
      referenceCount: 0,
      templateName: "Portrait poster"
    }, "en-US")).toContain("selected the “Portrait poster” template");
  });

  it("preserves structured prompt fields when sending assistant context", () => {
    expect(buildPromptAssistantCurrentFields(
      "风格：黑白手绘表情包\n角色：两只戴墨镜的小狗\n分镜：四帧连续动作",
      "",
      "canvas-prompt"
    )).toEqual([
      { label: "风格", value: "黑白手绘表情包" },
      { label: "角色", value: "两只戴墨镜的小狗" },
      { label: "分镜", value: "四帧连续动作" }
    ]);
    expect(buildPromptAssistantCurrentFields(
      "",
      "风格：黑白手绘表情包\n角色：两只戴墨镜的小狗",
      "canvas-prompt"
    )).toEqual([
      { label: "上一轮结构字段·风格", value: "黑白手绘表情包" },
      { label: "上一轮结构字段·角色", value: "两只戴墨镜的小狗" }
    ]);
  });

  it("keeps the edit greeting concise without repeating the prompt or references", () => {
    expect(buildPromptAssistantGreeting("把背景换成浅灰色", { editing: true, referenceCount: 1 }))
      .toBe("告诉我想修改的地方。");
    expect(buildPromptAssistantGreeting("", { editing: true, referenceCount: 0 }))
      .toBe("告诉我想修改的地方。");
  });

  it("builds assistant greetings in the active interface language", () => {
    expect(buildPromptAssistantGreeting("", { editing: false, referenceCount: 0 }, "en-US"))
      .toContain("Tell me what you want to create");
    expect(buildPromptAssistantGreeting("a ceramic cup", { editing: false, referenceCount: 2 }, "en-US"))
      .toContain("2 selected reference images");
    expect(buildPromptAssistantGreeting("", { editing: true, referenceCount: 1 }, "en-US"))
      .toBe("Tell me what you’d like to change.");
  });

  it("serializes structured assistant fields into a reusable prompt", () => {
    expect(sceneAssistantFieldsToPrompt([
      { label: "主体", value: "白色陶瓷杯" },
      { label: "光线", value: "柔和侧光" }
    ])).toBe("主体：白色陶瓷杯\n光线：柔和侧光");
    expect(sceneAssistantFieldsToPrompt([{ label: "提示词", value: "极简产品摄影" }]))
      .toBe("极简产品摄影");
  });

  it("normalizes an assistant generation count to the active provider limit", () => {
    expect(resolveAssistantGenerationCount({
      message: "已准备 4 个方向",
      fields: [],
      generationCount: 4
    }, 4)).toBe(4);
    expect(resolveAssistantGenerationCount({
      message: "已准备多个方向",
      fields: [],
      generationCount: 6
    }, 4)).toBe(4);
    expect(resolveAssistantGenerationCount({
      message: "只提供建议",
      fields: []
    }, 4)).toBeUndefined();
    expect(resolveAssistantGenerationCount({
      message: "改成三张",
      fields: [],
      actions: [{ type: "set_generation_count", count: 3 }]
    }, 2)).toBe(2);
  });

  it("keeps the last submitted generation as continuity context after the composer clears", () => {
    expect(buildPromptAssistantCurrentFields("", "第一集：小熊在家醒来", "canvas-prompt"))
      .toEqual([{
        label: "上一轮已生成提示词（连续创作基线）",
        value: "第一集：小熊在家醒来"
      }]);
    expect(buildPromptAssistantCurrentFields("第二集草稿", "第一集", "canvas-prompt"))
      .toEqual([{ label: "提示词", value: "第二集草稿" }]);
    expect(buildPromptAssistantCurrentFields("", "上一轮生成内容", "canvas-edit"))
      .toEqual([]);
  });

  it("falls back to confirmation instead of applying fields immediately", () => {
    expect(resolveAssistantInteraction({
      message: "已经整理完成",
      fields: [{ label: "主体", value: "礼品卡" }]
    }, "scene-template")).toEqual({
      type: "confirm",
      title: "已经可以生成模板",
      description: "确认后才会更新当前内容。",
      confirmLabel: "生成模板",
      cancelLabel: "继续完善"
    });
  });

  it("builds concrete confirmation previews for template and canvas actions", () => {
    expect(buildTemplateAssistantConfirmationPreview({
      message: "已经整理完成",
      suggestedName: "夏日产品海报",
      suggestedDescription: "适合快速替换商品与卖点",
      fields: [
        { label: "商品主体", value: "【商品名称与外观】" },
        { label: "视觉风格", value: "清爽、高明度、自然阳光" },
        { label: "固定约束", value: "保留品牌标志" }
      ]
    }, {
      name: "已有模板名称",
      fields: [
        { label: "视觉风格", value: "低饱和、柔光" },
        { label: "固定约束", value: "保留品牌标志" }
      ]
    })).toEqual({
      title: "将更新的模板内容",
      items: [
        { label: "模板说明", value: "适合快速替换商品与卖点" },
        { label: "商品主体", value: "【商品名称与外观】" },
        { label: "视觉风格", value: "清爽、高明度、自然阳光" }
      ]
    });
    expect(buildAssistantConfirmationPreview("将应用的提示词", [
      { value: "  一只白色陶瓷杯  " },
      { label: "空内容", value: "  " }
    ])).toEqual({
      title: "将应用的提示词",
      items: [{ value: "一只白色陶瓷杯" }]
    });
  });

  it("keeps the example review reason beside the proposed template changes", () => {
    expect(buildTemplateExampleReviewConfirmationPreview({
      message: "复核发现：生成示例的主行动区位置不稳定。\n调整原因：当前规则只约束了阅读顺序，补充底部锚定规则可避免后续页面漂移。",
      fields: [
        { label: "阅读顺序", value: "从身份识别到状态判断，再进入任务操作" },
        { label: "行动区位置", value: "主行动固定在页面底部，并与内容区保持明确间隔" }
      ]
    }, {
      fields: [
        { label: "阅读顺序", value: "从身份识别到状态判断，再进入任务操作" }
      ]
    })).toEqual({
      title: "示例复盘建议",
      items: [
        {
          label: "为什么建议调整",
          value: "复核发现：生成示例的主行动区位置不稳定。\n调整原因：当前规则只约束了阅读顺序，补充底部锚定规则可避免后续页面漂移。"
        },
        {
          label: "行动区位置",
          value: "主行动固定在页面底部，并与内容区保持明确间隔"
        }
      ]
    });
  });

  it("applies canvas results directly without synthesizing a confirmation", () => {
    expect(resolveAssistantInteraction({
      message: "编辑指令已经整理完成",
      fields: [{ label: "修改目标", value: "移除右侧路人" }]
    }, "canvas-edit")).toBeUndefined();
    expect(resolveAssistantInteraction({
      message: "提示词已经整理完成",
      fields: [{ label: "提示词", value: "一只白色陶瓷杯" }]
    }, "canvas-prompt")).toBeUndefined();
  });

  it("passes through model-provided interactions untouched for canvas surfaces", () => {
    const form = {
      type: "form" as const,
      title: "补充一个关键点",
      fields: [{ id: "usage", label: "用途", type: "text" as const }]
    };
    expect(resolveAssistantInteraction({
      message: "还差一个信息",
      fields: [],
      interaction: form
    }, "canvas-prompt")).toEqual(form);
  });

  it("builds an overwrite confirmation for user-authored content", () => {
    expect(buildOverwriteConfirmInteraction("canvas-prompt")).toMatchObject({
      type: "confirm",
      title: "覆盖当前提示词？",
      confirmLabel: "应用提示词",
      cancelLabel: "保留我的版本"
    });
    expect(buildOverwriteConfirmInteraction("canvas-edit")).toMatchObject({
      type: "confirm",
      title: "覆盖当前编辑指令？",
      confirmLabel: "应用编辑指令"
    });
  });

  it("requires confirmation before the assistant applies a new prompt", () => {
    expect(buildAssistantActionConfirmInteraction("canvas-prompt", {
      changesPrompt: true,
      hasCurrentPrompt: false
    })).toMatchObject({
      type: "confirm",
      title: "应用 AI 助手的提示词？",
      confirmLabel: "应用提示词",
      cancelLabel: "暂不应用"
    });
    expect(buildAssistantActionConfirmInteraction("canvas-prompt", {
      changesPrompt: true,
      hasCurrentPrompt: true
    })).toMatchObject({
      title: "覆盖当前提示词？",
      cancelLabel: "保留我的版本"
    });
  });

  it("requires an explicit confirmation for every assistant generation", () => {
    expect(buildAssistantActionConfirmInteraction("canvas-prompt", {
      changesPrompt: false,
      hasCurrentPrompt: true,
      generationRequestCount: 1,
      generationImageCount: 4
    })).toMatchObject({
      type: "confirm",
      title: "生成 4 张图片？",
      confirmLabel: "确认生成",
      cancelLabel: "暂不生成"
    });
    expect(buildAssistantActionConfirmInteraction("canvas-prompt", {
      changesPrompt: true,
      hasCurrentPrompt: true,
      generationRequestCount: 4,
      generationImageCount: 4
    })).toMatchObject({
      title: "覆盖提示词并生成？",
      description: expect.stringContaining("覆盖当前提示词"),
      confirmLabel: "确认并生成"
    });
  });

  it("formats answers from the assistant form for the next conversation turn", () => {
    expect(formatAssistantInteractionAnswers({
      type: "form",
      title: "补充信息",
      fields: [
        { id: "audience", label: "目标人群", type: "text" },
        {
          id: "channel",
          label: "投放渠道",
          type: "select",
          multiple: true,
          options: [
            { label: "电商", value: "电商" },
            { label: "社媒", value: "社媒" }
          ]
        }
      ]
    }, { audience: "品牌新客", channel: ["电商", "社媒"] }))
      .toBe("我补充了这些信息：\n- 目标人群：品牌新客\n- 投放渠道：电商、社媒");
  });

  it("includes optional details added after a selection", () => {
    expect(formatAssistantInteractionAnswers({
      type: "form",
      title: "补充信息",
      fields: [{
        id: "layout",
        label: "版式偏好",
        type: "select",
        options: [
          { label: "竖版", value: "竖版" },
          { label: "横版", value: "横版" }
        ]
      }]
    }, {
      layout: "竖版",
      [assistantInteractionSupplementKey("layout")]: "小红书 3:4，标题放在上方"
    })).toBe("我补充了这些信息：\n- 版式偏好：竖版；补充：小红书 3:4，标题放在上方");
  });
});
