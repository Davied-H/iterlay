import type {
  GenerateImageInput,
  GenerationJob,
  ImageGenerationInputSnapshot,
  ProviderConfig,
  ReferenceImagePayload,
  StoredReferenceImage
} from "./types.js";

/** Explicitly copy the public image input contract. Runtime extras must never persist credentials. */
export function createGenerationInputSnapshot(
  input: GenerateImageInput,
  references: StoredReferenceImage[]
): ImageGenerationInputSnapshot {
  return structuredClone({
    version: 1,
    input: {
      workflowMode: input.workflowMode,
      creationMode: input.creationMode,
      useCase: input.useCase,
      sceneId: input.sceneId,
      promptSpec: input.promptSpec,
      prompt: input.prompt,
      model: input.model,
      size: input.size,
      n: input.n,
      quality: input.quality,
      style: input.style,
      background: input.background,
      outputFormat: input.outputFormat,
      boardId: input.boardId,
      generationNodeId: input.generationNodeId,
      assistantConversationId: input.assistantConversationId,
      providerId: input.providerId,
      sceneOnly: input.sceneOnly,
      editSource: input.editSource,
      historySourceJobId: input.historySourceJobId
    },
    references: references.map((reference, index) => ({
      id: reference.id,
      name: reference.name,
      mimeType: reference.mimeType,
      path: reference.path,
      role: reference.role ?? input.referenceImages[index]?.role,
      semanticRole: reference.semanticRole ?? input.referenceImages[index]?.semanticRole,
      sourceNodeId: reference.sourceNodeId ?? input.referenceImages[index]?.sourceNodeId
    }))
  });
}

export interface RestoredGenerationHistory {
  input: GenerateImageInput;
  providerId?: string;
  /** Older records lack names/roles; disclose the limitation rather than claiming an exact restore. */
  warnings: string[];
}

function referenceFromDataUrl(
  reference: StoredReferenceImage,
  dataUrl: string,
  index: number
): ReferenceImagePayload {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) throw new Error(`无法还原参考图“${reference.name || index + 1}”：图片内容不可读取。`);
  return {
    id: reference.id || `history-reference-${index}`,
    name: reference.name || `参考图 ${index + 1}`,
    mimeType: match[1],
    dataBase64: match[2].replace(/[\r\n]/g, ""),
    role: reference.role,
    semanticRole: reference.semanticRole,
    sourceNodeId: reference.sourceNodeId
  };
}

/** Resolve every asset before changing the composer. Missing inputs never become a different task. */
export async function restoreGenerationHistoryJob(
  job: GenerationJob,
  readAssetDataUrl: (path: string) => Promise<string>,
  providers: Pick<ProviderConfig, "id" | "model" | "referenceModel">[]
): Promise<RestoredGenerationHistory> {
  const snapshot = job.inputSnapshot?.version === 1 ? job.inputSnapshot : undefined;
  const original = snapshot?.input ?? job.input;
  const workflowMode = original.workflowMode;
  if (workflowMode !== "edit" && workflowMode !== "generate") throw new Error("这条历史缺少明确的任务类型，请仅复用提示词。");
  const providerId = original.providerId ?? job.providerId;
  let restoredProviderId = providerId;
  if (providerId && !providers.some((provider) => provider.id === providerId)) {
    throw new Error("原任务使用的 Provider 已删除，请先恢复配置，或仅复用提示词。");
  }
  if (!providerId) {
    const candidates = providers.filter((provider) => provider.model === original.model || provider.referenceModel === original.model);
    if (candidates.length !== 1) throw new Error("这条旧历史无法确定原 Provider，请仅复用提示词，或先恢复原配置。");
    restoredProviderId = candidates[0].id;
  }
  const warnings: string[] = [];
  const storedReferences: StoredReferenceImage[] = snapshot?.references ?? (job.referenceImagePaths ?? []).map((path, index) => ({
    id: `${job.id}-reference-${index}`,
    name: workflowMode === "edit" && index === 0 ? "编辑源图（旧记录）" : `参考图 ${index + 1}（旧记录）`,
    mimeType: "",
    role: workflowMode === "edit" && index === 0 ? "edit-target" : "reference",
    path
  }));
  if (!snapshot) warnings.push("旧记录未保存参考图名称和职责；已按原始顺序恢复，请核对后提交。");
  if (workflowMode === "edit" && !storedReferences.some((reference) => reference.role === "edit-target")) {
    throw new Error("这条编辑历史缺少明确的编辑源图，无法还原；可以仅复用提示词。");
  }
  const referenceImages: ReferenceImagePayload[] = [];
  for (const [index, reference] of storedReferences.entries()) {
    let dataUrl: string;
    try { dataUrl = await readAssetDataUrl(reference.path); }
    catch { throw new Error(`无法还原参考图“${reference.name || index + 1}”：源文件已丢失或不可读取。原输入未改动。`); }
    referenceImages.push(referenceFromDataUrl(reference, dataUrl, index));
  }
  const editReference = storedReferences.find((reference) => reference.role === "edit-target");
  // Deliberately whitelist replayable settings: quote/idempotency/paid-attempt identities and
  // generationNodeId belong to the original request and must not be replayed.
  const input: GenerateImageInput = {
    workflowMode,
    creationMode: original.creationMode,
    useCase: original.useCase ?? job.useCase,
    sceneId: original.sceneId,
    promptSpec: original.promptSpec ? structuredClone(original.promptSpec) : undefined,
    prompt: original.prompt ?? job.prompt,
    model: original.model || job.model || "",
    size: original.size,
    n: original.n,
    quality: original.quality,
    style: original.style,
    background: original.background,
    outputFormat: original.outputFormat,
    providerId: restoredProviderId,
    historySourceJobId: job.id,
    editSource: workflowMode === "edit" && editReference ? {
      ...original.editSource,
      // The managed copy is the exact submitted image, including advanced-edit masks/annotations.
      imagePath: editReference.path
    } : undefined,
    referenceImages
  };
  return { input, providerId: restoredProviderId, warnings };
}

/** Copy only the prompt and its structured text; keep the current target, model and references. */
export function reuseGenerationHistoryPrompt(current: GenerateImageInput, job: GenerationJob): GenerateImageInput {
  const source = job.inputSnapshot?.version === 1 ? job.inputSnapshot.input : job.input;
  return {
    ...current,
    prompt: source.prompt ?? job.prompt,
    promptSpec: source.promptSpec ? structuredClone(source.promptSpec) : undefined
  };
}

/** Keep restore references portable when a board archive assigns new asset/node identities. */
export function remapGenerationHistorySnapshot(
  snapshot: ImageGenerationInputSnapshot | undefined,
  mapPath: (path: string) => string,
  identities?: { boardId?: string; nodeIds?: Map<string, string>; jobIds?: Map<string, string> }
): ImageGenerationInputSnapshot | undefined {
  if (!snapshot) return undefined;
  const remapNode = (id: string | undefined): string | undefined => id ? identities?.nodeIds?.get(id) ?? id : undefined;
  return {
    version: 1,
    input: {
      ...snapshot.input,
      boardId: identities?.boardId ?? snapshot.input.boardId,
      generationNodeId: remapNode(snapshot.input.generationNodeId),
      editSource: snapshot.input.editSource ? {
        ...snapshot.input.editSource,
        imagePath: mapPath(snapshot.input.editSource.imagePath),
        boardId: identities?.boardId ?? snapshot.input.editSource.boardId,
        nodeId: remapNode(snapshot.input.editSource.nodeId),
        jobId: snapshot.input.editSource.jobId ? identities?.jobIds?.get(snapshot.input.editSource.jobId) ?? snapshot.input.editSource.jobId : undefined
      } : undefined
    },
    references: snapshot.references.map((reference) => ({
      ...reference,
      path: mapPath(reference.path),
      sourceNodeId: remapNode(reference.sourceNodeId)
    }))
  };
}
