import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import type { BoardComicDramaEntryNode, BoardConnection, BoardEnterOrigin, ComicCharacterNode, ComicSettingNode } from "@shared/types";
import {
  AiAssistant,
  type AiAssistantInteractionState,
  type AiAssistantMessage
} from "../../components/assistant/AiAssistant";
import { CanvasBoard } from "../../components/canvas/CanvasBoard";
import { BoardEntryTransition } from "../../components/workbench/BoardEntryTransition";
import { ComicDramaWorkspace } from "../../components/comic-drama/ComicDramaWorkspace";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { I18nProvider } from "../../i18n";
import { comicDramaAssistantGuide } from "../../lib/comic-drama-assistant";
import "../../styles.css";

const createdAt = "2026-08-22T08:00:00.000Z";
const setting: ComicSettingNode = {
  id: "setting", type: "comic-setting", x: 60, y: 80, status: "saved", activeVersionId: "setting-v2",
  versions: [{ versionId: "setting-v2", createdAt, fields: { title: "雨夜来信", synopsis: "旧物修复师在暴雨夜收到一封迟到十年的信。", genre: "悬疑", tone: "克制", worldRules: ["记忆附着在旧物上"], visualStyle: "冷色手绘", constraints: ["不用旁白"], aspectRatio: "9:16", targetDurationSeconds: 30 } }]
};
const previewCharacter: ComicCharacterNode = {
  id: "character-linmo", type: "comic-character", x: 500, y: 110, name: "林默", status: "saved",
  activeVersionId: "character-linmo-v1",
  versions: [{ versionId: "character-linmo-v1", createdAt, fields: {
    role: "旧物修复师，推动主线",
    profile: "收到一封迟到十年的信，决定寻找寄信人。",
    appearanceAnchors: ["短黑发", "深色工作围裙"],
    visualPrompt: "冷色手绘角色设定"
  } }]
};
const previewConnection: BoardConnection = {
  id: "setting-character-locked", source: setting.id, target: previewCharacter.id,
  sourceHandle: "source-right", targetHandle: "target-left", kind: "reference",
  versionBinding: { mode: "pinned", versionId: setting.activeVersionId },
  label: "由此设定派生", locked: true,
  sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
  targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
  style: { dash: "solid", endMarker: "arrow", markerSize: 9, width: 2 },
  routing: { mode: "auto", kind: "curved", waypoints: [] }
};
const projectEntry: BoardComicDramaEntryNode = {
  id: "comic-project",
  type: "comic-drama-entry",
  x: 180,
  y: 160,
  childBoardId: "preview",
  name: "雨夜来信"
};
function Preview(): React.ReactElement {
  const previewParams = new URLSearchParams(window.location.search);
  const activityPreview = previewParams.has("activity");
  const interactionPreview = previewParams.has("interaction");
  const [confirmation, setConfirmation] = useState<string[]>([]);
  const [entryChoice, setEntryChoice] = useState(false);
  const [clarified, setClarified] = useState(false);
  const [inChildBoard, setInChildBoard] = useState(new URLSearchParams(window.location.search).get("view") !== "parent");
  const [entryMotion, setEntryMotion] = useState<BoardEnterOrigin | null>(null);
  const assistantWidth = window.innerWidth <= 1280 ? 320 : 336;
  const previewState = new URLSearchParams(window.location.search).get("state");
  const showPendingOutput = previewState === "pending-output";
  const showConnections = previewState === "connections" || previewState === "failed" || showPendingOutput;
  const displayedCharacter: ComicCharacterNode = previewState === "failed"
    ? { ...previewCharacter, status: "failed", generationError: "Provider 鉴权失败，请检查 API Key 后重试。" }
    : previewCharacter;
  const draftSetting: ComicSettingNode = { ...setting, status: "draft" };
  const snapshot = {
    boardId: "preview",
    revision: 7,
    nodes: showConnections ? [setting, displayedCharacter] : [draftSetting],
    connections: showConnections ? [previewConnection] : [],
    groups: []
  };
  const guide = comicDramaAssistantGuide(snapshot, showConnections ? [previewCharacter.id] : [draftSetting.id]);
  const messages: AiAssistantMessage[] = activityPreview ? [
    { id: "guide", role: "assistant", content: guide.message },
    { id: "input", role: "user", content: "我要做个漫剧，关于西游" },
    { id: "agent", role: "assistant", content: "", streaming: true }
  ] : showConnections ? [
    { id: "guide", role: "assistant", content: guide.message }
  ] : [
    { id: "guide", role: "assistant", content: guide.message },
    { id: "input", role: "user", content: "帮我开始做吧" },
    {
      id: "agent",
      role: "assistant",
      content: clarified
        ? "收到。我会根据这个故事核心继续整理设定方案。"
        : "可以。我先确认故事的核心方向，再开始整理设定。"
    }
  ];
  const interaction: AiAssistantInteractionState | null = showConnections || clarified ? null : {
    id: "story-core",
    interaction: {
      type: "form",
      title: "先确定故事核心",
      description: "这会决定后续角色和片段方向。",
      submitLabel: "继续",
      cancelLabel: "暂不补充",
      fields: [{
        id: "storyCore",
        label: "请用一句话描述主角、目标和主要冲突",
        type: "textarea",
        required: true,
        placeholder: "例如：旧物修复师收到一封迟到十年的信，决定寻找寄信人。"
      }]
    }
  };
  const previewInteraction: AiAssistantInteractionState | null = interactionPreview ? {
    id: "story-choice",
    interaction: {
      type: "form",
      title: "补充一个关键点",
      description: "只需要先确定主角这次要追求什么、遇到什么冲突，我就能整理成漫剧设定。",
      submitLabel: "继续",
      cancelLabel: "暂不补充",
      fields: [{
        id: "storyGoal",
        label: "孙悟空这次的目标和主要冲突是什么？",
        type: "select",
        required: true,
        options: [
          { label: "护送取经队，遭遇强敌阻拦", value: "escort" },
          { label: "大闹天宫，对抗天庭压迫", value: "heaven" },
          { label: "被误解驱逐，独自证明清白", value: "exile" },
          { label: "现代重生，找回齐天大圣力量", value: "modern" }
        ]
      }]
    }
  } : interaction;
  if (activityPreview || interactionPreview) {
    return <I18nProvider>
      <main className="h-screen w-screen overflow-hidden bg-background text-foreground">
        <section className="absolute inset-y-0 left-0 right-[400px] bg-[#f7f7f5]">
          <div className="mx-auto mt-[28vh] w-[360px] rounded-lg border border-border bg-background p-5 shadow-sm">
            <strong className="block text-base">未命名漫剧</strong>
            <p className="mt-3 text-sm text-muted-foreground">故事简介还没有填写。</p>
          </div>
        </section>
        <aside className="absolute inset-y-0 right-0 w-[400px]" data-preview-assistant>
          <AiAssistant
            variant="docked"
            dockSide="right"
            title="AI 助手"
            subtitle="漫剧制作 · 当前画板 · 1 个设定"
            compact
            messages={messages}
            interaction={interactionPreview ? previewInteraction : null}
            value=""
            streaming={activityPreview || interactionPreview}
            activityLabel={activityPreview ? "正在读取漫剧画板" : undefined}
            placeholder={guide.placeholder}
            onValueChange={() => undefined}
            onSubmit={() => undefined}
            onStop={() => undefined}
            onInteractionSubmit={() => undefined}
            onInteractionDismiss={() => undefined}
          />
        </aside>
      </main>
    </I18nProvider>;
  }
  const previewNodes = inChildBoard ? showConnections ? [setting, displayedCharacter] : [draftSetting] : [projectEntry];
  if (inChildBoard) {
    return <I18nProvider>
      <ComicDramaWorkspace
        onBeforeAgentRequest={async () => undefined}
        onAgentMutation={async () => undefined}
        onApplyPlan={async () => undefined}
        onSelect={() => undefined}
        snapshot={snapshot}
        selectedNodeIds={[]}
        onBack={() => setInChildBoard(false)}
      />
      {entryMotion ? <BoardEntryTransition origin={entryMotion.rect} thumbnailDataUrl={entryMotion.thumbnailDataUrl} onComplete={() => setEntryMotion(null)} /> : null}
      <Dialog open={confirmation.length > 0} onOpenChange={(open) => !open && setConfirmation([])}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmation[0] === "continue-setting" ? "继续完善漫剧设定" : "生成角色形象"}</DialogTitle>
            <DialogDescription>
              {confirmation[0] === "continue-setting"
                ? "可以直接在漫剧助手中补充设定，或打开设定卡的结构化编辑器。"
                : "正式应用将在这里展示 Provider、模型与费用，确认后再提交生成任务。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation([])}>取消</Button>
            <Button onClick={() => setConfirmation([])}>确认并生成角色</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </I18nProvider>;
  }
  return <I18nProvider><main className="h-screen w-screen overflow-hidden bg-background text-foreground">
    <header className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-semibold"><span>普通画板</span><span className="text-xs font-normal text-muted-foreground">项目画板</span></header>
    <div className="absolute bottom-0 left-0 top-12" style={{ right: assistantWidth }} data-preview-canvas="real-canvas-board"><ReactFlowProvider><CanvasBoard images={[]} workflowNodes={previewNodes} initialConnections={[]} clipboardEnabled={false} showMinimap={false} onSave={() => undefined} onUseReference={() => undefined} onUseReferences={() => undefined} onDownloadImages={() => undefined} onPasteImages={() => undefined} onDropImages={() => undefined} showEmptyCanvasStart={false} emptyCanvasSuggestedMode="compass" promptFocused={false} onStartPrompt={() => undefined} onAddRecentAssets={() => undefined} onOpenAssetLibrary={() => undefined} showDemoStart={false} onOpenDemoStart={() => undefined} onCreateWorkflowNode={() => undefined} comicDramaBoard={false} onOpenComicDramaProject={(_node, origin) => { setInChildBoard(true); if (origin && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) setEntryMotion(origin); }} onStartComicDrama={() => setEntryChoice(true)} onContinueComicDrama={() => setConfirmation(["continue-setting"])} onRetryComicCharacter={(node) => setConfirmation([node.id])} /></ReactFlowProvider></div>
    {entryMotion ? <BoardEntryTransition origin={entryMotion.rect} thumbnailDataUrl={entryMotion.thumbnailDataUrl} onComplete={() => setEntryMotion(null)} /> : null}
    <aside className="absolute bottom-0 right-0 top-12 border-l border-border" style={{ width: assistantWidth }} data-preview-assistant><AiAssistant variant="docked" dockSide="right" title="AI 助手" subtitle="漫剧制作 · 当前画板 · 1 个设定" compact messages={messages} interaction={activityPreview ? null : interaction} value="" streaming={activityPreview} activityLabel={activityPreview ? "Pi Agent 正在理解当前漫剧画板" : undefined} placeholder={guide.placeholder} onValueChange={() => undefined} onSubmit={() => undefined} onStop={() => undefined} onInteractionSubmit={() => setClarified(true)} onInteractionDismiss={() => setClarified(true)} /></aside>
    <Dialog open={entryChoice} onOpenChange={setEntryChoice}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>开始漫剧制作</DialogTitle><DialogDescription>当前画板已有漫剧设定，请选择继续或新建。</DialogDescription></DialogHeader><div className="grid gap-2"><Button variant="outline" onClick={() => setEntryChoice(false)}>继续已有 · 雨夜来信</Button><Button variant="outline" onClick={() => setEntryChoice(false)}>新建漫剧</Button></div></DialogContent></Dialog>
    <Dialog open={confirmation.length > 0} onOpenChange={(open) => !open && setConfirmation([])}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>继续完善漫剧设定</DialogTitle><DialogDescription>可以直接在漫剧助手中补充设定，或打开设定卡的结构化编辑器。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmation([])}>返回助手</Button><Button onClick={() => setConfirmation([])}>编辑设定卡</Button></DialogFooter></DialogContent></Dialog>
  </main></I18nProvider>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
