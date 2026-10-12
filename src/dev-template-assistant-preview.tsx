import React from "react";
import ReactDOM from "react-dom/client";
import type { ImageWorkbenchApi } from "../electron/preload/preload";
import type { CollaborateSceneResult, SceneMediaSummary, TemplateExtractionScenario } from "@shared/types";
import { SceneCreator } from "@/components/workbench/SceneCreator";
import { I18nProvider } from "@/i18n";
import type { NewSceneInput, SceneDefinition } from "@/lib/scene-library";
import "@/styles.css";

const SCENARIOS = new Set<TemplateExtractionScenario>([
  "design-language",
  "layout-skeleton",
  "series-template",
  "replica"
]);

function readScenario(): TemplateExtractionScenario {
  const value = new URLSearchParams(window.location.search).get("scenario");
  return value && SCENARIOS.has(value as TemplateExtractionScenario)
    ? value as TemplateExtractionScenario
    : "design-language";
}

const sceneByScenario: Record<TemplateExtractionScenario, SceneDefinition> = {
  "design-language": {
    id: "custom:template-assistant-design-language",
    name: "暗色荧光设计语言",
    description: "适合游戏、社群和会员类产品界面的视觉语言",
    prompt: [
      "色彩角色：近黑背景承载主体；荧光黄绿只用于核心数据、选中态和主行动",
      "字体层级：核心数字使用超大粗体；标题中等字重；说明文字小号低对比",
      "形状系统：容器使用中大圆角，状态与标签使用胶囊形",
      "组件构造：普通卡片使用低对比描边，重点卡片增加荧光边缘",
      "空间密度：卡片内部紧凑，模块之间用更大间距分组",
      "图形语言：功能信息使用轻量线性图标，成就使用圆润 3D 徽章",
      "强调机制：每个区域只设置一个高亮焦点",
      "本次创作需求：【要使用该设计语言创建的内容】"
    ].join("\n"),
    category: "social",
    mode: "generate",
    useCase: "other",
    source: "custom",
    extractionScenario: "design-language",
    createdAt: "2026-07-22T00:00:00.000Z"
  },
  "layout-skeleton": {
    id: "custom:template-assistant-layout-skeleton",
    name: "单列数据主页骨架",
    description: "适合身份、指标、任务和行动区组成的移动端页面",
    prompt: [
      "画布比例：使用窄幅竖版画布，内容沿单列纵向展开",
      "区域结构：顶部身份区、中部核心数据区、下方任务区，底部设置固定主行动",
      "主次占比：身份区约占首屏四分之一，任务区允许纵向增长",
      "对齐规则：文本和卡片沿统一左基线排列，指标内部采用等宽分栏",
      "阅读顺序：从身份识别到状态判断，再进入任务操作",
      "页面内容：【页面主题、身份信息、指标和任务内容】"
    ].join("\n"),
    category: "social",
    mode: "generate",
    useCase: "other",
    source: "custom",
    extractionScenario: "layout-skeleton",
    createdAt: "2026-07-22T00:00:00.000Z"
  },
  "series-template": {
    id: "custom:template-assistant-series-template",
    name: "暗色数据产品系列",
    description: "适合连续产出风格一致的数据与任务页面",
    prompt: [
      "视觉系统：深色界面，荧光绿作为小面积强调色，卡片使用低对比描边",
      "布局规则：顶部身份区、中部数据区、下方列表区，底部固定主行动",
      "信息层级：核心数字为第一焦点，任务状态为第二焦点",
      "组件质感：仅重点卡片出现荧光边缘",
      "系列约束：同系列页面保持一致色彩角色、卡片构造和强调机制",
      "本期主题：【页面主题和业务目标】",
      "业务内容：【本期数据、任务和行动文案】"
    ].join("\n"),
    category: "social",
    mode: "generate",
    useCase: "other",
    source: "custom",
    extractionScenario: "series-template",
    createdAt: "2026-07-22T00:00:00.000Z"
  },
  replica: {
    id: "custom:template-assistant-replica",
    name: "深色数据主页复刻",
    description: "保留参考图的模块组合和视觉系统，可替换实例内容",
    prompt: [
      "页面结构：保留身份卡、三列指标、成就卡、任务卡和底部主按钮的组合顺序",
      "模块比例：身份卡较高，数据与任务卡横向铺满，成就图形位于数据卡右侧",
      "视觉系统：近黑背景配荧光黄绿高亮，重点组件带局部边缘光",
      "组件组合：保留大数字、进度信息、奖励徽章、任务说明和满宽行动按钮",
      "用户信息：【头像、昵称和身份说明】",
      "数据指标：【指标名称、数值与进度】",
      "任务内容：【日期、任务与奖励内容】"
    ].join("\n"),
    category: "social",
    mode: "generate",
    useCase: "other",
    source: "custom",
    extractionScenario: "replica",
    createdAt: "2026-07-22T00:00:00.000Z"
  }
};

const previewApi = {
  checkpointPromptDraft: async () => undefined,
  suggestAssistantIntents: async () => ({ suggestions: [] })
} as unknown as ImageWorkbenchApi;

(globalThis as typeof globalThis & { imageWorkbench: ImageWorkbenchApi }).imageWorkbench = previewApi;

function previewMedia(sceneId: string): Record<string, SceneMediaSummary> {
  const now = "2026-07-24T10:00:00.000Z";
  return {
    [sceneId]: {
      sceneId,
      covers: [],
      results: [
        "/scene-previews/social/1.webp",
        "/scene-previews/social/2.webp",
        "/scene-previews/social/3.webp",
        "/scene-previews/concept/1.webp"
      ].map((imageUrl, index) => ({
        id: `preview-example-${index + 1}`,
        jobId: `preview-job-${index + 1}`,
        sceneId,
        path: imageUrl,
        imageUrl,
        prompt: `模板验证示例 ${index + 1}`,
        createdAt: now,
        providerName: "Preview",
        model: "preview"
      }))
    }
  };
}

function Preview(): React.ReactElement {
  const initialScene = sceneByScenario[readScenario()];
  const preserveScene = (input: NewSceneInput): SceneDefinition => ({
    ...initialScene,
    ...input
  });

  return (
    <main className="h-screen min-h-0">
      <SceneCreator
        currentPrompt=""
        initialScene={initialScene}
        initialWorkflowMode="generate"
        initialUseCase="other"
        generationDefaults={{
          providerId: "preview",
          providerName: "Preview",
          model: "preview",
          size: "1024x1024",
          quality: "auto",
          canGenerate: false,
          supportsEditing: false
        }}
        canOptimize={false}
        canCollaborate
        onCollaborate={async (): Promise<CollaborateSceneResult> => ({
          message: "预览模式不会调用模型。",
          fields: []
        })}
        onOptimize={async (_scene, prompt) => prompt}
        onSave={preserveScene}
        onUpdate={(_scene, input) => preserveScene(input)}
        onDelete={() => undefined}
        onCreated={() => undefined}
        onCancel={() => undefined}
        onMediaChange={async () => undefined}
        onOpenSettings={() => undefined}
        mediaBySceneId={previewMedia(initialScene.id)}
      />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <Preview />
    </I18nProvider>
  </React.StrictMode>
);
