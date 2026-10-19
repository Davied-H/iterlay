import { vi } from "vitest";
import type { GenerateImageInput } from "../../shared/types";
import { createImageGenerationController, type GenerationControllerDependencies } from "../../src/features/generation/create-generation-controller";
import type { GenerationQueue } from "../../src/lib/generation-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// Execute the production submission function with controlled asynchronous boundaries.
export function generationHarness(official = true, queue?: GenerationQueue) {
  const quote = deferred<object>();
  const asset = deferred<string>();
  const completion = deferred<object>();
  const activeBoardRef = { current: { id: "a", name: "A" } };
  const boardOpenSequenceRef = { current: 1 };
  const setImages = vi.fn();
  const setInput = vi.fn();
  const enqueue = vi.fn((id: string) => queue?.enqueue(id) ?? ({ queued: false, ready: Promise.resolve(), cancel: () => false }));
  const generateImage = vi.fn<(input: GenerateImageInput) => Promise<object>>(() => completion.promise);
  const appendBoardNodes = vi.fn(async () => undefined);
  const paidGenerationMetadata = vi.fn(() => quote.promise);
  const readAssetDataUrl = vi.fn(() => asset.promise);
  const api = { generateImage, readAssetDataUrl, appendBoardNodes };
  const bindings = {
    inputRef: { current: { prompt: "test", model: "test", size: "1024x1024", n: 1, workflowMode: "generate", referenceImages: [] } },
    getBlockedGenerateMessage: () => null,
    getWorkbenchApi: () => api,
    activeBoardRef,
    boardOpenSequenceRef,
    imagesRef: { current: [{ id: "edit", path: "original.png", dataUrl: "asset://original" }] },
    editTargetId: "edit",
    activeProvider: { model: "gpt-image-1", type: "openai-compatible" },
    activeProviderId: "provider",
    isOfficialProvider: official,
    generationFingerprint: async () => "fingerprint",
    paidGenerationMetadata,
    dataUrlToReferencePayload: () => ({ id: "reference" }),
    generationQueueRef: { current: { enqueue, release: vi.fn((id: string) => queue?.release(id)) } },
    parseSizeDimensions: () => null,
    canvasStateRef: { current: { positions: {}, connections: [] } },
    workflowNodesRef: { current: [] },
    setFocusTarget: vi.fn(),
    setActiveGenerations: vi.fn(),
    setActiveBoardGenerations: vi.fn(),
    setCanvasConnectionsVersion: vi.fn(),
    setCreditStatus: vi.fn(),
    setStatus: vi.fn(),
    window: { setTimeout: () => 1, clearTimeout: vi.fn() },
    loadImageSize: async () => ({ width: 512, height: 512 }),
    boardDetailCacheRef: { current: new Map() },
    refreshBoards: vi.fn(),
    refreshHistory: vi.fn(),
    locateGenerationResult: vi.fn(),
    updateWorkflowNode: vi.fn(),
    persistBoard: vi.fn(async () => undefined),
    triggerParticleBurst: vi.fn(),
    creditStatus: null,
    licenseStatus: null,
    openLicenseActivation: vi.fn(),
    iterlayToast: { result: vi.fn(), dismiss: vi.fn(), balance: vi.fn(), generationPending: vi.fn(), partial: vi.fn() },
    setImages,
    setInput,
    toast: { error: vi.fn(), warning: vi.fn() }
  };
  // The bridge and state setters are intentionally narrow fakes; execute the
  // imported production controller rather than extracting source from App.tsx.
  const generate = createImageGenerationController(bindings as unknown as GenerationControllerDependencies);
  return { generate, quote, asset, completion, activeBoardRef, boardOpenSequenceRef, setImages, setInput,
    enqueue, generateImage, appendBoardNodes, paidGenerationMetadata, readAssetDataUrl,
    setStatus: bindings.setStatus, setActiveBoardGenerations: bindings.setActiveBoardGenerations, toast: bindings.toast };
}

