import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceCommands } from "../electron/application/workspace-commands";
import type { WorkspaceApi } from "../electron/application/workbench-api";
import { workspaceFixture } from "./helpers/workspace-fixture";
describe("typed workspace image tasks", () => {
  it("generates with user-owned provider and stores results outside the renderer", async () => {
    const f = workspaceFixture();
    const task = await f.commands.call("generate_image", { boardId: "board", prompt: "test" }) as { generationId: string; status: string };
    expect(task.status).toBe("running");
    await vi.waitFor(() => expect(f.mocks.appendBoardNodes).toHaveBeenCalledOnce());
    await vi.waitFor(async () => {
      expect(await f.commands.call("get_generation_status", { generationId: task.generationId })).toMatchObject({ status: "succeeded" });
    });
    expect(f.mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({ providerId: "custom", n: 1, background: "auto" }));
    expect(f.flush).toHaveBeenCalledTimes(2);
  });
  it("rejects obsolete official provider before submitting", async () => {
    const f = workspaceFixture();
    f.mocks.getSettings.mockResolvedValue({ activeProviderId: "official", providers: [{ id: "official", type: "official" }] });
    await expect(f.commands.call("generate_image", { boardId: "board", prompt: "test" })).rejects.toThrow("自有");
    expect(f.mocks.generateImage).not.toHaveBeenCalled();
  });
  it("validates an edit target and appends versions to the captured node", async () => {
    const f = workspaceFixture();
    await expect(f.commands.call("edit_image", { boardId: "board", sourcePath: "/other.png", prompt: "test" })).rejects.toThrow("编辑目标");
    const task = await f.commands.call("edit_image", { boardId: "board", sourcePath: "/managed/source.png", prompt: "test" }) as { generationId: string };
    await vi.waitFor(() => expect(f.mocks.appendBoardNodeVersions).toHaveBeenCalledWith("board", "image", expect.any(Array)));
    expect(f.mocks.appendBoardNodes).not.toHaveBeenCalled();
    await vi.waitFor(async () => expect(await f.commands.call("get_generation_status", { generationId: task.generationId })).toMatchObject({ status: "succeeded" }));
  });
  it("records background failures and never reports them as succeeded", async () => {
    const f = workspaceFixture();
    f.mocks.generateImage.mockRejectedValue(new Error("provider unavailable"));
    const task = await f.commands.call("generate_image", { boardId: "board", prompt: "test" }) as { generationId: string };
    await vi.waitFor(async () => expect(await f.commands.call("get_generation_status", { generationId: task.generationId })).toMatchObject({ status: "failed", error: "provider unavailable" }));
  });
  it("loads completed operation metadata after constructing a new runtime", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-mcp-task-"));
    try {
      const f = workspaceFixture();
      const api = f.mocks as unknown as WorkspaceApi;
      const commands = new WorkspaceCommands({ api, emit: f.emit, flush: f.flush, taskDirectory: directory });
      const task = await commands.call("generate_image", { boardId: "board", prompt: "test" }) as { generationId: string };
      await vi.waitFor(async () => expect(await commands.call("get_generation_status", { generationId: task.generationId })).toMatchObject({ status: "succeeded" }));
      const resumed = new WorkspaceCommands({ api, emit: f.emit, flush: f.flush, taskDirectory: directory });
      await vi.waitFor(async () => expect(await resumed.call("get_generation_status", { generationId: task.generationId })).toMatchObject({ status: "succeeded", previewImageDataUrls: ["data:image/png;base64,AA=="] }));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("deduplicates concurrent image submissions and rejects changed parameters", async () => {
    const f = workspaceFixture();
    const args = { boardId: "board", prompt: "test", requestId: "stable-request" };
    const [first, second] = await Promise.all([f.commands.call("generate_image", args), f.commands.call("generate_image", args)]);
    expect(first).toMatchObject({ generationId: "stable-request" });
    expect(second).toMatchObject({ generationId: "stable-request" });
    await vi.waitFor(() => expect(f.mocks.generateImage).toHaveBeenCalledOnce());
    await expect(f.commands.call("generate_image", { ...args, prompt: "changed" })).rejects.toThrow("不同参数");
    expect(f.mocks.generateImage).toHaveBeenCalledOnce();
  });
  it("returns a provider projection without secrets or raw settings", async () => {
    const f = workspaceFixture();
    f.mocks.getSettings.mockResolvedValue({ activeProviderId: "custom", providers: [{ id: "custom", name: "My service", type: "openai-compatible", model: "fixture", apiKey: "secret" }], providerKeyStatus: { custom: true }, encryptedApiKeys: { custom: "encrypted" } });
    const response = await f.commands.call("list_providers", { kind: "image" });
    expect(response).toEqual([expect.objectContaining({ id: "custom", isDefault: true, authConfigured: true })]);
    expect(JSON.stringify(response)).not.toContain("secret");
    expect(JSON.stringify(response)).not.toContain("encrypted");
  });

});
