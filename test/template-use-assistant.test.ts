import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const assistantSource = readFileSync(
  new URL("../src/components/assistant/TemplateUseAssistant.tsx", import.meta.url),
  "utf8"
);
const sceneDetailSource = readFileSync(
  new URL("../src/components/workbench/SceneDetail.tsx", import.meta.url),
  "utf8"
);

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("TemplateUseAssistant", () => {
  it("only presents template rules that can be derived from the template", () => {
    expect(assistantSource).toContain("getTemplateFocus");
    expect(assistantSource).toContain("!/【[^】]+】/u.test(field.value)");
    expect(assistantSource).toContain("isVariableLabel");
    expect(assistantSource).not.toContain("FALLBACK_TEMPLATE_FOCUS");
    expect(assistantSource).not.toContain('["构图", "视觉语言", "关键约束"]');
  });

  it("tracks whether each requested template value is still pending or already supplied", () => {
    expect(assistantSource).toContain('type TemplateRequestStatus = "pending" | "provided" | "included"');
    expect(assistantSource).toContain("data-request-status={item.status}");
    expect(assistantSource).toContain("待补充");
    expect(assistantSource).toContain("已提供");
    expect(assistantSource).toContain("已纳入方案");
    expect(assistantSource).toContain("source.matchAll(/【([^】]+)】/gu)");
  });

  it("explains template usage in plain language and yields space after conversation starts", () => {
    expect(assistantSource).toContain("模板约束");
    expect(assistantSource).toContain(">自动保留<");
    expect(assistantSource).toContain(">需要补充<");
    expect(assistantSource).toContain("whitespace-nowrap");
    expect(assistantSource).toContain("compactSummary");
    expect(assistantSource).toContain("useState(false)");
    expect(assistantSource).toContain("setBriefExpanded(false)");
    expect(assistantSource).toContain("previousHasUserMessageRef");
    expect(assistantSource).not.toContain(">模板依据<");
    expect(assistantSource).not.toContain(">本次信息<");
  });

  it("offers task-oriented fallbacks instead of asking users to interpret the template", () => {
    expect(assistantSource).toContain("补全：");
    expect(assistantSource).toContain("整理 3 组差异明显的方案");
    expect(assistantSource).toContain("检查需求是否与模板规则冲突");
    expect(assistantSource).toContain("visibleSuggestions.slice(0, 2)");
    expect(assistantSource).not.toContain("先告诉我这个模板会固定保留什么");
  });

  it("uses the same two-action confirmation pattern as the board assistant", () => {
    expect(assistantSource).not.toContain("function TemplateProgress");
    expect(assistantSource).not.toContain("<TemplateProgress");
    expect(assistantSource.match(/应用提示词/g)).toHaveLength(1);
    expect(assistantSource.match(/立即生成/g)).toHaveLength(1);
    expect(assistantSource).toContain('aria-label="确认生成方案内容"');
    expect(assistantSource).toContain("onApply(draftPrompt)");
    expect(assistantSource).toContain("onGenerate(draftPrompt)");
    expect(assistantSource).toContain("absolute inset-x-2 bottom-2");
  });

  it("supports references, contextual actions and keyboard submission", () => {
    expect(assistantSource).toContain('aria-label="本次参考图片"');
    expect(assistantSource).toContain("extractClipboardImageFiles");
    expect(assistantSource).toContain("isSendEnter(event)");
    expect(assistantSource).toContain("onRefreshSuggestions");
  });
});

describe("SceneDetail template assistant workflow", () => {
  it("keeps a pending assistant proposal actionable after the assistant closes", () => {
    const creationAction = sourceBetween(
      sceneDetailSource,
      "const creationAction:",
      "function runCreationAction"
    );

    expect(sceneDetailSource).toContain("hasPendingAssistantProposal");
    expect(creationAction).toContain("hasPendingAssistantProposal");
    expect(creationAction).not.toMatch(/hasPendingAssistantProposal\s*&&\s*assistantOpen/);
    expect(creationAction).toContain('kind: "apply-proposal"');
  });

  it("commits an inline confirmation without opening a second proposal surface", () => {
    const commitAssistantPrompt = sourceBetween(
      sceneDetailSource,
      "function commitAssistantPrompt",
      "function applyAssistantPrompt"
    );
    const applyAssistantPrompt = sourceBetween(
      sceneDetailSource,
      "function applyAssistantPrompt",
      "function generateAssistantPrompt"
    );

    expect(commitAssistantPrompt).toContain("setGeneratedPrompt(nextPrompt)");
    expect(commitAssistantPrompt).toContain("setGenerationBrief(nextPrompt)");
    expect(commitAssistantPrompt).toMatch(/setAppliedAssistantPrompt|setAppliedAssistantProposal/);
    expect(commitAssistantPrompt).toContain("setAssistantMessages");
    expect(applyAssistantPrompt).toContain("commitAssistantPrompt(prompt)");
    expect(applyAssistantPrompt).toContain("setAssistantOpen(false)");
    expect(applyAssistantPrompt).toContain("setCreationTrayOpen(false)");
    expect(applyAssistantPrompt).toContain('assistantExitFocusRef.current = "creation"');
    expect(applyAssistantPrompt).not.toContain("setCreationTrayOpen(true)");
  });

  it("can commit the proposal and start generation from the assistant", () => {
    const immediateGeneration = sourceBetween(
      sceneDetailSource,
      "function generateAssistantPrompt",
      "async function requestTemplateAssistantSuggestions"
    );

    expect(immediateGeneration).toContain("commitAssistantPrompt(prompt)");
    expect(immediateGeneration).toContain("generateSceneResults(false, nextPrompt)");
    expect(sceneDetailSource).toContain("canGenerateImmediately={canGenerateAssistantPrompt}");
  });

  it("keeps the assistant column mounted until its exit animation completes", () => {
    expect(sceneDetailSource).toContain("assistantLayoutOpen");
    expect(sceneDetailSource).toContain("onExitComplete={finishAssistantExit}");
    expect(sceneDetailSource).toContain('assistantLayoutOpen && "max-[899px]:hidden"');
  });

  it("does not advance the page workflow merely because the assistant is open", () => {
    const creationStage = sourceBetween(
      sceneDetailSource,
      "const creationStage =",
      "const creationAction:"
    );

    expect(creationStage).not.toContain("assistantOpen");
  });

  it("keeps assistant input synchronized with the page brief", () => {
    const assistantProps = sourceBetween(
      sceneDetailSource,
      "<TemplateUseAssistant",
      "/>"
    );

    const usesSharedBrief = assistantProps.includes("value={generationBrief}")
      && assistantProps.includes("onValueChange={setGenerationBrief}");
    const explicitlySynchronizesBrief = assistantProps.includes("value={assistantValue}")
      && /onValueChange=\{\(value\) => \{[\s\S]*?setAssistantValue\(value\);[\s\S]*?setGenerationBrief\(value\);[\s\S]*?\}\}/.test(assistantProps);
    expect(usesSharedBrief || explicitlySynchronizesBrief).toBe(true);
  });

  it("clears the shared page and assistant draft as soon as a message is sent", () => {
    const sendMessage = sourceBetween(
      sceneDetailSource,
      "async function sendTemplateAssistantMessage",
      "function submitQuickTemplateRequest"
    );

    expect(sendMessage).toContain('setGenerationBrief("")');
    expect(sendMessage.indexOf('setGenerationBrief("")')).toBeLessThan(sendMessage.indexOf("await onCollaborate"));
  });

  it("keeps the narrow assistant inside the workspace instead of opening a modal", () => {
    expect(sceneDetailSource).toContain('data-template-assistant-sidebar="workspace"');
    expect(sceneDetailSource).toContain('assistantLayoutOpen && "max-[899px]:hidden"');
    expect(sceneDetailSource).not.toContain('data-template-assistant-dialog=""');
  });

  it("allocates a stable desktop column and leaves the canvas visible", () => {
    expect(sceneDetailSource).toContain("min-[900px]:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]");
    expect(sceneDetailSource).toContain("min-[900px]:border-l");
    expect(sceneDetailSource).not.toContain('className="fixed right-3');
  });

  it("requests recommendations for using an existing template", () => {
    expect(sceneDetailSource).toContain('templateWorkflow: "use"');
  });

  it("marks the actual collaboration request as using an existing template", () => {
    const collaboration = sourceBetween(
      sceneDetailSource,
      "const result = await onCollaborate({",
      "if (assistantRequestRef.current !== requestId) return;"
    );

    expect(collaboration).toContain('templateWorkflow: "use"');
    expect(collaboration).toContain("referenceImages: assistantContextImages.map");
  });

  it("reopens the assistant to adjust a confirmed proposal", () => {
    expect(sceneDetailSource).toContain(">调整方案</span>");
    expect(sceneDetailSource).not.toContain(">查看方案</span>");
    expect(sceneDetailSource).toContain('data-template-creation-action=""');
  });
});
