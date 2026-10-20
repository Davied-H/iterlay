import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { iterlayToast } from "@/components/ui/iterlay-toast";
import { translateSourceText } from "@/i18n/ui-text";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import { createCustomScene, createCustomSceneFromScene, updateCustomScene, writeCustomScenes, writeFavoriteSceneIds, type NewSceneInput, type SceneDefinition } from "@/lib/scene-library";
import { getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import type { ImageWorkbenchApi } from "@shared/workbench-client";
import type { GenerateImageInput, GenerationJob, SceneTemplateImportResult } from "@shared/types";
import { getDefaultQuality } from "@shared/workflow";

type Setter<T> = Dispatch<SetStateAction<T>>;
interface TemplateLibraryOptions {
  setFavoriteSceneIds: Setter<string[]>;
  setCustomScenes: Setter<SceneDefinition[]>;
  setLibraryInitialSceneRequest: Setter<{ id: string; nonce: number } | undefined>;
  setLibraryInitialTab: (tab: "scenes") => void;
  setLibraryOpen: Setter<boolean>;
  setHistoryOpen: Setter<boolean>;
  setCommentOpen: Setter<boolean>;
  setInput: Setter<GenerateImageInput>;
  qualityEditedByUser: boolean;
  history: GenerationJob[];
  scenes: SceneDefinition[];
  images: GeneratedImage[];
  getWorkbenchApi: () => ImageWorkbenchApi | null;
  reportWorkbenchError: (error: unknown) => void;
}

export function useTemplateLibrary({ setFavoriteSceneIds, setCustomScenes, setLibraryInitialSceneRequest, setLibraryInitialTab, setLibraryOpen, setHistoryOpen, setCommentOpen, setInput, qualityEditedByUser, history, scenes, images, getWorkbenchApi, reportWorkbenchError }: TemplateLibraryOptions) {
  const toggleFavoriteScene = useCallback((id: string): void => {
    setFavoriteSceneIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeFavoriteSceneIds(next);
      return next;
    });
  }, [setFavoriteSceneIds]);

  const openTemplateDetail = useCallback((scene: SceneDefinition): void => {
    setLibraryInitialSceneRequest((current) => ({
      id: scene.id,
      nonce: (current?.nonce ?? 0) + 1
    }));
    setLibraryInitialTab("scenes");
    setLibraryOpen(true);
  }, [setLibraryInitialSceneRequest, setLibraryInitialTab, setLibraryOpen]);

  const findImageSourceTemplate = useCallback((image: GeneratedImage): SceneDefinition | undefined => {
    const activeVersionJobId = image.versions?.[image.activeVersion ?? -1]?.jobId;
    const jobIds = [activeVersionJobId, image.jobId, ...image.versions?.map((version) => version.jobId) ?? []]
      .filter((jobId, index, values): jobId is string => Boolean(jobId) && values.indexOf(jobId) === index);
    const sceneId = jobIds
      .map((jobId) => history.find((job) => job.id === jobId)?.input.sceneId)
      .find((candidate): candidate is string => Boolean(candidate));
    return sceneId ? scenes.find((scene) => scene.id === sceneId) : undefined;
  }, [history, scenes]);

  const templateSourceImageIds = useMemo(
    () => images.filter((image) => findImageSourceTemplate(image)).map((image) => image.id),
    [findImageSourceTemplate, images]
  );

  const openImageSourceTemplate = useCallback((image: GeneratedImage): void => {
    const scene = findImageSourceTemplate(image);
    if (!scene) {
      toast.error(translateSourceText("来源模板已删除，无法打开。"));
      return;
    }
    setHistoryOpen(false);
    setCommentOpen(false);
    openTemplateDetail(scene);
  }, [findImageSourceTemplate, openTemplateDetail, setHistoryOpen, setCommentOpen]);

  const applyScene = useCallback((scene: SceneDefinition): void => {
    setInput((current) => ({
      ...current,
      workflowMode: scene.mode,
      useCase: scene.useCase,
      sceneId: scene.id,
      promptSpec: undefined,
      quality: qualityEditedByUser ? current.quality : getDefaultQuality(scene.mode, scene.useCase)
    }));
    setLibraryOpen(false);
    toast.success(translateSourceText("已套用模板「{{ui:0}}」", [scene.name]));
  }, [qualityEditedByUser, setInput, setLibraryOpen]);

  const saveScene = useCallback((draft: NewSceneInput): SceneDefinition => {
    const scene = createCustomScene(draft);
    setCustomScenes((current) => {
      const next = [scene, ...current];
      writeCustomScenes(next);
      return next;
    });
    iterlayToast.templateSaved({ name: scene.name, onNavigate: () => openTemplateDetail(scene) });
    return scene;
  }, [openTemplateDetail, setCustomScenes]);

  const updateScene = useCallback((scene: SceneDefinition, draft: NewSceneInput): SceneDefinition => {
    const updated = scene.source === "preset"
      ? createCustomSceneFromScene(scene, draft)
      : updateCustomScene(scene, draft);
    setCustomScenes((current) => {
      const next = scene.source === "preset"
        ? [updated, ...current]
        : current.map((item) => (item.id === scene.id ? updated : item));
      writeCustomScenes(next);
      return next;
    });
    iterlayToast.templateSaved({ name: updated.name, updated: true, onNavigate: () => openTemplateDetail(updated) });
    return updated;
  }, [openTemplateDetail, setCustomScenes]);

  const deleteScene = useCallback((id: string): void => {
    setCustomScenes((current) => {
      const next = current.filter((scene) => scene.id !== id);
      writeCustomScenes(next);
      return next;
    });
    setFavoriteSceneIds((current) => {
      if (!current.includes(id)) return current;
      const next = current.filter((item) => item !== id);
      writeFavoriteSceneIds(next);
      return next;
    });
    toast.success(translateSourceText("模板已删除"));
  }, [setCustomScenes, setFavoriteSceneIds]);

  async function exportSceneTemplate(scene: SceneDefinition): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      const result = await api.exportScene(scene);
      if (result.ok && result.path) {
        iterlayToast.exported({ title: translateSourceText("模板已导出"), path: result.path });
      }
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

  async function importSceneTemplate(): Promise<SceneDefinition | null> {
    const api = getWorkbenchApi();
    if (!api) return null;
    try {
      const result = await api.importScene();
      if (!result) return null;
      return persistImportedSceneResults([result])[0] ?? null;
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "导入模板失败。"));
      return null;
    }
  }

  function persistImportedSceneResults(results: SceneTemplateImportResult[]): SceneDefinition[] {
    const importedScenes: SceneDefinition[] = results.map((result) => result.scene);
    if (importedScenes.length === 0) return [];
    setCustomScenes((current) => {
      const next = [...importedScenes, ...current];
      writeCustomScenes(next);
      return next;
    });
    results.forEach((result) => {
      const scene = result.scene;
      toast.success(
        result.instanceCount > 0
          ? translateSourceText("已导入模板「{{ui:0}}」和 {{ui:1}} 个实例", [scene.name, result.instanceCount])
          : translateSourceText("已导入模板「{{ui:0}}」", [scene.name])
      );
    });
    return importedScenes;
  }

  async function importSceneTemplateFiles(files: File[]): Promise<SceneDefinition[]> {
    const api = getWorkbenchApi();
    if (!api) return [];
    const results: SceneTemplateImportResult[] = [];
    for (const file of files) {
      try {
        results.push(await api.importSceneData(await file.arrayBuffer()));
      } catch (error) {
        toast.error(translateSourceText("导入 {{ui:0}} 失败：{{ui:1}}", [file.name, getWorkbenchErrorMessage(error, "导入模板失败。")]));
      }
    }
    return persistImportedSceneResults(results);
  }

  return { toggleFavoriteScene, openTemplateDetail, templateSourceImageIds, openImageSourceTemplate, applyScene, saveScene, updateScene, deleteScene, exportSceneTemplate, importSceneTemplate, importSceneTemplateFiles };
}
