import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile("PromptDock.tsx",
  readFileSync(new URL("../src/components/workbench/PromptDock.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(name: string, deps: Record<string, unknown>): (...args: unknown[]) => unknown {
  let selected: ts.Node | undefined;
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) selected = node;
    if (name === "refresh" && ts.isCallExpression(node) && node.expression.getText(source) === "useEffect"
      && node.arguments[0]?.getText(source).includes("assistantIntentAttemptedKeyRef.current ===")) selected = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!selected) throw new Error(`Missing handler ${name}`);
  const code = ts.transpileModule(name === "refresh" ? `const handler = ${selected.getText(source)};` : selected.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return new Function(...Object.keys(deps), `${code}\nreturn ${name === "refresh" ? "handler" : name};`)(...Object.values(deps));
}
afterEach(() => vi.useRealTimers());

describe("assistant turn recovery", () => {
  it("restores recommendations after a busy opening and each completed turn without refresh loops", () => {
    vi.useFakeTimers();
    const request = vi.fn();
    const deps = {
      assistantOpen: true, assistantSurface: "canvas-prompt", assistantIntentSuggestionsEnabled: true,
      supportsPromptEnhancement: true, assistantStreaming: true, assistantActivity: null,
      assistantInteraction: null as null | object, assistantIntentAttemptedKeyRef: { current: null },
      assistantIntentRefreshKey: "conversation:reply-1",
      requestAssistantIntentSuggestionsRef: { current: request }, window: globalThis
    };
    const run = () => extract("refresh", deps)();
    run();
    vi.advanceTimersByTime(300);
    expect(request).not.toHaveBeenCalled();
    deps.assistantStreaming = false;
    deps.assistantInteraction = {};
    run();
    vi.advanceTimersByTime(300);
    expect(request).not.toHaveBeenCalled();
    deps.assistantInteraction = null;
    run();
    vi.advanceTimersByTime(300);
    expect(request).toHaveBeenCalledTimes(1);
    run();
    vi.advanceTimersByTime(300);
    expect(request).toHaveBeenCalledTimes(1);
    deps.assistantIntentRefreshKey = "conversation:reply-2";
    run();
    vi.advanceTimersByTime(300);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("unlocks the composer even when a confirmation action throws", () => {
    vi.useFakeTimers();
    const deps = {
      setAssistantInteraction: vi.fn(), setAssistantActivity: vi.fn(),
      assistantApplyTimerRef: { current: null }, window: globalThis,
      toast: { error: vi.fn() }, getWorkbenchErrorMessage: (error: Error) => error.message
    };
    extract("executeAssistantInteraction", deps)(() => { throw new Error("提交失败"); }, "正在提交");
    expect(deps.setAssistantActivity).toHaveBeenLastCalledWith("正在提交");
    vi.advanceTimersByTime(420);
    expect(deps.toast.error).toHaveBeenCalledWith("提交失败");
    expect(deps.assistantApplyTimerRef.current).toBeNull();
    expect(deps.setAssistantActivity).toHaveBeenLastCalledWith(null);
  });
});
