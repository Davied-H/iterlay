import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { McpCommands } from "../electron/application/mcp-commands";
import type { McpWorkbenchApi } from "../electron/application/workbench-api";
import { mcpFixture } from "./helpers/mcp-fixture";
describe("typed MCP image tasks", () => {
  it("generates with user-owned provider and stores results outside the renderer", async () => {
    const f = mcpFixture();
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
    const f = mcpFixture();
    f.mocks.getSettings.mockResolvedValue({ activeProviderId: "official", providers: [{ id: "official", type: "official" }] });
    await expect(f.commands.call("generate_image", { boardId: "board", prompt: "test" })).rejects.toThrow("自有");
    expect(f.mocks.generateImage).not.toHaveBeenCalled();
  });
  it("validates an edit target and appends versions to the captured node", async () => {
    const f = mcpFixture();
    await expect(f.commands.call("edit_image", { boardId: "board", sourcePath: "/other.png", prompt: "test" })).rejects.toThrow("编辑目标");
    const task = await f.commands.call("edit_image", { boardId: "board", sourcePath: "/managed/source.png", prompt: "test" }) as { generationId: string };
    await vi.waitFor(() => expect(f.mocks.appendBoardNodeVersions).toHaveBeenCalledWith("board", "image", expect.any(Array)));
    expect(f.mocks.appendBoardNodes).not.toHaveBeenCalled();
    await vi.waitFor(async () => expect(await f.commands.call("get_generation_status", { generationId: task.generationId })).toMatchObject({ status: "succeeded" }));
  });
  it("records background failures and never reports them as succeeded", async () => {
    const f = mcpFixture();
    f.mocks.generateImage.mockRejectedValue(new Error("provider unavailable"));
    const task = await f.commands.call("generate_image", { boardId: "board", prompt: "test" }) as { generationId: string };
    await vi.waitFor(async () => expect(await f.commands.call("get_generation_status", { generationId: task.generationId })).toMatchObject({ status: "failed", error: "provider unavailable" }));
  });
  it("loads completed operation metadata after constructing a new runtime", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-mcp-task-"));
    try {
      const f = mcpFixture();
      const api = f.mocks as unknown as McpWorkbenchApi;
      const commands = new McpCommands({ api, emit: f.emit, flush: f.flush, taskDirectory: directory });
      const task = await commands.call("generate_image", { boardId: "board", prompt: "test" }) as { generationId: string };
      await vi.waitFor(async () => expect(await commands.call("get_generation_status", { generationId: task.generationId })).toMatchObject({ status: "succeeded" }));
      const resumed = new McpCommands({ api, emit: f.emit, flush: f.flush, taskDirectory: directory });
      await vi.waitFor(async () => expect(await resumed.call("get_generation_status", { generationId: task.generationId })).toMatchObject({ status: "succeeded", mcpImageDataUrls: ["data:image/png;base64,AA=="] }));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
