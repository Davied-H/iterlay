import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); }
  };
}

describe("template smart-create task state", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.resetModules();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps an earlier task visible when a newer concurrent task finishes", async () => {
    const agent = await import("@/lib/pi-template-agent");
    const first = agent.startPiTemplateAgent("第一个任务");
    const second = agent.startPiTemplateAgent("第二个任务");

    expect(agent.getPiTemplateAgentTask()?.id).toBe(second.id);
    expect(agent.getPiTemplateAgentTasks()).toHaveLength(2);

    agent.updatePiTemplateAgent(second.id, { phase: "complete", detail: "第二个任务已完成" });

    expect(agent.getPiTemplateAgentTask()?.id).toBe(first.id);
  });

  it("falls back to another running task when the current task is paused", async () => {
    const agent = await import("@/lib/pi-template-agent");
    const first = agent.startPiTemplateAgent("第一个任务");
    const second = agent.startPiTemplateAgent("第二个任务");

    agent.pausePiTemplateAgentTask(second.id);

    expect(agent.getPiTemplateAgentTask()?.id).toBe(first.id);
    expect(agent.getPiTemplateAgentTasks().find((task) => task.id === second.id)?.phase).toBe("paused");
  });
});
