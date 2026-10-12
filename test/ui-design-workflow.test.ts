import { describe, expect, it } from "vitest";
import {
  buildUiDesignAssistantGreeting,
  buildUiDesignAssistantInstruction,
  buildUiDesignBriefInstruction,
  createUiDesignBrief,
  hasUiDesignBriefFields,
  inferUiMaterialRole
} from "../src/lib/ui-design-workflow";

describe("UI design workflow", () => {
  it("infers common material roles from file names without changing ambiguous references", () => {
    expect(inferUiMaterialRole("checkout-PRD-v2.png")).toBe("prd");
    expect(inferUiMaterialRole("首页原型图.jpg")).toBe("wireframe");
    expect(inferUiMaterialRole("brand-guideline.webp")).toBe("brand");
    expect(inferUiMaterialRole("视觉稿-final.png")).toBe("visual");
    expect(inferUiMaterialRole("screen-01.png")).toBe("reference");
  });

  it("builds a non-generating brief instruction with explicit material responsibilities", () => {
    const instruction = buildUiDesignBriefInstruction([
      { name: "需求截图", role: "prd" },
      { name: "页面原型", role: "wireframe" }
    ], true);

    expect(instruction).toContain("先整理结构化 UI Brief");
    expect(instruction).toContain("模板只提供布局、视觉规则和兼容约束");
    expect(instruction).toContain("1. 需求截图：prd");
    expect(instruction).toContain("fields 必须恰好返回以下 6 项");
    expect(instruction).toContain("不要返回 interaction");
  });

  it("normalizes assistant fields into a directly generatable UI brief", () => {
    const brief = createUiDesignBrief({
      message: "Brief 已整理完成",
      intent: "direct",
      fields: [
        { label: "产品目标", value: "帮助运营快速比较广告素材" },
        { label: "界面载体", value: "桌面端 Web 应用" },
        { label: "信息结构", value: "左侧筛选，中间素材网格，右侧详情" },
        { label: "视觉方向", value: "高密度、克制的工作台" },
        { label: "关键约束", value: "保留品牌色与真实素材比例" },
        { label: "最终提示词", value: "生成一张专业桌面端广告素材管理界面" }
      ]
    });

    expect(brief.structure).toContain("左侧筛选");
    expect(brief.generationPrompt).toBe("生成一张专业桌面端广告素材管理界面");
  });

  it("keeps UI design feedback conversational until the user asks for a brief change", () => {
    const chatInstruction = buildUiDesignAssistantInstruction("为什么右侧需要详情栏？", true);

    expect(chatInstruction).toContain("intent=chat");
    expect(chatInstruction).toContain("fields=[]");
    expect(chatInstruction).toContain("不要发起图片生成");
    expect(chatInstruction).toContain("为什么右侧需要详情栏？");
  });

  it("recognizes complete UI brief fields without treating generic assistant output as a brief", () => {
    expect(hasUiDesignBriefFields({
      message: "已更新",
      intent: "direct",
      fields: [
        { label: "产品目标", value: "目标" },
        { label: "界面载体", value: "桌面端" },
        { label: "信息结构", value: "三栏" },
        { label: "视觉方向", value: "克制" },
        { label: "关键约束", value: "可读" },
        { label: "最终提示词", value: "生成界面" }
      ]
    })).toBe(true);
    expect(hasUiDesignBriefFields({
      message: "建议先突出主任务",
      intent: "chat",
      fields: [{ label: "建议", value: "突出主任务" }]
    })).toBe(false);
  });

  it("greets the user with the current UI surface and invites direct feedback", () => {
    const greeting = buildUiDesignAssistantGreeting({
      goal: "管理素材",
      surface: "桌面端素材工作台",
      structure: "三栏",
      visualDirection: "克制",
      constraints: "高密度",
      generationPrompt: "生成桌面端素材工作台"
    }, 2);

    expect(greeting).toContain("桌面端素材工作台");
    expect(greeting).toContain("哪里不对");
    expect(greeting).toContain("先更新 Brief");
  });
});
