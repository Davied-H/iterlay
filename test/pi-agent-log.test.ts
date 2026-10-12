import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PiAgentLogStore, sanitizePiAgentLogDetails } from "../electron/pi-agent-log.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("PiAgentLogStore", () => {
  it("persists sanitized entries and clears memory and disk together", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-pi-agent-log-"));
    temporaryDirectories.push(directory);
    const store = new PiAgentLogStore(directory);
    await store.start();

    store.record({
      taskId: "task-1",
      event: "tool_end",
      summary: "authorization=top-secret 已完成",
      toolName: "submit_editable_ui",
      details: {
        apiKey: "sk-private",
        html: `<html>${"private layout ".repeat(100)}</html>`,
        image: `data:image/png;base64,${"a".repeat(1_000)}`,
        nested: { token: "token-private" },
        result: { content: [{ text: `<div>${"secret node ".repeat(100)}</div>` }] }
      }
    });
    await store.flush();

    const snapshot = store.getSnapshot();
    const serialized = JSON.stringify(snapshot.entries);
    const disk = await readFile(store.logPath, "utf8");
    expect(snapshot.entries).toHaveLength(1);
    expect(serialized).toContain("[已脱敏]");
    expect(serialized).toContain("HTML 内容已省略");
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("sk-private");
    expect(serialized).not.toContain("token-private");
    expect(serialized).not.toContain("data:image");
    expect(disk).not.toContain("private layout");
    expect(disk).not.toContain("secret node");

    await store.clear();
    expect(store.getSnapshot().entries).toEqual([]);
    await expect(readFile(store.logPath, "utf8")).resolves.toBe("");
  });

  it("redacts sensitive nested keys without mutating the source object", () => {
    const source = {
      request: {
        authorization: "Bearer private",
        prompt: "ordinary value"
      }
    };

    expect(sanitizePiAgentLogDetails(source)).toEqual({
      request: {
        authorization: "[已脱敏]",
        prompt: "ordinary value"
      }
    });
    expect(source.request.authorization).toBe("Bearer private");
  });
});
