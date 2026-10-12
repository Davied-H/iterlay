import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { GenerateImageInput } from "../shared/types";
import type { GeneratedImage } from "../src/components/canvas/image-node-model";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const start = app.indexOf("  async function generate(");
const end = app.indexOf("\n  function createWorkflowNode(", start);
const compiled = ts.transpileModule(app.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// Execute the production submission function with controlled asynchronous boundaries.
function harness(official = true) {
  const quote = deferred<object>();
  const asset = deferred<string>();
  const completion = deferred<object>();
  const activeBoardRef = { current: { id: "a", name: "A" } };
  const boardOpenSequenceRef = { current: 1 };
  const setImages = vi.fn();
  const setInput = vi.fn();
  const enqueue = vi.fn(() => ({ queued: false, ready: Promise.resolve() }));
  const generateImage = vi.fn<(input: GenerateImageInput) => Promise<object>>(() => completion.promise);
  const appendBoardNodes = vi.fn(async () => undefined);
  const paidGenerationMetadata = vi.fn(() => quote.promise);
  const readAssetDataUrl = vi.fn(() => asset.promise);
  const api = { generateImage, readAssetDataUrl, appendBoardNodes };
  const bindings = {
    inputRef: { current: { prompt: "test", n: 1, workflowMode: "generate", referenceImages: [] } },
    getBlockedGenerateMessage: () => null,
    getWorkbenchApi: () => api,
    activeBoardRef,
    boardOpenSequenceRef,
    imagesRef: { current: [{ id: "edit", path: "original.png", dataUrl: "asset://original" }] },
    editTargetId: "edit",
    providerSupportsTransparentBackground: () => true,
    activeProvider: { model: "test" },
    activeProviderId: "provider",
    isOfficialProvider: official,
    generationFingerprint: async () => "fingerprint",
    parseGptImageSize: (size: unknown) => size,
    paidGenerationMetadata,
    dataUrlToReferencePayload: () => ({ id: "reference" }),
    generationQueueRef: { current: { enqueue, release: vi.fn() } },
    parseSizeDimensions: () => undefined,
    canvasStateRef: { current: { positions: {}, connections: [] } },
    workflowNodesRef: { current: [] },
    setFocusTarget: vi.fn(),
    setActiveGenerations: vi.fn(),
    setActiveBoardGenerations: vi.fn(),
    setStatus: vi.fn(),
    window: { setTimeout: () => 1, clearTimeout: vi.fn() },
    GENERATION_ESTIMATE_MS: 60_000,
    loadImageSize: async () => ({ width: 512, height: 512 }),
    boardDetailCacheRef: { current: new Map() },
    refreshBoards: vi.fn(),
    refreshHistory: vi.fn(),
    iterlayToast: { result: vi.fn(), dismiss: vi.fn() },
    setImages,
    setInput,
    toast: { error: vi.fn() }
  };
  const generate = new Function(...Object.keys(bindings), `${compiled}\nreturn generate;`)(
    ...Object.values(bindings)
  ) as (rect?: undefined, input?: Partial<GenerateImageInput>, options?: object) => Promise<GeneratedImage[]>;
  return { generate, quote, asset, completion, activeBoardRef, boardOpenSequenceRef, setImages, setInput,
    enqueue, generateImage, appendBoardNodes, paidGenerationMetadata, readAssetDataUrl };
}

describe("generation board isolation", () => {
  it("rejects an explicit destination instead of silently replacing it with the current board", async () => {
    const h = harness();
    expect(await h.generate(undefined, { boardId: "b" })).toEqual([]);
    expect(h.paidGenerationMetadata).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.generateImage).not.toHaveBeenCalled();
  });

  it.each(["different board", "switch away and back"])("does not submit after a quote resolves on %s", async (scenario) => {
    const h = harness();
    const result = h.generate(undefined, {}, { skipOfficialCreditCheck: true });
    await vi.waitFor(() => expect(h.paidGenerationMetadata).toHaveBeenCalledOnce());
    h.boardOpenSequenceRef.current += 1;
    if (scenario === "different board") h.activeBoardRef.current = { id: "b", name: "B" };
    h.quote.resolve({});
    expect(await result).toEqual([]);
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.generateImage).not.toHaveBeenCalled();
    expect(h.setImages).not.toHaveBeenCalled();
    expect(h.setInput).not.toHaveBeenCalled();
  });

  it("does not insert edit state into another board while reading the original image", async () => {
    const h = harness(false);
    const result = h.generate(undefined, { workflowMode: "edit" });
    expect(h.readAssetDataUrl).toHaveBeenCalledWith("original.png");
    h.activeBoardRef.current = { id: "b", name: "B" };
    h.asset.resolve("data:image/png;base64,AA==");
    expect(await result).toEqual([]);
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.generateImage).not.toHaveBeenCalled();
    expect(h.setImages).not.toHaveBeenCalled();
    expect(h.setInput).not.toHaveBeenCalled();
  });

  it("updates imperative board and image refs before publishing React state", () => {
    const open = app.slice(app.indexOf("  const openBoard ="), app.indexOf("  const notifyVideoJob ="));
    expect(open.indexOf("activeBoardRef.current = openedBoard;")).toBeGreaterThan(0);
    expect(open.indexOf("imagesRef.current = restored;")).toBeGreaterThan(0);
    expect(open.indexOf("activeBoardRef.current = openedBoard;")).toBeLessThan(open.indexOf("setActiveBoard(openedBoard)"));
    expect(open.indexOf("imagesRef.current = restored;")).toBeLessThan(open.indexOf("setImages(restored)"));
  });

  it("keeps an already submitted result on its original board after switching", async () => {
    const h = harness(false);
    const result = h.generate(undefined, { boardId: "a" });
    await vi.waitFor(() => expect(h.generateImage).toHaveBeenCalledOnce());
    expect(h.generateImage.mock.calls[0]?.[0]).toMatchObject({ boardId: "a" });
    h.activeBoardRef.current = { id: "b", name: "B" };
    h.setImages.mockClear();
    h.setInput.mockClear();
    h.completion.resolve({
      job: { id: "job-a" },
      images: [{ path: "generated-a.png", dataUrl: "data:image/png;base64,AA==" }]
    });
    expect(await result).toMatchObject([{ path: "generated-a.png", jobId: "job-a" }]);
    expect(h.appendBoardNodes).toHaveBeenCalledWith("a", [
      expect.objectContaining({ imagePath: "generated-a.png", jobId: "job-a" })
    ]);
    expect(h.setImages).not.toHaveBeenCalled();
    expect(h.setInput).not.toHaveBeenCalled();
  });

  it("passes the captured board from delayed generation entry points", () => {
    const chat = app.slice(app.indexOf("  async function createFromChat("), app.indexOf("  async function prepareCharacterGeneration("));
    const node = app.slice(app.indexOf("  async function runGenerationNode("), app.indexOf("  async function runVideoGenerationNode("));
    expect(chat).toContain("generate(undefined, {\n        boardId: target.id,");
    expect(node).toContain("generate(undefined, {\n        boardId: originBoardId,");
  });
});
