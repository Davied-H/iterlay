import { useUiText } from "@/i18n";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Focus,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  Undo2,
  Volume2,
  X,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AiAssistant,
  type AiAssistantInteractionState,
  type AiAssistantInteractionValues,
  type AiAssistantMessage
} from "@/components/assistant/AiAssistant";
import { startSceneCollaborationStream, type SceneCollaborationStreamHandle } from "@/lib/scene-collaboration-stream";
import {
  activeSegmentVersion,
  effectiveSegmentDurationMs,
  orderedKeyframes,
  orderedSegments,
  removeSequenceKeyframe,
  reorderSequenceKeyframe,
  reorderSequenceSegment,
  segmentIsBlocked,
  segmentNeedsGeneration,
  sequenceDurationMs,
  updateSequenceSegment
} from "@/lib/video-sequence-controller";
import type {
  VideoSequenceEditorProps,
  VideoSequenceExportOptions,
  VideoSequenceSegment,
  VideoSequenceSegmentState,
  VideoSequenceTaskState
} from "./types";
import "./video-sequence-editor.css";

type Selection = { type: "keyframe" | "segment"; id: string };
type OpenDialog = "generate-batch" | "generate-segment" | "template" | "export" | null;
const ACTIVE_TASKS = new Set<VideoSequenceTaskState>(["submitting", "queued", "generating", "post_processing", "recovering"]);

export function VideoSequenceEditor(props: VideoSequenceEditorProps): React.ReactElement {
  const uiText = useUiText();

  const frames = useMemo(() => orderedKeyframes(props.sequence), [props.sequence]);
  const segments = useMemo(() => orderedSegments(props.sequence), [props.sequence]);
  const totalMs = useMemo(() => sequenceDurationMs(props.sequence), [props.sequence]);
  const [selection, setSelection] = useState<Selection>(() => segments[0]
    ? { type: "segment", id: segments[0].id }
    : { type: "keyframe", id: frames[0]?.id ?? "" });
  const [playing, setPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantValue, setAssistantValue] = useState("");
  const [assistantStreaming, setAssistantStreaming] = useState(false);
  const [assistantActivity, setAssistantActivity] = useState<string | null>(null);
  const [assistantInteraction, setAssistantInteraction] = useState<{
    state: AiAssistantInteractionState;
    interactionId: string;
  } | null>(null);
  const [assistantMessages, setAssistantMessages] = useState<AiAssistantMessage[]>([{
    id: "video-assistant-greeting",
    role: "assistant",
    content: "我可以帮你调整当前片段的运动描述、镜头节奏和视频生成参数。"
  }]);
  const assistantStreamRef = useRef<SceneCollaborationStreamHandle | null>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  const selectedSegment = selection.type === "segment" ? segments.find((item) => item.id === selection.id) : undefined;
  const selectedFrame = selection.type === "keyframe" ? frames.find((item) => item.id === selection.id) : undefined;
  const current = playing
    ? segmentAtPlayhead(segments, props.sequence.defaults.durationSeconds, playheadMs) ?? segments[0]
    : selectedSegment ?? segmentAtPlayhead(segments, props.sequence.defaults.durationSeconds, playheadMs) ?? segments[0];
  const currentVersion = current ? activeSegmentVersion(current) : undefined;
  const currentFrame = current ? frames.find((frame) => frame.id === current.toKeyframeId) : frames[0];
  const videoUrl = currentVersion ? props.mediaUrls[currentVersion.videoPath] : undefined;
  const posterUrl = currentVersion?.posterPath ? props.mediaUrls[currentVersion.posterPath] : currentFrame ? props.mediaUrls[currentFrame.imagePath] : undefined;
  const targets = useMemo(() => segments.filter((item) => segmentNeedsGeneration(item) && !segmentIsBlocked(item) && !ACTIVE_TASKS.has(item.taskState ?? "idle")), [segments]);
  const onPrepareGeneration = props.onPrepareGeneration;
  const prepareGeneration = useCallback(async (kind: "generate-batch" | "generate-segment"): Promise<void> => {
    if (onPrepareGeneration && !await onPrepareGeneration()) return;
    setDialog(kind);
  }, [onPrepareGeneration]);

  useEffect(() => {
    if (!playing || videoUrl) return;
    const timer = window.setInterval(() => setPlayheadMs((value) => value >= totalMs ? 0 : value + 100), 100);
    return () => window.clearInterval(timer);
  }, [playing, totalMs, videoUrl]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !videoUrl) return;
    if (playing) void player.play().catch(() => setPlaying(false));
    else player.pause();
  }, [playing, videoUrl]);

  const generateSelected = useCallback(() => {
    if (selection.type !== "segment") return;
    const segment = segments.find((item) => item.id === selection.id);
    if (!segment || ACTIVE_TASKS.has(segment.taskState ?? "idle")) return;
    void prepareGeneration("generate-segment");
  }, [prepareGeneration, segments, selection]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable=true]");
      if (event.key === " " && !editing) { event.preventDefault(); setPlaying((value) => !value); }
      if (!editing && event.key === "ArrowLeft") setPlayheadMs((value) => Math.max(0, value - (event.shiftKey ? 1_000 : 100)));
      if (!editing && event.key === "ArrowRight") setPlayheadMs((value) => Math.min(totalMs, value + (event.shiftKey ? 1_000 : 100)));
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); generateSelected(); }
      if (!editing && (event.key === "Delete" || event.key === "Backspace") && selection.type === "keyframe") {
        event.preventDefault();
        const next = removeSequenceKeyframe(props.sequence, selection.id);
        if (next !== props.sequence) {
          props.onChange(next);
          const remaining = orderedKeyframes(next);
          setSelection({ type: "keyframe", id: remaining[Math.min(selectionIndex(frames, selection.id), remaining.length - 1)]?.id ?? "" });
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) props.onRedo?.(); else props.onUndo?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [frames, generateSelected, props, selection, totalMs]);

  function reorder(id: string, index: number): void {
    props.onChange(props.sequence.kind === "video-assembly"
      ? reorderSequenceSegment(props.sequence, id, index)
      : reorderSequenceKeyframe(props.sequence, id, index));
  }
  function patchSegment(id: string, patch: Partial<VideoSequenceSegment>): void {
    props.onChange(updateSequenceSegment(props.sequence, id, patch));
  }
  async function run(action: () => void | Promise<void>): Promise<void> {
    setBusy(true);
    try { await action(); setDialog(null); } finally { setBusy(false); }
  }
  function submitVideoAssistant(): void {
    const instruction = assistantValue.trim();
    if (!instruction || assistantStreaming) return;
    const target = selectedSegment ?? current;
    const assistantMessageId = crypto.randomUUID();
    setAssistantMessages((messages) => [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content: instruction },
      { id: assistantMessageId, role: "assistant", content: "", streaming: true }
    ]);
    setAssistantValue("");
    setAssistantStreaming(true);
    assistantStreamRef.current = startSceneCollaborationStream({
      instruction,
      referenceImages: [],
      currentFields: [
        { label: "序列", value: props.sequence.name },
        ...(target ? [
          { label: "当前片段", value: `片段 ${target.order + 1}` },
          { label: "运动描述", value: target.prompt || "未填写" },
          { label: "时长", value: `${target.durationSeconds ?? props.sequence.defaults.durationSeconds} 秒` },
          { label: "分辨率", value: target.resolution ?? props.sequence.defaults.resolution }
        ] : [])
      ],
      conversation: assistantMessages
        .filter((message) => !message.streaming && message.content.trim())
        .slice(-12)
        .map(({ role, content }) => ({ role, content })),
      assistantSurface: "video",
      assistantScenario: "video",
      workflowMode: "generate",
      recordInHistory: true
    }, {
      onDelta: (delta) => setAssistantMessages((messages) => messages.map((message) => (
        message.id === assistantMessageId ? { ...message, content: message.content + delta } : message
      ))),
      onFields: () => undefined,
      onActivity: setAssistantActivity,
      onInteraction: (interactionId, interaction) => {
        if (!interaction) return;
        setAssistantActivity(null);
        setAssistantInteraction({
          state: { id: interactionId, interaction },
          interactionId
        });
      },
      onResult: (result) => {
        const prompt = result.fields.find((field) => /提示词|运动描述|视频描述/u.test(field.label))?.value
          ?? result.detailedPrompt
          ?? "";
        setAssistantMessages((messages) => messages.map((message) => (
          message.id === assistantMessageId
            ? { ...message, content: result.message, streaming: false, generatedPrompt: prompt || undefined }
            : message
        )));
        setAssistantStreaming(false);
        setAssistantActivity(null);
        assistantStreamRef.current = null;
      },
      onError: (message) => {
        setAssistantMessages((messages) => messages.map((item) => (
          item.id === assistantMessageId
            ? { ...item, content: message, streaming: false, tone: "error" }
            : item
        )));
        setAssistantStreaming(false);
        setAssistantActivity(null);
      },
      onCancelled: () => {
        setAssistantStreaming(false);
        setAssistantActivity(null);
      }
    });
  }
  function submitVideoAssistantInteraction(values: AiAssistantInteractionValues): void {
    if (!assistantInteraction) return;
    assistantStreamRef.current?.respondToInteraction(
      assistantInteraction.interactionId,
      "submit",
      values
    );
    setAssistantInteraction(null);
    setAssistantActivity("正在继续…");
  }
  function dismissVideoAssistantInteraction(): void {
    if (!assistantInteraction) return;
    assistantStreamRef.current?.respondToInteraction(
      assistantInteraction.interactionId,
      "dismiss"
    );
    setAssistantInteraction(null);
    setAssistantActivity("正在继续…");
  }
  function applyVideoAssistantPrompt(prompt: string): void {
    const target = selectedSegment ?? current;
    if (target && prompt.trim()) patchSegment(target.id, { prompt: prompt.trim() });
  }
  function stopVideoAssistant(): void {
    assistantStreamRef.current?.dispose();
    assistantStreamRef.current = null;
    setAssistantStreaming(false);
    setAssistantActivity(null);
  }

  return <main className="video-sequence-editor" aria-label={uiText("镜头序列编辑器：{{ui:0}}", [props.sequence.name])}>
    <SequenceTopbar {...props} targetCount={targets.length} inspectorOpen={inspectorOpen} onToggleInspector={() => setInspectorOpen((value) => !value)} onGenerate={() => { void prepareGeneration("generate-batch"); }} onTemplate={() => setDialog("template")} onExport={() => setDialog("export")} onAssistant={() => setAssistantOpen((value) => !value)} />
    <section className={cn("vse-workspace", !inspectorOpen && "is-wide")}>
      <div className="vse-preview-column">
        <SequencePreview videoRef={playerRef} videoUrl={videoUrl} posterUrl={posterUrl} segment={current} playing={playing} onPlayingChange={setPlaying} onTimeUpdate={(localMs) => setPlayheadMs(Math.min(totalMs, segmentStartMs(segments, props.sequence.defaults.durationSeconds, current?.id) + localMs))} onEnded={() => setPlayheadMs((value) => value >= totalMs - 100 ? 0 : Math.min(totalMs, segmentEndMs(segments, props.sequence.defaults.durationSeconds, current?.id) + 1))} />
        <Transport playing={playing} timeMs={playheadMs} totalMs={totalMs} onPlayingChange={setPlaying} onSeek={setPlayheadMs} />
      </div>
      {inspectorOpen ? <Inspector {...props} frames={frames} segments={segments} selection={selection} selectedFrame={selectedFrame} selectedSegment={selectedSegment} onSelect={setSelection} onPatch={patchSegment} onReorder={reorder} onGenerate={() => { void prepareGeneration("generate-segment"); }} /> : null}
    </section>
    <SequenceTimeline sequence={props.sequence} mediaUrls={props.mediaUrls} frames={frames} segments={segments} selection={selection} playheadMs={playheadMs} totalMs={totalMs} onSelect={setSelection} onSeek={setPlayheadMs} onReorder={reorder} />
    <GenerationDialog open={dialog === "generate-batch" || dialog === "generate-segment"} sequence={props.sequence} segments={dialog === "generate-segment" && selectedSegment ? [selectedSegment] : targets} credits={props.credits} busy={busy} onClose={() => setDialog(null)} onConfirm={() => run(() => dialog === "generate-segment" && selectedSegment ? props.onGenerateSegment(selectedSegment.id) : props.onGenerateBatch(targets.map((item) => item.id)))} />
    <TemplateDialog open={dialog === "template"} templates={props.templates ?? []} busy={busy} onClose={() => setDialog(null)} onSave={(name) => run(() => props.onSaveTemplate(name))} onApply={(id) => run(() => props.onApplyTemplate(id))} />
    <ExportDialog open={dialog === "export"} sequence={props.sequence} hasStale={segments.some(segmentNeedsGeneration)} busy={busy} onClose={() => setDialog(null)} onConfirm={(options) => run(() => props.onExport(options))} />
    {assistantOpen ? <aside className="vse-assistant">
      <AiAssistant
        variant="docked"
        title={uiText("视频助手")}
        subtitle={selectedSegment ? `片段 ${selectedSegment.order + 1}` : props.sequence.name}
        messages={assistantMessages}
        value={assistantValue}
        placeholder={uiText("描述镜头运动、节奏或想调整的生成参数…")}
        streaming={assistantStreaming}
        activityLabel={assistantActivity ?? undefined}
        interaction={assistantInteraction?.state}
        onValueChange={setAssistantValue}
        onSubmit={submitVideoAssistant}
        onStop={stopVideoAssistant}
        onClose={() => setAssistantOpen(false)}
        onInteractionSubmit={submitVideoAssistantInteraction}
        onInteractionDismiss={dismissVideoAssistantInteraction}
        onApplyGeneratedPrompt={applyVideoAssistantPrompt}
      />
    </aside> : null}
  </main>;
}

function SequenceTopbar(props: VideoSequenceEditorProps & { targetCount: number; inspectorOpen: boolean; onToggleInspector: () => void; onGenerate: () => void; onTemplate: () => void; onExport: () => void; onAssistant: () => void }): React.ReactElement {
  const uiText = useUiText();

  const active = props.sequence.segments.filter((segment) => segment.taskState && ACTIVE_TASKS.has(segment.taskState)).length;
  return <header className="vse-topbar">
    <div className="vse-title-group"><Icon label={uiText("返回画布")} onClick={props.onClose}><ArrowLeft /></Icon><div><strong>{props.sequence.name}</strong><span>{props.sequence.boardName ?? "镜头序列"}</span></div><small className={props.saveError ? "error" : ""}>{props.saveError ? uiText("保存失败") : props.saving ? uiText("正在保存…") : uiText("已保存")}</small></div>
    <div className="vse-center-status"><Sparkles /><span>{active ? uiText("正在生成 {{ui:0}} 个片段", [active]) : uiText("{{ui:0}}/{{ui:1}} 最新", [props.sequence.segments.length - props.targetCount, props.sequence.segments.length])}</span></div>
    <div className="vse-actions"><Icon label={uiText("撤销")} onClick={props.onUndo}><Undo2 /></Icon><Icon label={uiText("重做")} onClick={props.onRedo}><Redo2 /></Icon><i /><Icon label={uiText("视频助手")} onClick={props.onAssistant}><Sparkles /></Icon>{props.sequence.kind !== "video-assembly" ? <><button className="vse-secondary template" onClick={props.onTemplate}><Layers3 />{uiText("模板")}<ChevronDown /></button><button className="vse-primary" disabled={!props.targetCount} onClick={props.onGenerate}><Zap />{uiText("生成待更新片段 · ")}{props.targetCount}</button></> : null}<button className="vse-secondary export" onClick={props.onExport}><Download /><span>{uiText("导出")}</span></button><Icon label={props.inspectorOpen ? uiText("收起属性") : uiText("打开属性")} onClick={props.onToggleInspector}><Settings2 /></Icon></div>
  </header>;
}

function SequencePreview({ videoRef, videoUrl, posterUrl, segment, playing, onPlayingChange, onTimeUpdate, onEnded }: { videoRef: React.RefObject<HTMLVideoElement | null>; videoUrl?: string; posterUrl?: string; segment?: VideoSequenceSegment; playing: boolean; onPlayingChange: (value: boolean) => void; onTimeUpdate: (localMs: number) => void; onEnded: () => void }): React.ReactElement {
  const uiText = useUiText();

  const status = segmentStatus(segment);
  return <div className="vse-stage"><div className="vse-stage-tools"><span>{segment ? uiText("片段 {{ui:0}}", [String(segment.order + 1).padStart(2, "0")]) : uiText("序列预览")}</span><Icon label={uiText("适应窗口")}><Focus /></Icon><Icon label={uiText("全屏")}><Maximize2 /></Icon></div><div className="vse-media">
    {videoUrl ? <video ref={videoRef} src={videoUrl} poster={posterUrl} muted={segment?.muted} onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.max(0, (segment?.trimInMs ?? 0) / 1_000); }} onTimeUpdate={(event) => { const localMs = event.currentTarget.currentTime * 1_000 - (segment?.trimInMs ?? 0); onTimeUpdate(Math.max(0, localMs)); if (segment?.trimOutMs !== undefined && event.currentTarget.currentTime * 1_000 >= segment.trimOutMs) onEnded(); }} onEnded={onEnded} /> : posterUrl ? <img src={posterUrl} alt={uiText("当前片段预览")} /> : <div className="vse-media-empty"><Film /><strong>{uiText("暂无可预览版本")}</strong><span>{uiText("生成片段后将在这里连续预览")}</span></div>}
    {status.kind !== "valid" ? <StatusBadge kind={status.kind} label={status.label} detail={segment?.progress} floating /> : null}
    <button className="vse-big-play" aria-label={playing ? uiText("暂停") : uiText("播放")} onClick={() => onPlayingChange(!playing)}>{playing ? <Pause /> : <Play />}</button>
  </div></div>;
}
function Transport({ playing, timeMs, totalMs, onPlayingChange, onSeek }: { playing: boolean; timeMs: number; totalMs: number; onPlayingChange: (value: boolean) => void; onSeek: (value: number) => void }): React.ReactElement {
  const uiText = useUiText();

  return <div className="vse-transport"><Icon label={uiText("上一片段")}><SkipBack /></Icon><button className="vse-play" aria-label={playing ? uiText("暂停") : uiText("播放")} onClick={() => onPlayingChange(!playing)}>{playing ? <Pause /> : <Play />}</button><Icon label={uiText("下一片段")}><SkipForward /></Icon><input aria-label={uiText("播放位置")} type="range" min={0} max={Math.max(1, totalMs)} step={100} value={Math.min(timeMs, totalMs)} onChange={(event) => onSeek(Number(event.target.value))} /><span>{formatTime(timeMs)} / {formatTime(totalMs)}</span><Icon label={uiText("音量")}><Volume2 /></Icon><Icon label={uiText("循环播放")}><RotateCcw /></Icon></div>;
}

function Inspector(props: VideoSequenceEditorProps & { frames: ReturnType<typeof orderedKeyframes>; segments: ReturnType<typeof orderedSegments>; selection: Selection; selectedFrame?: ReturnType<typeof orderedKeyframes>[number]; selectedSegment?: VideoSequenceSegment; onSelect: (selection: Selection) => void; onPatch: (id: string, patch: Partial<VideoSequenceSegment>) => void; onReorder: (id: string, index: number) => void; onGenerate: () => void }): React.ReactElement {
  const uiText = useUiText();

  const frame = props.selectedFrame; const segment = props.selectedSegment;
  return <aside className="vse-inspector"><header><div><span>{segment ? props.sequence.kind === "video-assembly" ? uiText("成片片段") : uiText("生成片段") : frame ? uiText("关键帧") : uiText("序列设置")}</span><strong>{segment ? uiText("片段 {{ui:0}}", [String(segment.order + 1).padStart(2, "0")]) : frame?.label ?? props.sequence.name}</strong></div><MoreHorizontal /></header>
    {frame ? <KeyframeInspector {...props} frame={frame} /> : segment ? <SegmentInspector {...props} segment={segment} /> : null}
  </aside>;
}

function KeyframeInspector(props: Parameters<typeof Inspector>[0] & { frame: ReturnType<typeof orderedKeyframes>[number] }): React.ReactElement {
  const uiText = useUiText();

  const { frame, frames } = props; const index = frames.findIndex((item) => item.id === frame.id); const url = props.mediaUrls[frame.imagePath];
  return <>{frame.missing ? <div className="vse-alert error"><AlertTriangle /><div><b>{uiText("素材不可用")}</b><small>{uiText("请重新定位或替换关键帧")}</small></div></div> : frame.sourceUpdateAvailable ? <div className="vse-alert warning"><AlertTriangle /><div><b>{uiText("来源已有新版本")}</b><small>{uiText("当前序列仍使用冻结版本")}</small></div></div> : null}<section className="vse-frame-detail">{url ? <img src={url} alt="" /> : <div><ImageIcon /></div>}<span><b>{uiText("关键帧 ")}{String(index + 1).padStart(2, "0")}</b><small>{uiText("来自画板 · 冻结素材")}</small></span></section><section><h3>{uiText("顺序与关系")}</h3><div className="vse-order"><button disabled={!index} onClick={() => props.onReorder(frame.id, index - 1)}><ChevronLeft />{uiText("向前")}</button><button disabled={index === frames.length - 1} onClick={() => props.onReorder(frame.id, index + 1)}>{uiText("向后")}<ChevronRight /></button></div><p className="vse-hint"><AlertTriangle />{uiText("调整顺序只会使变化的邻接片段待更新")}</p></section><section><h3>{uiText("相邻片段")}</h3><div className="vse-related">{props.segments.filter((item) => item.fromKeyframeId === frame.id || item.toKeyframeId === frame.id).map((item) => <button key={item.id} onClick={() => props.onSelect({ type: "segment", id: item.id })}><Film /><span>{uiText("片段 ")}{item.order + 1}</span><SegmentStatus segment={item} /></button>)}</div></section><footer><button className="vse-secondary" onClick={() => props.onReplaceKeyframe?.(frame.id)}><ImageIcon />{uiText("替换图片")}</button><button className="vse-secondary" onClick={() => props.onLocateKeyframe?.(frame.id)}><Focus />{uiText("在画布中定位")}</button></footer></>;
}

function SegmentInspector(props: Parameters<typeof Inspector>[0] & { segment: VideoSequenceSegment }): React.ReactElement {
  const uiText = useUiText();

  const { segment } = props; const from = props.frames.find((frame) => frame.id === segment.fromKeyframeId); const to = props.frames.find((frame) => frame.id === segment.toKeyframeId); const duration = props.sequence.kind === "video-assembly" ? (activeSegmentVersion(segment)?.durationMs ?? 0) / 1_000 : segment.durationSeconds ?? props.sequence.defaults.durationSeconds; const versions = [...segment.versions].reverse();
  return <><div className={cn("vse-alert", segmentStatus(segment).kind)}><SegmentStatus segment={segment} /><small>{segment.error ?? statusExplanation(segment)}</small></div>{props.sequence.kind !== "video-assembly" ? <><section><h3>{uiText("生成输入")}</h3><div className="vse-frame-pair">{[from, to].map((frame, index) => <button key={frame?.id ?? index} onClick={() => frame && props.onSelect({ type: "keyframe", id: frame.id })}>{frame && props.mediaUrls[frame.imagePath] ? <img src={props.mediaUrls[frame.imagePath]} alt="" /> : <ImageIcon />}<span>{index ? uiText("尾帧") : uiText("首帧")}</span></button>)}</div><label className="vse-field"><span>{uiText("运动描述")}<small>{segment.prompt.length}/500</small></span><textarea maxLength={500} value={segment.prompt} onChange={(event) => props.onPatch(segment.id, { prompt: event.target.value })} /></label></section><section><h3>{uiText("生成设置")}</h3><label className="vse-row"><span>{uiText("模型")}</span><select value={segment.providerId ?? props.sequence.defaults.providerId ?? ""} onChange={(event) => props.onPatch(segment.id, { providerId: event.target.value })}>{props.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><label className="vse-row"><span>{uiText("时长")}</span><select value={duration} onChange={(event) => props.onPatch(segment.id, { durationSeconds: Number(event.target.value) })}>{[5, 6, 10].map((value) => <option key={value} value={value}>{value} {uiText("秒")}</option>)}</select></label><label className="vse-row"><span>{uiText("分辨率")}</span><select value={segment.resolution ?? props.sequence.defaults.resolution} onChange={(event) => props.onPatch(segment.id, { resolution: event.target.value })}><option>720p</option><option>1080p</option></select></label><label className="vse-row"><span>{uiText("生成声音")}</span><input type="checkbox" checked={segment.generateAudio ?? props.sequence.defaults.generateAudio} onChange={(event) => props.onPatch(segment.id, { generateAudio: event.target.checked })} /></label></section></> : null}<section><h3>{uiText("剪辑")}</h3><div className="vse-trim"><label>{uiText("入点")}<input type="number" min={0} step={.1} value={segment.trimInMs / 1_000} onChange={(event) => props.onPatch(segment.id, { trimInMs: Number(event.target.value) * 1_000 })} /></label><label>{uiText("出点")}<input type="number" min={0} step={.1} value={(segment.trimOutMs ?? duration * 1_000) / 1_000} onChange={(event) => props.onPatch(segment.id, { trimOutMs: Number(event.target.value) * 1_000 })} /></label><label className="vse-mute">{uiText("静音")}<input type="checkbox" checked={segment.muted ?? false} onChange={(event) => props.onPatch(segment.id, { muted: event.target.checked, state: segment.state })} /></label></div></section><section><h3>{uiText("版本")}<small>{versions.length} {uiText("个")}</small></h3><div className="vse-versions">{versions.length ? versions.map((version) => <button key={version.id} className={version.id === (segment.activeVersionId ?? versions[0]?.id) ? "active" : ""} onClick={() => props.onPatch(segment.id, { activeVersionId: version.id, state: segment.state })}><span>v{segment.versions.indexOf(version) + 1}</span><div><b>{version.id === segment.activeVersionId ? uiText("当前版本") : uiText("历史版本")}</b><small>{formatDate(version.createdAt)} · {version.model ?? "视频模型"}</small></div>{version.id === segment.activeVersionId ? <Check /> : null}</button>) : <p className="vse-empty">{uiText("尚无成功版本")}</p>}</div></section>{props.sequence.kind !== "video-assembly" ? <footer><button className="vse-primary" disabled={segmentIsBlocked(segment) || ACTIVE_TASKS.has(segment.taskState ?? "idle")} onClick={props.onGenerate}>{segment.taskState === "failed" ? uiText("重试此片段") : uiText("重新生成此片段")}</button></footer> : null}</>;
}

function SequenceTimeline({ sequence, mediaUrls, frames, segments, selection, playheadMs, totalMs, onSelect, onSeek, onReorder }: {
  sequence: VideoSequenceEditorProps["sequence"];
  mediaUrls: VideoSequenceEditorProps["mediaUrls"];
  frames: ReturnType<typeof orderedKeyframes>;
  segments: ReturnType<typeof orderedSegments>;
  selection: Selection;
  playheadMs: number;
  totalMs: number;
  onSelect: (selection: Selection) => void;
  onSeek: (value: number) => void;
  onReorder: (id: string, index: number) => void;
}): React.ReactElement {
  const uiText = useUiText();

  return <section className="vse-timeline"><header><div><Film /><strong>{uiText("时间线")}</strong><span>{frames.length} {uiText("个关键帧 · ")}{segments.length} {uiText("个片段 · ")}{formatTime(totalMs)}</span></div><div><button>−</button><span>100%</span><button>＋</button><button><Maximize2 />{uiText("适配")}</button></div></header><div className="vse-storyboard" role="list" aria-label={uiText("关键帧顺序")}>{frames.map((frame, index) => <div className="vse-story-item" key={frame.id}><button draggable onDragStart={(event) => event.dataTransfer.setData("text/video-sequence-keyframe", frame.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onReorder(event.dataTransfer.getData("text/video-sequence-keyframe"), index)} onKeyDown={(event) => { if (event.altKey && event.key === "ArrowLeft") onReorder(frame.id, index - 1); if (event.altKey && event.key === "ArrowRight") onReorder(frame.id, index + 1); }} className={cn("vse-frame-chip", selection.type === "keyframe" && selection.id === frame.id && "selected", frame.missing && "missing")} onClick={() => onSelect({ type: "keyframe", id: frame.id })}>{mediaUrls[frame.imagePath] ? <img src={mediaUrls[frame.imagePath]} alt="" /> : <ImageIcon />}<span>{String(index + 1).padStart(2, "0")}</span><small>{frame.label ?? `关键帧 ${index + 1}`}</small></button>{segments[index] ? <button className={cn("vse-link", segmentStatus(segments[index]).kind, selection.type === "segment" && selection.id === segments[index].id && "selected")} onClick={() => onSelect({ type: "segment", id: segments[index].id })}><i /><SegmentStatus segment={segments[index]} /><span>{segments[index].durationSeconds ?? sequence.defaults.durationSeconds}s</span></button> : null}</div>)}</div><div className="vse-ruler"><span>0s</span><span>{formatTime(totalMs * .25)}</span><span>{formatTime(totalMs * .5)}</span><span>{formatTime(totalMs * .75)}</span><span>{formatTime(totalMs)}</span></div><div className="vse-track" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onSeek((event.clientX - rect.left) / rect.width * totalMs); }}><div className="vse-playhead" style={{ left: `${totalMs ? playheadMs / totalMs * 100 : 0}%` }}><i /></div>{segments.map((segment, index) => { const version = activeSegmentVersion(segment); const image = version?.posterPath ? mediaUrls[version.posterPath] : mediaUrls[frames[index + 1]?.imagePath]; return <button key={segment.id} draggable={sequence.kind === "video-assembly"} onDragStart={(event) => event.dataTransfer.setData("text/video-sequence-segment", segment.id)} onDragOver={(event) => sequence.kind === "video-assembly" && event.preventDefault()} onDrop={(event) => sequence.kind === "video-assembly" && onReorder(event.dataTransfer.getData("text/video-sequence-segment"), index)} style={{ flexGrow: effectiveSegmentDurationMs(segment, sequence.defaults.durationSeconds) }} className={cn("vse-clip", segmentStatus(segment).kind, selection.type === "segment" && selection.id === segment.id && "selected")} onClick={(event) => { event.stopPropagation(); onSelect({ type: "segment", id: segment.id }); }}>{image ? <img src={image} alt="" /> : null}<em /><div><b>{uiText("片段 ")}{String(index + 1).padStart(2, "0")}</b><small>{(effectiveSegmentDurationMs(segment, sequence.defaults.durationSeconds) / 1_000).toFixed(1)}s · v{segment.versions.length || 0}</small></div><SegmentStatus segment={segment} /><i className="start" /><i className="end" /></button>; })}</div></section>;
}

interface DialogShellProps { open: boolean; title: string; icon: React.ReactNode; children?: React.ReactNode; onClose: () => void; }
export function DialogShell({ open, title, icon, children, onClose }: DialogShellProps): React.ReactElement | null {
  const uiText = useUiText();

  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => { window.removeEventListener("keydown", handleKeyDown); openerRef.current?.focus(); };
  }, [onClose, open]);
  if (!open) return null;
  return <div className="vse-dialog-backdrop" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="vse-dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header><span>{icon}</span><div><strong>{title}</strong><small>{uiText("确认设置后继续")}</small></div><Icon label={uiText("关闭")} onClick={onClose}><X /></Icon></header>{children}</section></div>;
}

function GenerationDialog({ open, sequence, segments, credits, busy, onClose, onConfirm }: { open: boolean; sequence: VideoSequenceEditorProps["sequence"]; segments: VideoSequenceSegment[]; credits?: VideoSequenceEditorProps["credits"]; busy: boolean; onClose: () => void; onConfirm: () => void }): React.ReactElement {
  const uiText = useUiText();

  const seconds = segments.reduce((sum, item) => sum + (item.durationSeconds ?? sequence.defaults.durationSeconds), 0);
  const cost = credits?.videoGoldBeanCostPerSecond === undefined ? undefined : Math.ceil(seconds * credits.videoGoldBeanCostPerSecond);
  const insufficient = cost !== undefined && credits?.balance !== undefined && cost > credits.balance;
  return <DialogShell open={open} title={uiText("确认批量生成")} icon={<Zap />} onClose={onClose}><div className="vse-cost"><div><span>{uiText("将生成")}</span><b>{segments.length} {uiText("个片段")}</b></div><div><span>{uiText("生成时长")}</span><b>{seconds} {uiText("秒")}</b></div><div><span>{cost === undefined ? uiText("费用") : uiText("预计消耗")}</span><b>{cost === undefined ? credits?.quoteLabel ?? "供应商计费" : uiText("{{ui:0}} 金豆", [cost])}</b></div><div><span>{uiText("当前余额")}</span><b>{credits?.balance === undefined ? uiText("未知") : uiText("{{ui:0}} 金豆", [credits.balance])}</b></div></div>{insufficient ? <div className="vse-dialog-warning error"><AlertTriangle /><span><b>{uiText("金豆余额不足")}</b><small>{uiText("还差 ")}{cost! - credits!.balance!} {uiText("金豆，本批次无法提交。")}</small></span></div> : <div className="vse-dialog-note"><Sparkles /><span><b>{sequence.defaults.model} · {sequence.defaults.resolution}</b><small>{uiText("单片段失败不会影响其他任务；窗口关闭后任务继续。")}</small></span></div>}<div className="vse-job-list">{segments.map((segment) => <div key={segment.id}><span>{uiText("片段 ")}{segment.order + 1}</span><SegmentStatus segment={segment} /><span>{segment.durationSeconds ?? sequence.defaults.durationSeconds}s</span><b>{cost === undefined ? "—" : uiText("{{ui:0}} 金豆", [Math.ceil((segment.durationSeconds ?? sequence.defaults.durationSeconds) * (credits?.videoGoldBeanCostPerSecond ?? 0))])}</b></div>)}</div><DialogFooter busy={busy} disabled={insufficient || !segments.length} label={uiText("确认生成 · {{ui:0}}", [segments.length])} onClose={onClose} onConfirm={onConfirm} /></DialogShell>;
}

function TemplateDialog({ open, templates, busy, onClose, onSave, onApply }: { open: boolean; templates: NonNullable<VideoSequenceEditorProps["templates"]>; busy: boolean; onClose: () => void; onSave: (name: string) => void; onApply: (id: string) => void }): React.ReactElement {
  const uiText = useUiText();

  const [mode, setMode] = useState<"apply" | "save">("apply"); const [selected, setSelected] = useState(templates[0]?.id ?? ""); const [name, setName] = useState("");
  return <DialogShell open={open} title={uiText("序列模板")} icon={<Layers3 />} onClose={onClose}><div className="vse-dialog-tabs"><button className={mode === "apply" ? "active" : ""} onClick={() => setMode("apply")}>{uiText("应用模板")}</button><button className={mode === "save" ? "active" : ""} onClick={() => setMode("save")}>{uiText("保存为模板")}</button></div>{mode === "apply" ? <div className="vse-template-list">{templates.length ? templates.map((template) => <button key={template.id} className={selected === template.id ? "active" : ""} onClick={() => setSelected(template.id)}><span><Film /></span><div><b>{template.name}</b><small>{template.slotCount} {uiText("个槽位 · ")}{template.segmentCount} {uiText("个片段 · ")}{template.aspectRatio}</small></div>{selected === template.id ? <Check /> : null}</button>) : <p className="vse-empty">{uiText("还没有序列模板")}</p>}</div> : <div className="vse-save-template"><label>{uiText("模板名称")}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={uiText("例如：产品氛围短片")} /></label><p>{uiText("保存关键帧槽位、运动描述、生成设置和裁剪设置，不保存具体素材。")}</p></div>}<DialogFooter busy={busy} disabled={mode === "apply" ? !selected : !name.trim()} label={mode === "apply" ? uiText("应用模板") : uiText("保存模板")} onClose={onClose} onConfirm={() => mode === "apply" ? onApply(selected) : onSave(name.trim())} /></DialogShell>;
}

function ExportDialog({ open, sequence, hasStale, busy, onClose, onConfirm }: { open: boolean; sequence: VideoSequenceEditorProps["sequence"]; hasStale: boolean; busy: boolean; onClose: () => void; onConfirm: (options: VideoSequenceExportOptions) => void }): React.ReactElement {
  const uiText = useUiText();

  const [fileName, setFileName] = useState(sequence.name); const [resolution, setResolution] = useState(sequence.defaults.resolution); const [fps, setFps] = useState<number>(sequence.defaults.fps); const [includeAudio, setIncludeAudio] = useState(true); const [updateFirst, setUpdateFirst] = useState(true);
  return <DialogShell open={open} title={uiText("导出视频")} icon={<Download />} onClose={onClose}><div className="vse-export-form"><label>{uiText("文件名")}<input value={fileName} onChange={(event) => setFileName(event.target.value)} /></label><div><label>{uiText("分辨率")}<select value={resolution} onChange={(event) => setResolution(event.target.value)}><option>720p</option><option>1080p</option></select></label><label>{uiText("帧率")}<select value={fps} onChange={(event) => setFps(Number(event.target.value))}><option value={24}>24 fps</option><option value={25}>25 fps</option><option value={30}>30 fps</option></select></label></div><label className="vse-check"><input type="checkbox" checked={includeAudio} onChange={(event) => setIncludeAudio(event.target.checked)} />{uiText("包含片段声音")}</label></div>{hasStale ? <div className="vse-dialog-warning"><AlertTriangle /><span><b>{uiText("存在待生成或待更新片段")}</b><small>{uiText("可先更新并在全部完成后自动导出。")}</small></span><label><input type="checkbox" checked={updateFirst} onChange={(event) => setUpdateFirst(event.target.checked)} />{uiText("先更新再导出")}</label></div> : null}<div className="vse-export-meta"><span>{formatTime(sequenceDurationMs(sequence))}</span><span>MP4 / H.264</span><span>{resolution} · {fps} fps</span></div><DialogFooter busy={busy} disabled={!fileName.trim()} label={hasStale && updateFirst ? uiText("更新并导出") : uiText("开始导出")} onClose={onClose} onConfirm={() => onConfirm({ fileName: fileName.trim(), resolution, fps, includeAudio, updateBeforeExport: hasStale && updateFirst })} /></DialogShell>;
}

function DialogFooter({ busy, disabled, label, onClose, onConfirm }: { busy: boolean; disabled?: boolean; label: string; onClose: () => void; onConfirm: () => void }): React.ReactElement {
  const uiText = useUiText();
 return <footer className="vse-dialog-footer"><button className="vse-secondary" disabled={busy} onClick={onClose}>{uiText("取消")}</button><button className="vse-primary" disabled={disabled || busy} onClick={onConfirm}>{busy ? <Loader2 className="spin" /> : null}{label}</button></footer>; }

function Icon({ label, children, onClick }: { label: string; children: React.ReactNode; onClick?: () => void }): React.ReactElement { return <button type="button" className="vse-icon" aria-label={label} title={label} onClick={onClick}>{children}</button>; }
function SegmentStatus({ segment }: { segment: VideoSequenceSegment }): React.ReactElement { const status = segmentStatus(segment); return <StatusBadge kind={status.kind} label={status.label} detail={segment.progress} />; }
function StatusBadge({ kind, label, detail, floating }: { kind: string; label: string; detail?: number; floating?: boolean }): React.ReactElement { return <span className={cn("vse-status", kind, floating && "floating")}>{kind === "valid" ? <Check /> : kind === "generating" ? <Loader2 className="spin" /> : <AlertTriangle />}{label}{detail !== undefined && kind === "generating" ? ` ${Math.round(detail)}%` : ""}</span>; }

function segmentStatus(segment?: VideoSequenceSegment): { kind: string; label: string } {
  if (!segment) return { kind: "configured", label: "未配置" };
  if (segment.taskState && ACTIVE_TASKS.has(segment.taskState)) return { kind: "generating", label: "生成中" };
  if (segment.taskState === "failed") return { kind: "failed", label: "失败" };
  const labels: Record<VideoSequenceSegmentState, string> = { empty: "待配置", configured: "待生成", valid: "最新", stale: "待更新", missing_input: "输入缺失", incompatible: "不兼容" };
  return { kind: segment.state, label: labels[segment.state] };
}
function statusExplanation(segment: VideoSequenceSegment): string { if (segment.taskState && ACTIVE_TASKS.has(segment.taskState)) return "新版本正在生成，旧版本仍可预览"; if (segment.state === "stale") return "生成输入已修改，需要重新生成"; if (segment.state === "valid") return "当前版本与生成输入一致"; if (segment.state === "missing_input") return "首帧或尾帧素材不可用"; if (segment.state === "incompatible") return "当前模型不支持所选参数"; return "配置完成后即可生成"; }
function segmentAtPlayhead(segments: VideoSequenceSegment[], fallbackSeconds: number, timeMs: number): VideoSequenceSegment | undefined { let offset = 0; for (const segment of segments) { offset += effectiveSegmentDurationMs(segment, fallbackSeconds); if (timeMs <= offset) return segment; } return segments.at(-1); }
function segmentStartMs(segments: VideoSequenceSegment[], fallbackSeconds: number, segmentId?: string): number { let offset = 0; for (const segment of segments) { if (segment.id === segmentId) return offset; offset += effectiveSegmentDurationMs(segment, fallbackSeconds); } return offset; }
function segmentEndMs(segments: VideoSequenceSegment[], fallbackSeconds: number, segmentId?: string): number { const start = segmentStartMs(segments, fallbackSeconds, segmentId); const segment = segments.find((item) => item.id === segmentId); return start + (segment ? effectiveSegmentDurationMs(segment, fallbackSeconds) : 0); }
function selectionIndex(frames: ReturnType<typeof orderedKeyframes>, id: string): number { return Math.max(0, frames.findIndex((item) => item.id === id)); }
function formatTime(ms: number): string { const seconds = Math.max(0, ms) / 1_000; return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${Math.floor(seconds % 1 * 10)}`; }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
