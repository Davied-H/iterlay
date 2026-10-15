import { readUiSource as readFileSync } from "./helpers/ui-source";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/workbench/SceneDetail.tsx", import.meta.url),
  "utf8"
);

describe("SceneDetail image preview", () => {
  it("constrains the selected example to the available stage", () => {
    expect(source).toContain("data-scene-preview-stage");
    expect(source).toContain("flex h-full w-full min-h-0 min-w-0 cursor-zoom-in");
    expect(source).toContain("h-auto w-auto max-h-full max-w-full rounded-lg object-contain");
  });

  it("opens the selected example in the shared zoom lightbox", () => {
    expect(source).toContain("setPreviewLightbox({");
    expect(source).toContain('aria-label={`放大预览${selectedItem.label}`}');
    expect(source).toContain("<ImageZoomLightbox");
    expect(source).toContain("sourceRect={previewLightbox.sourceRect}");
    expect(source).toContain("onClose={() => setPreviewLightbox(null)}");
  });

  it("accepts a pasted source image for edit templates", () => {
    expect(source).toContain('import { extractClipboardImageFiles } from "@/lib/clipboard-images";');
    expect(source).toContain("function pasteSourceImage");
    expect(source).toContain("onPaste={pasteSourceImage}");
    expect(source).toContain("上传或直接粘贴编辑源图");
  });
});
