import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCommentHandoffContext, handoffBoardComments, quoteShellArgument } from "../electron/agent-comment-handoff";
import { SettingsStore } from "../electron/storage/settings-store";
import type { BoardData, AssetComment } from "../shared/types";

const board: BoardData = {
  id: "board", name: "音箱设计", createdAt: "2026-10-19", updatedAt: "2026-10-19", revision: 4,
  nodes: [{ id: "image", type: "image", imagePath: "/assets/green.png", jobId: "green", source: "upload", x: 0, y: 0,
    versions: [{ imagePath: "/assets/orange.png", jobId: "orange" }, { imagePath: "/assets/green.png", jobId: "green" }] }]
};
const comment: AssetComment = { id: "comment", imagePath: "/assets/orange.png", text: "改成鼠尾草绿，保留背景", createdAt: "2026-10-19", position: { x: .25, y: .75 } };
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function directory() { const value = await mkdtemp(path.join(os.tmpdir(), "iterlay-agent-handoff-")); directories.push(value); return value; }

describe("comment Agent handoff", () => {
  it("keeps the commented source version and annotation instead of silently switching to the active version", () => {
    const context = buildCommentHandoffContext(board, [comment], [comment.id, comment.id]);
    expect(context.requests).toHaveLength(1);
    expect(context.requests[0]).toMatchObject({ comment: { text: comment.text, position: comment.position },
      image: { nodeId: "image", sourcePath: comment.imagePath, sourceJobId: "orange", currentPath: "/assets/green.png" } });
    expect(context.board).toEqual({ id: "board", name: "音箱设计", revision: 4 });
  });

  it("rejects empty, deleted and other-board comments", () => {
    expect(() => buildCommentHandoffContext(board, [comment], [])).toThrow();
    expect(() => buildCommentHandoffContext(board, [comment], ["deleted"])).toThrow();
    expect(() => buildCommentHandoffContext({ ...board, nodes: [] }, [comment], [comment.id])).toThrow();
  });

  it("exports local context and opens a Codex composer draft pinned to the same workspace", async () => {
    const userDataPath = await directory();
    const openExternal = vi.fn<(url: string) => Promise<void>>(async () => {});
    const openPath = vi.fn(async () => "");
    const result = await handoffBoardComments({ agent: "codex", board, comments: [comment], commentIds: [comment.id],
      userDataPath, cliExecutable: "/Applications/Iterlay.app/Electron", cliScriptPath: "/app/cli/main.js", openExternal, openPath });
    const url = new URL(openExternal.mock.calls[0][0]);
    expect(url.protocol).toBe("codex:");
    expect(url.hostname).toBe("new");
    expect(url.searchParams.get("path")).toBe(path.join(userDataPath, "workspace"));
    expect(url.searchParams.get("prompt")).toContain(comment.text);
    expect(url.searchParams.get("prompt")).toContain(result.contextPath);
    expect(url.searchParams.get("prompt")).toContain("--user-data-path");
    expect(url.searchParams.get("prompt")).toContain(userDataPath);
    expect(JSON.parse(await readFile(result.contextPath, "utf8")).requests[0].image.sourceJobId).toBe("orange");
    expect(result.delivery).toBe("draft");
    expect(openPath).not.toHaveBeenCalled();
  });

  it("reports launch failure and keeps the prepared context recoverable", async () => {
    const userDataPath = await directory();
    await expect(handoffBoardComments({ agent: "codex", board, comments: [comment], commentIds: [comment.id],
      userDataPath, cliExecutable: "electron", cliScriptPath: "main.js", openExternal: async () => { throw Error("No handler"); },
      openPath: async () => "" })).rejects.toThrow("修改上下文已保留");
  });

  it("opens Claude only through a safely quoted terminal launcher with comment text kept in a data file", async () => {
    const userDataPath = await directory();
    const openPath = vi.fn<(file: string) => Promise<string>>(async () => "");
    const maliciousText = "保留图片 $(touch /tmp/should-never-run); `echo no`";
    const result = await handoffBoardComments({ agent: "claude-code", board, comments: [{ ...comment, text: maliciousText }],
      commentIds: [comment.id], userDataPath, cliExecutable: "electron", cliScriptPath: "main.js", platform: "darwin",
      claudeExecutable: "/test's tools/claude", openExternal: vi.fn(), openPath });
    const script = await readFile(openPath.mock.calls[0][0], "utf8");
    expect(script).toContain(quoteShellArgument("/test's tools/claude"));
    expect(script).not.toContain(maliciousText);
    expect(await readFile(path.join(path.dirname(result.contextPath), "prompt.txt"), "utf8")).toContain(maliciousText);
    expect(result.delivery).toBe("terminal");
  });

  it("does not report success when Claude is absent", async () => {
    await expect(handoffBoardComments({ agent: "claude-code", board, comments: [comment], commentIds: [comment.id],
      userDataPath: await directory(), cliExecutable: "electron", cliScriptPath: "main.js", platform: "darwin",
      openExternal: vi.fn(), openPath: vi.fn() })).rejects.toThrow("未找到可用的 Claude Code");
  });

  it("persists the default Agent, preserves it across unrelated saves and normalizes invalid stored values", async () => {
    const target = await directory();
    const store = new SettingsStore(target);
    expect(store.getSettings().defaultCodingAgent).toBe("codex");
    store.saveSettings({ ...store.getSettings(), defaultCodingAgent: "claude-code" });
    expect(new SettingsStore(target).getSettings().defaultCodingAgent).toBe("claude-code");
    const settings = store.getSettings();
    delete settings.defaultCodingAgent;
    store.saveSettings(settings);
    expect(store.getSettings().defaultCodingAgent).toBe("claude-code");
    await writeFile(path.join(target, "settings.json"), JSON.stringify({ defaultCodingAgent: "unknown", providers: [] }));
    expect(new SettingsStore(target).getSettings().defaultCodingAgent).toBe("codex");
  });
});
