import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AssistantConversationStore } from "../electron/storage/assistant-conversation-store";
import { agentMediaTaskFromTool, artifactUrl, artifactsFromBoard, makeCreationSession, mergeCreationTool } from "../src/lib/creation-workspace";
import type { BoardDetail } from "../shared/types";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("creation workspace persistence", () => {
  it("keeps a resumable session without writing reference pixels", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "iterlay-creation-"));
    directories.push(directory);
    const store = new AssistantConversationStore(directory);
    const session = makeCreationSession("aaaabbbb-1111-2222-3333-444455556666");
    session.title = "咖啡品牌系列";
    session.projectId = "project-1";
    session.draft = "调整第二张";
    session.queued = ["视频完成后再生成竖版封面"];
    session.references = [{ id: "r", kind: "upload", role: "reference", name: "咖啡.png", mimeType: "image/png", imagePath: "/managed/reference.png", previewUrl: "iterlay-asset://local/token", dataBase64: "private-pixels" }];
    session.artifacts = [{ id: "a", kind: "image", boardId: "b", boardName: "咖啡", path: "/managed/output.png", prompt: "海报", status: "ready", createdAt: session.createdAt }];
    session.events = [{ id: "e", kind: "run", runId: "run", status: "completed", label: "已保存", at: session.createdAt }];
    await store.saveCreationSession(session);
    const raw = await readFile(path.join(directory, "creation-sessions.json"), "utf8");
    expect(raw).not.toContain("private-pixels");
    expect(raw).not.toContain("iterlay-asset://");
    const [restored] = await new AssistantConversationStore(directory).listCreationSessions();
    expect(restored.draft).toBe("调整第二张");
    expect(restored.projectId).toBe("project-1");
    expect(restored.queued).toHaveLength(1);
    expect(restored.artifacts[0].path).toBe("/managed/output.png");
    expect(restored.references[0].dataBase64).toBeUndefined();
    const pluginArtifact = { id: "plugin:item", kind: "example.plugin:poster", mediaType: "image" as const,
      pluginId: "example.plugin", boardId: "b", boardName: "咖啡", nodeId: "i", path: "/managed/plugin.png",
      prompt: "海报", status: "ready" as const, createdAt: session.createdAt };
    await store.addCreationArtifact(session.id, pluginArtifact);
    const [afterPlugin] = await store.listCreationSessions();
    expect(afterPlugin.messages).toEqual(restored.messages);
    expect(afterPlugin.artifacts).toContainEqual(pluginArtifact);
  });

  it("does not regress a settled tool call to running", () => {
    const done = { id: "1", name: "generate_video", status: "completed" as const };
    expect(mergeCreationTool([done], { ...done, status: "running" })).toEqual([done]);
  });

  it("extracts only a successful media task identity from the Agent tool receipt", () => {
    const call = { id: "call", name: "generate_video", status: "completed" as const,
      input: JSON.stringify({ boardId: "board", prompt: "5 秒镜头" }),
      output: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ videoGenerationId: "job" }) }] }) };
    expect(agentMediaTaskFromTool(call)).toEqual({ id: "job", kind: "video", boardId: "board", prompt: "5 秒镜头" });
    expect(agentMediaTaskFromTool({ ...call, status: "error" })).toBeNull();
    expect(agentMediaTaskFromTool({ ...call, output: "not json" })).toBeNull();
  });

  it("uses the board returned by generation when the call omitted its target", () => {
    expect(agentMediaTaskFromTool({ id: "call", name: "generate_image", status: "completed",
      input: JSON.stringify({ prompt: "水彩马" }),
      output: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ generationId: "task", boardId: "resolved-board" }) }] })
    })).toEqual({ id: "task", kind: "image", boardId: "resolved-board", prompt: "水彩马" });
  });
  it("resolves persisted artifacts only through their board assets", () => {
    const board = { id: "b", name: "咖啡", createdAt: "2026-01-01", updatedAt: "2026-01-01", nodes: [{ id: "i", type: "image", imagePath: "out.png", jobId: "job", source: "generated", x: 0, y: 0 }],
      images: { "out.png": "iterlay-asset://local/image" }, media: {} } as BoardDetail;
    const [artifact] = artifactsFromBoard(board, ["i"], undefined, "海报");
    expect(artifact.path).toBe("out.png");
    expect(artifactUrl(board, artifact)).toBe("iterlay-asset://local/image");
    expect(artifactsFromBoard(board, ["missing"], undefined, "海报")).toEqual([]);
  });
});
