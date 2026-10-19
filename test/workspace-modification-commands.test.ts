import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceCommands, type GenerationRecord } from "../electron/application/workspace-commands";
import type { WorkspaceApi } from "../electron/application/workbench-api";
import { createImageGenerationCommand, type ImageGenerationDependencies } from "../electron/application/image-generation";
import { ModificationRequests } from "../electron/application/modification-requests";
import { ModificationRequestStore } from "../electron/storage/modification-request-store";
import { AssetStore } from "../electron/storage/asset-store";
import { BoardStore } from "../electron/storage/board-store";
import { HistoryStore } from "../electron/storage/history-store";
import { isBoardImageNode, type ProviderConfig } from "../shared/types";
import { workspaceFixture } from "./helpers/workspace-fixture";

vi.mock("../electron/system-notification.js", () => ({ showGenerationCompletedNotification: vi.fn() }));

describe("workspace annotation-request completion events", () => {
  it.each([undefined, "unrelated-board"])("uses the stored board identity when the caller supplies %s", async (callerBoardId) => {
    const f = workspaceFixture();
    const request = { id: "request", boardId: "actual-board", status: "claimed" };
    f.mocks.getModificationRequest.mockResolvedValue(request);
    f.mocks.finishModificationRequest.mockResolvedValue({ ...request, status: "succeeded" });
    const args = {
      requestId: request.id, claimToken: "owner-token", resultJobId: "job", resultPaths: ["/managed/result.png"],
      ...(callerBoardId ? { boardId: callerBoardId } : {})
    };
    await f.commands.call("finish_modification_request", args);
    expect(f.mocks.getModificationRequest).toHaveBeenCalledWith(request.id);
    expect(f.mocks.finishModificationRequest).toHaveBeenCalledWith({
      id: request.id, claimToken: "owner-token", resultJobId: "job", resultPaths: ["/managed/result.png"], error: undefined
    });
    expect(f.emit).toHaveBeenCalledOnce();
    expect(f.emit).toHaveBeenCalledWith({ type: "board-updated", boardId: request.boardId });
    expect(args).toEqual({
      requestId: request.id, claimToken: "owner-token", resultJobId: "job", resultPaths: ["/managed/result.png"],
      ...(callerBoardId ? { boardId: callerBoardId } : {})
    });
  });
});

describe("workspace annotation-request paid execution", () => {
  it("pins the requested source and coalesces two operation IDs into one paid job and one result append", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-workspace-modifications-"));
    try {
      const boards = new BoardStore(directory), assets = new AssetStore(directory), history = new HistoryStore(directory);
      const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=", "base64");
      const [source] = await assets.saveOutputs("source", [{ bytes, mimeType: "image/png" }]);
      const board = await boards.createBoard("Annotation handoff");
      await boards.appendNodes(board.id, [{ id: "image", imagePath: source, jobId: "source-v1", source: "generated" }]);
      const service = new ModificationRequests(new ModificationRequestStore(directory), boards, assets, history);
      const request = await service.create({
        boardId: board.id, nodeId: "image", sourcePath: source, sourceVersionId: "source-v1", instruction: "Make the grille green",
        regions: [{ kind: "rect", x: 0.2, y: 0.2, width: 0.4, height: 0.4 }], annotationDataUrl: `data:image/png;base64,${bytes.toString("base64")}`
      });
      const claimed = await service.claim(request.id, "codex-owner");
      const [v2] = await assets.saveOutputs("other-version", [{ bytes, mimeType: "image/png" }]);
      await boards.appendVersions(board.id, "image", [{ imagePath: v2, jobId: "source-v2" }]);
      const provider: ProviderConfig = {
        id: "custom", name: "Offline fixture", type: "openai-compatible", baseUrl: "https://fixture.invalid",
        generationEndpoint: "/v1/images/generations", model: "gpt-image-1", supportsReferenceImages: true
      };
      const settings = { getSettings: () => ({ activeProviderId: provider.id, providers: [provider] }), getApiKey: () => "fixture-only" };
      const providerGenerate = vi.fn(async () => ({ images: [{ bytes, mimeType: "image/png" }] }));
      const imageGeneration = createImageGenerationCommand({
        settings, assets, history, boards, getProviderAdapter: () => ({ generate: providerGenerate }),
        recordMemory: vi.fn(), sceneMedia: {}, analytics: { track: async () => undefined },
        backfillThumbHashes: vi.fn(), createGeneratedBoardNodes: async () => []
      } as unknown as ImageGenerationDependencies);
      const f = workspaceFixture();
      const api = {
        ...f.mocks,
        getSettings: async () => settings.getSettings(), getBoard: (id: string) => boards.getBoard(id),
        readAssetDataUrl: (file: string) => assets.readManagedDataUrl(file), generateImage: imageGeneration,
        listHistory: () => history.listJobs(),
        getModificationRequest: (id: string) => service.get(id),
        prepareModificationRequest: (id: string, token: string) => service.prepare(id, token),
        finishModificationRequest: (input: Parameters<ModificationRequests["finish"]>[0]) => service.finish(input)
      } as unknown as WorkspaceApi;
      const commands = new WorkspaceCommands({ api, emit: f.emit, flush: f.flush });
      const args = {
        boardId: board.id, sourcePath: source, prompt: request.instruction,
        modificationRequestId: request.id, claimToken: claimed.claim!.token
      };
      await expect(commands.call("edit_image", { ...args, sourcePath: v2, requestId: "wrong-source" })).rejects.toThrow("固定源版本");
      expect(providerGenerate).not.toHaveBeenCalled();
      const operations = await Promise.all(["operation-one", "operation-two"].map(requestId => commands.call("edit_image", { ...args, requestId }))) as GenerationRecord[];
      await vi.waitFor(async () => {
        for (const operation of operations) expect(await commands.call("get_generation_status", { generationId: operation.generationId })).toMatchObject({ status: "succeeded" });
      });
      expect(providerGenerate).toHaveBeenCalledOnce();
      const jobs = await history.listJobs(board.id);
      expect(jobs).toHaveLength(1);
      const job = jobs[0];
      const prepared = await service.prepare(request.id, claimed.claim!.token);
      expect(job.input).toMatchObject({
        idempotencyKey: prepared.executionKey, modificationRequestId: request.id,
        editSource: { nodeId: "image", boardId: board.id, imagePath: source, jobId: "source-v1" }
      });
      expect(f.mocks.appendBoardNodeVersions).not.toHaveBeenCalled();
      const finish = { requestId: request.id, claimToken: claimed.claim!.token, resultJobId: job.id, resultPaths: job.outputImagePaths };
      expect(await commands.call("finish_modification_request", finish)).toMatchObject({ status: "succeeded" });
      await expect(commands.call("finish_modification_request", finish)).rejects.toThrow("接手凭证");
      const updated = await boards.getBoard(board.id);
      const image = updated!.nodes.find(isBoardImageNode)!;
      expect(image.versions?.filter(version => version.imagePath === job.outputImagePaths[0])).toHaveLength(1);
      expect(f.emit).toHaveBeenLastCalledWith({ type: "board-updated", boardId: board.id });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
