import { useUiText } from "@/i18n";
import { memo, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  Clock3,
  FileAudio,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Square,
  Video,
  X
} from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { VideoProviderConfig } from "@shared/types";
import { getProviderModels } from "@shared/provider-models";
import { findVideoProviderModelOption, resolveVideoModelCapability, resolveVideoParameters, validateVideoParameters } from "@shared/video-provider-models";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import type { GeneratedImage } from "./image-node-model";
import { resolveVideoGenerationAspectRatio } from "./video-generation-image-inputs";
import { useDebouncedNodeCommit } from "./use-debounced-node-commit";
import { useCanvasThumbnail } from "./use-canvas-thumbnail";
import type { ConnectionTargetPresentation } from "./connection-target-presentation";
import {
  VIDEO_MAX_REFERENCE_IMAGES,
  formatVideoDuration,
  videoGenerationModeLabel,
  type AudioReferenceInput,
  type VideoGenerationMode,
  type VideoReferenceInput
} from "./video-node-model";

export { VIDEO_GENERATION_NODE_HEIGHT, VIDEO_GENERATION_NODE_MIN_WIDTH, VIDEO_GENERATION_NODE_WIDTH } from "./canvas-node-layout";
export const VIDEO_GENERATION_PROMPT_MAX_LENGTH = 2000;

export type VideoGenerationNodeStatus =
  | "draft"
  | "ready"
  | "blocked"
  | "submitting"
  | "queued"
  | "generating"
  | "post_processing"
  | "recovering"
  | "polling_stopped"
  | "completed"
  | "modified"
  | "failed"
  | "cancelled";

export interface VideoGenerationNodeConfig {
  mode: VideoGenerationMode;
  prompt: string;
  providerId: string;
  model: string;
  duration: number;
  aspectRatio: string;
  resolution: string;
  generateAudio: boolean;
}

export interface VideoGenerationNodeData extends Omit<VideoGenerationNodeConfig, "mode" | "providerId">, ConnectionTargetPresentation {
  mode?: VideoGenerationMode;
  advancedVideoModesEnabled?: boolean;
  providerId?: string;
  sourceVideoPath?: string;
  providerOptions?: VideoProviderConfig[];
  requiresFirstLastFrame?: boolean;
  goldBeanBalance?: number;
  goldBeanLoading?: boolean;
  videoGoldBeanCostPerSecond?: number;
  title?: string;
  status?: VideoGenerationNodeStatus;
  error?: string;
  lastGenerationId?: string;
  startFrame?: GeneratedImage;
  endFrame?: GeneratedImage;
  referenceImages?: GeneratedImage[];
  referenceVideos?: VideoReferenceInput[];
  referenceAudios?: AudioReferenceInput[];
  onBeforeChange?: () => void;
  onChange?: (nodeId: string, patch: Partial<VideoGenerationNodeConfig>) => void;
  onRun?: (nodeId: string, config: VideoGenerationNodeConfig) => void;
  onRetry?: (nodeId: string, config: VideoGenerationNodeConfig) => void;
  onStopPolling?: (nodeId: string) => void;
  onResumePolling?: (nodeId: string) => void;
  onChooseAudio?: (nodeId: string) => void;
  onRemoveAudio?: (nodeId: string, audio: AudioReferenceInput) => void;
}

const BUSY_STATUSES: ReadonlySet<VideoGenerationNodeStatus> = new Set(["submitting", "queued", "generating", "post_processing", "recovering"]);
const MODE_OPTIONS: VideoGenerationMode[] = ["generate", "remix", "extend"];
const MODE_PRESENTATION: Record<VideoGenerationMode, {
  title: string;
  description: string;
  promptLabel: string;
  promptPlaceholder: string;
  submitLabel: string;
}> = {
  generate: {
    title: "新建视频",
    description: "从文字或参考画面创建一个全新视频。",
    promptLabel: "视频描述",
    promptPlaceholder: "描述主体、场景、动作与镜头变化...",
    submitLabel: "生成视频"
  },
  remix: {
    title: "改编视频",
    description: "重新演绎源视频，结果保存为原视频的新版本。",
    promptLabel: "改编要求",
    promptPlaceholder: "例如：保留人物动作，改成赛博朋克夜景...",
    submitLabel: "生成新版本"
  },
  extend: {
    title: "继续视频",
    description: "从源视频结尾继续生成，结果作为独立的下一段。",
    promptLabel: "后续内容",
    promptPlaceholder: "描述接下来发生什么，以及镜头如何继续...",
    submitLabel: "生成下一段"
  }
};

export function videoGenerationStatusLabel(status: VideoGenerationNodeStatus): string {
  switch (status) {
    case "ready": return "可生成";
    case "blocked": return "待修复";
    case "submitting": return "提交中";
    case "queued": return "排队中";
    case "generating": return "生成中";
    case "post_processing": return "下载中";
    case "recovering": return "恢复中";
    case "polling_stopped": return "已停止等待";
    case "completed": return "已完成";
    case "modified": return "已修改";
    case "failed": return "失败";
    case "cancelled": return "已取消";
    default: return "草稿";
  }
}

function VideoGenerationNodeComponent({ id, data, selected }: NodeProps): React.ReactElement {
  const uiText = useUiText();

  const nodeData = data as unknown as VideoGenerationNodeData;
  const {
  title = "视频生成",
  mode,
  advancedVideoModesEnabled = false,
  prompt,
  providerId,
  sourceVideoPath,
  model,
  duration,
  aspectRatio,
  resolution,
  generateAudio,
  status = "draft",
  error,
  lastGenerationId,
  startFrame,
  endFrame,
  referenceImages = [],
  referenceVideos = [],
  referenceAudios = [],
  providerOptions = [],
  requiresFirstLastFrame = false,
  goldBeanBalance,
  goldBeanLoading = false,
  videoGoldBeanCostPerSecond,
  onBeforeChange,
  onChange,
  onRun,
  onRetry,
  onStopPolling,
  onResumePolling,
  onChooseAudio,
  onRemoveAudio,
  connectionTargetActive,
  compatibleConnectionHandles = [],
  connectionSnapTargetHandle
} = nodeData;
  const aspectRatioSuggestion = resolveVideoGenerationAspectRatio(startFrame, endFrame, referenceImages);
  const aspectRatioSourceKey = aspectRatioSuggestion?.sourceKey ?? "";
  const previousAspectRatioSourceKey = useRef<string | undefined>(undefined);
  const [imagePreview, setImagePreview] = useState<{
    image: GeneratedImage;
    src: string;
    alt: string;
  } | null>(null);
  const [draft, setDraft] = useState<VideoGenerationNodeConfig>(() => configFromData({
    mode,
    prompt,
    providerId,
    model,
    duration,
    aspectRatio: aspectRatioSuggestion?.aspectRatio ?? aspectRatio,
    resolution,
    generateAudio
  } as VideoGenerationNodeData, providerOptions));
  const draftRef = useRef(draft);
  const composingRef = useRef(false);
  const busy = BUSY_STATUSES.has(status);
  const selectedProvider = providerOptions.find((provider) => provider.id === draft.providerId);
  const modelOption = findVideoProviderModelOption(selectedProvider?.modelOptions, draft.model);
  const constraints = resolveVideoParameters(modelOption);
  const parameterOptions = videoParameterOptions(selectedProvider, draft.model);
  const providerParametersKey = JSON.stringify(providerOptions.map((provider) => [provider.id, provider.modelOptions]));
  const selectedModelCapability = requiresFirstLastFrame
    ? resolveVideoModelCapability(
        findVideoProviderModelOption(selectedProvider?.modelOptions, draft.model),
        "first-last-frame"
      )
    : "supported";
  const capabilityBlock = requiresFirstLastFrame && selectedModelCapability !== "supported"
    ? selectedModelCapability === "unknown"
      ? "当前模型的首尾帧能力未知，请切换模型或检查 Provider 配置。"
      : "当前模型不支持首尾帧生成，请切换模型。"
    : undefined;
  const hasSourceVideo = Boolean(sourceVideoPath || referenceVideos.length);
  const modePresentation = MODE_PRESENTATION[draft.mode];
  const showAdvancedModeControls = advancedVideoModesEnabled || draft.mode !== "generate";
  const modeUnavailableReason = videoModeUnavailableReason(draft.mode, hasSourceVideo, selectedProvider);
  const { schedule, flush, finish, cancel } = useDebouncedNodeCommit(
    (config: VideoGenerationNodeConfig) => onChange?.(id, config),
    undefined,
    onBeforeChange
  );
  const commitNormalizedParameters = useEffectEvent((config: VideoGenerationNodeConfig) => {
    onChange?.(id, config);
  });
  const commitInferredAspectRatio = useEffectEvent((value: string) => {
    onChange?.(id, { aspectRatio: value });
  });

  useEffect(() => {
    cancel();
    const inputChanged = previousAspectRatioSourceKey.current !== aspectRatioSourceKey;
    previousAspectRatioSourceKey.current = aspectRatioSourceKey;
    const inferredAspectRatio = inputChanged ? aspectRatioSuggestion?.aspectRatio : undefined;
    const next = configFromData({
      mode,
      prompt,
      providerId,
      model,
      duration,
      aspectRatio: inferredAspectRatio ?? aspectRatio,
      resolution,
      generateAudio
    } as VideoGenerationNodeData, providerOptions);
    draftRef.current = next;
    setDraft(next);
    if (next.duration !== duration || next.aspectRatio !== (inferredAspectRatio ?? aspectRatio) || next.resolution !== resolution || next.generateAudio !== generateAudio) {
      commitNormalizedParameters(next);
    } else if (inferredAspectRatio && inferredAspectRatio !== aspectRatio) {
      commitInferredAspectRatio(inferredAspectRatio);
    }
    // Effect Events are non-reactive; the installed hooks lint predates their support.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    aspectRatio,
    aspectRatioSourceKey,
    aspectRatioSuggestion?.aspectRatio,
    cancel,
    duration,
    generateAudio,
    id,
    mode,
    model,
    prompt,
    providerId,
    providerParametersKey,
    resolution
  ]);

  function update(patch: Partial<VideoGenerationNodeConfig>): void {
    const next = configFromData({ ...draftRef.current, ...patch }, providerOptions);
    draftRef.current = next;
    setDraft(next);
    schedule(next);
  }

  const promptRequired = constraints.requiresPrompt;
  const promptBlock = promptRequired && !draft.prompt.trim()
    ? uiText("当前模型需要视频描述，请填写后再生成。")
    : undefined;
  const parameterError = validateVideoParameters({
    prompt: draft.prompt, durationSeconds: draft.duration, aspectRatio: draft.aspectRatio,
    resolution: draft.resolution, generateAudio: draft.generateAudio,
    firstFrame: Boolean(startFrame), lastFrame: Boolean(endFrame),
    images: referenceImages.length + Number(Boolean(startFrame)) + Number(Boolean(endFrame)),
    videos: referenceVideos.length + Number(Boolean(sourceVideoPath && !referenceVideos.some((video) => video.path === sourceVideoPath))),
    audios: referenceAudios.length,
    ...(draft.mode === "remix" || draft.mode === "extend" ? { mode: draft.mode } : {})
  }, modelOption);
  const canRun = !busy
    && !parameterError
    && !modeUnavailableReason
    && !capabilityBlock
    && providerOptions.some((provider) => (
      provider.id === draft.providerId && getProviderModels(provider).includes(draft.model.trim())
    ))
    && referenceImages.length <= VIDEO_MAX_REFERENCE_IMAGES
    && (Boolean(draft.prompt.trim()) || Boolean(startFrame || endFrame || referenceImages.length || referenceVideos.length));
  const retryable = status === "failed" && Boolean(onRetry);

  return (
    <section
      data-video-generation-node=""
      data-advanced-video-modes={showAdvancedModeControls ? "true" : "false"}
      data-selected={selected ? "true" : undefined}
      data-connection-target-active={connectionTargetActive ? "true" : undefined}
      data-connection-snap-target={connectionSnapTargetHandle}
      className={cn(
        "canvas-node-card canvas-workflow-node video-generation-node group relative flex w-[340px] cursor-grab flex-col overflow-visible active:cursor-grabbing",
        selected && "canvas-workflow-node--selected"
      )}
      aria-label={uiText("{{ui:0}}节点，{{ui:1}}", [title, videoGenerationStatusLabel(status)])}
    >
      <VideoGenerationHandles
        connectionTargetActive={connectionTargetActive}
        compatibleConnectionHandles={compatibleConnectionHandles}
        connectionSnapTargetHandle={connectionSnapTargetHandle}
      />
      <header className="canvas-workflow-node__header">
        <span className="canvas-workflow-node__icon canvas-workflow-node__icon--generation"><Video aria-hidden /></span>
        <span className="canvas-workflow-node__title">{title}</span>
        <span className={cn("canvas-generation-status", `video-generation-status--${status}`)} role="status" aria-live="polite">
          <GenerationStatusIcon status={status} />{videoGenerationStatusLabel(status)}
        </span>
      </header>

      <div className="nodrag video-generation-body" onPointerDown={(event) => event.stopPropagation()}>
        {capabilityBlock ? (
          <div id={`video-capability-${id}`} className="video-generation-mode-detail is-blocked" role="alert">
            <CircleAlert aria-hidden />
            <span><strong>{uiText("首尾帧模型不可用")}</strong><small>{capabilityBlock}</small></span>
          </div>
        ) : null}
        {showAdvancedModeControls ? (
          <>
            <div className="video-generation-mode" role="group" aria-label={uiText("视频生成模式")}>
              {MODE_OPTIONS.map((option) => {
                const unavailableReason = videoModeUnavailableReason(option, hasSourceVideo, selectedProvider);
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    aria-pressed={draft.mode === option}
                    title={unavailableReason}
                    onClick={() => update({ mode: option })}
                  >
                    {videoGenerationModeLabel(option)}
                  </button>
                );
              })}
            </div>
            <div className={cn("video-generation-mode-detail", modeUnavailableReason && "is-blocked")} role={modeUnavailableReason ? "alert" : "status"}>
              {modeUnavailableReason ? <CircleAlert aria-hidden /> : <Check aria-hidden />}
              <span><strong>{modePresentation.title}</strong><small>{modeUnavailableReason || modePresentation.description}</small></span>
            </div>
          </>
        ) : null}
        <div className="video-generation-section">
          <div className="video-generation-section-title"><span>{hasSourceVideo ? uiText("源视频与参考") : uiText("画面参考")}</span><small>{referenceImages.length}/{VIDEO_MAX_REFERENCE_IMAGES} {uiText("参考图")}</small></div>
          <div className="video-generation-frame-grid">
            <FrameSlot label={uiText("首帧")} image={startFrame} required onPreview={(image, src, alt) => setImagePreview({ image, src, alt })} />
            <FrameSlot label={uiText("尾帧")} image={endFrame} onPreview={(image, src, alt) => setImagePreview({ image, src, alt })} />
          </div>
          {referenceImages.length ? (
            <div className="video-generation-references" aria-label={uiText("视频参考图")}>
              {referenceImages.slice(0, VIDEO_MAX_REFERENCE_IMAGES).map((image, index) => (
                <CanvasThumbnailImage
                  key={image.id}
                  image={image}
                  alt={uiText("参考图 {{ui:0}}", [index + 1])}
                  onPreview={(src, alt) => setImagePreview({ image, src, alt })}
                />
              ))}
            </div>
          ) : null}
          {referenceImages.length > VIDEO_MAX_REFERENCE_IMAGES ? (
            <p className="video-generation-input-error" role="alert">
              {uiText("当前模型最多接收 ")}{VIDEO_MAX_REFERENCE_IMAGES} {uiText("张参考图，请移除 ")}{referenceImages.length - VIDEO_MAX_REFERENCE_IMAGES} {uiText("张后生成。")}</p>
          ) : null}
          {referenceVideos.length ? (
            <div className="video-generation-video-references" aria-label={uiText("参考视频")}>
              {referenceVideos.map((video, index) => (
                <div key={video.id} className="video-generation-video-reference">
                  <span className="video-generation-video-thumb">
                    {video.posterDataUrl ? <img src={video.posterDataUrl} alt="" /> : <Video aria-hidden />}
                  </span>
                  <span>
                    <strong>{video.name}</strong>
                    <small>{video.path === sourceVideoPath || (!sourceVideoPath && draft.mode !== "generate" && index === 0) ? uiText("源视频") : uiText("参考视频")} · {formatVideoDuration(video.durationMs)}</small>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="video-generation-audio-references" aria-label={uiText("参考音频")}>
            {referenceAudios.map((audio) => (
              <span key={audio.id} className="video-generation-audio-chip">
                <FileAudio aria-hidden />
                <span title={audio.name}>{audio.name}</span>
                <small>{formatVideoDuration(audio.durationMs)}</small>
                {onRemoveAudio ? (
                  <button type="button" aria-label={uiText("移除参考音频 {{ui:0}}", [audio.name])} disabled={busy} onClick={() => onRemoveAudio(id, audio)}><X aria-hidden /></button>
                ) : null}
              </span>
            ))}
            {onChooseAudio ? (
              <button type="button" className="video-generation-audio-add" disabled={busy} onClick={() => onChooseAudio(id)}><Plus aria-hidden />{uiText("参考音频")}</button>
            ) : null}
          </div>
        </div>

        <div className="video-generation-section video-generation-prompt-section">
          <label htmlFor={`video-prompt-${id}`}>{modePresentation.promptLabel}</label>
          <textarea
            id={`video-prompt-${id}`}
            value={draft.prompt}
            maxLength={VIDEO_GENERATION_PROMPT_MAX_LENGTH}
            disabled={busy}
            aria-required={promptRequired || undefined}
            aria-invalid={Boolean(promptBlock) || undefined}
            aria-describedby={promptBlock ? `video-prompt-error-${id}` : undefined}
            placeholder={modePresentation.promptPlaceholder}
            onChange={(event) => update({ prompt: event.target.value })}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onBlur={finish}
            onKeyDown={(event) => {
              if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter" || !canRun) return;
              event.preventDefault(); flush(); onRun?.(id, draftRef.current);
            }}
          />
          {promptBlock ? <small id={`video-prompt-error-${id}`} className="text-destructive" role="alert">{promptBlock}</small> : null}
          <span className="video-generation-prompt-meta"><span>{uiText("⌘ Enter 生成")}</span><span>{draft.prompt.length}/{VIDEO_GENERATION_PROMPT_MAX_LENGTH}</span></span>
        </div>

        <div className="video-generation-settings">
          <VideoProviderPicker
            providerId={draft.providerId}
            model={draft.model}
            providers={providerOptions}
            requiresFirstLastFrame={requiresFirstLastFrame}
            disabled={busy}
            goldBeanBalance={goldBeanBalance}
            goldBeanLoading={goldBeanLoading}
            requiredGoldBeans={Math.max(1, draft.duration) * (videoGoldBeanCostPerSecond ?? 1)}
            videoGoldBeanCostPerSecond={videoGoldBeanCostPerSecond}
            resolution={draft.resolution}
            onSelect={(selectedProviderId, selectedModel) => update({ providerId: selectedProviderId, model: selectedModel })}
          />
          {(!parameterOptions.durations || !parameterOptions.ratios || !parameterOptions.resolutions) ? <small className="text-muted-foreground">{uiText("模型未提供完整参数约束，请按服务商要求填写。")}</small> : null}
          <OptionRow label={uiText("时长")} options={parameterOptions.durations?.map(String)} value={String(draft.duration)} suffix="s" disabled={busy} onChange={(value) => update({ duration: Number(value) })} />
          <OptionRow label={uiText("画幅")} options={parameterOptions.ratios} value={draft.aspectRatio} disabled={busy} onChange={(value) => update({ aspectRatio: value })} />
          <OptionRow label={uiText("清晰度")} options={parameterOptions.resolutions} value={draft.resolution} disabled={busy} onChange={(value) => update({ resolution: value })} />
          <div className="video-generation-audio">
            <span><strong>{uiText("生成声音")}</strong><small>{uiText("模型支持时同步生成环境音")}</small></span>
            <button
              type="button"
              role="switch"
              aria-label={uiText("生成声音")}
              aria-checked={draft.generateAudio}
              disabled={busy || constraints.supportsGeneratedAudio === false}
              className="video-generation-audio-switch"
              onClick={() => update({ generateAudio: !draft.generateAudio })}
            >
              <span aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <footer className="nodrag video-generation-footer" onPointerDown={(event) => event.stopPropagation()}>
        <span className={cn(status === "failed" && "text-destructive")} role={status === "failed" ? "alert" : undefined} title={error}>
          {(parameterError ? uiText(parameterError) : undefined) ?? (status === "failed"
            ? error || "任务失败，配置已保留"
            : status === "polling_stopped"
              ? error || "仅停止本地等待，远端可能继续并计费"
              : generationSummary(startFrame, endFrame, referenceImages.length, referenceVideos.length, referenceAudios.length))}
        </span>
        <button type="button" aria-describedby={capabilityBlock ? `video-capability-${id}` : undefined} disabled={busy ? !onStopPolling || !lastGenerationId : status === "polling_stopped" ? !onResumePolling || !lastGenerationId : !canRun} className="canvas-generation-run" onClick={() => {
          if (busy) {
            onStopPolling?.(id);
            return;
          }
          if (status === "polling_stopped") {
            onResumePolling?.(id);
            return;
          }
          if (!canRun) return;
          flush();
          if (retryable) onRetry?.(id, draftRef.current);
          else onRun?.(id, draftRef.current);
        }}>
          {busy ? <Square aria-hidden /> : status === "polling_stopped" ? <RotateCcw aria-hidden /> : retryable ? <RotateCcw aria-hidden /> : <Play aria-hidden />}
          {busy ? uiText("停止等待") : status === "polling_stopped" ? uiText("恢复等待") : retryable ? uiText("重试") : modePresentation.submitLabel}
        </button>
      </footer>
      {imagePreview ? (
        <ImageZoomLightbox
          src={imagePreview.image.dataUrl || imagePreview.src}
          alt={imagePreview.alt}
          imageWidth={imagePreview.image.width}
          imageHeight={imagePreview.image.height}
          backdrop="dim"
          showDetailsPanel={false}
          onClose={() => setImagePreview(null)}
        />
      ) : null}
    </section>
  );
}

function videoModeUnavailableReason(
  mode: VideoGenerationMode,
  hasSourceVideo: boolean,
  provider: VideoProviderConfig | undefined
): string | undefined {
  if (mode === "generate") {
    return hasSourceVideo ? "新建视频请使用新的生成节点。" : undefined;
  }
  if (!hasSourceVideo) {
    return mode === "remix"
      ? "请连接一个源视频；生成结果会保存为它的新版本。"
      : "请连接一个源视频；将从它的结尾继续生成下一段。";
  }
  if (!provider) return "请先选择可用的视频服务。";
  if (provider.type === "official" || provider.type === "openrouter" || provider.type === "minimax") {
    return `${provider.name}暂不支持${MODE_PRESENTATION[mode].title}，请切换视频服务。`;
  }
  return undefined;
}

function CanvasThumbnailImage({
  image,
  alt,
  onPreview
}: {
  image: GeneratedImage;
  alt: string;
  onPreview?: (src: string, alt: string) => void;
}): React.ReactElement | null {
  const uiText = useUiText();

  const thumbnailUrl = useCanvasThumbnail(image.path, image.dataUrl, 192, true);
  if (!thumbnailUrl) return null;
  if (!onPreview) return <img src={thumbnailUrl} alt={alt} />;
  return (
    <button
      type="button"
      className="nodrag nopan"
      aria-label={uiText("预览{{ui:0}}", [alt])}
      onClick={() => onPreview(thumbnailUrl, alt)}
    >
      <img src={thumbnailUrl} alt="" />
    </button>
  );
}

function FrameSlot({
  label,
  image,
  required = false,
  onPreview
}: {
  label: string;
  image?: GeneratedImage;
  required?: boolean;
  onPreview: (image: GeneratedImage, src: string, alt: string) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const content = (
    <>
      {image ? (
        <CanvasThumbnailImage
          image={image}
          alt={uiText("{{ui:0}}预览", [label])}
          onPreview={(src, alt) => onPreview(image, src, alt)}
        />
      ) : <ImageIcon aria-hidden />}
      <span>{label}{required ? <small>{uiText("建议")}</small> : null}</span>
    </>
  );

  if (image) {
    return <div className="video-generation-frame-slot is-filled">{content}</div>;
  }
  return (
    <div className="video-generation-frame-slot">{content}</div>
  );
}

function OptionRow({ label, options, value, suffix = "", disabled, onChange }: { label: string; options?: string[]; value: string; suffix?: string; disabled: boolean; onChange: (value: string) => void }): React.ReactElement {
  return (
    <div className="video-generation-option-row">
      <span>{label}</span>
      <div role="group" aria-label={label}>{!options ? (
        <input aria-label={label} type={suffix === "s" ? "number" : "text"} min={suffix === "s" ? 1 : undefined} value={value} disabled={disabled}
          onChange={(event) => { if (event.target.value && (suffix !== "s" || Number(event.target.value) > 0)) onChange(event.target.value); }} />
      ) : options.length > 6 ? (
        <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option} value={option}>{option}{suffix}</option>)}
        </select>
      ) : options.map((option) => (
        <button key={option} type="button" disabled={disabled} aria-pressed={value === option} onClick={() => onChange(option)}>{option}{suffix}</button>
      ))}</div>
    </div>
  );
}

function VideoProviderPicker({
  providerId,
  model,
  providers,
  disabled,
  requiresFirstLastFrame,
  goldBeanBalance,
  goldBeanLoading,
  requiredGoldBeans,
  videoGoldBeanCostPerSecond,
  resolution,
  onSelect
}: {
  providerId: string;
  model: string;
  providers: VideoProviderConfig[];
  disabled: boolean;
  requiresFirstLastFrame: boolean;
  goldBeanBalance?: number;
  goldBeanLoading: boolean;
  requiredGoldBeans: number;
  videoGoldBeanCostPerSecond?: number;
  resolution: string;
  onSelect: (providerId: string, model: string) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const [open, setOpen] = useState(false);
  const selected = providers.find((provider) => provider.id === providerId);
  const unavailable = Boolean(providerId) && !selected;
  const modelUnavailable = Boolean(selected && model.trim() && !getProviderModels(selected).includes(model.trim()));

  function choose(selectedProviderId: string, selectedModel: string): void {
    onSelect(selectedProviderId, selectedModel);
    setOpen(false);
  }

  return (
    <div className="video-generation-model">
      <span>{uiText("模型")}</span>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={uiText("选择视频模型")}
            aria-expanded={open}
            disabled={disabled || providers.length === 0}
            className={cn("video-generation-model-trigger", (unavailable || modelUnavailable) && "is-unavailable")}
          >
            <span title={model}>{unavailable ? uiText("连接不可用") : modelUnavailable ? uiText("模型不可用") : model || "选择视频模型"}</span>
            <ChevronDown aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="nodrag nopan nowheel w-60 max-w-[calc(100vw-1rem)] shadow-md"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {providers.map((provider) => {
            const models = getProviderModels(provider);
            const activeProvider = provider.id === providerId;
            const official = provider.type === "official";
            const insufficientGoldBeans = official
              && goldBeanBalance !== undefined
              && goldBeanBalance < requiredGoldBeans;
            return (
              <DropdownMenuSub key={provider.id}>
                <DropdownMenuSubTrigger className={cn("min-h-12 py-1.5", activeProvider && "bg-accent/60")}>
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate text-xs font-medium text-foreground" title={provider.name || "未命名视频服务"}>
                      {provider.name || "未命名视频服务"}
                    </span>
                    <span className="mt-0.5 truncate text-[11px] text-muted-foreground" title={provider.model}>
                      {provider.model || "未配置模型"}
                    </span>
                  </span>
                  {official ? (
                    <span className={cn(
                      "shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground",
                      insufficientGoldBeans && "text-destructive"
                    )}>
                      {uiText("余额 ")}{goldBeanLoading ? "--" : goldBeanBalance ?? "--"}
                    </span>
                  ) : null}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  aria-label={uiText("{{ui:0}}的视频模型", [provider.name || "未命名视频服务"])}
                  className="nodrag nopan nowheel w-80 max-w-[calc(100vw-1rem)] shadow-md"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {models.filter((providerModel) => !requiresFirstLastFrame || resolveVideoModelCapability(
                    findVideoProviderModelOption(provider.modelOptions, providerModel),
                    "first-last-frame"
                  ) === "supported").map((providerModel) => {
                    const active = activeProvider && providerModel === model;
                    return (
                      <DropdownMenuItem
                        key={providerModel}
                        title={providerModel}
                        onSelect={() => choose(provider.id, providerModel)}
                        className={cn("min-h-9 text-xs", active && "bg-accent/60")}
                      >
                        <span className="min-w-0 flex-1 truncate">{providerModel}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                            {official
                              ? uiText("{{ui:0}} 金豆/秒", [videoGoldBeanCostPerSecond ?? 1])
                              : provider.type === "minimax"
                                ? minimaxVideoPriceLabel(providerModel, resolution)
                                : findVideoProviderModelOption(provider.modelOptions, providerModel)?.pricingLabel || "供应商计费"}
                          </span>
                          <span className="flex h-3.5 w-3.5 items-center justify-center">
                            {active ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                  {models.filter((providerModel) => !requiresFirstLastFrame || resolveVideoModelCapability(
                    findVideoProviderModelOption(provider.modelOptions, providerModel),
                    "first-last-frame"
                  ) === "supported").length === 0 ? <p className="px-2 py-1.5 text-xs text-muted-foreground">{requiresFirstLastFrame ? uiText("没有明确支持首尾帧的模型，请检查 Provider 配置") : uiText("未配置模型")}</p> : null}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function minimaxVideoPriceLabel(model: string, resolution: string): string {
  const h3Max = model.toLowerCase() === "minimax-h3-max";
  const is2K = !h3Max && resolution === "1080p";
  const is480P = h3Max && resolution === "480p";
  if (is2K) return "官方 ¥0.88/秒";
  if (is480P) return "官方 ¥0.34/秒";
  return "官方 ¥0.54/秒";
}

function GenerationStatusIcon({ status }: { status: VideoGenerationNodeStatus }): React.ReactElement {
  if (status === "queued") return <Clock3 aria-hidden />;
  if (BUSY_STATUSES.has(status)) return <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />;
  if (status === "completed") return <Check aria-hidden strokeWidth={2.5} />;
  if (status === "failed" || status === "blocked") return <CircleAlert aria-hidden />;
  return <Circle aria-hidden />;
}

function VideoGenerationHandles({
  connectionTargetActive,
  compatibleConnectionHandles = [],
  connectionSnapTargetHandle
}: ConnectionTargetPresentation): React.ReactElement {
  const uiText = useUiText();

  const compatible = new Set(compatibleConnectionHandles);
  const inputClass = (handleId: string): string => cn(
    compatible.has(handleId) && "is-compatible",
    connectionSnapTargetHandle === handleId && "is-snapped"
  );
  return (
    <>
      <Handle type="target" position={Position.Left} id="target-start-frame" className={cn("video-generation-port video-generation-port--start nodrag nopan", inputClass("target-start-frame"))} aria-label={uiText("连接首帧输入")} />
      <Handle type="target" position={Position.Left} id="target-end-frame" className={cn("video-generation-port video-generation-port--end nodrag nopan", inputClass("target-end-frame"))} aria-label={uiText("连接尾帧输入")} />
      <Handle type="target" position={Position.Left} id="target-reference" className={cn("video-generation-port video-generation-port--reference nodrag nopan", inputClass("target-reference"))} aria-label={uiText("连接参考图输入")} />
      <Handle type="target" position={Position.Left} id="target-video-reference" className={cn("video-generation-port video-generation-port--video-reference nodrag nopan", inputClass("target-video-reference"))} aria-label={uiText("连接参考视频输入")} />
      <Handle type="source" position={Position.Right} id="source-right" className="video-generation-output-port nodrag nopan" aria-label={uiText("连接视频生成结果")} />
      <span className={cn("video-generation-port-label video-generation-port-label--start", inputClass("target-start-frame"))}>{connectionTargetActive ? uiText("首帧") : uiText("首")}</span>
      <span className={cn("video-generation-port-label video-generation-port-label--end", inputClass("target-end-frame"))}>{connectionTargetActive ? uiText("尾帧") : uiText("尾")}</span>
      <span className={cn("video-generation-port-label video-generation-port-label--reference", inputClass("target-reference"))}>{connectionTargetActive ? uiText("参考图") : uiText("参")}</span>
      <span className={cn("video-generation-port-label video-generation-port-label--video-reference", inputClass("target-video-reference"))}>{connectionTargetActive ? uiText("参考视频") : uiText("视")}</span>
      <span className="video-generation-output-label"><Plus aria-hidden /></span>
    </>
  );
}

function videoParameterOptions(provider: VideoProviderConfig | undefined, model: string) {
  const option = findVideoProviderModelOption(provider?.modelOptions, model);
  const constraints = resolveVideoParameters(option);
  const range = constraints.durationRange;
  const min = Math.max(1, Math.ceil(range?.min ?? 1));
  const durations = constraints.durations ?? (range && range.max - min < 120
    ? Array.from({ length: Math.max(0, Math.floor(range.max) - min + 1) }, (_, index) => min + index)
    : undefined);
  return {
    durations: durations?.length ? durations : undefined,
    ratios: constraints.ratios,
    resolutions: constraints.resolutions
  };
}

function configFromData(data: VideoGenerationNodeData, providers: VideoProviderConfig[] = []): VideoGenerationNodeConfig {
  const options = videoParameterOptions(providers.find((provider) => provider.id === data.providerId), data.model);
  const option = findVideoProviderModelOption(providers.find((provider) => provider.id === data.providerId)?.modelOptions, data.model);
  const range = option?.capability?.durationSeconds;
  const duration = Number.isFinite(data.duration) ? Math.max(1, data.duration) : 5;
  return {
    mode: data.mode ?? "generate",
    prompt: data.prompt ?? "",
    providerId: data.providerId ?? "",
    model: data.model ?? "",
    duration: options.durations
      ? options.durations.reduce((nearest, value) => Math.abs(value - duration) < Math.abs(nearest - duration) ? value : nearest)
      : range ? Math.max(range.min, Math.min(range.max, duration)) : duration,
    aspectRatio: options.ratios && !options.ratios.includes(data.aspectRatio) ? options.ratios[0] : data.aspectRatio || "16:9",
    resolution: options.resolutions && !options.resolutions.includes(data.resolution) ? options.resolutions[0] : data.resolution || "720p",
    generateAudio: resolveVideoParameters(option).supportsGeneratedAudio === false ? false : data.generateAudio ?? false
  };
}

function generationSummary(startFrame: GeneratedImage | undefined, endFrame: GeneratedImage | undefined, referenceCount: number, videoCount: number, audioCount: number): string {
  const parts = [
    startFrame ? "首帧" : "",
    endFrame ? "尾帧" : "",
    referenceCount ? `${referenceCount} 张参考图` : "",
    videoCount ? `${videoCount} 个参考视频` : "",
    audioCount ? `${audioCount} 个参考音频` : ""
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "等待输入";
}

export const VideoGenerationNode = memo(VideoGenerationNodeComponent);
