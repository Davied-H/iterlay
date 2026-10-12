import type { ImageQuality, SceneCoverFocus, SceneMediaSummary } from "@shared/types";
import type { SceneDefinition } from "@/lib/scene-library";

export interface SceneGenerationDefaults {
  providerId: string;
  providerName: string;
  model: string;
  size: string;
  quality?: ImageQuality;
  style?: string;
  canGenerate: boolean;
  supportsEditing: boolean;
}

export interface ScenePreviewImage {
  src: string;
  focus: SceneCoverFocus;
  generated: boolean;
}

const CENTER_FOCUS: SceneCoverFocus = { x: 0.5, y: 0.5 };

export function getScenePreviewImages(
  scene: SceneDefinition,
  media?: SceneMediaSummary
): ScenePreviewImage[] {
  if (media?.results.length) {
    return media.results.slice(0, 3).map((result) => ({
      src: result.imageUrl,
      focus: CENTER_FOCUS,
      generated: true
    }));
  }
  return (scene.previewImages ?? []).slice(0, 3).map((src) => ({
    src,
    focus: CENTER_FOCUS,
    generated: false
  }));
}
