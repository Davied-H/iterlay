import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import type { TemplateExtractionSaveDecision, TemplateExtractionSource } from "@/components/workbench/TemplateExtractionDialog";
import { translateSourceText } from "@/i18n/ui-text";
import { getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { parseSceneFields, type SceneDefinition, type NewSceneInput } from "@/lib/scene-library";
import { startSceneCollaborationStream } from "@/lib/scene-collaboration-stream";
import { buildTemplateExtractionInstruction, createTemplateExtractionFromAssistant, parseTemplateExtractionItems, retargetTemplateExtractionContext, type TemplateExtractionResult, type TemplateExtractionScenario } from "@/lib/template-workflow";
import type { CollaborateSceneRequest, CollaborateSceneResult, GenerationJob, ImageWorkflowMode, ReferenceImagePayload, ReferenceImageRole } from "@shared/types";
import type { ImageWorkbenchApi } from "@shared/workbench-client";
import { getDefaultUseCase } from "@shared/workflow";

interface TemplateExtractionOptions {
  textProviderReady: boolean;
  openProviderSetup: () => void;
  history: GenerationJob[];
  scenes: SceneDefinition[];
  getWorkbenchApi: () => ImageWorkbenchApi | null;
  refreshCreditStatus: () => void;
  dataUrlToReferencePayload: (dataUrl: string, name: string, role: ReferenceImageRole) => ReferenceImagePayload | null;
  saveScene: (draft: NewSceneInput) => SceneDefinition;
  updateScene: (scene: SceneDefinition, draft: NewSceneInput) => SceneDefinition;
}

export function useTemplateExtraction({ textProviderReady, openProviderSetup, history, scenes, getWorkbenchApi, refreshCreditStatus, dataUrlToReferencePayload, saveScene, updateScene }: TemplateExtractionOptions) {
  const [templateExtractionSource, setTemplateExtractionSource] = useState<TemplateExtractionSource | null>(null);
  const openTemplateExtraction = useCallback((image: GeneratedImage): void => {
    if (!textProviderReady) {
      toast.error(translateSourceText("沉淀模板需要先配置可用的文本 AI。"));
      openProviderSetup();
      return;
    }
    const activeVersionJobId = image.versions?.[image.activeVersion ?? -1]?.jobId;
    const jobId = activeVersionJobId || image.jobId;
    const job = history.find((item) => item.id === jobId);
    const sourcePrompt = job?.prompt?.trim() || job?.input.prompt?.trim() || "";
    if (!image.dataUrl && !image.path) {
      toast.error(translateSourceText("无法读取这张画板图片，暂时不能沉淀为模板。"));
      return;
    }
    const workflowMode = job?.input.workflowMode ?? "generate";
    const useCase = job?.useCase ?? job?.input.useCase ?? getDefaultUseCase(workflowMode);
    const sourceScene = job?.input.sceneId ? scenes.find((scene) => scene.id === job.input.sceneId) : undefined;
    setTemplateExtractionSource({
      id: `${image.id}:${job?.id ?? image.activeVersion ?? "image"}`,
      imageUrl: image.dataUrl,
      imagePath: image.path,
      sourcePrompt,
      workflowMode,
      useCase,
      category: sourceScene?.category
    });
  }, [history, openProviderSetup, scenes, textProviderReady]);

  const extractTemplateFromCanvas = useCallback(async (
    source: TemplateExtractionSource,
    workflowMode: ImageWorkflowMode,
    scenario: TemplateExtractionScenario,
    onItems: (items: TemplateExtractionResult["items"]) => void
  ): Promise<TemplateExtractionResult> => {
    const api = getWorkbenchApi();
    const dataUrl = source.imageUrl.startsWith("data:")
      ? source.imageUrl
      : source.imagePath && api
        ? await api.readAssetDataUrl(source.imagePath)
        : "";
    const reference = dataUrlToReferencePayload(dataUrl, "已验证的画板结果", "reference");
    if (!reference) throw new Error("无法读取这张画板图片。");
    const extractionContext = retargetTemplateExtractionContext({
      sourcePrompt: source.sourcePrompt,
      workflowMode: source.workflowMode,
      useCase: source.useCase,
      category: source.category,
      extractionScenario: scenario
    }, workflowMode);
    const request = {
      instruction: buildTemplateExtractionInstruction(
        workflowMode,
        Boolean(source.sourcePrompt.trim()),
        scenario
      ),
      referenceImages: [{
        name: reference.name,
        mimeType: reference.mimeType,
        dataBase64: reference.dataBase64
      }],
      currentFields: parseSceneFields(source.sourcePrompt).map((field) => ({
        label: field.label || "生成提示词",
        value: field.value
      })),
      workflowMode,
      useCase: extractionContext.useCase,
      assistantSurface: "scene-template",
      recordInHistory: false,
      memoryQuery: source.imagePath ? { assetPath: source.imagePath } : undefined
    } satisfies CollaborateSceneRequest;
    const result = await new Promise<CollaborateSceneResult>((resolve, reject) => {
      startSceneCollaborationStream(request, {
        onDelta: () => undefined,
        onFields: (fields) => onItems(parseTemplateExtractionItems({ message: "", fields })),
        onResult: resolve,
        onError: (message) => reject(new Error(message)),
        onCancelled: () => reject(new Error("已停止提炼模板。"))
      });
    });
    refreshCreditStatus();
    return createTemplateExtractionFromAssistant(result, extractionContext);
  }, [getWorkbenchApi, refreshCreditStatus, dataUrlToReferencePayload]);

  const saveExtractedTemplate = useCallback(async (
    source: TemplateExtractionSource,
    draft: NewSceneInput,
    decision: TemplateExtractionSaveDecision
  ): Promise<void> => {
    const scene = decision.action === "replace"
      ? updateScene(decision.template, draft)
      : saveScene(draft);
    const api = getWorkbenchApi();
    if (api && source.imagePath) {
      try {
        await api.addSceneExample(scene.id, source.imagePath, scene.prompt);
      } catch (error) {
        toast.warning(getWorkbenchErrorMessage(error, "模板已保存，但示例图暂时无法加入。"));
      }
    }
    setTemplateExtractionSource(null);
  }, [getWorkbenchApi, saveScene, updateScene]);

  return { templateExtractionSource, setTemplateExtractionSource, openTemplateExtraction, extractTemplateFromCanvas, saveExtractedTemplate };
}
