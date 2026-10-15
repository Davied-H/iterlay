import { readUiSource as readFileSync } from "./helpers/ui-source";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const board = readFileSync(new URL("../src/components/canvas/CanvasBoard.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../src/components/canvas/ComicDramaNode.tsx", import.meta.url), "utf8");
const projectCard = readFileSync(new URL("../src/components/canvas/ComicDramaEntryNode.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/comic-drama/ComicDramaWorkspace.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("../src/dev/previews/comic-drama-preview.tsx", import.meta.url), "utf8");

describe("comic drama board entry and paid confirmation", () => {
  it("keeps one project card on the parent board and opens an independent comic child board", () => {
    expect(board).toContain('aria-label="更多画布工具"');
    expect(board).toContain('className="canvas-mode-toolbar"');
    expect(board).toContain("canvas-tool-divider");
    expect(board).toContain("<Clapperboard");
    expect(board).toContain('onClick={startComicDrama}');
    expect(board).toContain('comicDramaBoard ? "打开漫剧设定" : "新建漫剧项目"');
    expect(board).toContain('createWorkflowNode("comic-character")');
    expect(board).toContain('createWorkflowNode("comic-segment-script")');
    expect(board).toContain("onStartComicDrama?.(screenToFlowPosition");
    expect(card).toContain("继续制作");
    expect(projectCard).toContain("打开漫剧画板");
    expect(projectCard).toContain("getBoundingClientRect");
    expect(projectCard).toContain("thumbnailDataUrl: summary?.thumbnailDataUrl");
    expect(app).toContain("createComicDramaProject");
    expect(app).toContain('<ComicDramaWorkspace');
    expect(workspace).not.toContain("PromptDock");
    expect(workspace).not.toContain("TopBar");
    expect(workspace).toContain("<AiAssistant");
    expect(workspace).toContain("snapshotRef.current");
    expect(workspace).toContain("startSceneCollaborationStream");
    expect(workspace).toContain("onComicMutation");
    expect(workspace).not.toContain("createComicDramaMutationPlan");
    expect(app).toContain("进入独立漫剧制作画板");
    expect(app).toContain("新建漫剧项目");
    expect(app).toContain('createWorkflowNode("comic-setting", position, { focusOnCreate: true })');
  });

  it("keeps quoted submissions behind the unified confirmation", () => {
    expect(app).toContain("requestGenerationConfirmation");
    expect(app).toContain("Quote expiry");
    expect(app).toContain("Promise.allSettled");
    expect(app).toContain('status: "failed", generationError: message');
    expect(card).toContain("逐项重试");
    expect(app).not.toContain('window.confirm("确认并生成');
  });

  it("renders the generation confirmation inside the comic workspace branch", () => {
    const branchStart = app.indexOf('if (activeBoard?.kind === "comic-drama" && comicDramaSnapshot)');
    const branchEnd = app.indexOf("\n  return (", branchStart);
    const branchSource = app.slice(branchStart, branchEnd);
    expect(branchSource).toContain("<GenerationConfirmationDialog");
    expect(branchSource).toContain("confirmation={generationConfirmation}");
    expect(branchSource).toContain("onConfirm={confirmGenerationSubmission}");
  });

  it("keeps character card placement separate from paid character image generation", () => {
    const applyStart = app.indexOf("async function applyComicDramaPlan");
    const applyEnd = app.indexOf("async function renameBoardById", applyStart);
    const applySource = app.slice(applyStart, applyEnd);
    expect(applySource).not.toContain("prepareCharacterGeneration");
    expect(applySource).not.toContain("confirmCharacterGeneration");
    expect(applySource).not.toContain("settleCharacterGenerationBatch");
    expect(applySource).toContain("setCanvasConnectionsVersion");
    expect(card).toContain("生成形象");
    expect(card).toContain("逐项重试");
  });

  it("renders the setting-first production canvas preview without premature character generation", () => {
    expect(preview).toContain("<CanvasBoard");
    expect(preview).toContain('data-preview-canvas="real-canvas-board"');
    expect(preview).toContain("comicDramaAssistantGuide");
    expect(preview).toContain("帮我开始做吧");
    expect(preview).toContain("先确定故事核心");
    expect(preview).toContain("请用一句话描述主角、目标和主要冲突");
    expect(preview).not.toContain("确认角色生成");
    expect(preview).not.toContain("quotePaidMedia");
  });
});
