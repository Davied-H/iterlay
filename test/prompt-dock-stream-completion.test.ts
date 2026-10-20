import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { createAssistantStreamHandlers } from "../src/features/assistant/assistant-stream-handlers";

// Execute the real inline handlers, rather than a fixture that starts idle and
// misses progress-state leaks before a confirmation is displayed.
const source = ts.createSourceFile("PromptDock.tsx",
  readFileSync(new URL("../src/components/workbench/PromptDock.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function handler(name: string, dependencies: Record<string, unknown>): (...args: unknown[]) => void {
  if (name !== "recoverIdle") {
    const options = { ...dependencies, onResult: dependencies.receivePromptAssistantResult } as unknown as Parameters<typeof createAssistantStreamHandlers>[0];
    return createAssistantStreamHandlers(options)[name as "onResult" | "onCancelled"] as (...args: unknown[]) => void;
  }
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node): void {
    if (name === "recoverIdle" && ts.isCallExpression(node) && node.expression.getText(source) === "useEffect") {
      const effect = node.arguments[0];
      if (effect?.getText(source).includes("Recover an orphaned progress label")) initializer = effect;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!initializer) throw new Error(`Missing real callback: ${name}`);
  const code = ts.transpileModule(`const callback = ${initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return new Function(...Object.keys(dependencies), `${code}\nreturn callback;`)(...Object.values(dependencies));
}

function context(surface = "canvas-prompt") {
  let activity: string | null = "正在检查并完善回复，请稍候，操作不会重复执行";
  const receive = vi.fn(() => { expect(activity).toBeNull(); });
  return {
    readActivity: () => activity,
    dependencies: {
      assistantRequestVersionRef: { current: 1 }, requestVersion: 1,
      setAssistantActivity: vi.fn((value: string | null) => { activity = value; }),
      assistantSurface: surface, receivePromptAssistantResult: receive, receiveComicDramaAgentResult: receive,
      assistantMessageId: "reply", instruction: "test", previous: { prompt: "", n: 1 },
      assistantBackgroundRequestRef: { current: true }, assistantOpenRef: { current: true },
      setAssistantHasUnreadResult: vi.fn(), onAssistantCreditsUsed: vi.fn(),
      setAssistantInteraction: vi.fn(), setAssistantMessages: vi.fn(),
      setAssistantStreaming: vi.fn(), assistantStreamRef: { current: {} }
    }
  };
}

describe("prompt dock stream completion", () => {
  it.each([
    { streaming: false, stream: null, timer: null, clears: true },
    { streaming: true, stream: null, timer: null, clears: false },
    { streaming: false, stream: {}, timer: null, clears: false },
    { streaming: false, stream: null, timer: 1, clears: false }
  ])("recovers orphaned activity without unlocking active work: %j", ({ streaming, stream, timer, clears }) => {
    const clear = vi.fn();
    handler("recoverIdle", {
      assistantActivity: "正在补交", assistantStreaming: streaming,
      assistantStreamRef: { current: stream }, assistantApplyTimerRef: { current: timer },
      setAssistantActivity: clear
    })();
    expect(clear).toHaveBeenCalledTimes(clears ? 1 : 0);
  });
  it.each(["canvas-prompt", "canvas-edit", "comic-drama"])("clears repair activity before displaying the %s result", (surface) => {
    const { dependencies, readActivity } = context(surface);
    handler("onResult", dependencies)({ message: "已补交提示词", fields: [] });
    expect(readActivity()).toBeNull();
    expect(dependencies.receivePromptAssistantResult).toHaveBeenCalledOnce();
    expect(dependencies.assistantBackgroundRequestRef.current).toBe(false);
  });

  it("clears busy state and pending interaction after upstream cancellation", () => {
    const { dependencies, readActivity } = context();
    handler("onCancelled", dependencies)();
    expect(readActivity()).toBeNull();
    expect(dependencies.setAssistantInteraction).toHaveBeenCalledWith(null);
    expect(dependencies.setAssistantStreaming).toHaveBeenCalledWith(false);
    expect(dependencies.assistantStreamRef.current).toBeNull();
  });

  it.each(["onResult", "onCancelled"])("ignores stale %s events from an earlier request", (name) => {
    const { dependencies, readActivity } = context();
    dependencies.assistantRequestVersionRef.current = 2;
    handler(name, dependencies)({});
    expect(readActivity()).not.toBeNull();
    expect(dependencies.setAssistantActivity).not.toHaveBeenCalled();
    expect(dependencies.receivePromptAssistantResult).not.toHaveBeenCalled();
  });
});
