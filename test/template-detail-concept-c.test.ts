import { readUiSource as readFileSync } from "./helpers/ui-source";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/workbench/SceneDetail.tsx", import.meta.url),
  "utf8"
);

describe("template detail concept C workspace", () => {
  it("keeps an icon-only back control before the template title", () => {
    expect(source).toContain('data-template-library-back=""');
    expect(source).toMatch(
      /size="icon"[\s\S]*?data-template-library-back=""[\s\S]*?aria-label="返回模版库"[\s\S]*?<ArrowLeft[\s\S]*?<\/Button>[\s\S]*?activeScene\.name/
    );
    expect(source).not.toContain("<span>模版库</span>");
    expect(source).not.toMatch(/<\/Button>\s*<ChevronRight className="h-3\.5 w-3\.5 text-muted-foreground" \/>/);
  });

  it("uses a media stage, vertical rail and independent creation dock", () => {
    expect(source).toContain('data-template-detail-workspace="concept-c"');
    expect(source).toContain('data-template-media-rail=""');
    expect(source).toContain('data-template-creation-dock=""');
    expect(source).toContain('grid-cols-[80px_minmax(0,1fr)]');
    expect(source).toContain('grid-rows-[minmax(320px,1fr)_auto]');
    expect(source).toContain('clamp(160px, calc(100dvh - 441px), 300px)');
  });

  it("keeps the media rail visual-only and aligned with the preview stage", () => {
    const railSource = source.slice(
      source.indexOf('data-template-media-rail=""'),
      source.indexOf("data-scene-preview-stage")
    );

    expect(railSource).toContain("bg-black/10");
    expect(railSource).toContain("dark:bg-black/40");
    expect(railSource).toContain("p-3");
    expect(railSource).toContain("border-neutral-400/80");
    expect(railSource).toContain("shadow-[0_2px_8px_rgba(24,24,20,0.18)]");
    expect(railSource).not.toContain("ring-foreground");
    expect(railSource).not.toContain("{group.label}</span>");
    expect(railSource).not.toContain("{group.items.length}");
  });

  it("opens the template-use assistant as a dedicated workspace sidebar", () => {
    expect(source).toContain('data-template-assistant-sidebar="workspace"');
    expect(source).toContain('data-template-assistant-primary=""');
    expect(source).toContain("min-[900px]:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]");
    expect(source).toContain('<TemplateUseAssistant');
    expect(source).toContain('templatePrompt={activeScene.prompt}');
    expect(source).toContain('templateFields={activeScene.fields}');
    expect(source).toContain('aria-controls="template-assistant-sidebar"');
    expect(source).not.toContain('data-template-creation-tray={creationTrayView}');
    expect(source).not.toContain('<AiAssistant\n');
    expect(source).not.toContain('data-template-assistant-sidebar="floating"');
    expect(source).not.toContain('data-template-assistant-dialog=""');
  });

  it("keeps examples and history as the only primary content tabs", () => {
    expect(source).toContain("<LibraryFilterTabs");
    expect(source).toContain('semantics="tablist"');
    expect(source).toContain('id: "scene-examples-tab"');
    expect(source).toContain('id: "scene-history-tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).not.toContain("本次结果");
    expect(source).not.toContain("{selectedItem.label}</p>");
  });

  it("provides an on-demand non-modal template inspector", () => {
    expect(source).toContain('data-template-info-inspector=""');
    expect(source).toContain('aria-controls="template-info-inspector"');
    expect(source).toContain('aria-expanded={inspectorOpen}');
    expect(source).toContain('aria-label={wideWorkspace ? "关闭模板信息" : "返回创作"}');
    expect(source).toContain('window.addEventListener("keydown", closeOnEscape)');
  });

  it("states generated-media ownership in calls to action and feedback", () => {
    expect(source).toContain('label: `生成 ${generationCount} 张`');
    expect(source).toContain("已生成并加入当前模板，未自动发布");
    expect(source).toContain('label="从模板移除"');
    expect(source).toContain("已从当前模板移除示例图");
  });

  it("makes the staged generation flow and current action visible", () => {
    expect(source).toContain("描述需求");
    expect(source).toContain("确认方案");
    expect(source).toContain("生成示例");
    expect(source).toContain('label: promptOutdated ? "更新方案" : "继续"');
    expect(source).toContain('label: "补全方案中的占位符"');
    expect(source).toContain('label: "配置生成服务"');
    expect(source).toContain('label: "重试失败项"');
    expect(source).toContain('label: "正在整理"');
    expect(source).toContain('label: "采用方案"');
    expect(source).toContain("isSendEnter(event)");
  });

  it("accepts pasted images from the creation prompt as removable references", () => {
    expect(source).toContain("function pasteReferenceImages");
    expect(source).toContain("extractClipboardImageFiles(event.clipboardData)");
    expect(source).toContain("onPaste={pasteReferenceImages}");
    expect(source).toContain("移除参考图 ${image.payload.name}");
  });

  it("auto-sizes the creation prompt and exposes the same drag affordance as the canvas dock", () => {
    expect(source).toContain('data-template-prompt-dock=""');
    expect(source).toContain('data-template-prompt-grip=""');
    expect(source).toContain('aria-label="拖拽调整模板提示词高度"');
    expect(source).toContain("textarea.scrollHeight");
    expect(source).toContain("startCreationPromptDrag");
    expect(source).toContain("moveCreationPromptDrag");
    expect(source).toContain("endCreationPromptDrag");
    expect(source).toContain("onDoubleClick={resetCreationPromptHeight}");
  });

  it("clears the prompt and preserves generation state while navigating away", () => {
    expect(source).toContain("startActiveSceneGeneration({");
    expect(source).toContain('source: "detail"');
    expect(source).toContain("finishActiveSceneGeneration(activeScene.id, activeGeneration.id)");
    expect(source).toMatch(
      /startActiveSceneGeneration\(\{[\s\S]*?setGenerationBrief\(""\)[\s\S]*?getImageWorkbenchApi\(\)\.generateImage/
    );
    expect(source).toContain('setGeneratedFromBrief("")');
    expect(source).toContain('? "正在生成，可继续输入下一轮提示词…"');
  });
});
