import { createHash } from "node:crypto";
import { assertGenerateImageInput } from "../../shared/input-validation.js";
import { imageProviderCapabilities } from "../../shared/provider-capabilities.js";
import { Semaphore } from "../providers/concurrency.js";

import { GenerateImageInput, GenerateResponse, GenerationJob, ProviderConfig, ProviderGenerateInput } from "../../shared/types.js";

import { paidProviderClientRequestId } from "../paid-media-quote.js";

import { ManagerProductAnalyticsClient } from "../product-analytics-client.js";

import { normalizeProviderError } from "../providers/errors.js";

import { AssetStore, decodeImageBase64, MAX_MANAGED_IMAGE_BYTES } from "../storage/asset-store.js";

import { BoardStore } from "../storage/board-store.js";

import { HistoryStore } from "../storage/history-store.js";
import { type MemoryEventInput } from "../storage/memory-store.js";

import { SceneMediaStore } from "../storage/scene-media-store.js";
import { SettingsStore } from "../storage/settings-store.js";

import { showGenerationCompletedNotification } from "../system-notification.js";

import type { UnpositionedBoardNode } from "../../shared/types.js";
import type { ImageProviderAdapter } from "../providers/image-registry.js";
function generationRequestHash(input: GenerateImageInput): string {
  const ignored = new Set(["referenceImages", "idempotencyKey", "inputFingerprint", "generationAttemptId", "quoteId", "quoteExpiresAt", "priceSnapshot", "quoteBoardId", "quoteRequestScope", "quotePurpose", "quoteOperation"]);
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  const hash = createHash("sha256").update(JSON.stringify(canonical(Object.fromEntries(Object.entries(input).filter(([key]) => !ignored.has(key))))));
  for (const image of input.referenceImages) hash.update(JSON.stringify([image.mimeType, image.role ?? "reference", image.name])).update(image.dataBase64);
  return hash.digest("hex");
}

export interface ImageGenerationDependencies {
  settings: SettingsStore;
  history: HistoryStore;
  assets: AssetStore;
  getProviderAdapter: (config: ProviderConfig) => ImageProviderAdapter;
  recordMemory: (input: MemoryEventInput) => void;
  sceneMedia: SceneMediaStore;
  backfillThumbHashes: (imagePaths: string[]) => void;
  createGeneratedBoardNodes: (imagePaths: string[], jobId: string) => Promise<UnpositionedBoardNode[]>;
  boards: BoardStore;
  analytics: ManagerProductAnalyticsClient;
}
export function createImageGenerationCommand(dependencies: ImageGenerationDependencies) {
  const {
  settings,
  history,
  assets,
  getProviderAdapter,
  recordMemory,
  sceneMedia,
  backfillThumbHashes,
  createGeneratedBoardNodes,
  boards,
  analytics
} = dependencies;
  const work = async (input: GenerateImageInput, requestHash: string): Promise<GenerateResponse> => {
    assertGenerateImageInput(input);
    const currentSettings = settings.getSettings();
    if (input.idempotencyKey) {
      const existing = await history.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        if (existing.boardId !== input.boardId || existing.requestHash && existing.requestHash !== requestHash
          || !existing.requestHash && (existing.prompt !== input.prompt || input.referenceImages.length > 0)) throw new Error("请求标识已绑定到其他生成参数，请重新发起。");
        if (existing.status !== "succeeded") throw new Error(existing.error || "该请求尚未完成，请查询历史或使用新的请求标识重试。");
        return { job: existing, images: existing.outputImagePaths.map((imagePath) => ({ path: imagePath, dataUrl: assets.toAssetUrl(imagePath) })) };
      }
    }
    const providerId = input.providerId ?? currentSettings.activeProviderId;
    const currentProvider =
      currentSettings.providers.find((p) => p.id === providerId) ?? currentSettings.providers[0];
    if (!currentProvider) {
      throw new Error("请先在设置中添加并保存一个 Provider。");
    }
    const capabilities = imageProviderCapabilities(currentProvider);
    if (input.n > capabilities.maxImageCount) throw new Error(`当前模型每次最多生成 ${capabilities.maxImageCount} 张图片。`);
    if (input.workflowMode === "edit" && !capabilities.editing) throw new Error("当前 Provider 不支持图片编辑。");
    if (input.workflowMode === "generate" && input.referenceImages.length && !capabilities.generationReferences) throw new Error("当前 Provider 不支持参考图生成。");
    if (input.background === "transparent" && !capabilities.transparentBackground) throw new Error("当前模型不支持透明背景。");
    const effectiveBackground =
      input.background;
    const apiKey = settings.getApiKey(currentProvider.id);
    const selectedProvider = getProviderAdapter(currentProvider);
    if (currentProvider.type !== "codex-oauth" && !apiKey) {
      throw new Error("请先为该 Provider 保存 API Key。");
    }
    if (input.workflowMode === "edit" && input.referenceImages.length === 0) {
      throw new Error("编辑模式至少需要上传 1 张源图。");
    }
    if (input.sceneOnly && !input.sceneId?.trim()) {
      throw new Error("场景详情生成缺少场景 ID。");
    }
    if (input.referenceImages.length > 4) {
      throw new Error("一次最多使用 4 张参考图。");
    }

    recordMemory({
      type: "prompt_submitted",
      surface: input.sceneId ? "scene-template" : input.workflowMode === "edit" ? "canvas-edit" : "canvas-prompt",
      content: input.prompt,
      boardId: input.boardId,
      sceneId: input.sceneId
    });

    const jobId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const decodedReferences = input.referenceImages.map(({ dataBase64, ...reference }) => ({
      ...reference,
      bytes: decodeImageBase64(dataBase64)
    }));
    const totalReferenceBytes = decodedReferences.reduce((total, reference) => total + reference.bytes.length, 0);
    if (totalReferenceBytes > MAX_MANAGED_IMAGE_BYTES * 4) {
      throw new Error("参考图总大小不能超过 100 MB。");
    }

    const references = input.sceneOnly ? [] : await assets.saveReferenceImageBytes(decodedReferences);
    const model =
      currentProvider.type === "fal" && input.referenceImages.length > 0
        ? currentProvider.referenceModel?.trim() || currentProvider.model.trim()
        : input.model.trim() || currentProvider.model.trim();
    const jobBase: GenerationJob = {
      id: jobId,
      requestHash: requestHash || undefined,
      status: "running",
      createdAt,
      prompt: input.prompt,
      providerId: currentProvider.id,
      providerName: currentProvider.name,
      model,
      input: {
        comicDramaContextSnapshot: input.comicDramaContextSnapshot ? structuredClone(input.comicDramaContextSnapshot) : undefined,
        inputFingerprint: input.inputFingerprint,
        generationAttemptId: input.generationAttemptId,
        quoteId: input.quoteId,
        quoteExpiresAt: input.quoteExpiresAt,
        idempotencyKey: input.idempotencyKey,
        priceSnapshot: input.priceSnapshot ? structuredClone(input.priceSnapshot) : undefined,
        workflowMode: input.workflowMode,
        useCase: input.useCase,
        sceneId: input.sceneId,
        assistantConversationId: input.assistantConversationId,
        promptSpec: input.promptSpec,
        prompt: input.prompt,
        model,
        size: input.size,
        n: input.n,
        quality: input.quality,
        style: input.style,
        background: effectiveBackground,
        outputFormat: input.outputFormat,
        sceneOnly: input.sceneOnly
      },
      useCase: input.useCase,
      referenceImagePaths: references.map((image) => image.path),
      outputImagePaths: [],
      boardId: input.boardId
    };
    if (!input.sceneOnly) await history.addJob(jobBase);

    try {
      const providerInput: ProviderGenerateInput = {
        clientRequestId: paidProviderClientRequestId(input),
        workflowMode: input.workflowMode,
        useCase: input.useCase,
        prompt: input.prompt,
        model,
        size: input.size,
        n: input.n,
        quality: input.quality,
        style: input.style,
        background: effectiveBackground,
        outputFormat: input.outputFormat,
        referenceImages: decodedReferences.map((image) => ({
          name: image.name,
          mimeType: image.mimeType,
          role: image.role,
          bytes: image.bytes
        }))
      };
      const result = await selectedProvider.generate(providerInput, currentProvider, apiKey);
      const completedAt = new Date().toISOString();
      const sceneResults = input.sceneOnly
        ? await sceneMedia.saveGeneration(
            input.sceneId!,
            {
              jobId,
              prompt: input.prompt,
              createdAt: completedAt,
              providerId: currentProvider.id,
              providerName: currentProvider.name,
              model
            },
            result.images
          )
        : null;
      const outputImagePaths = sceneResults
        ? sceneResults.map((sceneResult) => sceneResult.path)
        : await assets.saveOutputs(jobId, result.images);
      // 场景媒体不进素材库，无需 thumbhash。
      if (!input.sceneOnly) backfillThumbHashes(outputImagePaths);
      const completedJob: GenerationJob = {
        ...jobBase,
        status: "succeeded",
        completedAt,
        outputImagePaths
      };
      if (!input.sceneOnly) await history.updateJob(completedJob);
      // The renderer may reload while the official request is in flight. Persisting its
      // result here makes the board recoverable even when no renderer awaits the IPC reply.
      if (!input.sceneOnly && input.workflowMode === "generate" && input.boardId) {
        const generatedNodes = await createGeneratedBoardNodes(outputImagePaths, jobId);
        if (input.generationNodeId) {
          await boards.finishGenerationNode(input.boardId, input.generationNodeId, {
            jobId,
            nodes: generatedNodes
          });
        }
      }
      recordMemory({
        type: "generation_succeeded",
        surface: input.sceneId ? "scene-template" : input.workflowMode === "edit" ? "canvas-edit" : "canvas-prompt",
        boardId: input.boardId,
        sceneId: input.sceneId,
        content: input.prompt,
        jobId
      });
      showGenerationCompletedNotification({
        count: outputImagePaths.length,
        workflowMode: input.workflowMode,
        sceneOnly: input.sceneOnly,
        boardId: input.boardId,
        imagePaths: outputImagePaths
      });
      void analytics.track(input.sceneId ? "scene.generated" : input.workflowMode === "edit" ? "image.edited" : "image.generated", {
        provider: currentProvider.type,
        mode: input.workflowMode
      });

      return {
        job: completedJob,
        images: outputImagePaths.map((filePath) => ({
          path: filePath,
          dataUrl: assets.toAssetUrl(filePath)
        })),
        warnings: result.warnings,
        credits: result.credits
      };
    } catch (error) {
      const normalized = normalizeProviderError(error);
      void analytics.track("image.generation_failed", { provider: currentProvider.type, mode: input.workflowMode });
      const failedJob: GenerationJob = {
        ...jobBase,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: normalized.message
      };
      if (!input.sceneOnly) await history.updateJob(failedJob);
      if (!input.sceneOnly && input.boardId && input.generationNodeId) {
        await boards.finishGenerationNode(input.boardId, input.generationNodeId, {
          error: normalized.message
        });
      }
      recordMemory({
        type: "generation_failed",
        surface: input.sceneId ? "scene-template" : input.workflowMode === "edit" ? "canvas-edit" : "canvas-prompt",
        boardId: input.boardId,
        sceneId: input.sceneId,
        content: input.prompt,
        jobId
      });
      throw normalized;
    }
  };
  const concurrency = new Semaphore(3);
  const inFlight = new Map<string, { hash: string; promise: Promise<GenerateResponse> }>();
  return async (request: GenerateImageInput): Promise<GenerateResponse> => {
    assertGenerateImageInput(request);
    const input = { ...request, providerId: request.providerId ?? settings.getSettings().activeProviderId };
    const key = input.idempotencyKey;
    const hash = key ? generationRequestHash(input) : "";
    const current = key ? inFlight.get(key) : undefined;
    if (current) {
      if (current.hash !== hash) throw new Error("请求标识已绑定到其他生成参数，请重新发起。");
      return current.promise;
    }
    const task = concurrency.run(() => work(input, hash));
    if (key) {
      inFlight.set(key, { hash, promise: task });
      void task.finally(() => { if (inFlight.get(key)?.promise === task) inFlight.delete(key); }).catch(() => undefined);
    }
    return task;
  };
}
