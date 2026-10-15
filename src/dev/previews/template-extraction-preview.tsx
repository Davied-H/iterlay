import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import previewImage from "@/assets/board-library-reference.png";
import { TemplateExtractionDialog } from "@/components/workbench/TemplateExtractionDialog";
import type {
  TemplateExtractionResult,
  TemplateExtractionScenario
} from "@/lib/template-workflow";
import type { SceneDefinition } from "@/lib/scene-library";
import "@/styles.css";

const EXISTING_PREVIEW_TEMPLATE: SceneDefinition = {
  id: "custom:template-extraction-preview",
  name: "深色数据主页",
  description: "已有的同名模板",
  prompt: "视觉风格：原有模板规则\n用户信息：【头像和昵称】",
  category: "social",
  mode: "generate",
  useCase: "other",
  source: "custom",
  createdAt: "2026-01-01T00:00:00.000Z"
};

function mockExtraction(scenario: TemplateExtractionScenario): TemplateExtractionResult {
  const retainedByScenario = {
    "design-language": [
      { id: "retained-1", label: "色彩角色", value: "近黑背景承载主体；荧光黄绿只用于核心数据、选中态和主行动；正文使用三级中性灰建立层次", category: "retained" as const },
      { id: "retained-2", label: "字体层级", value: "核心数字使用超大粗体；模块标题中等字重；说明文字小号低对比，避免所有信息同时抢占注意力", category: "retained" as const },
      { id: "retained-3", label: "形状系统", value: "容器使用中大圆角，状态与标签使用胶囊形；圆形状态点只承担完成度和在线状态", category: "retained" as const },
      { id: "retained-4", label: "组件构造", value: "普通卡片使用低对比描边，重点卡片增加荧光边缘；满宽主按钮采用实色高亮并保留右侧行动图标", category: "retained" as const },
      { id: "retained-5", label: "空间密度", value: "卡片内部紧凑，模块之间用更大间距分组；同类指标沿统一基线排列，保持高密度但不拥挤", category: "retained" as const },
      { id: "retained-6", label: "图形语言", value: "功能信息使用轻量线性图标，奖励与成就使用圆润 3D 徽章；装饰图形不承担主要操作", category: "retained" as const },
      { id: "retained-7", label: "材质与光效", value: "光晕集中在关键数据、成就图形和主按钮；普通卡片保持哑光，背景不使用大面积发光", category: "retained" as const },
      { id: "retained-8", label: "强调机制", value: "每个区域只设置一个高亮焦点；通过字号、荧光色和局部光效共同建立行动优先级", category: "retained" as const }
    ],
    "layout-skeleton": [
      { id: "retained-1", label: "画布比例", value: "使用窄幅竖版画布，内容沿单列纵向展开", category: "retained" as const },
      { id: "retained-2", label: "区域结构", value: "顶部身份区、中部核心数据区、下方任务区，底部设置固定主行动", category: "retained" as const },
      { id: "retained-3", label: "主次占比", value: "身份区约占首屏四分之一，核心数据卡横向占满，任务区允许纵向增长", category: "retained" as const },
      { id: "retained-4", label: "对齐规则", value: "文本和卡片沿统一左基线排列，指标内部采用等宽分栏", category: "retained" as const },
      { id: "retained-5", label: "阅读顺序", value: "从身份识别到状态判断，再进入任务操作，底部行动作为流程收口", category: "retained" as const }
    ],
    "series-template": [
      { id: "retained-1", label: "视觉系统", value: "深色界面，荧光绿作为小面积强调色，卡片使用低对比描边", category: "retained" as const },
      { id: "retained-2", label: "布局规则", value: "顶部身份区、中部数据区、下方列表区，底部固定主行动", category: "retained" as const },
      { id: "retained-3", label: "信息层级", value: "核心数字为第一焦点，任务状态为第二焦点，说明信息保持低对比", category: "retained" as const },
      { id: "retained-4", label: "组件质感", value: "低对比卡片、细描边与紧凑信息密度，仅重点卡片出现荧光边缘", category: "retained" as const },
      { id: "retained-5", label: "图形语言", value: "线性功能图标与圆润 3D 成就徽章组合使用", category: "retained" as const },
      { id: "retained-6", label: "生成约束", value: "同系列页面保持一致色彩角色、卡片构造和强调机制", category: "retained" as const }
    ],
    replica: [
      { id: "retained-1", label: "页面结构", value: "保留身份卡、三列指标、成就卡、任务卡和底部主按钮的组合顺序", category: "retained" as const },
      { id: "retained-2", label: "模块比例", value: "身份卡较高，数据与任务卡横向铺满，成就图形位于数据卡右侧", category: "retained" as const },
      { id: "retained-3", label: "视觉系统", value: "近黑背景配荧光黄绿高亮，重点组件带局部边缘光", category: "retained" as const },
      { id: "retained-4", label: "组件组合", value: "保留大数字、进度信息、奖励徽章、任务说明和满宽行动按钮", category: "retained" as const }
    ]
  } satisfies Record<TemplateExtractionScenario, TemplateExtractionResult["items"]>;
  const retained = retainedByScenario[scenario];
  const variable = scenario === "design-language"
    ? [{ id: "variable-1", label: "本次创作需求", value: "【要使用该设计语言创建的内容】", category: "variable" as const }]
    : [
        { id: "variable-1", label: "用户信息", value: "【头像、昵称和身份说明】", category: "variable" as const },
        { id: "variable-2", label: "数据指标", value: "【指标名称、数值与进度】", category: "variable" as const },
        { id: "variable-3", label: "列表内容", value: "【日期、任务与奖励内容】", category: "variable" as const }
      ];
  const ignored = [
    { id: "ignored-1", label: "原图身份", value: "Mr.Bobrovsky、Level 8", category: "ignored" as const },
    { id: "ignored-2", label: "原图数据", value: "70%、76 Days、Thursday 22", category: "ignored" as const },
    { id: "ignored-3", label: "特定素材", value: "绿色奖杯与原角色头像", category: "ignored" as const }
  ];
  const items = [...retained, ...variable, ...ignored];
  const prompt = [
    ...retained.map((item) => `${item.label}：${item.value}`),
    ...variable.map((item) => `${item.label}：${item.value}`)
  ].join("\n");
  return {
    input: {
      name: scenario === "design-language" ? "暗色荧光设计语言" : "深色数据主页",
      description: "适合游戏、社群或会员类移动端个人主页",
      prompt,
      category: "social",
      mode: "generate",
      useCase: "other"
    },
    items
  };
}

function Preview(): React.ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <main className="min-h-screen bg-muted p-8 text-foreground">
      <button
        type="button"
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        onClick={() => setOpen(true)}
      >
        打开模板提取
      </button>
      <TemplateExtractionDialog
        open={open}
        existingTemplates={[EXISTING_PREVIEW_TEMPLATE]}
        source={{
          id: "preview-source",
          imageUrl: previewImage,
          imagePath: "",
          sourcePrompt: "Mr.Bobrovsky，Level 8，70%，Thursday 22",
          workflowMode: "generate",
          useCase: "other"
        }}
        onOpenChange={setOpen}
        onExtract={async (_source, _mode, level) => mockExtraction(level)}
        onSave={async () => undefined}
      />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>
);
