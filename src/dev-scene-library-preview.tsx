import React from "react";
import ReactDOM from "react-dom/client";
import type { CollaborateSceneResult } from "@shared/types";
import { SceneLibraryPage } from "@/components/workbench/SceneLibrary";
import { I18nProvider } from "@/i18n";
import { PRESET_SCENES, type SceneDefinition } from "@/lib/scene-library";
import "@/styles.css";

const previewScenes = [
  ...PRESET_SCENES,
  ...PRESET_SCENES.slice(0, 6).map((scene, index): SceneDefinition => ({
    ...scene,
    id: `preview-custom-${index}`,
    name: `${scene.name}变体`,
    source: "custom",
    createdAt: new Date(2026, 6, index + 1).toISOString()
  }))
];

function Preview(): React.ReactElement {
  return (
    <main className="h-screen min-h-0">
      <SceneLibraryPage
        scenes={previewScenes}
        favoriteSceneIds={[previewScenes[1].id, previewScenes[4].id]}
        boards={[]}
        currentPrompt=""
        mode="generate"
        useCase="other"
        history={[]}
        canOptimize={false}
        canCollaborate={false}
        generationDefaults={{
          providerId: "preview",
          providerName: "Preview",
          model: "preview",
          size: "auto",
          quality: "auto",
          canGenerate: false,
          supportsEditing: false
        }}
        onSelect={() => undefined}
        onToggleFavorite={() => undefined}
        onSave={() => previewScenes[0]}
        onUpdate={(scene) => scene}
        onDelete={() => undefined}
        onExport={() => undefined}
        onSubmit={async (scene) => ({
          id: `preview-${scene.id}`,
          slug: scene.id,
          name: scene.name,
          authorName: "Preview",
          status: "pending",
          submittedAt: new Date().toISOString()
        })}
        onGetSubmission={async () => null}
        onImport={async () => null}
        onImportFiles={async () => []}
        onOptimize={async (_scene, prompt) => prompt}
        onCollaborate={async (): Promise<CollaborateSceneResult> => ({ message: "预览模式", fields: [] })}
        onCopyText={() => undefined}
        onLocateHistory={() => undefined}
        onReuseHistory={() => undefined}
        onUseHistoryAsReference={() => undefined}
        loadThumbnail={async () => undefined}
        onOpenSettings={() => undefined}
        onClose={() => undefined}
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
