import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaidMediaQuoteService } from "../electron/paid-media-quote.js";
import { VideoSequenceStore, freezeSequenceImage } from "../electron/storage/video-sequence-store.js";

type IpcHandler = (...args: unknown[]) => unknown;
const electronMocks = vi.hoisted(() => ({ handlers: new Map<string, IpcHandler>() }));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] }, dialog: { showSaveDialog: vi.fn() },
  ipcMain: { handle: (channel: string, handler: IpcHandler) => electronMocks.handlers.set(channel, handler), removeHandler: (channel: string) => electronMocks.handlers.delete(channel) }
}));

describe("paid video sequence IPC", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-paid-sequence-")); electronMocks.handlers.clear(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("reserves an authoritative quote before task creation and replays the original batch", async () => {
    const { registerVideoSequenceIpc } = await import("../electron/video/video-sequence-ipc.js");
    const store = new VideoSequenceStore(dir);
    const sources = await Promise.all(["a", "b", "c"].map(async (name) => {
      const imagePath = path.join(dir, `${name}.png`);
      await writeFile(imagePath, name);
      return freezeSequenceImage({ imagePath, sha256: "" });
    }));
    const sequence = await store.createSequence({ boardId: "board", sources, defaults: { providerId: "official-video" } });
    const scheduler = { enqueue: vi.fn() };
    const quotes = new PaidMediaQuoteService();
    const settings = {
      activeVideoProviderId: "official-video",
      videoProviders: [{ id: "official-video", name: "Official", type: "official", model: sequence.defaults.model }]
    };
    const registration = registerVideoSequenceIpc({
      store, templates: { list: vi.fn().mockResolvedValue([]) }, scheduler, ffmpeg: {},
      boards: { getBoard: vi.fn(), saveBoard: vi.fn() },
      assets: { readManagedBytes: vi.fn(async () => Buffer.from("image")), toAssetUrl: (value: string) => `asset:${value}`, exportAsset: vi.fn() },
      settings: { getSettings: () => settings }, paidMediaQuotes: quotes
    } as never);
    const selected = sequence.segments;
    const fingerprintItems = selected.map((segment) => ({
      id: segment.id, segmentRevision: segment.desiredRevision, inputFingerprint: segment.inputFingerprint,
      providerId: segment.config.providerId ?? sequence.defaults.providerId,
      durationSeconds: segment.config.durationSeconds ?? sequence.defaults.durationSeconds
    }));
    const inputFingerprint = createHash("sha256").update(JSON.stringify(fingerprintItems)).digest("hex");
    const clientRequestId = crypto.randomUUID();
    const pricingKey = JSON.stringify(selected.map((segment) => ({
      providerId: segment.config.providerId ?? settings.activeVideoProviderId,
      model: segment.config.model ?? sequence.defaults.model,
      durationSeconds: segment.config.durationSeconds ?? sequence.defaults.durationSeconds,
      resolution: segment.config.resolution ?? sequence.defaults.resolution,
      generateAudio: (segment.config.generateAudio ?? sequence.defaults.generateAudio) === true
    })));
    const quote = await quotes.issue({
      clientRequestId, inputFingerprint, providerKey: "official-video,official-video", stage: "video",
      amount: 10, currency: "gold-bean", balance: 20, pricingKey,
      boardId: "board", requestScope: sequence.id, purpose: "video", operation: "videoSequence:run"
    });
    const run = electronMocks.handlers.get("videoSequence:run")!;
    await expect(run({}, { boardId: "board", sequenceId: sequence.id, expectedRevision: sequence.revision, scope: "all" })).rejects.toThrow("报价");
    expect(await store.listTasks(sequence.id)).toEqual([]);
    expect(scheduler.enqueue).not.toHaveBeenCalled();
    const metadata = {
      generationAttemptId: clientRequestId, inputFingerprint, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt,
      idempotencyKey: [clientRequestId, inputFingerprint, quote.quoteId].join(":"), priceSnapshot: quote.priceSnapshot,
      quoteBoardId: "board", quoteRequestScope: sequence.id, quotePurpose: "video", quoteOperation: "videoSequence:run"
    };
    const first = await run({}, { boardId: "board", sequenceId: sequence.id, expectedRevision: sequence.revision, scope: "all", ...metadata }) as { jobs: Array<{ id: string }> };
    await store.mutateSequence("board", sequence.id, sequence.revision, (draft) => { draft.name = "changed after submit"; });
    const replay = await run({}, { boardId: "board", sequenceId: sequence.id, expectedRevision: sequence.revision, scope: "all", ...metadata }) as { jobs: Array<{ id: string }> };
    expect(first.jobs).toHaveLength(2);
    expect(replay.jobs.map((job) => job.id)).toEqual(first.jobs.map((job) => job.id));
    expect(await store.listTasks(sequence.id)).toHaveLength(2);
    expect(scheduler.enqueue).toHaveBeenCalledOnce();
    registration.dispose();
  });
});
