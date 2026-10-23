import { createRoot } from "react-dom/client";
import type { BoardSummary, CollaborateSceneRequest, CollaborateSceneResult } from "@shared/types";
import {
  CreationAssistantPage,
  type CreationAssistantGenerationPlan,
  type CreationAssistantResult
} from "@/components/workbench/CreationAssistantPage";
import "@/styles.css";

const now = new Date().toISOString();
const previewParams = new URLSearchParams(window.location.search);
const generationDelay = Math.min(60_000, Math.max(650, Number(previewParams.get("delay")) || 650));
document.documentElement.classList.toggle("dark", previewParams.get("theme") === "dark");
const boards: BoardSummary[] = [
  { id: "brand", name: "品牌视觉探索", createdAt: now, updatedAt: now, imageCount: 12 },
  { id: "portrait", name: "人物肖像", createdAt: now, updatedAt: now, imageCount: 8 },
  { id: "product", name: "产品摄影", createdAt: now, updatedAt: now, imageCount: 5 }
];

Object.defineProperty(globalThis, "imageWorkbench", {
  configurable: true,
  value: {
    listAssistantConversations: async () => [
      {
        id: "history-1",
        conversationId: "portrait-history",
        surface: "canvas-prompt",
        instruction: "生成一个复古胶片质感的个人头像",
        response: "我整理了一版克制的复古人像方向，保留自然肤色和清晰轮廓。",
        generatedPrompt: "复古胶片人像，柔和侧光，纯色背景，自然肤色，清晰轮廓",
        occurredAt: now,
        boardId: "portrait"
      },
      {
        id: "history-2",
        conversationId: "coffee-history",
        surface: "canvas-prompt",
        instruction: "为独立咖啡品牌设计三张社交媒体视觉",
        response: "方向聚焦在晨间光线、手作质感与克制的品牌信息层级。",
        occurredAt: new Date(Date.now() - 86_400_000).toISOString(),
        boardId: "brand"
      }
    ]
  }
});

async function createPreviewResult(
  plan: CreationAssistantGenerationPlan
): Promise<CreationAssistantResult> {
  await new Promise((resolve) => window.setTimeout(resolve, generationDelay));
  if (plan.prompt.includes("测试失败")) throw new Error("图片服务暂时无法连接。请稍后重试，你的创作方案已保留。");
  const target = boards.find((board) => board.id === plan.targetBoardId);
  return {
    boardId: target?.id ?? "new-board",
    boardName: target?.name ?? "未命名画板",
    images: [
      { id: "one", dataUrl: "/scene-previews/edit-style/1.webp" }
    ]
  };
}

async function interpretPreview(
  request: CollaborateSceneRequest
): Promise<CollaborateSceneResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 450));
  if (request.instruction.includes("表情包") && request.clarificationRounds === 0) {
    return {
      message: "可以。先确认表情包的角色和整体感觉，我再整理成可生成的方案。",
      intent: "creative",
      fields: [],
      interaction: {
        type: "form",
        title: "先确定两个关键点",
        fields: [
          {
            id: "character",
            label: "想用什么角色？",
            type: "text",
            required: true,
            placeholder: "例如：一只圆滚滚的橘猫"
          },
          {
            id: "style",
            label: "偏好的风格",
            type: "select",
            required: true,
            options: [
              { label: "可爱手绘", value: "可爱手绘" },
              { label: "夸张搞笑", value: "夸张搞笑" },
              { label: "简洁扁平", value: "简洁扁平" }
            ]
          }
        ]
      }
    };
  }
  return {
    message: "我整理了一版可直接生成的创作方案，请确认。",
    intent: "direct",
    suggestedName: "表情包创作",
    fields: [{
      label: "提示词",
      value: (request.clarificationRounds ?? 0) > 0
        ? "圆滚滚的橘猫，可爱手绘表情包，白色干净背景，夸张但清晰的情绪动作，适合聊天场景使用。"
        : request.instruction
    }]
  };
}

createRoot(document.getElementById("root")!).render(
  <main className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
    <CreationAssistantPage
      boards={boards}
      activeBoardId="brand"
      onInterpret={interpretPreview}
      onCreate={createPreviewResult}
      onOpenBoard={() => undefined}
      onOpenSettings={() => undefined}
    />
  </main>
);
