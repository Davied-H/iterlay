import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { providerSupportsGenerateReferences } from "../shared/provider-capabilities";
import type { ProviderConfig } from "../shared/types";

// Run the real result handler with a controllable generation promise.
const source = ts.createSourceFile("PromptDock.tsx",
  readFileSync(new URL("../src/components/workbench/PromptDock.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration: ts.FunctionDeclaration | undefined;
function visit(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "applyPromptAssistantResult") declaration = node;
  ts.forEachChild(node, visit);
}
visit(source);
if (!declaration) throw new Error("Missing result handler");
const code = ts.transpileModule(declaration.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

function harness(onGeneratePrompts: () => Promise<string | null>) {
  let messages = [{ id: "reply", receipt: undefined as undefined | { label: string } }];
  const deps = {
    maxImageCount: 4,
    sceneAssistantFieldsToPrompt: () => "头像", resolveAssistantGenerationCount: () => 4,
    resolveAssistantGenerationRequests: () => [{ prompt: "头像", count: 4 }],
    applyAssistantChanges: vi.fn(), buildAssistantDirectionMessage: () => ({}),
    getAssistantGeneratedPrompt: () => "头像", assistantSurface: "canvas-prompt",
    assistantPreviousGenerationPromptRef: { current: "" },
    setAssistantMessages: (update: (current: typeof messages) => typeof messages) => { messages = update(messages); },
    setAssistantValue: vi.fn(), setAssistantStreaming: vi.fn(), setAssistantActivity: vi.fn(),
    setAssistantInteraction: vi.fn(), assistantStreamRef: { current: null },
    assistantApplyTimerRef: { current: null }, onGeneratePrompts, assistantConversationId: "conversation"
  };
  const apply = new Function(...Object.keys(deps), `${code}\nreturn applyPromptAssistantResult;`)(...Object.values(deps));
  apply({ message: "准备生成", fields: [] }, "reply", { prompt: "", n: 1 });
  return () => messages[0].receipt?.label;
}

describe("assistant generation receipt", () => {
  it("waits for the actual task before claiming completion", async () => {
    let finish!: (value: string | null) => void;
    const pending = new Promise<string | null>((resolve) => { finish = resolve; });
    const label = harness(() => pending);
    expect(label()).toBe("正在生成 · 4 张…");
    finish(null);
    await vi.waitFor(() => expect(label()).toBe("生成完成"));
  });

  it.each(["blocked", "rejected"])("keeps a persistent failure receipt when %s", async (kind) => {
    const reason = "当前 Provider 不支持参考图";
    const label = harness(() => kind === "blocked" ? Promise.resolve(reason) : Promise.reject(new Error(reason)));
    await vi.waitFor(() => expect(label()).toBe(`生成失败：${reason}`));
  });

  it("allows Images API reference creation only when references are supported", () => {
    const provider = { type: "openai-compatible", apiMode: "images", supportsReferenceImages: true } as ProviderConfig;
    expect(providerSupportsGenerateReferences(provider)).toBe(true);
    expect(providerSupportsGenerateReferences({ ...provider, supportsReferenceImages: false })).toBe(false);
    expect(providerSupportsGenerateReferences({ ...provider, type: "poe" })).toBe(false);
  });
});
