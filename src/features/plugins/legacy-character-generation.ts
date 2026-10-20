import { toast } from "sonner";
import { translateSourceText } from "@/i18n/ui-text";
import { getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { SHORT_DRAMA_PLUGIN_ID } from "@shared/plugins";
import type { ComicCharacterNode, GenerateImageInput, ProviderConfig } from "@shared/types";
import { useEffect, useRef, type RefObject } from "react";
import type { ActiveBoard, CanvasLayoutState, CanvasPersistedNode } from "@/features/boards/types";
import type { GenerationConfirmationRequest } from "@/features/generation/confirmation";
import type { createImageGenerationController } from "@/features/generation/create-generation-controller";
import { requestPluginCapability } from "../plugins/request-plugin-capability";
import { type PluginImageRecipe } from "../plugins/validate-image-recipe";

interface PreparedCharacterGeneration {
  character: ComicCharacterNode;
  prompt: string;
  recipe: PluginImageRecipe;
  providerId: string;
  providerLabel: string;
  model: string;
  metadata: Partial<GenerateImageInput>;
}

interface LegacyCharacterGenerationOptions {
  boardId: string | undefined;
  workflowNodesRef: RefObject<CanvasPersistedNode[]>;
  activeProvider: ProviderConfig;
  activeBoardRef: RefObject<ActiveBoard | null>;
  canvasStateRef: RefObject<CanvasLayoutState>;
  paidSubmissionInFlightRef: RefObject<Set<string>>;
  generate: ReturnType<typeof createImageGenerationController>;
  updateWorkflowNode: (id: string, patch: Partial<CanvasPersistedNode>) => void;
  requestGenerationConfirmation: (request: GenerationConfirmationRequest) => Promise<boolean>;
}

/** Legacy canvas compatibility: policy runs in the installed plugin, execution stays trusted. */
export function useLegacyCharacterGeneration({ boardId: currentBoardId, workflowNodesRef, activeProvider, activeBoardRef, canvasStateRef, paidSubmissionInFlightRef, generate, updateWorkflowNode, requestGenerationConfirmation }: LegacyCharacterGenerationOptions) {
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, [currentBoardId]);
  const isCurrentCharacter = (character: ComicCharacterNode, boardId: string): boolean => {
    const current = workflowNodesRef.current.find(node => node.id === character.id);
    return !lifetime.current.signal.aborted && activeBoardRef.current?.id === boardId
      && current?.type === "comic-character" && current.activeVersionId === character.activeVersionId;
  };

  async function prepareCharacterGeneration(
    character: ComicCharacterNode,
    boardId: string,
    settingVersionId?: string
  ): Promise<PreparedCharacterGeneration> {
    void settingVersionId;
    const recipe = await requestPluginCapability(SHORT_DRAMA_PLUGIN_ID, "character.prepareGeneration", character, {
      signal: lifetime.current.signal, isCurrentBoard: () => isCurrentCharacter(character, boardId)
    });
    return { character, prompt: recipe.prompt, recipe, providerId: activeProvider.id,
      providerLabel: activeProvider.name, model: activeProvider.model, metadata: {} };
  }

  async function confirmCharacterGeneration(
    prepared: PreparedCharacterGeneration[],
    title: string
  ): Promise<boolean> {
    const quoted = prepared.filter((item) => item.metadata.priceSnapshot);
    const amount = quoted.reduce((sum, item) => sum + (item.metadata.priceSnapshot?.amount ?? 0), 0);
    const currency = quoted[0]?.metadata.priceSnapshot?.currency;
    const allQuoted = quoted.length === prepared.length;
    const totalCostLabel = allQuoted
      ? `${amount} ${currency === "gold-bean" ? "金豆" : currency === "credit" ? "Credit" : currency ?? ""}`.trim()
      : quoted.length > 0
        ? `${amount} ${currency ?? ""} + 外部 Provider 计费`.trim()
        : "由外部 Provider 计费";
    return requestGenerationConfirmation({
      title,
      providerLabel: prepared.map((item) => item.providerLabel).filter((value, index, values) => values.indexOf(value) === index).join("、"),
      model: prepared.map((item) => item.model).filter((value, index, values) => values.indexOf(value) === index).join("、"),
      totalCostLabel,
      items: prepared.map((item) => ({
        id: item.character.id,
        label: item.character.name,
        task: "生成 1 张角色图片",
        costLabel: item.metadata.priceSnapshot
          ? `${item.metadata.priceSnapshot.amount} ${item.metadata.priceSnapshot.currency === "credit" ? "Credit" : item.metadata.priceSnapshot.currency}`
          : "Provider 计费",
        quoteId: item.metadata.quoteId,
        quoteExpiresAt: item.metadata.quoteExpiresAt
      })),
      confirmLabel: prepared.length === 1 ? "确认并生成角色" : `确认并生成 ${prepared.length} 个角色`
    });
  }

  async function submitCharacterGeneration(prepared: PreparedCharacterGeneration, boardId: string): Promise<void> {
    const { character, metadata } = prepared;
    if (!isCurrentCharacter(character, boardId)) throw new Error("画板或角色版本已切换，请重新生成角色。");
    updateWorkflowNode(character.id, { status: "generating", generationError: undefined });
    try {
      const outputs = await generate(undefined, {
        workflowMode: "generate",
        creationMode: prepared.recipe.creationMode,
        useCase: prepared.recipe.useCase,
        prompt: prepared.prompt,
        model: prepared.model,
        size: prepared.recipe.size,
        n: 1,
        referenceImages: [],
        boardId,
        providerId: prepared.providerId,
        ...metadata
      }, { preservePrompt: true, placementAnchorId: character.id, preserveModelOverride: true });
      if (!outputs.length) throw new Error("角色图片生成未返回结果。");
      if (isCurrentCharacter(character, boardId)) {
        updateWorkflowNode(character.id, { status: "review", generationError: undefined });
      }
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "角色图片生成失败。");
      if (isCurrentCharacter(character, boardId)) {
        updateWorkflowNode(character.id, { status: "failed", generationError: message });
      }
      throw new Error(message, { cause: error });
    }
  }

  async function settleCharacterGenerationBatch(
    prepared: PreparedCharacterGeneration[],
    boardId: string
  ): Promise<void> {
    const results = await Promise.allSettled(prepared.map((item) => submitCharacterGeneration(item, boardId)));
    const completed = results.filter((item) => item.status === "fulfilled").length;
    const failures = results.flatMap((result, index) => result.status === "rejected"
      ? [{
          name: prepared[index].character.name,
          reason: getWorkbenchErrorMessage(result.reason, "角色图片生成失败。")
        }]
      : []);
    if (failures.length > 0) {
      toast.error(translateSourceText("{{ui:0}}/{{ui:1}} 个角色生成完成", [completed, results.length]), {
        description: failures.map((failure) => `${failure.name}：${failure.reason}`).join("\n")
      });
      return;
    }
    toast.success(translateSourceText("{{ui:0}}/{{ui:1}} 个角色生成完成，等待逐项采用", [completed, results.length]));
  }

  async function retryComicCharacterGeneration(character: ComicCharacterNode): Promise<void> {
    const boardId = activeBoardRef.current?.id;
    if (!boardId) {
      toast.error(translateSourceText("当前漫剧画板尚未就绪，请返回后重新进入。"));
      return;
    }
    if (paidSubmissionInFlightRef.current.has(character.id)) {
      toast("该角色的生成请求正在处理中。");
      return;
    }
    paidSubmissionInFlightRef.current.add(character.id);
    try {
      const settingVersionId = canvasStateRef.current.connections.find((connection) => connection.target === character.id)?.versionBinding?.mode === "pinned"
        ? (canvasStateRef.current.connections.find((connection) => connection.target === character.id)?.versionBinding as { mode: "pinned"; versionId: string }).versionId
        : undefined;
      const prepared = await prepareCharacterGeneration(character, boardId, settingVersionId);
      const confirmationTitle = character.status === "failed" ? `重试角色 · ${character.name}` : `生成角色形象 · ${character.name}`;
      if (!await confirmCharacterGeneration([prepared], confirmationTitle)) return;
      await settleCharacterGenerationBatch([prepared], boardId);
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "角色图片生成准备失败。");
      if (isCurrentCharacter(character, boardId)) updateWorkflowNode(character.id, { status: "failed", generationError: message });
      toast.error(message, { action: { label: "插件市场", onClick: () => window.dispatchEvent(new Event("iterlay:manage-plugins")) } });
    } finally {
      paidSubmissionInFlightRef.current.delete(character.id);
    }
  }

  return { retryComicCharacterGeneration };
}
