import React from "react";
import ReactDOM from "react-dom/client";
import type { CollaborateSceneResult } from "@shared/types";
import { SceneDetail } from "@/components/workbench/SceneDetail";
import { I18nProvider } from "@/i18n";
import type { SceneDefinition } from "@/lib/scene-library";
import "@/styles.css";

const previewScene: SceneDefinition = {
  id: "preview:scene-detail",
  name: "参考图风格拆解",
  description: "适用于从参考图中提取 UI、广告或营销视觉的可复用风格结构。",
  prompt: [
    "构图：移动端界面居中展示，使用圆角设备外框；顶部放置成都城市天际线与新能源汽车充电桩场景图并加入渐隐遮罩。",
    "中部展示手机号登录、验证码输入、附近充电站提示等核心信息卡片列表。",
    "底部放置同意用户协议勾选控件与登录主按钮；整体纵向排版，留白充足。",
    "本次创作需求：【替换为要生成的页面主题与业务内容】"
  ].join("\n"),
  previewImages: [
    "/scene-previews/ad-poster/1.webp",
    "/scene-previews/ad-poster/2.webp"
  ],
  previewPrompts: [
    "移动端清洁能源服务欢迎页，使用城市与新能源汽车充电场景，包含手机号登录、验证码和附近充电站信息。",
    "移动端新能源品牌活动页，延续相同版式与绿色视觉语言，突出城市出行与补能服务。"
  ],
  category: "editing",
  mode: "generate",
  useCase: "other",
  source: "custom",
  createdAt: "2026-07-23T00:00:00.000Z"
};

function Preview(): React.ReactElement {
  return (
    <main className="h-screen min-h-0">
      <SceneDetail
        scene={previewScene}
        isFavorite={false}
        boards={[]}
        history={[]}
        media={{
          sceneId: previewScene.id,
          results: [],
          covers: [{
            id: "preview-cover",
            sceneId: previewScene.id,
            path: "/scene-previews/ad-poster/1.webp",
            imageUrl: "/scene-previews/ad-poster/1.webp",
            sourcePath: "/scene-previews/ad-poster/1.webp",
            createdAt: "2026-07-23T00:00:00.000Z",
            focus: { x: 0.5, y: 0.5 }
          }]
        }}
        generationDefaults={{
          providerId: "preview",
          providerName: "Preview",
          model: "preview",
          size: "1024x1536",
          quality: "auto",
          canGenerate: false,
          supportsEditing: false
        }}
        canOptimize
        onBack={() => undefined}
        onApply={() => undefined}
        onToggleFavorite={() => undefined}
        onEdit={() => undefined}
        onExport={() => undefined}

        onCollaborate={async (): Promise<CollaborateSceneResult> => ({
          message: "已按当前模板整理出一版可生成的画面方案。",
          fields: [{
            label: "提示词",
            value: "白色机甲模型电商展示广告，主体居中，突出机械关节细节、产品比例与价格信息，使用克制的银灰色背景和清晰的商品信息层级。"
          }]
        })}
        onCopyText={() => undefined}
        onLocateHistory={() => undefined}
        onReuseHistory={() => undefined}
        onUseHistoryAsReference={() => undefined}
        loadThumbnail={async () => undefined}
        onMediaChange={async () => undefined}
        onOpenSettings={() => undefined}
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
