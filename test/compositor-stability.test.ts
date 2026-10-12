import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Electron compositor stability", () => {
  it("keeps full-viewport overlays free of backdrop filters", () => {
    const dialog = source("src/components/ui/dialog.tsx");
    const imageZoom = source("src/components/workbench/asset/ImageZoomLightbox.tsx");
    const assetDetail = source("src/components/workbench/AssetDetail.tsx");
    const providerSettings = source("src/components/workbench/ProviderSettingsDialog.tsx");
    const memoryManager = source("src/components/workbench/MemoryManagerDialog.tsx");

    expect(dialog).not.toMatch(/fixed inset-0[^"\n]*(?:backdrop-blur|backdrop-filter)/);
    expect(imageZoom).not.toMatch(/fixed inset-0[^"\n]*(?:backdrop-blur|backdrop-filter)/);
    expect(imageZoom).not.toContain("backdropFilter");
    expect(assetDetail).not.toMatch(/fixed inset-0[^"\n]*(?:backdrop-blur|backdrop-filter)/);
    expect(providerSettings).not.toContain("backdrop-blur-[3px]");
    expect(memoryManager).not.toContain("backdrop-blur-sm");
  });

  it("does not delegate long-list painting to content-visibility", () => {
    const sceneLibrary = source("src/components/workbench/SceneLibrary.tsx");
    const boardLibrary = source("src/components/workbench/BoardLibrary.tsx");

    expect(sceneLibrary).not.toContain("contentVisibility");
    expect(boardLibrary).not.toContain("contentVisibility");
  });

  it("uses compositor-friendly flat workspace surfaces", () => {
    const topBar = source("src/components/workbench/TopBar.tsx");
    const commentRail = source("src/components/workbench/CommentRail.tsx");
    const editLightbox = source("src/components/canvas/EditLightbox.tsx");
    const generationStack = source("src/components/workbench/gallery/GenerationStack.tsx");

    expect(topBar).not.toContain("backdrop-blur-xl");
    expect(commentRail).not.toContain("shadow-xl backdrop-blur-md");
    expect(editLightbox).toContain("absolute inset-0 bg-black/40 dark:bg-black/60");
    expect(editLightbox).not.toMatch(/absolute inset-0[^"\n]*(?:backdrop-blur|backdrop-filter)/);
    expect(generationStack).not.toContain("backdrop-blur-2xl");
  });

  it("avoids full-viewport clip and mask animations that can expose compositor tiles", () => {
    const app = source("src/App.tsx");
    const filmGallery = source("src/components/workbench/gallery/FilmGenerationGallery.css");
    const lightboxGallery = source("src/components/workbench/gallery/LightboxGenerationGallery.css");

    expect(app).not.toContain("galleryTransitionGeometry");
    expect(app).not.toContain("startViewTransition");
    expect(app).not.toContain("motion.svg");
    expect(filmGallery).not.toContain("mask-image");
    expect(lightboxGallery).not.toContain("backdrop-filter");
  });

  it("keeps scrollable cards and moving canvas nodes free of backdrop filters", () => {
    const assetCard = source("src/components/workbench/asset/AssetCard.tsx");
    const imageNode = source("src/components/canvas/ImageNode.tsx");
    const sceneLibrary = source("src/components/workbench/SceneLibrary.tsx");

    expect(assetCard).not.toContain("backdrop-blur");
    expect(imageNode).not.toContain("backdrop-blur");
    expect(sceneLibrary).not.toContain("backdrop-blur");
  });
});
