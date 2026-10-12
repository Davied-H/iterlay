import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/workbench/SceneCreator.tsx", import.meta.url),
  "utf8"
);

describe("SceneCreator example image preview", () => {
  it("opens generated example images in the shared zoom lightbox", () => {
    expect(source).toContain('aria-label={`放大预览${alt}`}');
    expect(source).toContain("setExampleImageLightbox({");
    expect(source).toContain("<ImageZoomLightbox");
    expect(source).toContain("sourceRect={exampleImageLightbox.sourceRect}");
    expect(source).toContain("onClose={() => setExampleImageLightbox(null)}");
  });

  it("lets users select persisted examples as assistant image context", () => {
    expect(source).toContain("mediaBySceneId?: Record<string, SceneMediaSummary>");
    expect(source).toContain("async function toggleAssistantExample");
    expect(source).toContain("选择提供给 AI 的示例");
    expect(source).toContain("currentAssistantReferences().map");
    expect(source).toContain("assistantExampleReferences.map");
  });

  it("accepts a pasted source image for edit-template examples", () => {
    expect(source).toContain('import { extractClipboardImageFiles } from "@/lib/clipboard-images";');
    expect(source).toContain("function pasteExampleSourceImage");
    expect(source).toContain("onPaste={pasteExampleSourceImage}");
    expect(source).toContain("上传或直接粘贴源图");
  });
});
