import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { generateTemplateVerification } from "@/lib/template-verification";
import type {
  AppSettings,
  AppSettingsPatch,
  AssistantIntentSuggestionCount,
  AssetLibraryItem,
  AssetComment,
  AssetReference,
  BoardDetail,
  BoardComicDramaEntryNode,
  BoardConnection,
  BoardEnterOrigin,
  BoardGenerationNode,
  BoardMutationPlan,
  BoardMutationResult,
  ComicCharacterNode,
  ComicDramaBoardNode,
  ComicDramaBoardSnapshot,
  BoardNode,
  BoardNodeSnapshot,
  BoardTextNode,
  BoardVideoGenerationNode,
  BoardVideoNode,
  BoardVideoSequenceEntryNode,
  BoardSummary,
  BoardViewport,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  CopyImageFormat,
  CreditStatus,
  EditInfoMode,
  GenerateButtonStyle,
  GenerateImageInput,
  GenerateResponse,
  GenerationJob,
  ImageCropRect,
  ImageDoubleClickAction,
  ImageWorkflowMode,
  MemoryUsageLevel,
  PromptSpec,
  ProviderApiMode,
  ProviderConfig,
  ReferenceImagePayload,
  ReferenceImageRole,
  RestoreTrashedBoardImageResult,
  SceneTemplateImportResult,
  SliceSubjectDetection,
  TemplateSubmissionResult,
  TextProviderConfig,
  VideoProviderConfig,
  UiDesignBrief,
  VersionSeparationMode,
  VideoGenerationInput,
  VideoGenerationJob,
  VideoSequenceTask,
  VideoSequence as PersistedVideoSequence,
  VideoSequenceTemplate
} from "@shared/types";
import { DEFAULT_VIDEO_PROVIDER_CONFIG, DEFAULT_VIDEO_PROVIDER_ID } from "@shared/types";
import {
  IMAGE_CREDIT_COST,
  OFFICIAL_PROVIDER_CONFIG,
  OFFICIAL_PROVIDER_ID,
  OFFICIAL_TEXT_PROVIDER_CONFIG,
  OFFICIAL_TEXT_PROVIDER_ID,
  isBoardGenerationNode,
  isBoardImageNode,
  isBoardTextNode,
  isBoardVideoGenerationNode,
  isBoardVideoNode
} from "@shared/types";
import { isComicDramaNode } from "@shared/comic-drama";
import { getDefaultQuality, getDefaultUseCase, parseGptImageSize } from "@shared/workflow";
import { selectProviderModel } from "@shared/provider-models";
import type { VideoProviderModelOption } from "@shared/types";
import { promoteRecentlyUsedBoard, sortBoardsByRecentUse } from "@shared/board-order";
import { INITIAL_DEMO_BOARD_NAME } from "@shared/demo-board";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import type {
  CanvasNodeLayout,
  CanvasRestoreSnapshot,
  CanvasSelectionSnapshot
} from "@/components/canvas/canvas-history";
import type { EmptyCanvasMode } from "@/components/canvas/EmptyCanvasStart";
import {
  duplicateClipboardImages,
  type CanvasClipboardItem
} from "@/components/canvas/canvas-clipboard";
import { centerNodeAtDrop, type CanvasDropPoint } from "@/components/canvas/canvas-drop";
import {
  placeGenerationReferenceImages,
  type GenerationReferencePlacementTarget
} from "@/components/canvas/generation-reference-paste";
import {
  IMAGE_NODE_WIDTH,
  getPendingEditCount,
  imageKey,
  type GeneratedImage,
  type ImageVersion,
  type VersionSeparationPlacement
} from "@/components/canvas/image-node-model";
import {
  VIDEO_GENERATION_NODE_HEIGHT,
  VIDEO_NODE_HEIGHT,
  VIDEO_NODE_WIDTH
} from "@/components/canvas/canvas-node-layout";
import {
  VIDEO_MAX_REFERENCE_IMAGES,
  type GeneratedVideo,
  type VideoReferenceInput
} from "@/components/canvas/video-node-model";
import { resolveVideoGenerationImageInputs } from "@/components/canvas/video-generation-image-inputs";
import type { AssistantDockLayout } from "@/lib/assistant-panel-docking";
import {
  copyImageVersions,
  createDetachedVersionImage,
  extractImageVersion,
  separateImageVersions
} from "@/components/canvas/image-versions";
import type { SliceSelection } from "@/components/canvas/ImageSliceDialog";
import { getSliceResultCell } from "@/components/canvas/slice-result-layout";
import { ParticleBurst, type ParticleBurstTrigger } from "@/components/canvas/ParticleBurst";
import type { TourDefinition } from "@/components/onboarding/FeatureTour";
import {
  BOARD_TOUR,
  EDIT_TOUR,
  GALLERY_TOUR,
  LIBRARY_TOUR,
  TOUR_DEMO_IMAGE_ID,
  TOUR_DEMO_PROMPT
} from "@/components/onboarding/tours";
import { hasGalleryTourContent } from "@/lib/gallery-onboarding";
import { collectGalleryPreloadPaths, preloadGalleryThumbnails } from "@/lib/gallery-preload";
import { getProviderMaxImageCount } from "@/lib/provider-image-count";
import { providerSupportsTransparentBackground } from "@/lib/provider-transparent-background";
import {
  hydrateBoardNodeImageLayout,
  hydrateGeneratedImage,
  serializeGeneratedImage
} from "@/lib/board-node-image";
import { resolveTextProviderReadiness } from "@/lib/text-provider-readiness";
import { notifyVideoJob as showVideoJobNotification } from "@/lib/video-job-notification";
import {
  clearTourSeen,
  hasSeenDemoStart,
  hasSeenTour,
  initializeOnboardingPersistence,
  markDemoStartSeen,
  markTourSeen
} from "@/lib/onboarding";
import tourDemoImageUrl from "@/assets/tour-demo-lamp.jpg";
import type { AssistantGenerationRequest } from "@/components/workbench/PromptDock";
import type {
  CreateChatGenerationPlan,
  CreateChatResult
} from "@/components/workbench/CreateChatPage";
import { ReferralInviteDialog } from "@/components/workbench/ReferralInviteDialog";
import { PiTemplateAgentStatus } from "@/components/workbench/PiTemplateAgentStatus";
import { ProviderStatusNotice } from "@/components/workbench/ProviderStatusNotice";
import { Toaster } from "@/components/ui/sonner";
import { iterlayToast } from "@/components/ui/iterlay-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  getImageWorkbenchApi,
  getWorkbenchErrorMessage,
  hasImageWorkbenchApi,
  missingImageWorkbenchMessage
} from "@/lib/image-workbench-api";
import { GENERATION_ESTIMATE_MS } from "@/lib/generation-timing";
import {
  centerGenerationOutputs,
  removeGeneratedPlaceholders,
  settleGeneratedPlaceholders
} from "@/lib/generation-placeholders";
import { resolveEditSmartSuggestionsEnabled } from "@/lib/smart-suggestions";
import { isSendEnter } from "@/lib/send-on-enter";
import { selectStartupBoard } from "@/lib/startup-board";
import { reconcileRecoveredVideoCanvas } from "@/lib/video-generation-recovery";
import { createMissingGenerationOutputConnections } from "@/lib/generation-output-connections";
import { GENERATION_OUTPUT_HORIZONTAL_GAP } from "@shared/generation-output-layout";
import { mergeOfficialVideoCatalog, mergeVideoProviderModelCatalogs } from "@/lib/official-video-models";
import { DataUrlLruCache } from "@/lib/data-url-lru-cache";
import { BoardDetailCache } from "@/lib/board-detail-cache";
import type { ActiveBoardGeneration } from "@/lib/active-board-generation";
import { GenerationQueue } from "@/lib/generation-queue";
import { createEmptyPromptSpec, resetBoardDraft } from "@/lib/board-draft";
import { createComicDramaMutationPlan } from "@/lib/comic-drama-assistant";
import { sceneAssistantFieldsToPrompt } from "@/lib/prompt-assistant";
import { startSceneCollaborationStream } from "@/lib/scene-collaboration-stream";
import { useLicense } from "@/components/licensing/license-context";
import { StartupLoading } from "@/components/system/StartupLoading";
import { ActivationNotice } from "@/components/licensing/ActivationNotice";
import { preloadBoardImages } from "@/lib/board-preload";
import {
  DEFAULT_BOARD_ENTRY_VISIBLE_PRELOAD_LIMIT,
  selectBoardEntryPreload
} from "@/lib/board-entry-preload";
import { removeImageBackground } from "@/lib/remove-image-background";
import {
  isShortcutHelpCommand,
  MAX_BOARD_SHORTCUTS,
  resolveBoardShortcutIndex
} from "@/lib/board-shortcuts";
import {
  createCustomScene,
  createCustomSceneFromScene,
  findSceneForMode,
  parseSceneFields,
  PRESET_SCENES,
  readCustomScenes,
  readFavoriteSceneIds,
  updateCustomScene,
  writeCustomScenes,
  writeFavoriteSceneIds,
  type NewSceneInput,
  type SceneDefinition
} from "@/lib/scene-library";
import {
  buildTemplateExtractionInstruction,
  buildTemplatePreviewInstruction,
  createTemplateExtractionFromAssistant,
  createTemplatePromptSet,
  parseTemplateExtractionItems,
  retargetTemplateExtractionContext,
  type TemplateExtractionScenario,
  type TemplateExtractionResult,
  type TemplatePromptSet
} from "@/lib/template-workflow";
import {
  buildUiDesignBriefInstruction,
  createUiDesignBrief,
  inferUiMaterialRole
} from "@/lib/ui-design-workflow";
import type {
  TemplateExtractionSaveDecision,
  TemplateExtractionSource
} from "@/components/workbench/TemplateExtractionDialog";
import { useI18n } from "@/i18n";
import { parseIterlayDeepLink, type IterlayDeepLink } from "@shared/deep-link";
import type {
  VideoSequence as EditorVideoSequence,
  VideoSequenceExportOptions,
  VideoSequenceTaskState
} from "@/components/video-sequence";
import type { McpSkillUpgradeDetail } from "@shared/mcp-integration";

const CanvasBoard = lazy(() =>
  import("@/components/canvas/CanvasBoard").then((module) => ({ default: module.CanvasBoard }))
);
const VideoSequenceEditor = lazy(() =>
  import("@/components/video-sequence").then((module) => ({ default: module.VideoSequenceEditor }))
);
const CanvasRoot = lazy(() =>
  import("@/components/canvas/CanvasRoot").then((module) => ({ default: module.CanvasRoot }))
);
const TopBar = lazy(() =>
  import("@/components/workbench/TopBar").then((module) => ({ default: module.TopBar }))
);
const PromptDock = lazy(() =>
  import("@/components/workbench/PromptDock").then((module) => ({ default: module.PromptDock }))
);
const ComicDramaWorkspace = lazy(() =>
  import("@/components/comic-drama/ComicDramaWorkspace").then((module) => ({ default: module.ComicDramaWorkspace }))
);
const EditLightbox = lazy(() =>
  import("@/components/canvas/EditLightbox").then((module) => ({ default: module.EditLightbox }))
);
const FeedbackWidget = lazy(() =>
  import("@/components/feedback/FeedbackWidget").then((module) => ({ default: module.FeedbackWidget }))
);
const AdvancedImageEditor = lazy(() =>
  import("@/components/canvas/AdvancedImageEditor").then((module) => ({ default: module.AdvancedImageEditor }))
);
const ImageSliceDialog = lazy(() =>
  import("@/components/canvas/ImageSliceDialog").then((module) => ({ default: module.ImageSliceDialog }))
);
const WechatStickerExportDialog = lazy(() =>
  import("@/components/canvas/WechatStickerExportDialog").then((module) => ({
    default: module.WechatStickerExportDialog
  }))
);
const QuickImageShareDialog = lazy(() =>
  import("@/components/canvas/QuickImageShareDialog").then((module) => ({
    default: module.QuickImageShareDialog
  }))
);
const MasterGoReconstructionDialog = lazy(() =>
  import("@/components/workbench/MasterGoReconstructionDialog").then((module) => ({ default: module.MasterGoReconstructionDialog }))
);
const CanvasShortcutHelpDialog = lazy(() =>
  import("@/components/canvas/CanvasShortcutHelpDialog").then((module) => ({
    default: module.CanvasShortcutHelpDialog
  }))
);
const FeatureTour = lazy(() =>
  import("@/components/onboarding/FeatureTour").then((module) => ({ default: module.FeatureTour }))
);
const HistoryRail = lazy(() =>
  import("@/components/workbench/HistoryRail").then((module) => ({ default: module.HistoryRail }))
);
const CommentRail = lazy(() =>
  import("@/components/workbench/CommentRail").then((module) => ({ default: module.CommentRail }))
);
const ImageDetailsPanel = lazy(() =>
  import("@/components/canvas/ImageDetailsPanel").then((module) => ({ default: module.ImageDetailsPanel }))
);
const TemplateExtractionDialog = lazy(() =>
  import("@/components/workbench/TemplateExtractionDialog").then((module) => ({
    default: module.TemplateExtractionDialog
  }))
);
const ImageTrashDialog = lazy(() =>
  import("@/components/workbench/ImageTrashDialog").then((module) => ({ default: module.ImageTrashDialog }))
);
type LibraryShellModule = typeof import("@/components/workbench/LibraryShell");

let libraryShellModulePromise: Promise<LibraryShellModule> | null = null;

function loadLibraryShell(): Promise<LibraryShellModule> {
  if (!libraryShellModulePromise) {
    libraryShellModulePromise = import("@/components/workbench/LibraryShell").catch((error: unknown) => {
      libraryShellModulePromise = null;
      throw error;
    });
  }
  return libraryShellModulePromise;
}

const LibraryShell = lazy(() =>
  loadLibraryShell().then((module) => ({ default: module.LibraryShell }))
);
type BoardGalleryModule = typeof import("@/components/workbench/BoardGallery");

let boardGalleryModulePromise: Promise<BoardGalleryModule> | null = null;

function loadBoardGallery(): Promise<BoardGalleryModule> {
  if (!boardGalleryModulePromise) {
    boardGalleryModulePromise = import("@/components/workbench/BoardGallery").catch((error: unknown) => {
      boardGalleryModulePromise = null;
      throw error;
    });
  }
  return boardGalleryModulePromise;
}

const BoardGallery = lazy(() =>
  loadBoardGallery().then((module) => ({ default: module.BoardGallery }))
);
type ProviderSettingsModule = typeof import("@/components/workbench/ProviderSettingsDialog");

let providerSettingsModulePromise: Promise<ProviderSettingsModule> | null = null;

function loadProviderSettings(): Promise<ProviderSettingsModule> {
  if (!providerSettingsModulePromise) {
    providerSettingsModulePromise = import("@/components/workbench/ProviderSettingsDialog").catch((error: unknown) => {
      providerSettingsModulePromise = null;
      throw error;
    });
  }
  return providerSettingsModulePromise;
}

const ProviderSettingsDialog = lazy(() =>
  loadProviderSettings().then((module) => ({
    default: module.ProviderSettingsDialog
  }))
);
const SkillUpgradeDetailsDialog = lazy(() =>
  import("@/components/workbench/SkillUpgradeDetailsDialog").then((module) => ({
    default: module.SkillUpgradeDetailsDialog
  }))
);
const MemoizedCanvasBoard = memo(CanvasBoard);

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const GALLERY_REVEAL_DURATION = 0.18;
const GALLERY_EXIT_DURATION = 0.14;
const IS_MAC_PLATFORM = /Mac|iPhone|iPad|iPod/u.test(navigator.platform);

type UiTheme = AppSettings["theme"];
type LibraryInitialTab = "boards" | "assets" | "scenes" | "trash" | "inspiration";

const defaultProvider: ProviderConfig = { ...OFFICIAL_PROVIDER_CONFIG };

const initialPromptSpec: PromptSpec = createEmptyPromptSpec();

const initialInput: GenerateImageInput = {
  workflowMode: "generate",
  creationMode: "general",
  useCase: "ads-marketing",
  promptSpec: initialPromptSpec,
  prompt: "",
  model: OFFICIAL_PROVIDER_CONFIG.model,
  size: "auto",
  n: 1,
  quality: "high",
  style: "natural",
  background: "auto",
  outputFormat: "png",
  referenceImages: []
};

function getInitialStatus(): string {
  return hasImageWorkbenchApi() ? "请选择 Provider 路线并保存配置。" : missingImageWorkbenchMessage;
}

function getProviderApiMode(provider: ProviderConfig): ProviderApiMode {
  if (provider.type !== "openai-compatible") return "responses";
  return provider.apiMode || (/\/responses\/?$/.test(provider.generationEndpoint) ? "responses" : "images");
}

function providerSupportsGenerateReferences(provider: ProviderConfig): boolean {
  if (!provider.supportsReferenceImages) return false;
  if (provider.type !== "openai-compatible") return provider.type !== "poe";
  return getProviderApiMode(provider) === "responses";
}

interface ActiveBoard {
  id: string;
  name: string;
  kind?: "standard" | "comic-drama";
  parentBoardId?: string;
  viewport?: BoardViewport;
}

interface CanvasLayoutState {
  positions: Record<string, CanvasNodeLayout>;
  viewport?: BoardViewport;
  connections: BoardConnection[];
}

type CanvasPersistedNode = BoardTextNode | BoardGenerationNode | BoardVideoNode | BoardVideoGenerationNode | ComicDramaBoardNode | BoardComicDramaEntryNode | BoardVideoSequenceEntryNode;

interface GenerationConfirmationItem {
  id: string;
  label: string;
  task: string;
  costLabel: string;
  quoteId?: string;
  quoteExpiresAt?: string;
}

interface GenerationConfirmationRequest {
  title: string;
  providerLabel: string;
  model: string;
  totalCostLabel: string;
  items: GenerationConfirmationItem[];
  confirmLabel: string;
}

interface PendingGenerationConfirmation extends GenerationConfirmationRequest {
  resolve: (confirmed: boolean) => void;
}

function GenerationConfirmationDialog({
  confirmation,
  locale,
  onCancel,
  onConfirm
}: {
  confirmation: PendingGenerationConfirmation | null;
  locale: string;
  onCancel: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <Dialog open={confirmation !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[min(720px,calc(100dvh-32px))] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{confirmation?.title ?? "确认生成"}</DialogTitle>
          <DialogDescription>确认后才会提交以下生成任务；取消不会调用 Provider。</DialogDescription>
        </DialogHeader>
        {confirmation ? <div className="grid gap-4">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-md bg-muted/60 p-3 text-xs">
            <div><dt className="text-muted-foreground">Provider</dt><dd className="mt-0.5 break-words font-medium">{confirmation.providerLabel}</dd></div>
            <div><dt className="text-muted-foreground">模型</dt><dd className="mt-0.5 break-words font-medium">{confirmation.model}</dd></div>
            <div><dt className="text-muted-foreground">任务数</dt><dd className="mt-0.5 font-medium">{confirmation.items.length}</dd></div>
            <div><dt className="text-muted-foreground">总费用</dt><dd className="mt-0.5 font-medium">{confirmation.totalCostLabel}</dd></div>
            <div className="col-span-2"><dt className="text-muted-foreground">Quote expiry</dt><dd className="mt-0.5 font-medium">{
              confirmation.items.some((item) => item.quoteExpiresAt)
                ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(Math.min(...confirmation.items.flatMap((item) => item.quoteExpiresAt ? [Date.parse(item.quoteExpiresAt)] : []))))
                : "外部 Provider 未提供 Iterlay 报价有效期"
            }</dd></div>
          </dl>
          <div className="divide-y divide-border border-y border-border" aria-label="生成确认任务">
            {confirmation.items.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3 text-sm">
              <span className="min-w-0"><b className="block break-words">{item.label}</b><small className="mt-0.5 block break-words text-muted-foreground">{item.task}{item.quoteId ? ` · Quote ${item.quoteId}` : ""}</small></span>
              <b className="self-center whitespace-nowrap text-xs">{item.costLabel}</b>
            </div>)}
          </div>
        </div> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
          <Button type="button" onClick={onConfirm}>{confirmation?.confirmLabel ?? "确认提交"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PreparedCharacterGeneration {
  character: ComicCharacterNode;
  prompt: string;
  providerId: string;
  providerLabel: string;
  model: string;
  metadata: Partial<GenerateImageInput>;
}

interface CanvasUndoSnapshot extends CanvasSelectionSnapshot {
  boardId: string;
  images: GeneratedImage[];
  workflowNodes: CanvasPersistedNode[];
}

const MAX_CANVAS_UNDO_STEPS = 50;
const LOCAL_CANVAS_HISTORY_ID = "__local-canvas__";

function cloneCanvasImage(image: GeneratedImage): GeneratedImage {
  return {
    ...image,
    versions: image.versions?.map((version) => ({ ...version })),
    derivation: image.derivation
      ? { ...image.derivation, crop: { ...image.derivation.crop } }
      : undefined
  };
}

function cloneBoardConnection(connection: BoardConnection): BoardConnection {
  return structuredClone(connection);
}

function isTerminalVideoJob(job: VideoGenerationJob): boolean {
  return job.status === "completed" || job.status === "failed" || job.status === "cancelled";
}

/** 编辑会话默认跟随原图尺寸；原图尺寸不满足生成约束时返回 null（保持现值）。 */
function adoptableSize(image: GeneratedImage): string | null {
  if (!image.width || !image.height) return null;
  try {
    return parseGptImageSize(`${image.width}x${image.height}`);
  } catch {
    return null;
  }
}

/** 画板库卡片封面：把首图缩到目标宽度的 JPEG，避免整张原图塞进画板 JSON。 */
function downscaleDataUrl(dataUrl: string, targetWidth: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const scale = Math.min(1, targetWidth / (image.naturalWidth || targetWidth));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(undefined);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      } catch {
        resolve(undefined);
      }
    };
    image.onerror = () => resolve(undefined);
    image.src = dataUrl;
  });
}

function scheduleRemainingBoardPreload(detail: BoardDetail, isCurrentRequest: () => boolean): void {
  const preload = (): void => {
    if (isCurrentRequest()) {
      void preloadBoardImages(detail, { shouldContinue: isCurrentRequest, maxImages: 24 });
    }
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(preload, { timeout: 1_500 });
  } else {
    window.setTimeout(preload, 500);
  }
}

function useStableCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult
): (...args: TArgs) => TResult {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}

function editorTaskState(status: VideoSequenceTask["status"]): VideoSequenceTaskState {
  if (status === "pending" || status === "submitting") return "submitting";
  if (status === "queued") return "queued";
  if (status === "generating") return "generating";
  if (status === "downloading" || status === "validating") return "post_processing";
  if (status === "remote_unknown") return "recovering";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

function toEditorVideoSequence(
  sequence: PersistedVideoSequence & { sequenceTasks?: VideoSequenceTask[] },
  boardName?: string
): EditorVideoSequence {
  return {
    kind: sequence.kind ?? "keyframe-generation",
    id: sequence.id,
    boardId: sequence.boardId,
    boardName,
    name: sequence.name,
    revision: sequence.revision,
    updatedAt: sequence.updatedAt,
    defaults: sequence.defaults,
    keyframes: sequence.keyframes.map((frame) => ({
      id: frame.id,
      order: frame.order,
      label: frame.label,
      imagePath: frame.source.imagePath,
      nodeId: frame.source.nodeId
    })),
    segments: sequence.segments.map((segment) => {
      const task = [...(sequence.sequenceTasks ?? [])].reverse().find((candidate) => candidate.segmentId === segment.id
        && candidate.segmentRevision === segment.desiredRevision
        && candidate.inputFingerprint === segment.inputFingerprint);
      const active = segment.versions.find((version) => version.id === segment.activeVersionId);
      const state = segment.error
        ? "incompatible" as const
        : !segment.activeVersionId
          ? (segment.config.prompt.trim() ? "configured" as const : "empty" as const)
          : segment.renderedRevision !== segment.desiredRevision
            ? "stale" as const
            : "valid" as const;
      return {
        id: segment.id,
        order: segment.order,
        fromKeyframeId: segment.fromKeyframeId,
        toKeyframeId: segment.toKeyframeId,
        prompt: segment.config.prompt,
        providerId: segment.config.providerId,
        model: segment.config.model,
        durationSeconds: segment.config.durationSeconds,
        aspectRatio: segment.config.aspectRatio,
        resolution: segment.config.resolution,
        generateAudio: segment.config.generateAudio,
        watermark: segment.config.watermark,
        trimInMs: segment.trim.inMs,
        trimOutMs: segment.trim.outMs,
        muted: segment.trim.muted,
        state,
        taskState: task ? editorTaskState(task.status) : segment.error ? "failed" as const : undefined,
        error: segment.error?.message,
        versions: segment.versions.map((version) => ({
          id: version.id,
          videoPath: version.videoPath,
          posterPath: version.posterPath,
          durationMs: version.durationMs,
          width: version.width,
          height: version.height,
          createdAt: version.createdAt,
          model: "config" in version.inputSnapshot ? version.inputSnapshot.config.model : undefined
        })),
        activeVersionId: active?.id ?? segment.activeVersionId
      };
    })
  };
}

async function generationFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function paidGenerationMetadata(
  inputFingerprint: string,
  stage: "character" | "first-frame" | "last-frame" | "video",
  request: {
    kind: "image" | "video";
    providerId: string;
    boardId: string;
    requestScope: string;
    operation: "image:generate" | "video:start";
    imageCount?: number;
    durationSeconds?: number;
    model?: string;
    resolution?: string;
    generateAudio?: boolean;
  }
) {
  const generationAttemptId = crypto.randomUUID();
  const quote = await getImageWorkbenchApi().quotePaidMedia({
    kind: request.kind,
    clientRequestId: generationAttemptId,
    inputFingerprint,
    boardId: request.boardId,
    requestScope: request.requestScope,
    operation: request.operation,
    providerId: request.providerId,
    imageCount: request.imageCount,
    durationSeconds: request.durationSeconds,
    model: request.model,
    resolution: request.resolution,
    generateAudio: request.generateAudio,
    stage
  });
  return {
    inputFingerprint,
    generationAttemptId,
    quoteId: quote.quoteId,
    quoteExpiresAt: quote.expiresAt,
    idempotencyKey: [generationAttemptId, inputFingerprint, quote.quoteId].join(":"),
    priceSnapshot: quote.priceSnapshot,
    quoteBoardId: request.boardId,
    quoteRequestScope: request.requestScope,
    quotePurpose: stage,
    quoteOperation: request.operation
  };
}

export default function App(): React.ReactElement {
  const { language, locale, setLanguage } = useI18n();
  const {
    status: licenseStatus,
    openCenter: openLicenseCenter,
    openActivation: openLicenseActivation = openLicenseCenter,
    startupError: licenseStartupError,
    retryStatus: retryLicenseStatus
  } = useLicense();
  const [providers, setProviders] = useState<ProviderConfig[]>([defaultProvider]);
  const [activeProviderId, setActiveProviderId] = useState<string>(defaultProvider.id);
  const [textProviders, setTextProviders] = useState<TextProviderConfig[]>([{ ...OFFICIAL_TEXT_PROVIDER_CONFIG }]);
  const [activeTextProviderId, setActiveTextProviderId] = useState<string>(OFFICIAL_TEXT_PROVIDER_ID);
  const [videoProviders, setVideoProviders] = useState<VideoProviderConfig[]>([{ ...DEFAULT_VIDEO_PROVIDER_CONFIG }]);
  const [activeVideoProviderId, setActiveVideoProviderId] = useState<string>(DEFAULT_VIDEO_PROVIDER_ID);
  const [providerKeyStatus, setProviderKeyStatus] = useState<Record<string, boolean>>({});
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);
  const creditStatusRef = useRef<CreditStatus | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const [theme, setTheme] = useState<UiTheme>(() => {
    const bootTheme = new URLSearchParams(window.location.search).get("bootTheme");
    return bootTheme === "dark" || bootTheme === "light" ? bootTheme : "system";
  });
  const [input, setInput] = useState<GenerateImageInput>(initialInput);
  const [customScenes, setCustomScenes] = useState<SceneDefinition[]>(readCustomScenes);
  const [favoriteSceneIds, setFavoriteSceneIds] = useState<string[]>(readFavoriteSceneIds);
  const [history, setHistory] = useState<GenerationJob[]>([]);
  const [videoHistory, setVideoHistory] = useState<VideoGenerationJob[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [workflowNodes, setWorkflowNodes] = useState<CanvasPersistedNode[]>([]);
  const [canvasConnectionsVersion, setCanvasConnectionsVersion] = useState(0);
  const [selectedCanvasNodeIds, setSelectedCanvasNodeIds] = useState<string[]>([]);
  const [comicDramaSnapshot, setComicDramaSnapshot] = useState<ComicDramaBoardSnapshot | null>(null);
  const [comicDramaEntryPosition, setComicDramaEntryPosition] = useState<CanvasDropPoint | null>(null);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [videoCompare, setVideoCompare] = useState<{ left: GeneratedVideo; right: GeneratedVideo } | null>(null);
  const [activeVideoSequence, setActiveVideoSequence] = useState<(PersistedVideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }) | null>(null);
  const [videoSequenceTemplates, setVideoSequenceTemplates] = useState<VideoSequenceTemplate[]>([]);
  const [videoSequenceSaving, setVideoSequenceSaving] = useState(false);
  const [videoSequenceSaveError, setVideoSequenceSaveError] = useState<string>();
  const videoPollingStoppedRef = useRef(new Set<string>());
  const [generationConfirmation, setGenerationConfirmation] = useState<PendingGenerationConfirmation | null>(null);
  const paidSubmissionInFlightRef = useRef(new Set<string>());
  const notifiedVideoJobIdsRef = useRef(new Set<string>());
  const generationQueueRef = useRef<GenerationQueue | null>(null);
  if (generationQueueRef.current === null) generationQueueRef.current = new GenerationQueue();
  // Generations run concurrently — track how many are in flight rather than a single busy flag.
  const [activeGenerations, setActiveGenerations] = useState(0);
  const [activeBoardGenerations, setActiveBoardGenerations] = useState<ActiveBoardGeneration[]>([]);
  // 状态文案当前不渲染，用 ref 留存，避免日志/生成阶段变化触发整棵 App 更新。
  const statusRef = useRef(getInitialStatus());
  const setStatus = useCallback((message: string): void => {
    statusRef.current = message;
  }, []);
  const requestGenerationConfirmation = useCallback((request: GenerationConfirmationRequest): Promise<boolean> => (
    new Promise((resolve) => setGenerationConfirmation((current) => {
      current?.resolve(false);
      return { ...request, resolve };
    }))
  ), []);
  const cancelGenerationConfirmation = useCallback((): void => {
    setGenerationConfirmation((current) => {
      current?.resolve(false);
      return null;
    });
  }, []);
  const confirmGenerationSubmission = useCallback((): void => {
    setGenerationConfirmation((current) => {
      if (!current) return null;
      const expired = current.items.some((item) => item.quoteExpiresAt && Date.parse(item.quoteExpiresAt) <= Date.now());
      if (expired) {
        current.resolve(false);
        toast.error("报价已过期，请重新获取报价后确认。");
        return null;
      }
      current.resolve(true);
      return null;
    });
  }, []);
  const [bridgeError, setBridgeError] = useState<string | null>(() =>
    hasImageWorkbenchApi() ? null : missingImageWorkbenchMessage
  );
  const [qualityEditedByUser, setQualityEditedByUser] = useState(false);
  const [suggestingEdits, setSuggestingEdits] = useState(false);
  const [suggestedEdits, setSuggestedEdits] = useState<string[]>([]);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  // 历史默认关闭（打开 App 直接看画布）；是否停留在库页则按上次记忆恢复。
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reserveCanvasSpaceForRightRail, setReserveCanvasSpaceForRightRail] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 701px)").matches
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDialogMounted, setSettingsDialogMounted] = useState(false);
  const [settingsEntryPoint, setSettingsEntryPoint] = useState<"default" | "provider-setup" | "model-management">("default");
  const [promptDockAutoCollapse, setPromptDockAutoCollapse] = useState(false);
  const [advancedVideoModesEnabled, setAdvancedVideoModesEnabled] = useState(false);
  const [canvasThumbnailPreview, setCanvasThumbnailPreview] = useState(true);
  const [canvasMinimapVisible, setCanvasMinimapVisible] = useState(true);
  const [canvasImageToolbarOnHover, setCanvasImageToolbarOnHover] = useState(false);
  const [canvasRelationshipHoverHighlight, setCanvasRelationshipHoverHighlight] = useState(false);
  const [wechatStickerExportEnabled, setWechatStickerExportEnabled] = useState(false);
  const [onlineImageSharingEnabled, setOnlineImageSharingEnabled] = useState(true);
  const [copyImageFormat, setCopyImageFormat] = useState<CopyImageFormat>("png");
  const [boardSmartSuggestionsEnabled, setBoardSmartSuggestionsEnabled] = useState(false);
  const [boardAssistantEnabled, setBoardAssistantEnabled] = useState(true);
  const [boardAssistantAgentModeEnabled, setBoardAssistantAgentModeEnabled] = useState(false);
  const [piAgentBuiltinTools, setPiAgentBuiltinTools] = useState<AppSettings["piAgentBuiltinTools"]>([
    "read",
    "grep",
    "find",
    "ls"
  ]);
  const [piAgentIterlayTools, setPiAgentIterlayTools] = useState<string[]>([]);
  const [piAgentSkillPaths, setPiAgentSkillPaths] = useState<string[]>([]);
  const [piAgentExtensionPaths, setPiAgentExtensionPaths] = useState<string[]>([]);
  const [piAgentCustomSkillPaths, setPiAgentCustomSkillPaths] = useState<string[]>([]);
  const [piAgentCustomExtensionPaths, setPiAgentCustomExtensionPaths] = useState<string[]>([]);
  const [piAgentMaxTurns, setPiAgentMaxTurns] = useState(12);
  const [piAgentWebSearchMaxResults, setPiAgentWebSearchMaxResults] = useState(5);
  const [boardAssistantAwarenessEnabled, setBoardAssistantAwarenessEnabled] = useState(true);
  const [boardAssistantIntentSuggestionsEnabled, setBoardAssistantIntentSuggestionsEnabled] = useState(true);
  const [boardAssistantIntentSuggestionCount, setBoardAssistantIntentSuggestionCount] =
    useState<AssistantIntentSuggestionCount>(3);
  const [assistantDockLayout, setAssistantDockLayout] = useState<AssistantDockLayout | null>(null);
  const [editSmartSuggestionsPreference, setEditSmartSuggestionsPreference] = useState<boolean | undefined>(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryUsageLevel, setMemoryUsageLevel] = useState<MemoryUsageLevel>("balanced");
  // 编辑态点击图片查看提示词的方式（flip=翻转 / panel=右侧打字机面板）。
  const [editInfoMode, setEditInfoMode] = useState<EditInfoMode>("flip");
  const [imageDoubleClickAction, setImageDoubleClickAction] = useState<ImageDoubleClickAction>("edit");
  const [downloadDirectory, setDownloadDirectory] = useState("");
  const [versionSeparationMode, setVersionSeparationMode] = useState<VersionSeparationMode>("copy");
  const [generateButtonStyle, setGenerateButtonStyle] = useState<GenerateButtonStyle>("folded");
  const [focusTarget, setFocusTarget] = useState<{ key: string; nonce: number } | null>(null);
  const [selectionTarget, setSelectionTarget] = useState<{ ids: string[]; nonce: number } | null>(null);
  const [promptFocusNonce, setPromptFocusNonce] = useState(0);
  const [promptFocused, setPromptFocused] = useState(false);
  const [particleBurst, setParticleBurst] = useState<ParticleBurstTrigger | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const topLevelBoards = useMemo(() => boards.filter((board) => board.kind !== "comic-drama"), [boards]);
  const boardNameById = useMemo(() => new Map(boards.map((board) => [board.id, board.name])), [boards]);
  const [activeBoard, setActiveBoard] = useState<ActiveBoard | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(readLibraryOpenPref);
  // 素材库整批进场每次应用启动只播放一次；库页卸载后仍保留已播放状态。
  const assetLibraryEntrancePlayedRef = useRef(false);
  const markAssetLibraryEntrancePlayed = useCallback((): void => {
    assetLibraryEntrancePlayedRef.current = true;
  }, []);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallerySceneMounted, setGallerySceneMounted] = useState(false);
  const [libraryInitialTab, setLibraryInitialTab] = useState<LibraryInitialTab | undefined>();
  const [libraryInitialSceneRequest, setLibraryInitialSceneRequest] = useState<{
    id: string;
    nonce: number;
  }>();
  const [openingBoardId, setOpeningBoardId] = useState<string | null>(null);
  const [startupLoading, setStartupLoading] = useState(() => hasImageWorkbenchApi());
  const [boardLoading, setBoardLoading] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  // 画板视图舞台仅做轻量淡入，避免缩放 React Flow 与图片解码争抢渲染资源。
  const stageControls = useAnimationControls();
  // 评论：C 进入评论模式，点击图片弹出输入；评论按当前画板图片作用域，会话内保存。
  const [commentMode, setCommentMode] = useState(false);
  const [comments, setComments] = useState<AssetComment[]>([]);
  const [commentOpen, setCommentOpen] = useState(false);
  const [imageDetailsTargetId, setImageDetailsTargetId] = useState<string | null>(null);
  const [assistantConversationRequest, setAssistantConversationRequest] = useState<{
    conversationId: string;
    nonce: number;
  } | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [skillUpgradeDetails, setSkillUpgradeDetails] = useState<McpSkillUpgradeDetail[]>([]);
  const [skillUpgradeDetailsOpen, setSkillUpgradeDetailsOpen] = useState(false);
  const [referralInviteOpen, setReferralInviteOpen] = useState(false);
  const [pendingComment, setPendingComment] = useState<{
    imagePath: string;
    x: number;
    y: number;
    position: NonNullable<AssetComment["position"]>;
  } | null>(null);
  // 待确认删除的图片 id（null = 无对话框）。
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
  const deleteConfirmationRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [workflowDeleteTargetIds, setWorkflowDeleteTargetIds] = useState<string[] | null>(null);
  const workflowDeleteConfirmationRef = useRef<((confirmed: boolean) => void) | null>(null);
  const comicDramaBoardHistoryOperationRef = useRef<Promise<void>>(Promise.resolve());
  const [imageTrashOpen, setImageTrashOpen] = useState(false);
  const [trashingImages, setTrashingImages] = useState(false);
  const [templateExtractionSource, setTemplateExtractionSource] = useState<TemplateExtractionSource | null>(null);
  // 图片编辑会话：非空时 Lightbox 聚焦该图，dock 过渡为编辑模式。
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [advancedEditOpen, setAdvancedEditOpen] = useState(false);
  const [sliceTargetId, setSliceTargetId] = useState<string | null>(null);
  const [wechatExportRequest, setWechatExportRequest] = useState<{
    images: GeneratedImage[];
    mode: "personal" | "album";
  } | null>(null);
  const [quickImageShareImages, setQuickImageShareImages] = useState<GeneratedImage[] | null>(null);
  const [masterGoReconstructionImage, setMasterGoReconstructionImage] = useState<GeneratedImage | null>(null);
  const [canvasRestoreSnapshot, setCanvasRestoreSnapshot] = useState<CanvasRestoreSnapshot | null>(null);
  // 顶栏撤销/重做按钮的可用态；栈本体放 ref 里避免高频改动触发渲染。
  const [canvasHistoryStatus, setCanvasHistoryStatus] = useState({ canUndo: false, canRedo: false });
  const [editSourceRect, setEditSourceRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  // 首次引导：非空时展示对应 tour；自动展示即写标记，完成时再更新最终状态。
  const [activeTour, setActiveTour] = useState<TourDefinition | null>(null);
  const tourAutoShownRef = useRef<Set<string>>(new Set());
  // 启动时只读取一次，确保首次推荐在当前会话内保持可见，同时不会在后续启动重复出现。
  const firstDemoStartVisitRef = useRef(!hasSeenDemoStart());
  // 画板引导的模拟生成演示：打字定时器与预载的演示图 dataUrl。
  const tourTypingTimerRef = useRef<number | null>(null);
  const tourDemoDataUrlRef = useRef<string | null>(null);
  // 画板引导的菜单步骤：强制展开顶栏画板菜单。
  const [tourBoardMenuOpen, setTourBoardMenuOpen] = useState(false);

  useEffect(() => {
    if (!settingsOpen) setSettingsEntryPoint("default");
  }, [settingsOpen]);

  useEffect(() => {
    if (!hasImageWorkbenchApi()) return;
    let cancelled = false;
    let frame = 0;
    void getImageWorkbenchApi().consumeMcpSkillUpgrades().then((details) => {
      if (cancelled || details.length === 0) return;
      setSkillUpgradeDetails(details);
      frame = window.requestAnimationFrame(() => {
        iterlayToast.update({
          badge: "Skill",
          title: "Iterlay Skill 已升级",
          detail: details.length > 1
            ? `已同步到 ${details.length} 个 Coding Agent`
            : `已同步到 ${details[0].client === "codex" ? "Codex" : "Claude Code"}`,
          actionLabel: "查看详情",
          onOpen: () => setSkillUpgradeDetailsOpen(true)
        });
      });
    }).catch((error) => console.warn("读取 Iterlay Skill 升级详情失败。", error));
    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const openProviderSetup = useCallback((): void => {
    setSettingsEntryPoint("provider-setup");
    setSettingsOpen(true);
  }, []);

  const openModelManagement = useCallback((): void => {
    setSettingsEntryPoint("model-management");
    setSettingsOpen(true);
  }, []);

  // 自动保存读取的都是最新值（避免闭包捕获旧状态），布局数据频繁变化走 ref 不触发渲染。
  const canvasStateRef = useRef<CanvasLayoutState>({ positions: {}, connections: [] });
  const canvasUndoStackRef = useRef<CanvasUndoSnapshot[]>([]);
  const canvasRedoStackRef = useRef<CanvasUndoSnapshot[]>([]);
  const imagesRef = useRef<GeneratedImage[]>(images);
  imagesRef.current = images;
  const workflowNodesRef = useRef(workflowNodes);
  workflowNodesRef.current = workflowNodes;
  const inputRef = useRef<GenerateImageInput>(input);
  inputRef.current = input;
  const activeBoardRef = useRef<ActiveBoard | null>(activeBoard);
  activeBoardRef.current = activeBoard;
  const boardSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardSaveInFlightRef = useRef<Promise<void> | null>(null);
  const boardSaveQueuedRef = useRef(false);
  const mcpPendingImageIdsRef = useRef(new Map<string, string[]>());
  const mcpPendingEditTargetIdsRef = useRef(new Map<string, string>());
  const deletedBoardIdsRef = useRef(new Set<string>());
  const boardThumbnailRef = useRef<{ key: string; dataUrl: string }>({ key: "", dataUrl: "" });
  const historyThumbnailCacheRef = useRef(new DataUrlLruCache({
    maxEntries: 32,
    maxEstimatedBytes: 64 * 1024 * 1024
  }));
  const boardDetailCacheRef = useRef(new BoardDetailCache<BoardDetail | null>(4, 15_000));
  const boardOpenSequenceRef = useRef(0);
  // 进入编辑会话前的历史栏开合状态，退出编辑时恢复。
  const historyOpenBeforeEditRef = useRef(false);
  const editSuggestionRequestRef = useRef(0);
  // 启动时"上次是否停留在库页"：首帧读一次，后续启动流程始终以这个快照为准。
  const restoreLibraryOpenRef = useRef(libraryOpen);
  const startupTaskRef = useRef<Promise<void> | null>(null);
  const officialRecoveryStartedRef = useRef(false);

  useEffect(() => () => boardDetailCacheRef.current.clear(), []);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === activeProviderId) ?? providers[0] ?? defaultProvider,
    [providers, activeProviderId]
  );
  const providerBlocksGenerateReferences = !providerSupportsGenerateReferences(activeProvider);
  const providerBlocksEditing = !activeProvider.supportsReferenceImages;
  const advancedEditProviderLimitation = !activeProvider.supportsReferenceImages
    ? `“${activeProvider.name}”不支持图片编辑，请切换支持参考图的 Provider。`
    : activeProvider.type === "fal" && activeProvider.falReferenceInput === "image_url"
      ? `“${activeProvider.name}”当前只接收一张图片，无法同时发送目标图和区域蒙版。请在 Provider 设置中改为 image_urls，或切换其他 Provider。`
      : undefined;
  const activeHasKey = Boolean(providerKeyStatus[activeProvider.id]);
  const isOfficialProvider = activeProvider.type === "official";
  const activeTextProvider = useMemo(
    () => textProviders.find((p) => p.id === activeTextProviderId) ?? textProviders[0],
    [textProviders, activeTextProviderId]
  );
  const textProviderReadiness = resolveTextProviderReadiness(
    activeTextProvider,
    providerKeyStatus,
    creditStatus,
    creditError
  );
  const textProviderReady = textProviderReadiness === "ready";
  const textProviderUnavailableMessage = textProviderReadiness === "checking"
    ? "正在检查官方文本助手状态，请稍后重试。"
    : textProviderReadiness === "unavailable"
      ? creditError || "官方文本助手暂时不可用，请稍后重试。"
      : "请先在设置中配置文本 Provider。";
  const editSmartSuggestionsAvailable = textProviderReady;
  const editSmartSuggestionsEnabled = resolveEditSmartSuggestionsEnabled(
    editSmartSuggestionsPreference,
    textProviderReady
  );
  const editTarget = editTargetId ? (images.find((image) => image.id === editTargetId) ?? null) : null;
  const imageDetailsTarget = imageDetailsTargetId
    ? (images.find((image) => image.id === imageDetailsTargetId) ?? null)
    : null;
  const promptDockEditTarget = useMemo(
    () => editTarget ? { dataUrl: editTarget.dataUrl, path: editTarget.path } : null,
    [editTarget]
  );
  const sliceTarget = sliceTargetId ? (images.find((image) => image.id === sliceTargetId) ?? null) : null;
  const referencedCanvasNodeIds = useMemo(
    () => input.referenceImages.flatMap((reference) => reference.sourceNodeId ? [reference.sourceNodeId] : []),
    [input.referenceImages]
  );
  const scenes = useMemo(() => [...PRESET_SCENES, ...customScenes], [customScenes]);
  const effectiveTheme: "dark" | "light" = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  const needsProviderSetup = !isOfficialProvider && (!setupComplete || providers.length === 0 || !activeHasKey);

  const reportWorkbenchError = useCallback((error: unknown): void => {
    const message = getWorkbenchErrorMessage(error);
    if (message === missingImageWorkbenchMessage) {
      setBridgeError(message);
    }
    setStatus(message);
    toast.error(message);
  }, [setStatus]);

  const getWorkbenchApi = useCallback(() => {
    try {
      return getImageWorkbenchApi();
    } catch (error) {
      reportWorkbenchError(error);
      return null;
    }
  }, [reportWorkbenchError]);

  const hydrateVideoProviderCatalogs = useCallback(async (providersToHydrate: VideoProviderConfig[]): Promise<VideoProviderConfig[]> => {
    const api = getWorkbenchApi();
    if (!api) return providersToHydrate;
    const entries = await Promise.all(providersToHydrate.map(async (provider): Promise<[string, VideoProviderModelOption[]]> => {
      try {
        return [provider.id, await api.listVideoProviderModels(provider)];
      } catch {
        return [provider.id, []];
      }
    }));
    return mergeVideoProviderModelCatalogs(providersToHydrate, new Map(entries));
  }, [getWorkbenchApi]);

  const changeAssistantDockLayout = useCallback(async (
    requestedLayout: AssistantDockLayout | null
  ): Promise<AssistantDockLayout | null> => {
    setAssistantDockLayout(requestedLayout);
    return requestedLayout;
  }, []);

  useEffect(() => {
    if (advancedEditOpen) setAssistantDockLayout(null);
  }, [advancedEditOpen]);

  useEffect(() => {
    const api = getWorkbenchApi();
    if (!api) return;
    let cancelled = false;
    setCreditLoading(true);
    setCreditError(null);
    void api.getCreditStatus()
      .then((status) => {
        if (!cancelled) {
          creditStatusRef.current = status;
          setCreditStatus(status);
          setVideoProviders((current) => mergeOfficialVideoCatalog(current, status));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setCreditError(getWorkbenchErrorMessage(error, "暂时无法读取官方余额。"));
      })
      .finally(() => {
        if (!cancelled) setCreditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getWorkbenchApi, licenseStatus?.state]);

  // Credits 独立于当前路由常驻刷新，保证模型菜单里的官方余额始终可见。
  const refreshCreditStatusRef = useRef<() => void>(() => {});
  refreshCreditStatusRef.current = (): void => {
    const api = getWorkbenchApi();
    if (!api) return;
    void api.getCreditStatus()
      .then((status) => {
        creditStatusRef.current = status;
        setCreditStatus(status);
        setVideoProviders((current) => mergeOfficialVideoCatalog(current, status));
        setCreditError(null);
      })
      .catch(() => {
        // 静默失败：下一次生成或打开设置时仍会重新拉取。
      });
  };
  const refreshCreditStatus = useCallback((): void => {
    refreshCreditStatusRef.current();
  }, []);

  const requestEditSuggestions = useCallback((notifyOnError = false): void => {
    const requestId = ++editSuggestionRequestRef.current;
    if (!editSmartSuggestionsEnabled || !textProviderReady || !editTarget?.path) {
      setSuggestingEdits(false);
      return;
    }

    const api = getWorkbenchApi();
    if (!api) {
      setSuggestingEdits(false);
      return;
    }

    setSuggestingEdits(true);
    void api
      .suggestImageEdits({ sourcePath: editTarget.path })
      .then((result) => {
        if (editSuggestionRequestRef.current !== requestId) return;
        setSuggestedEdits(result.suggestions);
        refreshCreditStatus();
      })
      .catch((error: unknown) => {
        if (editSuggestionRequestRef.current !== requestId) return;
        console.warn("自动生成图片修改建议失败", error);
        if (notifyOnError) {
          toast.error("智能建议生成失败", {
            description: getWorkbenchErrorMessage(error, "请稍后重试。")
          });
        }
      })
      .finally(() => {
        if (editSuggestionRequestRef.current === requestId) setSuggestingEdits(false);
      });
  }, [
    editSmartSuggestionsEnabled,
    editTarget?.path,
    getWorkbenchApi,
    refreshCreditStatus,
    textProviderReady
  ]);

  // 编辑会话进入或切换目标/Provider 后，使用已配置的视觉模型刷新图片级修改建议。
  useEffect(() => {
    setSuggestedEdits([]);
    requestEditSuggestions();
    return () => {
      editSuggestionRequestRef.current += 1;
    };
  }, [requestEditSuggestions]);

  const regenerateSuggestedEdits = useCallback((): void => {
    requestEditSuggestions(true);
  }, [requestEditSuggestions]);

  const refreshHistory = useCallback(async (): Promise<void> => {
    const api = getWorkbenchApi();
    if (!api) return;

    try {
      const [jobs, videoJobs] = await Promise.all([api.listHistory(), api.listVideoJobs()]);
      setHistory(jobs);
      setVideoHistory(videoJobs);
    } catch (error) {
      reportWorkbenchError(error);
    }
  }, [getWorkbenchApi, reportWorkbenchError]);

  const clearCurrentBoardHistory = useCallback(async (): Promise<void> => {
    const boardId = activeBoardRef.current?.id;
    if (!boardId) throw new Error("请先打开一个画板。");
    const api = getWorkbenchApi();
    if (!api) throw new Error(missingImageWorkbenchMessage);

    try {
      const [result, videoCount] = await Promise.all([api.clearHistory(boardId), api.clearVideoJobs(boardId)]);
      setHistory((current) => current.filter((job) => job.boardId !== boardId));
      setVideoHistory((current) => current.filter((job) => job.input.boardId !== boardId));
      const count = result.count + videoCount;
      toast.success(count > 0 ? `已清空 ${count} 条生成历史` : "生成历史已为空");
    } catch (error) {
      reportWorkbenchError(error);
      throw error;
    }
  }, [getWorkbenchApi, reportWorkbenchError]);

  // ---------- 画板：自动保存与切换 ----------

  const persistBoardSnapshot = useCallback(async (): Promise<void> => {
    const board = activeBoardRef.current;
    if (!board || deletedBoardIdsRef.current.has(board.id)) return;
    const api = getWorkbenchApi();
    if (!api) return;

    const persistable = imagesRef.current.filter((image) => !image.pending && image.path);
    const persistableIds = new Set([
      ...persistable.map((image) => image.id),
      ...workflowNodesRef.current.map((node) => node.id)
    ]);
    const positions = canvasStateRef.current.positions;
    const imageNodes: BoardNodeSnapshot[] = persistable.map((image) => serializeGeneratedImage(image, {
      x: positions[image.id]?.x ?? 0,
      y: positions[image.id]?.y ?? 0,
      width: positions[image.id]?.width,
      height: positions[image.id]?.height
    }));
    const workflowBoardNodes = workflowNodesRef.current.map((node) => ({
      ...node,
      x: positions[node.id]?.x ?? node.x,
      y: positions[node.id]?.y ?? node.y,
      displayWidth: positions[node.id]?.width ?? node.displayWidth,
      displayHeight: positions[node.id]?.height ?? node.displayHeight
    }));
    const nodes: BoardNode[] = [...imageNodes, ...workflowBoardNodes];
    const connections = canvasStateRef.current.connections.filter(
      (connection) => persistableIds.has(connection.source) && persistableIds.has(connection.target)
    );
    const viewport = canvasStateRef.current.viewport;
    // 布局变化不应反复解码和编码封面；只在首图内容变化时重建缩略图。
    const cover = persistable[0];
    const coverKey = cover ? `${cover.path}:${cover.activeVersion ?? -1}` : "";
    const thumbnailDataUrl = coverKey === boardThumbnailRef.current.key
      ? boardThumbnailRef.current.dataUrl
      : cover ? (await downscaleDataUrl(cover.dataUrl, 480)) ?? "" : "";
    if (activeBoardRef.current?.id === board.id) {
      boardThumbnailRef.current = { key: coverKey, dataUrl: thumbnailDataUrl };
    }
    // 删除动作可能发生在缩略图编码期间；此时不要再向主进程发送可重建画板的保存请求。
    if (deletedBoardIdsRef.current.has(board.id)) return;

    try {
      const summary = await api.saveBoard({
        id: board.id,
        name: board.name,
        replaceManagedNodes: true,
        nodes,
        connections,
        viewport,
        thumbnailDataUrl
      });
      boardDetailCacheRef.current.delete(board.id);
      if (activeBoardRef.current?.id === board.id) {
        void api.getComicDramaBoardSnapshot(board.id).then((snapshot) => {
          if (activeBoardRef.current?.id === board.id) setComicDramaSnapshot(snapshot);
        }).catch(() => undefined);
      }
      setBoards((current) => sortBoardsByRecentUse(
        current.map((item) => (item.id === summary.id ? summary : item))
      ));
    } catch (error) {
      // 自动保存失败不打断创作流，仅留痕；下一次改动会再试。
      console.warn("画板自动保存失败", error);
    }
  }, [getWorkbenchApi]);

  // 同一画板最多只有一次保存正在执行；期间发生的多次变化合并为一次最新快照。
  const persistBoard = useCallback(async (): Promise<void> => {
    if (boardSaveInFlightRef.current) {
      boardSaveQueuedRef.current = true;
      await boardSaveInFlightRef.current;
      return;
    }

    do {
      boardSaveQueuedRef.current = false;
      const request = persistBoardSnapshot();
      boardSaveInFlightRef.current = request;
      try {
        await request;
      } finally {
        boardSaveInFlightRef.current = null;
      }
    } while (boardSaveQueuedRef.current);
  }, [persistBoardSnapshot]);

  const scheduleBoardSave = useCallback((): void => {
    if (!activeBoardRef.current) return;
    if (boardSaveTimerRef.current) clearTimeout(boardSaveTimerRef.current);
    boardSaveTimerRef.current = setTimeout(() => {
      boardSaveTimerRef.current = null;
      void persistBoard();
    }, 800);
  }, [persistBoard]);

  const flushBoardSave = useCallback(async (): Promise<void> => {
    if (boardSaveTimerRef.current) {
      clearTimeout(boardSaveTimerRef.current);
      boardSaveTimerRef.current = null;
      await persistBoard();
    }
    while (boardSaveInFlightRef.current) {
      await boardSaveInFlightRef.current;
      await Promise.resolve();
    }
  }, [persistBoard]);

  const handleCanvasChange = useCallback(
    (
      positions: Record<string, CanvasNodeLayout>,
      viewport: BoardViewport,
      connections: BoardConnection[]
    ): void => {
      canvasStateRef.current = { positions, viewport, connections };
      setComicDramaSnapshot((current) => current ? { ...current, connections } : current);
      scheduleBoardSave();
    },
    [scheduleBoardSave]
  );

  const syncCanvasHistoryStatus = useCallback((): void => {
    const boardId = activeBoardRef.current?.id ?? LOCAL_CANVAS_HISTORY_ID;
    const canUndo = canvasUndoStackRef.current.some((snapshot) => snapshot.boardId === boardId);
    const canRedo = canvasRedoStackRef.current.some((snapshot) => snapshot.boardId === boardId);
    setCanvasHistoryStatus((current) =>
      current.canUndo === canUndo && current.canRedo === canRedo ? current : { canUndo, canRedo }
    );
  }, []);

  /** 抓取当前画布状态：图片来自 imagesRef，坐标/选中优先用调用方传入的实时节点快照。 */
  const captureCanvasSnapshot = useCallback(
    (selection?: CanvasSelectionSnapshot): CanvasUndoSnapshot => ({
      boardId: activeBoardRef.current?.id ?? LOCAL_CANVAS_HISTORY_ID,
      images: imagesRef.current.map(cloneCanvasImage),
      workflowNodes: structuredClone(workflowNodesRef.current),
      positions: { ...(selection?.positions ?? canvasStateRef.current.positions) },
      selectedIds: [...(selection?.selectedIds ?? [])],
      connections: (selection?.connections ?? canvasStateRef.current.connections).map(cloneBoardConnection),
      selectedConnectionIds: [...(selection?.selectedConnectionIds ?? [])]
    }),
    []
  );

  const pushCanvasUndoSnapshot = useCallback(
    (selection?: CanvasSelectionSnapshot): void => {
      const stack = canvasUndoStackRef.current;
      stack.push(captureCanvasSnapshot(selection));
      if (stack.length > MAX_CANVAS_UNDO_STEPS) stack.shift();
      // 产生新改动后，原先的重做分支随之失效。
      canvasRedoStackRef.current = [];
      syncCanvasHistoryStatus();
    },
    [captureCanvasSnapshot, syncCanvasHistoryStatus]
  );

  const queueComicDramaBoardState = useCallback((
    restoreBoardIds: readonly string[],
    trashBoardIds: readonly string[]
  ): void => {
    if ((!restoreBoardIds.length && !trashBoardIds.length) || !hasImageWorkbenchApi()) return;
    const restoreIds = [...new Set(restoreBoardIds)];
    const trashIds = [...new Set(trashBoardIds)];
    const operation = comicDramaBoardHistoryOperationRef.current
      .catch(() => undefined)
      .then(async () => {
        const api = getImageWorkbenchApi();
        await Promise.all(restoreIds.map((boardId) => api.restoreBoard(boardId)));
        await Promise.all(trashIds.map((boardId) => api.deleteBoard(boardId)));
        for (const boardId of [...restoreIds, ...trashIds]) {
          boardDetailCacheRef.current.delete(boardId);
        }
        setBoards(sortBoardsByRecentUse(await api.listBoards()));
      });
    comicDramaBoardHistoryOperationRef.current = operation;
    void operation.catch((error) => {
      toast.error(getWorkbenchErrorMessage(error, "同步漫剧子画板状态失败。"));
    });
  }, []);

  const applyCanvasSnapshot = useCallback((snapshot: CanvasUndoSnapshot): void => {
    const currentComicDramaEntries = new Map(
      workflowNodesRef.current.flatMap((node) => node.type === "comic-drama-entry"
        ? [[node.id, node.childBoardId] as const]
        : [])
    );
    const restoredComicDramaEntries = new Map(
      snapshot.workflowNodes.flatMap((node) => node.type === "comic-drama-entry"
        ? [[node.id, node.childBoardId] as const]
        : [])
    );
    queueComicDramaBoardState(
      [...restoredComicDramaEntries].flatMap(([nodeId, childBoardId]) =>
        currentComicDramaEntries.has(nodeId) ? [] : [childBoardId]
      ),
      [...currentComicDramaEntries].flatMap(([nodeId, childBoardId]) =>
        restoredComicDramaEntries.has(nodeId) ? [] : [childBoardId]
      )
    );
    const selectedIds = new Set(snapshot.selectedIds);
    const restored = snapshot.images.map((image) => ({
      ...cloneCanvasImage(image),
      placementAnchorId: undefined,
      placementPosition: snapshot.positions[image.id],
      placementWidth: snapshot.positions[image.id]?.width,
      preserveViewportOnCreate: true,
      selectOnCreate: selectedIds.has(image.id)
    }));
    imagesRef.current = restored;
    workflowNodesRef.current = structuredClone(snapshot.workflowNodes ?? []);
    canvasStateRef.current = {
      ...canvasStateRef.current,
      positions: { ...snapshot.positions },
      connections: (snapshot.connections ?? []).map(cloneBoardConnection)
    };
    setImages(restored);
    setWorkflowNodes(workflowNodesRef.current);
    setCanvasRestoreSnapshot((current) => ({
      positions: { ...snapshot.positions },
      selectedIds: [...snapshot.selectedIds],
      connections: (snapshot.connections ?? []).map(cloneBoardConnection),
      selectedConnectionIds: [...(snapshot.selectedConnectionIds ?? [])],
      nonce: (current?.nonce ?? 0) + 1
    }));
  }, [queueComicDramaBoardState]);

  const undoCanvasChange = useCallback(
    (current?: CanvasSelectionSnapshot): void => {
      const boardId = activeBoardRef.current?.id ?? LOCAL_CANVAS_HISTORY_ID;
      const stack = canvasUndoStackRef.current;
      let snapshot = stack.pop();
      while (snapshot && snapshot.boardId !== boardId) snapshot = stack.pop();
      if (!snapshot) {
        syncCanvasHistoryStatus();
        return;
      }

      const redoStack = canvasRedoStackRef.current;
      redoStack.push(captureCanvasSnapshot(current));
      if (redoStack.length > MAX_CANVAS_UNDO_STEPS) redoStack.shift();
      applyCanvasSnapshot(snapshot);
      syncCanvasHistoryStatus();
    },
    [applyCanvasSnapshot, captureCanvasSnapshot, syncCanvasHistoryStatus]
  );

  const redoCanvasChange = useCallback(
    (current?: CanvasSelectionSnapshot): void => {
      const boardId = activeBoardRef.current?.id ?? LOCAL_CANVAS_HISTORY_ID;
      const stack = canvasRedoStackRef.current;
      let snapshot = stack.pop();
      while (snapshot && snapshot.boardId !== boardId) snapshot = stack.pop();
      if (!snapshot) {
        syncCanvasHistoryStatus();
        return;
      }

      // 重做前把当前状态放回撤销栈，且不清空剩余的重做分支。
      const undoStack = canvasUndoStackRef.current;
      undoStack.push(captureCanvasSnapshot(current));
      if (undoStack.length > MAX_CANVAS_UNDO_STEPS) undoStack.shift();
      applyCanvasSnapshot(snapshot);
      syncCanvasHistoryStatus();
    },
    [applyCanvasSnapshot, captureCanvasSnapshot, syncCanvasHistoryStatus]
  );

  useEffect(() => {
    canvasUndoStackRef.current = [];
    canvasRedoStackRef.current = [];
    setCanvasRestoreSnapshot(null);
    setCanvasHistoryStatus({ canUndo: false, canRedo: false });
  }, [activeBoard?.id]);

  const refreshBoards = useCallback(async (): Promise<BoardSummary[]> => {
    const api = getWorkbenchApi();
    if (!api) return [];
    try {
      const list = await api.listBoards();
      setBoards(list);
      return list;
    } catch (error) {
      reportWorkbenchError(error);
      return [];
    }
  }, [getWorkbenchApi, reportWorkbenchError]);

  const loadBoardDetail = useCallback(
    (boardId: string): Promise<BoardDetail | null> => {
      const cached = boardDetailCacheRef.current.get(boardId);
      if (cached) return cached;

      const api = getWorkbenchApi();
      if (!api) return Promise.resolve(null);
      const promise = api.getBoard(boardId).catch((error) => {
        boardDetailCacheRef.current.deleteIfMatches(boardId, promise);
        throw error;
      });
      boardDetailCacheRef.current.set(boardId, promise);
      return promise;
    },
    [getWorkbenchApi]
  );

  const prefetchBoard = useCallback(
    (boardId: string): void => {
      if (boardId === activeBoardRef.current?.id) return;
      void loadBoardDetail(boardId).catch(() => undefined);
    },
    [loadBoardDetail]
  );

  const openBoard = useCallback(
    async (
      boardId: string,
      origin?: BoardEnterOrigin,
      opts?: {
        keepLibraryOpen?: boolean;
        resetPromptDraft?: boolean;
        deferImagePreload?: boolean;
        forceReload?: boolean;
        suppressLoadingScreen?: boolean;
        skipFlushCurrent?: boolean;
      }
    ): Promise<void> => {
      const requestSequence = ++boardOpenSequenceRef.current;
      setOpeningBoardId(boardId);

      if (boardId === activeBoardRef.current?.id && !opts?.forceReload) {
        if (!opts?.keepLibraryOpen) setLibraryOpen(false);
        if (requestSequence === boardOpenSequenceRef.current) setOpeningBoardId(null);
        return;
      }

      if (!opts?.suppressLoadingScreen) setBoardLoading(true);
      // 目标画板读取与旧画板落盘互不依赖，尽早启动以消除串行等待。
      const detailPromise = loadBoardDetail(boardId);
      try {
        if (!opts?.skipFlushCurrent) await flushBoardSave();
        const detail = await detailPromise;
        if (requestSequence !== boardOpenSequenceRef.current) return;
        if (!detail) {
          toast.error("画板不存在或已损坏。");
          return;
        }
        const entryPreload = selectBoardEntryPreload(detail, {
          width: window.innerWidth,
          height: window.innerHeight
        }, {
          visibleCount: DEFAULT_BOARD_ENTRY_VISIBLE_PRELOAD_LIMIT
        });
        if (opts?.deferImagePreload) {
          void preloadBoardImages(entryPreload, {
            shouldContinue: () => requestSequence === boardOpenSequenceRef.current
          });
        } else {
          await preloadBoardImages(entryPreload);
        }
        if (requestSequence !== boardOpenSequenceRef.current) return;
        canvasStateRef.current = {
          positions: Object.fromEntries(detail.nodes.map((node) => [node.id, {
            x: node.x,
            y: node.y,
            width: node.displayWidth,
            height: node.displayHeight
          }])),
          viewport: detail.viewport,
          connections: detail.connections ?? []
        };
        const restored: GeneratedImage[] = detail.nodes
          .filter(isBoardImageNode)
          .map((node) => hydrateGeneratedImage(node, detail.images))
          .filter((image): image is GeneratedImage => image !== null);
        if (opts?.resetPromptDraft) {
          const nextInput = resetBoardDraft(inputRef.current);
          inputRef.current = nextInput;
          setInput(nextInput);
          setEditTargetId(null);
          setAdvancedEditOpen(false);
          setSliceTargetId(null);
          setSuggestedEdits([]);
          setParticleBurst(null);
        }
        const openedAt = new Date().toISOString();
        setBoards((current) => promoteRecentlyUsedBoard(current, detail.id, openedAt));
        const openedBoard: ActiveBoard = {
          id: detail.id,
          name: detail.name,
          kind: detail.kind,
          parentBoardId: detail.parentBoardId,
          viewport: detail.viewport
        };
        // Async callers may submit generation before React commits this board switch.
        activeBoardRef.current = openedBoard;
        imagesRef.current = restored;
        setActiveBoard(openedBoard);
        setImages(restored);
        setVideoUrls(detail.media ?? {});
        const restoredWorkflowNodes = detail.nodes.filter(
          (node): node is CanvasPersistedNode => (
            isBoardTextNode(node)
            || isBoardGenerationNode(node)
            || isBoardVideoNode(node)
            || isBoardVideoGenerationNode(node)
            || isComicDramaNode(node)
            || node.type === "comic-drama-entry"
            || node.type === "video-sequence-entry"
          )
        );
        workflowNodesRef.current = restoredWorkflowNodes;
        setWorkflowNodes(restoredWorkflowNodes);
        setComicDramaSnapshot({
          boardId: detail.id,
          revision: detail.revision ?? 0,
          nodes: detail.nodes.filter((node) => isComicDramaNode(node) || node.type === "video-sequence-entry") as ComicDramaBoardSnapshot["nodes"],
          connections: detail.connections ?? [],
          groups: detail.groups ?? []
        });
        // Older board nodes (including early MCP generations) did not retain source
        // dimensions. Hydrate them once so their canvas frames follow the real aspect ratio.
        const imagesMissingDimensions = restored.filter((image) => !image.width || !image.height);
        if (imagesMissingDimensions.length > 0) {
          void Promise.all(imagesMissingDimensions.map(async (image) => ({
            id: image.id,
            ...await loadImageSize(image.dataUrl)
          }))).then((sizes) => {
            if (requestSequence !== boardOpenSequenceRef.current) return;
            const sizeById = new Map(
              sizes
                .filter((size) => size.width > 0 && size.height > 0)
                .map((size) => [size.id, size])
            );
            if (sizeById.size === 0) return;
            setImages((current) => current.map((image) => {
              const size = sizeById.get(image.id);
              return size ? { ...image, width: size.width, height: size.height } : image;
            }));
          });
        }
        scheduleRemainingBoardPreload(
          detail,
          () => requestSequence === boardOpenSequenceRef.current
        );
        setFocusTarget(null);
        setSelectionTarget(null);
        // 切换画板：评论现为全局持久化（按图片文件），只需收起评论态。
        setCommentOpen(false);
        setCommentMode(false);
        setPendingComment(null);
        // 删除画板后的兜底加载需要留在库页；此时若关掉库页，
        // 库页里尚在关闭动画中的删除确认 Dialog 会被整树卸载，
        // body 上残留 pointer-events:none，导致全界面不可点击。
        if (!opts?.keepLibraryOpen) setLibraryOpen(false);
        const api = getWorkbenchApi();
        if (api) void api.setLastOpenedBoard(detail.id);
        stageControls.set({ opacity: 1 });
      } catch (error) {
        if (requestSequence === boardOpenSequenceRef.current) reportWorkbenchError(error);
      } finally {
        if (requestSequence === boardOpenSequenceRef.current) {
          setOpeningBoardId(null);
          if (!opts?.suppressLoadingScreen) setBoardLoading(false);
        }
      }
    },
    [flushBoardSave, getWorkbenchApi, loadBoardDetail, reportWorkbenchError, stageControls]
  );

  const notifyVideoJob = useStableCallback((job: VideoGenerationJob): void => {
    showVideoJobNotification(job, {
      notifiedJobIds: notifiedVideoJobIdsRef.current,
      boardNameForId: (boardId) => boards.find((board) => board.id === boardId)?.name,
      onNavigate: (boardId, jobId) => {
        void (async () => {
          if (activeBoardRef.current?.id !== boardId) await openBoard(boardId);
          setSelectionTarget({ ids: [`video-output-${jobId}`], nonce: Date.now() });
        })();
      }
    });
  });

  // MCP runs outside React and mutates boards through the preload API. Reconcile the
  // local workbench so its pending state and persisted canvas snapshot stay authoritative.
  useEffect(() => {
    const onMcpEvent = (event: Event): void => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail || typeof detail.type !== "string") return;
      const boardId = typeof detail.boardId === "string" ? detail.boardId : undefined;
      const operationId = typeof detail.operationId === "string" ? detail.operationId : undefined;

      if (detail.type === "board-mutation-requested" && boardId) {
        const resolve = typeof detail.resolve === "function" ? detail.resolve as () => void : undefined;
        const reject = typeof detail.reject === "function" ? detail.reject as (message?: string) => void : undefined;
        void (async () => {
          try {
            if (activeBoardRef.current?.id === boardId) await flushBoardSave();
            resolve?.();
          } catch (error) {
            reject?.(getWorkbenchErrorMessage(error, "Iterlay 无法准备画板变更。"));
          }
        })();
        return;
      }

      if (detail.type === "board-created" && boardId) {
        void (async () => {
          await refreshBoards();
          await openBoard(boardId, undefined, { resetPromptDraft: true });
          setStatus("MCP 已创建画板。");
        })();
        return;
      }

      if (detail.type === "open-board" && boardId) {
        void openBoard(boardId);
        return;
      }

      if (detail.type === "focus-nodes" && boardId) {
        const nodeIds = Array.isArray(detail.nodeIds)
          ? detail.nodeIds.filter((id): id is string => typeof id === "string")
          : [];
        void (async () => {
          if (activeBoardRef.current?.id !== boardId) await openBoard(boardId);
          if (nodeIds.length > 0) setSelectionTarget({ ids: nodeIds, nonce: Date.now() });
        })();
        return;
      }

      if (detail.type === "fit-board-view" && boardId) {
        const nodeIds = Array.isArray(detail.nodeIds)
          ? detail.nodeIds.filter((id): id is string => typeof id === "string")
          : [];
        void (async () => {
          await openBoard(boardId, undefined, { forceReload: activeBoardRef.current?.id === boardId });
          if (nodeIds.length > 0) setSelectionTarget({ ids: nodeIds, nonce: Date.now() });
        })();
        return;
      }

      if (detail.type === "generation-started" && boardId && operationId) {
        const count = typeof detail.count === "number" ? detail.count : 1;
        const mode = detail.mode === "edit" ? "edit" : "generate";
        const prompt = typeof detail.prompt === "string" ? detail.prompt : "";
        const size = typeof detail.size === "string" ? parseSizeDimensions(detail.size) : null;
        if (mode === "generate" && activeBoardRef.current?.id === boardId) {
          const ids = Array.from({ length: Math.max(1, count) }, () => crypto.randomUUID());
          mcpPendingImageIdsRef.current.set(operationId, ids);
          setImages((current) => [
            ...ids.map((id) => ({
              id,
              path: "",
              dataUrl: "",
              jobId: "",
              pending: true,
              generationStatus: "running" as const,
              pendingStartedAt: Date.now(),
              pendingPrompt: prompt,
              source: "generated" as const,
              width: size?.width,
              height: size?.height
            })),
            ...current
          ]);
        }
        if (mode === "edit" && activeBoardRef.current?.id === boardId) {
          const sourcePath = typeof detail.sourcePath === "string" ? detail.sourcePath : "";
          const target = imagesRef.current.find((image) =>
            image.path === sourcePath || image.versions?.some((version) => version.path === sourcePath)
          );
          if (target) {
            mcpPendingEditTargetIdsRef.current.set(operationId, target.id);
            const startedAt = Date.now();
            setImages((current) => current.map((image) => image.id === target.id
              ? {
                  ...image,
                  editing: true,
                  pendingEditCount: getPendingEditCount(image) + count,
                  editingStartedAt: image.editingStartedAt ?? startedAt
                }
              : image
            ));
          }
        }
        setActiveGenerations((current) => current + 1);
        setActiveBoardGenerations((current) => [...current, {
          id: operationId,
          boardId,
          mode,
          prompt,
          requestedCount: count,
          startedAt: Date.now(),
          status: "running"
        }]);
        setStatus(mode === "edit" ? "MCP 正在编辑图片..." : "MCP 正在生成图片...");
        return;
      }

      if (detail.type === "board-updated" && boardId) {
        void (async () => {
          if (operationId) {
            const pendingIds = mcpPendingImageIdsRef.current.get(operationId);
            mcpPendingImageIdsRef.current.delete(operationId);
            if (pendingIds) {
              const pendingIdSet = new Set(pendingIds);
              setImages((current) => current.filter((image) => !pendingIdSet.has(image.id)));
            }
          }
          // A delayed autosave contains the pre-MCP in-memory canvas. Letting it run
          // after appendNodes would overwrite the external result with that stale snapshot.
          if (activeBoardRef.current?.id === boardId && boardSaveTimerRef.current) {
            clearTimeout(boardSaveTimerRef.current);
            boardSaveTimerRef.current = null;
          }
          const saveInFlight = boardSaveInFlightRef.current;
          if (saveInFlight) await saveInFlight;
          const movedNodeId = typeof detail.movedNodeId === "string" ? detail.movedNodeId : undefined;
          const movedX = typeof detail.x === "number" && Number.isFinite(detail.x) ? detail.x : undefined;
          const movedY = typeof detail.y === "number" && Number.isFinite(detail.y) ? detail.y : undefined;
          if (
            saveInFlight
            && activeBoardRef.current?.id === boardId
            && movedNodeId
            && movedX !== undefined
            && movedY !== undefined
          ) {
            await getWorkbenchApi()?.moveBoardImage(boardId, movedNodeId, movedX, movedY);
          }
          boardDetailCacheRef.current.delete(boardId);
          await refreshBoards();
          if (activeBoardRef.current?.id === boardId) {
            await openBoard(boardId, undefined, { forceReload: true });
          }
        })();
        return;
      }

      if (detail.type === "generation-finished" && operationId) {
        const error = typeof detail.error === "string" ? detail.error : undefined;
        const editTargetId = mcpPendingEditTargetIdsRef.current.get(operationId);
        mcpPendingEditTargetIdsRef.current.delete(operationId);
        if (error) {
          const pendingIds = mcpPendingImageIdsRef.current.get(operationId);
          mcpPendingImageIdsRef.current.delete(operationId);
          if (pendingIds) {
            const pendingIdSet = new Set(pendingIds);
            setImages((current) => current.filter((image) => !pendingIdSet.has(image.id)));
          }
          if (editTargetId) {
            setImages((current) => current.map((image) => {
              if (image.id !== editTargetId) return image;
              const pendingEditCount = Math.max(0, getPendingEditCount(image) - 1);
              return {
                ...image,
                editing: pendingEditCount > 0,
                pendingEditCount: pendingEditCount || undefined,
                editingStartedAt: pendingEditCount > 0 ? image.editingStartedAt : undefined
              };
            }));
          }
        }
        setActiveGenerations((current) => Math.max(0, current - 1));
        setActiveBoardGenerations((current) => current.filter((task) => task.id !== operationId));
        setStatus(error ?? "MCP 图片生成完成。");
      }
    };

    window.addEventListener("iterlay:mcp", onMcpEvent);
    return () => window.removeEventListener("iterlay:mcp", onMcpEvent);
  }, [flushBoardSave, getWorkbenchApi, openBoard, refreshBoards, setStatus]);

  // 生成结果可能来自已切走的画板。统一按图片路径定位，编辑版本也能命中所属原图。
  const locateGenerationResult = useCallback(async (boardId: string, imagePaths: string[]): Promise<void> => {
    setSettingsOpen(false);
    setGalleryOpen(false);
    await openBoard(boardId);
    setLibraryOpen(false);

    const focusResult = (remainingAttempts: number): void => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const target = imagesRef.current.find((image) =>
          imagePaths.includes(image.path) || image.versions?.some((version) => imagePaths.includes(version.path))
        );
        if (target) {
          setFocusTarget((current) => ({ key: imageKey(target), nonce: (current?.nonce ?? 0) + 1 }));
        } else if (remainingAttempts > 0) {
          window.setTimeout(() => focusResult(remainingAttempts - 1), 120);
        }
      }));
    };
    focusResult(2);
  }, [openBoard]);

  useEffect(() => {
    if (!hasImageWorkbenchApi()) return;
    return getImageWorkbenchApi().onGenerationNotificationOpen((target) => {
      void locateGenerationResult(target.boardId, target.imagePaths);
    });
  }, [locateGenerationResult]);

  // 画布内容变化（新图、删除、生成完成）后计划一次自动保存。
  useEffect(() => {
    if (!activeBoard) return;
    scheduleBoardSave();
  }, [images, activeBoard, scheduleBoardSave]);

  useEffect(() => {
    let active = true;
    if (!startupTaskRef.current) startupTaskRef.current = (async () => {
      const api = getWorkbenchApi();
      if (!api) {
        return;
      }

      try {
        performance.mark("iterlay:workspace-start");
        // 恢复库页时立即加载其分包，并在撤下启动页前等待它就绪，避免先露出底层画板。
        const restoredLibraryPromise = restoreLibraryOpenRef.current ? loadLibraryShell() : null;
        await initializeOnboardingPersistence(api);
        firstDemoStartVisitRef.current = !hasSeenDemoStart();
        const settingsPromise = api.getSettings();
        const boardsPromise = api.listBoards();
        const boardStatePromise = api.getBoardsState();
        const commentsPromise = api.listComments().catch(() => [] as AssetComment[]);
        void refreshHistory();

        const settings = await settingsPromise;
        setProviders(settings.providers);
        setActiveProviderId(settings.activeProviderId);
        setTextProviders(settings.textProviders);
        setActiveTextProviderId(settings.activeTextProviderId);
        const initialVideoProviders = mergeOfficialVideoCatalog(settings.videoProviders, creditStatusRef.current);
        setVideoProviders(initialVideoProviders);
        void hydrateVideoProviderCatalogs(initialVideoProviders).then(setVideoProviders);
        setActiveVideoProviderId(settings.activeVideoProviderId);
        setProviderKeyStatus(settings.providerKeyStatus);
        setLanguage(settings.language);
        setTheme(settings.theme);
        setPromptDockAutoCollapse(settings.promptDockAutoCollapse ?? false);
        setAdvancedVideoModesEnabled(settings.advancedVideoModesEnabled ?? false);
        setCanvasThumbnailPreview(settings.canvasThumbnailPreview ?? true);
        setCanvasMinimapVisible(settings.canvasMinimapVisible ?? true);
        setCanvasImageToolbarOnHover(settings.canvasImageToolbarOnHover ?? false);
        setCanvasRelationshipHoverHighlight(settings.canvasRelationshipHoverHighlight ?? false);
        setWechatStickerExportEnabled(settings.wechatStickerExportEnabled ?? false);
        setOnlineImageSharingEnabled(settings.onlineImageSharingEnabled ?? true);
        setCopyImageFormat(settings.copyImageFormat ?? "png");
        setBoardSmartSuggestionsEnabled(settings.boardSmartSuggestionsEnabled ?? false);
        setBoardAssistantEnabled(settings.boardAssistantEnabled ?? true);
        setBoardAssistantAgentModeEnabled(
          settings.assistantAgentModeEnabled ?? settings.boardAssistantAgentModeEnabled ?? false
        );
        setPiAgentBuiltinTools(settings.piAgentBuiltinTools ?? ["read", "grep", "find", "ls"]);
        setPiAgentIterlayTools(settings.piAgentIterlayTools ?? []);
        setPiAgentSkillPaths(settings.piAgentSkillPaths ?? []);
        setPiAgentExtensionPaths(settings.piAgentExtensionPaths ?? []);
        setPiAgentCustomSkillPaths(settings.piAgentCustomSkillPaths ?? []);
        setPiAgentCustomExtensionPaths(settings.piAgentCustomExtensionPaths ?? []);
        setPiAgentMaxTurns(settings.piAgentMaxTurns ?? 12);
        setPiAgentWebSearchMaxResults(settings.piAgentWebSearchMaxResults ?? 5);
        setBoardAssistantAwarenessEnabled(settings.boardAssistantAwarenessEnabled ?? true);
        setBoardAssistantIntentSuggestionsEnabled(settings.boardAssistantIntentSuggestionsEnabled ?? true);
        setBoardAssistantIntentSuggestionCount(settings.boardAssistantIntentSuggestionCount ?? 3);
        setEditSmartSuggestionsPreference(settings.editSmartSuggestionsEnabled ?? true);
        setMemoryEnabled(settings.memoryEnabled ?? true);
        setMemoryUsageLevel(settings.memoryUsageLevel ?? "balanced");
        setEditInfoMode(settings.editInfoMode ?? "flip");
        setImageDoubleClickAction(settings.imageDoubleClickAction ?? "edit");
        setDownloadDirectory(settings.downloadDirectory ?? "");
        setVersionSeparationMode(settings.versionSeparationMode ?? "copy");
        setGenerateButtonStyle(settings.generateButtonStyle ?? "folded");
        setSetupComplete(settings.setupComplete);
        const active = settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0];
        if (active) setInput((current) => ({ ...current, model: active.model }));
        void commentsPromise.then(setComments);

        // 启动进入上次打开的画板；没有记录时进第一个（主进程迁移保证至少存在一个）。
        let [summaries, state] = await Promise.all([boardsPromise, boardStatePromise]);
        if (summaries.length === 0) {
          await api.createBoard("画板 1");
          summaries = await api.listBoards();
        }
        const firstDemoStartVisit = firstDemoStartVisitRef.current;
        let selection = selectStartupBoard(summaries, state.lastOpenedBoardId, firstDemoStartVisit);
        if (selection.needsStarterBoard) {
          await api.createBoard("画板 1");
          summaries = await api.listBoards();
          selection = selectStartupBoard(summaries, state.lastOpenedBoardId, firstDemoStartVisit);
        }
        setBoards(summaries);
        if (selection.target) {
          await openBoard(selection.target.id, undefined, {
            deferImagePreload: true,
            keepLibraryOpen: restoreLibraryOpenRef.current
          });
        }
        if (firstDemoStartVisit) markDemoStartSeen();
        if (restoredLibraryPromise) await restoredLibraryPromise;
      } catch (error) {
        reportWorkbenchError(error);
      }
    })();
    void startupTaskRef.current.finally(() => {
      if (active) {
        performance.mark("iterlay:workspace-interactive");
        setStartupLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [getWorkbenchApi, hydrateVideoProviderCatalogs, openBoard, refreshHistory, reportWorkbenchError, setLanguage]);

  useEffect(() => {
    if (startupLoading || officialRecoveryStartedRef.current) return;
    const api = getWorkbenchApi();
    if (!api) return;
    officialRecoveryStartedRef.current = true;
    let active = true;
    let retryTimer: number | undefined;
    const recover = async (): Promise<void> => {
      try {
        const result = await api.recoverOfficialGenerations();
        if (!active) return;
        await refreshHistory();
        const activeBoardId = activeBoardRef.current?.id;
        if (activeBoardId && result.boardIds.includes(activeBoardId)) {
          if (boardSaveTimerRef.current) {
            clearTimeout(boardSaveTimerRef.current);
            boardSaveTimerRef.current = null;
          }
          if (boardSaveInFlightRef.current) await boardSaveInFlightRef.current;
          boardDetailCacheRef.current.delete(activeBoardId);
          await openBoard(activeBoardId, undefined, { forceReload: true });
        }
        if (active && result.pending > 0) {
          retryTimer = window.setTimeout(() => void recover(), 3_000);
        }
      } catch {
        // 离线时保留历史 running 状态，下次启动继续恢复。
      }
    };
    void recover();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [getWorkbenchApi, openBoard, refreshHistory, startupLoading]);

  useEffect(() => {
    if (startupLoading) return;
    const api = getWorkbenchApi();
    if (!api) return;
    let active = true;

    const syncRecoveredJobs = (jobs: VideoGenerationJob[]): void => {
      const activeBoardId = activeBoardRef.current?.id;
      if (!activeBoardId) return;
      const byId = new Map(jobs.filter((job) => job.input.boardId === activeBoardId).map((job) => [job.id, job]));
      if (byId.size === 0) return;
      const reconciled = reconcileRecoveredVideoCanvas(
        workflowNodesRef.current,
        canvasStateRef.current.connections,
        [...byId.values()],
        activeBoardId
      );
      if (!reconciled.changed) return;
      const recoveredWorkflowNodes = reconciled.nodes.filter(
        (candidate): candidate is CanvasPersistedNode => !isBoardImageNode(candidate)
      );
      workflowNodesRef.current = recoveredWorkflowNodes;
      canvasStateRef.current = { ...canvasStateRef.current, connections: reconciled.connections };
      setWorkflowNodes(recoveredWorkflowNodes);
      setCanvasConnectionsVersion((value) => value + 1);
      scheduleBoardSave();
    };

    const recover = async (): Promise<void> => {
      try {
        await flushBoardSave();
        let pending = await api.recoverVideoGenerations();
        if (!active || pending.length === 0) return;
        await refreshHistory();
        const activeBoardId = activeBoardRef.current?.id;
        if (activeBoardId && pending.some((job) => job.input.boardId === activeBoardId)) {
          boardDetailCacheRef.current.delete(activeBoardId);
          await openBoard(activeBoardId, undefined, { forceReload: true });
        }
        syncRecoveredJobs(pending);
        pending = pending.filter((job) => !isTerminalVideoJob(job));

        while (active && pending.length > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
          if (!active) return;
          const snapshots = (await Promise.all(pending.map((job) => api.getVideoJob(job.id))))
            .filter((job): job is VideoGenerationJob => job !== null);
          syncRecoveredJobs(snapshots);
          snapshots.forEach(notifyVideoJob);
          setVideoHistory((current) => {
            const updates = new Map(snapshots.map((job) => [job.id, job]));
            return current.map((job) => updates.get(job.id) ?? job);
          });
          const completedBoards = new Set(snapshots
            .filter(isTerminalVideoJob)
            .map((job) => job.input.boardId)
            .filter((boardId): boardId is string => Boolean(boardId)));
          const currentBoardId = activeBoardRef.current?.id;
          if (currentBoardId && completedBoards.has(currentBoardId)) {
            boardDetailCacheRef.current.delete(currentBoardId);
            await openBoard(currentBoardId, undefined, { forceReload: true });
          }
          pending = snapshots.filter((job) => !isTerminalVideoJob(job));
        }
        if (active) await refreshHistory();
      } catch (error) {
        console.warn("恢复视频生成任务失败", error);
      }
    };

    void recover();
    return () => {
      active = false;
    };
  }, [flushBoardSave, getWorkbenchApi, notifyVideoJob, openBoard, refreshHistory, scheduleBoardSave, startupLoading]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  // 设置是快捷键入口；工作区可交互后立即利用空闲时间解析分包，避免首次按键才开始加载。
  useEffect(() => {
    if (startupLoading) return;
    let active = true;
    const preload = (): void => {
      void loadProviderSettings()
        .then(() => {
          if (active) setSettingsDialogMounted(true);
        })
        .catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(preload, { timeout: 600 });
      return () => {
        active = false;
        window.cancelIdleCallback(idleId);
      };
    }
    const timerId = window.setTimeout(preload, 200);
    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [startupLoading]);

  // 画廊依赖 WebGL 与多种浏览组件，空闲时提前解析分包，避免首次转场只揭示出黑色 fallback。
  useEffect(() => {
    let cancelled = false;
    const preload = (): void => {
      void loadBoardGallery().then(() => {
        if (!cancelled) setGallerySceneMounted(true);
      }).catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(preload, { timeout: 1_500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }
    const timerId = window.setTimeout(preload, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, []);

  // 记忆"是否停留在库页"，供下次启动恢复。
  useEffect(() => {
    try {
      localStorage.setItem("iterlay.libraryOpen", libraryOpen ? "1" : "0");
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, [libraryOpen]);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = effectiveTheme === "dark";
    if (root.classList.contains("dark") === isDark) return;
    root.classList.toggle("dark", isDark);
  }, [effectiveTheme]);

  const canGenerate = useMemo(() => {
    // Note: intentionally does NOT block on in-flight generations — multiple can run at once.
    if (bridgeError) return false;
    if (!isOfficialProvider && (!setupComplete || !activeHasKey)) return false;
    if (isOfficialProvider && (!creditStatus?.providerAvailable || creditLoading)) return false;
    // 编辑模式只在编辑会话中出现，目标图由会话隐式提供。
    if (input.workflowMode === "edit" && (!editTargetId || providerBlocksEditing)) return false;
    if (providerBlocksGenerateReferences && input.workflowMode === "generate" && input.referenceImages.length > 0) {
      return false;
    }
    return true;
  }, [
    bridgeError,
    editTargetId,
    activeHasKey,
    creditLoading,
    creditStatus?.providerAvailable,
    input.referenceImages.length,
    input.workflowMode,
    providerBlocksEditing,
    providerBlocksGenerateReferences,
    isOfficialProvider,
    setupComplete
  ]);

  // 输入框切换当前 provider：更新激活项、同步默认 model，并落盘 activeProviderId。
  function persistSettingsPatch(patch: AppSettingsPatch): void {
    const api = getWorkbenchApi();
    if (!api) return;
    void api
      .updateSettings(patch)
      .then(() => setSetupComplete(true))
      .catch(reportWorkbenchError);
  }

  function selectActiveProvider(id: string, model?: string): void {
    const target = providers.find((p) => p.id === id);
    if (!target) return;
    const nextTarget = model ? selectProviderModel(target, model) : target;
    const nextProviders = providers.map((provider) => provider.id === id ? nextTarget : provider);
    setProviders(nextProviders);
    setActiveProviderId(id);
    setInput((current) => ({
      ...current,
      model: nextTarget.model,
      size: nextTarget.type === "official" && !["auto", "1024x1024", "1536x1024", "1024x1536"].includes(current.size)
        ? "auto"
        : current.size
    }));
    persistSettingsPatch({ providers: nextProviders, activeProviderId: id });
  }

  function changeTheme(next: UiTheme, _origin?: { x: number; y: number }): void {
    void _origin;
    setTheme(next);
    persistSettingsPatch({ theme: next });
  }

  function changeLanguage(next: AppSettings["language"]): void {
    setLanguage(next);
    persistSettingsPatch({ language: next });
  }

  // 设置页保存多个 provider（含各自的 API Key）后回调：落盘并用主进程回读的结果刷新本地状态。
  async function persistProviders(next: {
    providers: ProviderConfig[];
    activeProviderId: string;
    textProviders: TextProviderConfig[];
    activeTextProviderId: string;
    videoProviders: VideoProviderConfig[];
    activeVideoProviderId: string;
    apiKeyByProviderId?: Record<string, string>;
  }): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      await api.saveSettings({
        providers: next.providers,
        activeProviderId: next.activeProviderId,
        textProviders: next.textProviders,
        activeTextProviderId: next.activeTextProviderId,
        videoProviders: next.videoProviders,
        activeVideoProviderId: next.activeVideoProviderId,
        language,
        theme,
        promptDockAutoCollapse,
        advancedVideoModesEnabled,
        canvasThumbnailPreview,
        canvasMinimapVisible,
        canvasImageToolbarOnHover,
        canvasRelationshipHoverHighlight,
        wechatStickerExportEnabled,
        onlineImageSharingEnabled,
        copyImageFormat,
        boardSmartSuggestionsEnabled,
        editSmartSuggestionsEnabled: editSmartSuggestionsPreference,
        memoryEnabled,
        memoryUsageLevel,
        editInfoMode,
        imageDoubleClickAction,
        downloadDirectory,
        versionSeparationMode,
        generateButtonStyle,
        apiKeyByProviderId: next.apiKeyByProviderId
      });
      const fresh = await api.getSettings();
      setProviders(fresh.providers);
      setActiveProviderId(fresh.activeProviderId);
      setTextProviders(fresh.textProviders);
      setActiveTextProviderId(fresh.activeTextProviderId);
      const freshVideoProviders = mergeOfficialVideoCatalog(fresh.videoProviders, creditStatusRef.current);
      setVideoProviders(await hydrateVideoProviderCatalogs(freshVideoProviders));
      setActiveVideoProviderId(fresh.activeVideoProviderId);
      setProviderKeyStatus(fresh.providerKeyStatus);
      setSetupComplete(true);
      const active = fresh.providers.find((p) => p.id === fresh.activeProviderId) ?? fresh.providers[0];
      if (active) setInput((current) => ({ ...current, model: active.model }));
      setStatus("配置已保存。");
      toast.success("配置已保存");
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

  function changePromptDockAutoCollapse(next: boolean): void {
    setPromptDockAutoCollapse(next);
    persistSettingsPatch({ promptDockAutoCollapse: next });
  }

  function changeAdvancedVideoModesEnabled(next: boolean): void {
    setAdvancedVideoModesEnabled(next);
    persistSettingsPatch({ advancedVideoModesEnabled: next });
  }

  function changeCanvasThumbnailPreview(next: boolean): void {
    setCanvasThumbnailPreview(next);
    persistSettingsPatch({ canvasThumbnailPreview: next });
  }

  function changeCanvasMinimapVisible(next: boolean): void {
    setCanvasMinimapVisible(next);
    persistSettingsPatch({ canvasMinimapVisible: next });
  }

  function changeCanvasImageToolbarOnHover(next: boolean): void {
    setCanvasImageToolbarOnHover(next);
    persistSettingsPatch({ canvasImageToolbarOnHover: next });
  }

  function changeCanvasRelationshipHoverHighlight(next: boolean): void {
    setCanvasRelationshipHoverHighlight(next);
    persistSettingsPatch({ canvasRelationshipHoverHighlight: next });
  }

  function changeBoardSmartSuggestionsEnabled(next: boolean): void {
    setBoardSmartSuggestionsEnabled(next);
    persistSettingsPatch({ boardSmartSuggestionsEnabled: next });
  }

  function changeWechatStickerExportEnabled(next: boolean): void {
    setWechatStickerExportEnabled(next);
    if (!next) setWechatExportRequest(null);
    persistSettingsPatch({ wechatStickerExportEnabled: next });
  }

  function changeOnlineImageSharingEnabled(next: boolean): void {
    setOnlineImageSharingEnabled(next);
    if (!next) setQuickImageShareImages(null);
    persistSettingsPatch({ onlineImageSharingEnabled: next });
  }

  function changeCopyImageFormat(next: CopyImageFormat): void {
    setCopyImageFormat(next);
    persistSettingsPatch({ copyImageFormat: next });
  }

  function changeBoardAssistantIntentSuggestionsEnabled(next: boolean): void {
    setBoardAssistantIntentSuggestionsEnabled(next);
    persistSettingsPatch({ boardAssistantIntentSuggestionsEnabled: next });
  }

  function changeBoardAssistantAwarenessEnabled(next: boolean): void {
    setBoardAssistantAwarenessEnabled(next);
    persistSettingsPatch({ boardAssistantAwarenessEnabled: next });
  }

  function changeBoardAssistantEnabled(next: boolean): void {
    setBoardAssistantEnabled(next);
    persistSettingsPatch({ boardAssistantEnabled: next });
  }

  function changeBoardAssistantAgentModeEnabled(next: boolean): void {
    const enabled = next && Boolean(creditStatus?.textFunctionCallingAvailable);
    setBoardAssistantAgentModeEnabled(enabled);
    persistSettingsPatch({
      assistantAgentModeEnabled: enabled,
      boardAssistantAgentModeEnabled: enabled
    });
  }

  function changePiAgentBuiltinTools(next: NonNullable<AppSettings["piAgentBuiltinTools"]>): void {
    setPiAgentBuiltinTools(next);
    persistSettingsPatch({ piAgentBuiltinTools: next });
  }

  function changePiAgentIterlayTools(next: string[]): void {
    setPiAgentIterlayTools(next);
    persistSettingsPatch({ piAgentIterlayTools: next });
  }

  function changePiAgentSkillPaths(next: string[]): void {
    setPiAgentSkillPaths(next);
    persistSettingsPatch({ piAgentSkillPaths: next });
  }

  function changePiAgentExtensionPaths(next: string[]): void {
    setPiAgentExtensionPaths(next);
    persistSettingsPatch({ piAgentExtensionPaths: next });
  }

  function changePiAgentCustomSkillPaths(next: string[]): void {
    setPiAgentCustomSkillPaths(next);
    persistSettingsPatch({ piAgentCustomSkillPaths: next });
  }

  function changePiAgentCustomExtensionPaths(next: string[]): void {
    setPiAgentCustomExtensionPaths(next);
    persistSettingsPatch({ piAgentCustomExtensionPaths: next });
  }

  function changePiAgentMaxTurns(next: number): void {
    setPiAgentMaxTurns(next);
    persistSettingsPatch({ piAgentMaxTurns: next });
  }

  function changePiAgentWebSearchMaxResults(next: number): void {
    setPiAgentWebSearchMaxResults(next);
    persistSettingsPatch({ piAgentWebSearchMaxResults: next });
  }

  function changeBoardAssistantIntentSuggestionCount(next: AssistantIntentSuggestionCount): void {
    setBoardAssistantIntentSuggestionCount(next);
    persistSettingsPatch({ boardAssistantIntentSuggestionCount: next });
  }

  function changeEditSmartSuggestionsEnabled(next: boolean): void {
    setEditSmartSuggestionsPreference(next);
    persistSettingsPatch({ editSmartSuggestionsEnabled: next });
  }

  function persistMemoryPreferences(enabled: boolean, usageLevel: MemoryUsageLevel): void {
    setMemoryEnabled(enabled);
    setMemoryUsageLevel(usageLevel);
    persistSettingsPatch({
      memoryEnabled: enabled,
      memoryUsageLevel: usageLevel
    });
  }

  function changeMemoryEnabled(next: boolean): void {
    persistMemoryPreferences(next, memoryUsageLevel);
  }

  function changeMemoryUsageLevel(next: MemoryUsageLevel): void {
    persistMemoryPreferences(memoryEnabled, next);
  }

  function changeEditInfoMode(next: EditInfoMode): void {
    setEditInfoMode(next);
    persistSettingsPatch({ editInfoMode: next });
  }

  function changeImageDoubleClickAction(next: ImageDoubleClickAction): void {
    setImageDoubleClickAction(next);
    persistSettingsPatch({ imageDoubleClickAction: next });
  }

  function changeVersionSeparationMode(next: VersionSeparationMode): void {
    setVersionSeparationMode(next);
    persistSettingsPatch({ versionSeparationMode: next });
  }

  function changeGenerateButtonStyle(next: GenerateButtonStyle): void {
    setGenerateButtonStyle(next);
    persistSettingsPatch({ generateButtonStyle: next });
  }

  // ---------- 画板：库页操作 ----------

  async function createBoardAndOpen(): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      const board = await api.createBoard();
      await refreshBoards();
      await openBoard(board.id, undefined, { resetPromptDraft: true });
      toast.success(`已创建「${board.name}」`);
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

  async function createFromChat(plan: CreateChatGenerationPlan): Promise<CreateChatResult> {
    const api = getWorkbenchApi();
    let createdBoardId: string | null = null;
    let createdComicChildBoardId: string | null = null;
    let comicParentBoardId: string | null = null;
    if (!api) throw new Error(missingImageWorkbenchMessage);

    try {
      const prompt = plan.prompt.trim();
      if (!prompt) throw new Error("Pi Agent 没有提供可执行的生成方案。");
      const targetBoardId = plan.targetBoardId;
      let target: Pick<BoardSummary, "id" | "name"> | undefined =
        targetBoardId ? boards.find((board) => board.id === targetBoardId) : undefined;
      if (!target) {
        const created = await api.createBoard(plan.suggestedName?.trim() || undefined);
        createdBoardId = created.id;
        target = { id: created.id, name: created.name };
        await refreshBoards();
      }

      if (plan.comicDrama) {
        if (activeBoardRef.current?.id === target.id) await flushBoardSave();
        const project = await api.createComicDramaProject({
          parentBoardId: target.id,
          name: plan.suggestedName?.trim() || "未命名漫剧",
          position: { x: 80, y: 80 }
        });
        createdComicChildBoardId = project.childBoard.id;
        comicParentBoardId = target.id;
        const snapshot = await api.getComicDramaBoardSnapshot(project.childBoard.id);
        const mutation = createComicDramaMutationPlan({ snapshot, selectedNodeIds: [], instruction: prompt });
        await api.applyComicDramaMutationPlan(mutation);
        boardDetailCacheRef.current.delete(target.id);
        await refreshBoards();
        await openBoard(project.childBoard.id, undefined, { keepLibraryOpen: true, resetPromptDraft: !targetBoardId, forceReload: true, suppressLoadingScreen: true });
        return { boardId: project.childBoard.id, boardName: project.childBoard.name, comicDrama: true, images: [] };
      }

      await openBoard(target.id, undefined, {
        keepLibraryOpen: true,
        resetPromptDraft: !targetBoardId,
        suppressLoadingScreen: true
      });
      const generated = await generate(undefined, {
        boardId: target.id,
        prompt,
        workflowMode: "generate",
        referenceImages: [],
        sceneId: undefined,
        promptSpec: undefined,
        n: 1,
        assistantConversationId: plan.conversationId
      });
      if (generated.length === 0) {
        throw new Error("图片生成没有返回结果，请检查模型配置或余额后重试。");
      }
      await refreshBoards();

      return {
        boardId: target.id,
        boardName: target.name,
        images: generated
          .filter((image) => Boolean(image.dataUrl))
          .map((image) => ({ id: image.id, dataUrl: image.dataUrl }))
      };
    } catch (error) {
      if (createdComicChildBoardId) {
        if (comicParentBoardId) {
          const parent = await api.getBoard(comicParentBoardId).catch(() => null);
          if (parent) {
            await api.saveBoard({
              id: parent.id,
              nodes: parent.nodes.filter((node) => node.type !== "comic-drama-entry" || node.childBoardId !== createdComicChildBoardId)
            }).catch(() => undefined);
          }
        }
        await api.deleteBoard(createdComicChildBoardId).catch(() => undefined);
      }
      if (plan.comicDrama && createdBoardId) {
        await api.deleteBoard(createdBoardId).catch(() => undefined);
        await refreshBoards().catch(() => undefined);
      }
      reportWorkbenchError(error);
      throw error;
    }
  }

  async function prepareCharacterGeneration(
    character: ComicCharacterNode,
    boardId: string,
    settingVersionId?: string
  ): Promise<PreparedCharacterGeneration> {
    const version = character.versions.find((item) => item.versionId === character.activeVersionId) ?? character.versions[0];
    const prompt = [
      character.name,
      version.fields.role,
      version.fields.profile,
      version.fields.visualPrompt,
      ...version.fields.appearanceAnchors
    ].filter(Boolean).join("，");
    const provider = activeProvider;
    const inputFingerprint = await generationFingerprint({
      boardId,
      characterId: character.id,
      characterVersionId: character.activeVersionId,
      prompt,
      settingVersionId
    });
    const metadata: Partial<GenerateImageInput> = provider.type === "official"
      ? await paidGenerationMetadata(inputFingerprint, "character", {
          kind: "image",
          providerId: provider.id,
          boardId,
          requestScope: character.id,
          operation: "image:generate",
          imageCount: 1
        })
      : {};
    return {
      character,
      prompt,
      providerId: provider.id,
      providerLabel: provider.name,
      model: provider.model,
      metadata
    };
  }

  async function confirmCharacterGeneration(
    prepared: PreparedCharacterGeneration[],
    title: string
  ): Promise<boolean> {
    const quoted = prepared.filter((item) => item.metadata.priceSnapshot);
    const amount = quoted.reduce((sum, item) => sum + (item.metadata.priceSnapshot?.amount ?? 0), 0);
    const currency = quoted[0]?.metadata.priceSnapshot?.currency;
    const allQuoted = quoted.length === prepared.length;
    const totalCostLabel = allQuoted
      ? `${amount} ${currency === "gold-bean" ? "金豆" : currency === "credit" ? "Credit" : currency ?? ""}`.trim()
      : quoted.length > 0
        ? `${amount} ${currency ?? ""} + 外部 Provider 计费`.trim()
        : "由外部 Provider 计费";
    return requestGenerationConfirmation({
      title,
      providerLabel: prepared.map((item) => item.providerLabel).filter((value, index, values) => values.indexOf(value) === index).join("、"),
      model: prepared.map((item) => item.model).filter((value, index, values) => values.indexOf(value) === index).join("、"),
      totalCostLabel,
      items: prepared.map((item) => ({
        id: item.character.id,
        label: item.character.name,
        task: "生成 1 张角色图片",
        costLabel: item.metadata.priceSnapshot
          ? `${item.metadata.priceSnapshot.amount} ${item.metadata.priceSnapshot.currency === "credit" ? "Credit" : item.metadata.priceSnapshot.currency}`
          : "Provider 计费",
        quoteId: item.metadata.quoteId,
        quoteExpiresAt: item.metadata.quoteExpiresAt
      })),
      confirmLabel: prepared.length === 1 ? "确认并生成角色" : `确认并生成 ${prepared.length} 个角色`
    });
  }

  async function submitCharacterGeneration(prepared: PreparedCharacterGeneration, boardId: string): Promise<void> {
    const { character, metadata } = prepared;
    if (activeBoardRef.current?.id !== boardId) throw new Error("画板已切换，请回到原画板重新生成角色。");
    updateWorkflowNode(character.id, { status: "generating", generationError: undefined });
    try {
      const outputs = await generate(undefined, {
        workflowMode: "generate",
        creationMode: "general",
        useCase: "illustration-story",
        prompt: prepared.prompt,
        model: prepared.model,
        size: "1024x1792",
        n: 1,
        referenceImages: [],
        boardId,
        providerId: prepared.providerId,
        ...metadata
      }, { preservePrompt: true, placementAnchorId: character.id, preserveModelOverride: true });
      if (!outputs.length) throw new Error("角色图片生成未返回结果。");
      if (activeBoardRef.current?.id === boardId) {
        updateWorkflowNode(character.id, { status: "review", generationError: undefined });
      }
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "角色图片生成失败。");
      if (activeBoardRef.current?.id === boardId) {
        updateWorkflowNode(character.id, { status: "failed", generationError: message });
      }
      throw new Error(message, { cause: error });
    }
  }

  async function settleCharacterGenerationBatch(
    prepared: PreparedCharacterGeneration[],
    boardId: string
  ): Promise<void> {
    const results = await Promise.allSettled(prepared.map((item) => submitCharacterGeneration(item, boardId)));
    const completed = results.filter((item) => item.status === "fulfilled").length;
    const failures = results.flatMap((result, index) => result.status === "rejected"
      ? [{
          name: prepared[index].character.name,
          reason: getWorkbenchErrorMessage(result.reason, "角色图片生成失败。")
        }]
      : []);
    if (failures.length > 0) {
      toast.error(`${completed}/${results.length} 个角色生成完成`, {
        description: failures.map((failure) => `${failure.name}：${failure.reason}`).join("\n")
      });
      return;
    }
    toast.success(`${completed}/${results.length} 个角色生成完成，等待逐项采用`);
  }

  async function retryComicCharacterGeneration(character: ComicCharacterNode): Promise<void> {
    const boardId = activeBoardRef.current?.id;
    if (!boardId) {
      toast.error("当前漫剧画板尚未就绪，请返回后重新进入。");
      return;
    }
    if (paidSubmissionInFlightRef.current.has(character.id)) {
      toast("该角色的生成请求正在处理中。");
      return;
    }
    paidSubmissionInFlightRef.current.add(character.id);
    try {
      const settingVersionId = canvasStateRef.current.connections.find((connection) => connection.target === character.id)?.versionBinding?.mode === "pinned"
        ? (canvasStateRef.current.connections.find((connection) => connection.target === character.id)?.versionBinding as { mode: "pinned"; versionId: string }).versionId
        : undefined;
      const prepared = await prepareCharacterGeneration(character, boardId, settingVersionId);
      const confirmationTitle = character.status === "failed" ? `重试角色 · ${character.name}` : `生成角色形象 · ${character.name}`;
      if (!await confirmCharacterGeneration([prepared], confirmationTitle)) return;
      await settleCharacterGenerationBatch([prepared], boardId);
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "角色图片生成准备失败。");
      updateWorkflowNode(character.id, { status: "failed", generationError: message });
      toast.error(message);
    } finally {
      paidSubmissionInFlightRef.current.delete(character.id);
    }
  }

  async function applyComicDramaPlan(plan: BoardMutationPlan): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) throw new Error(missingImageWorkbenchMessage);

    pushCanvasUndoSnapshot();
    try {
      const result = await api.applyComicDramaMutationPlan(plan);
      if (activeBoardRef.current?.id === result.boardId) {
        const updatedNodeById = new Map((plan.updates?.nodes ?? []).map((node) => [node.id, node]));
        const additions = plan.additions.nodes.filter((node): node is CanvasPersistedNode => (
          isBoardTextNode(node)
          || isBoardGenerationNode(node)
          || isBoardVideoNode(node)
          || isBoardVideoGenerationNode(node)
          || isComicDramaNode(node)
          || node.type === "video-sequence-entry"
        ));
        const nextWorkflowNodes = [
          ...workflowNodesRef.current.map((node) => updatedNodeById.get(node.id) ?? node),
          ...additions
        ];
        workflowNodesRef.current = nextWorkflowNodes;
        setWorkflowNodes(nextWorkflowNodes);
        canvasStateRef.current.connections = [
          ...canvasStateRef.current.connections,
          ...plan.additions.connections
        ];
        if (plan.additions.connections.length > 0) {
          setCanvasConnectionsVersion((value) => value + 1);
        }
        setComicDramaSnapshot((current) => current ? {
          ...current,
          revision: result.revision,
          nodes: [
            ...current.nodes.map((node) => updatedNodeById.get(node.id) ?? node),
            ...additions.filter((node): node is ComicDramaBoardSnapshot["nodes"][number] => (
              isComicDramaNode(node) || node.type === "video-sequence-entry"
            ))
          ],
          connections: [...current.connections, ...plan.additions.connections],
          groups: [...current.groups, ...plan.additions.groups]
        } : current);
        boardDetailCacheRef.current.delete(result.boardId);
        setSelectionTarget({
          ids: result.addedNodeIds.length ? result.addedNodeIds : result.updatedNodeIds ?? [],
          nonce: Date.now()
        });
      }
    } catch (error) {
      canvasUndoStackRef.current.pop();
      syncCanvasHistoryStatus();
      throw error;
    }
  }

  async function refreshComicDramaAfterAgent(): Promise<void> {
    const boardId = activeBoardRef.current?.id;
    if (!boardId) return;
    if (boardSaveTimerRef.current) {
      clearTimeout(boardSaveTimerRef.current);
      boardSaveTimerRef.current = null;
    }
    boardSaveQueuedRef.current = false;
    boardDetailCacheRef.current.delete(boardId);
    await openBoard(boardId, undefined, {
      forceReload: true,
      suppressLoadingScreen: true,
      skipFlushCurrent: true
    });
  }

  async function handleComicDramaAgentMutation(result: BoardMutationResult): Promise<void> {
    if (activeBoardRef.current?.id !== result.boardId) return;
    pushCanvasUndoSnapshot();
    await refreshComicDramaAfterAgent();
    setSelectionTarget({
      ids: result.addedNodeIds.length ? result.addedNodeIds : result.updatedNodeIds ?? [],
      nonce: Date.now()
    });
  }

  async function renameBoardById(id: string, name: string): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      const parentBoardId = boards.find((board) => board.id === id)?.parentBoardId;
      await api.renameBoard(id, name);
      boardDetailCacheRef.current.delete(id);
      if (parentBoardId) boardDetailCacheRef.current.delete(parentBoardId);
      if (activeBoardRef.current?.id === id) {
        setActiveBoard((current) => (current ? { ...current, name } : current));
      }
      await refreshBoards();
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

  async function duplicateBoardById(id: string): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      const copy = await api.duplicateBoard(id);
      await refreshBoards();
      if (copy) toast.success(`已创建「${copy.name}」`);
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

  async function deleteBoardById(id: string): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) throw new Error("工作台服务暂不可用。");
    const deletingCurrentBoard = activeBoardRef.current?.id === id
      || activeBoardRef.current?.parentBoardId === id;
    let deletionCommitted = false;
    try {
      // 删的是当前画板时，先取消待写入的自动保存，避免删除后又把文件写回来。
      if (deletingCurrentBoard) {
        deletedBoardIdsRef.current.add(id);
        if (boardSaveTimerRef.current) {
          clearTimeout(boardSaveTimerRef.current);
          boardSaveTimerRef.current = null;
        }
        boardSaveQueuedRef.current = false;
        activeBoardRef.current = null;
        setActiveBoard(null);
        setImages([]);
        setVideoUrls({});
        workflowNodesRef.current = [];
        setWorkflowNodes([]);
        // 已发送的保存会先完成，再执行删除；尚在缩略图编码阶段的保存会被 tombstone 截断。
        if (boardSaveInFlightRef.current) await boardSaveInFlightRef.current;
      }
      const deleted = await api.deleteBoard(id);
      if (!deleted.ok) throw new Error("画板不存在或已经移入回收站。");
      deletionCommitted = true;
      boardDetailCacheRef.current.delete(id);
      let list = await refreshBoards();
      // 删除只能从库页发起：兜底加载画板时保持库页打开，
      // 不把用户踢回画布视图。
      if (list.length === 0) {
        // 最后一个画板被删除：自动兜底一个空画板。
        const created = await api.createBoard("画板 1");
        list = await refreshBoards();
        await openBoard(created.id, undefined, { keepLibraryOpen: true, resetPromptDraft: true });
      } else if (!activeBoardRef.current) {
        await openBoard(list[0].id, undefined, { keepLibraryOpen: true });
      }
      await refreshHistory();
      toast.success("画板已移入回收站");
    } catch (error) {
      if (deletingCurrentBoard && !deletionCommitted) {
        deletedBoardIdsRef.current.delete(id);
        await openBoard(id, undefined, { keepLibraryOpen: true }).catch(() => undefined);
      }
      reportWorkbenchError(error);
      if (!deletionCommitted) throw error;
    }
  }

  async function refreshRestoredBoard(id: string): Promise<BoardSummary[]> {
    deletedBoardIdsRef.current.delete(id);
    return refreshBoards();
  }

  // ---------- 画板：导出 / 导入 ----------

  async function exportBoardById(id: string): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      // 导出当前画板前先冲刷待写入的自动保存，确保导出的是最新状态。
      if (activeBoardRef.current?.id === id) await flushBoardSave();
      const result = await api.exportBoard(id);
      if (result.ok && result.path) {
        iterlayToast.exported({ title: "画板已导出", path: result.path });
      }
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

  function announceImportedBoard(summary: BoardSummary): void {
    iterlayToast.boardImported({
      name: summary.name,
      imageCount: summary.imageCount,
      preview: summary.thumbnailDataUrl,
      onNavigate: () => void openBoard(summary.id)
    });
  }

  async function importBoardFromDialog(): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      const summary = await api.importBoard();
      if (!summary) return;
      await refreshBoards();
      await refreshHistory();
      announceImportedBoard(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败。";
      toast.error(message);
    }
  }

  async function importBoardFiles(files: File[]): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    const imported: BoardSummary[] = [];
    for (const file of files) {
      try {
        const summary = await api.importBoardData(await file.arrayBuffer());
        imported.push(summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : "导入失败。";
        toast.error(`导入 ${file.name} 失败：${message}`);
      }
    }
    await Promise.all([refreshBoards(), refreshHistory()]);
    imported.forEach(announceImportedBoard);
  }


  async function generate(
    sourceRect?: ParticleBurstTrigger["rect"],
    inputOverride?: Partial<GenerateImageInput>,
    options?: {
      skipOfficialCreditCheck?: boolean;
      preservePrompt?: boolean;
      createDerivedEditNode?: boolean;
      placementAnchorId?: string;
      preserveModelOverride?: boolean;
    }
  ): Promise<GeneratedImage[]> {
    let generationInput: GenerateImageInput = { ...inputRef.current, ...inputOverride };
    const blockedMessage = getBlockedGenerateMessage(generationInput);
    if (blockedMessage) {
      const message = blockedMessage;
      setStatus(message);
      toast.error(message);
      return [];
    }
    const api = getWorkbenchApi();
    if (!api) return [];
    const originBoard = activeBoardRef.current;
    if (!originBoard) {
      toast.error("请先打开一个画板。");
      return [];
    }
    if (inputOverride?.boardId && inputOverride.boardId !== originBoard.id) {
      toast.error("画板已切换，请回到原画板重新发起生成。");
      return [];
    }
    const originBoardSequence = boardOpenSequenceRef.current;
    const isOriginBoardCurrent = (): boolean =>
      activeBoardRef.current?.id === originBoard.id
      && boardOpenSequenceRef.current === originBoardSequence;
    const editTargetImage =
      generationInput.workflowMode === "edit" && editTargetId
        ? (imagesRef.current.find((image) => image.id === editTargetId) ?? null)
        : null;
    if (!providerSupportsTransparentBackground(activeProvider)) {
      generationInput = { ...generationInput, background: "auto", outputFormat: "png" };
    }
    if (isOfficialProvider && !generationInput.idempotencyKey) {
      const inputFingerprint = await generationFingerprint({
        boardId: originBoard.id,
        prompt: generationInput.prompt,
        model: options?.preserveModelOverride ? generationInput.model : activeProvider.model || generationInput.model,
        size: parseGptImageSize(generationInput.size),
        count: Math.max(1, generationInput.n),
        workflowMode: generationInput.workflowMode,
        background: generationInput.background ?? "auto",
        outputFormat: generationInput.outputFormat ?? "png",
        references: generationInput.referenceImages.map((reference) => ({ id: reference.id, role: reference.role, sourceNodeId: reference.sourceNodeId }))
      });
      generationInput = {
        ...generationInput,
        ...await paidGenerationMetadata(inputFingerprint, generationInput.comicDramaContextSnapshot?.role ?? "first-frame", {
          kind: "image", providerId: activeProviderId, boardId: originBoard.id,
          requestScope: generationInput.generationNodeId ?? generationInput.sceneId ?? inputFingerprint, operation: "image:generate",
          imageCount: Math.max(1, generationInput.n)
        })
      };
    }
    if (isOfficialProvider && !options?.skipOfficialCreditCheck) {
      const required = Math.max(1, generationInput.n) * IMAGE_CREDIT_COST;
      const balance = creditStatus?.credits.balance ?? 0;
      if (balance < required) {
        iterlayToast.balance({
          balance,
          required,
          onActivate: licenseStatus?.state === "LICENSED" ? undefined : openLicenseActivation
        });
        return [];
      }
    }

    const submittedPrompt = generationInput.prompt.trim();

    // 编辑会话把生成结果叠加为当前图片的新版本。
    const isEditSession = editTargetImage !== null && !options?.createDerivedEditNode;
    const requestedEditCount = Math.max(1, generationInput.n);
    let editReferencePayload: ReferenceImagePayload | null = null;
    if (editTargetImage) {
      try {
        const source = editTargetImage.dataUrl.startsWith("data:")
          ? editTargetImage.dataUrl
          : await api.readAssetDataUrl(editTargetImage.path);
        editReferencePayload = dataUrlToReferencePayload(source, "编辑目标", "edit-target");
      } catch {
        editReferencePayload = null;
      }
    }
    if (editTargetImage && !editReferencePayload) {
      toast.error("无法读取目标图片，请重试。");
      return [];
    }
    // Quotes and reference reads can yield while the user switches boards.
    // Never insert placeholders or clear the composer in a different board.
    if (!isOriginBoardCurrent()) {
      toast.error("画板已切换，本次生成尚未提交，请回到原画板重试。");
      return [];
    }

    const activeGenerationId = crypto.randomUUID();
    const queueTicket = generationQueueRef.current!.enqueue(activeGenerationId);

    // Put loading placeholder nodes on the canvas immediately; they keep their id
    // through pending → done so the finished image lands in the same spot.
    // Placeholders carry the requested output dimensions so the pending card
    // already shows the final aspect ratio instead of a generic square.
    const placeholderSize = parseSizeDimensions(generationInput.size);
    const outputConnectionSourceId = generationInput.generationNodeId ?? options?.placementAnchorId;
    const clientIds: string[] = isEditSession
      ? []
      : Array.from({ length: Math.max(1, generationInput.n) }, () => crypto.randomUUID());
    if (isEditSession) {
      const editingStartedAt = queueTicket.queued ? undefined : Date.now();
      setImages((current) =>
        current.map((image) =>
          image.id === editTargetImage.id
            ? {
                ...image,
                editing: true,
                pendingEditCount: getPendingEditCount(image) + requestedEditCount,
                queuedEditCount: (image.queuedEditCount ?? 0) + (queueTicket.queued ? requestedEditCount : 0),
                editingStartedAt: image.editingStartedAt ?? editingStartedAt
              }
            : image
        )
      );
    } else {
      const pendingStartedAt = queueTicket.queued ? undefined : Date.now();
      const referenceAnchorId = options?.placementAnchorId ?? (options?.createDerivedEditNode && editTargetImage
        ? editTargetImage.id
        : generationInput.referenceImages
        .map((reference) => reference.sourceNodeId)
        .find((nodeId): nodeId is string => Boolean(nodeId && imagesRef.current.some((image) => image.id === nodeId))));
      const placeholderDrafts: GeneratedImage[] = clientIds.map((id, index) => ({
        id,
        path: "",
        dataUrl: "",
        jobId: "",
        pending: true,
        generationStatus: queueTicket.queued ? "queued" : "running",
        pendingStartedAt,
        pendingPrompt: submittedPrompt,
        pendingReferenceImages: generationInput.referenceImages.map((reference) => ({
          name: reference.name,
          dataUrl: `data:${reference.mimeType};base64,${reference.dataBase64}`
        })),
        placementAnchorId: generationInput.generationNodeId
          ? generationInput.generationNodeId
          : index === 0 ? referenceAnchorId : clientIds[index - 1],
        selectOnCreate: Boolean(options?.createDerivedEditNode),
        source: "generated",
        width: placeholderSize?.width,
        height: placeholderSize?.height
      }));
      let nextImages = [...placeholderDrafts, ...imagesRef.current];
      if (generationInput.generationNodeId) {
        const anchor = canvasStateRef.current.positions[generationInput.generationNodeId];
        if (anchor) {
          nextImages = centerGenerationOutputs(
            nextImages,
            generationInput.generationNodeId,
            anchor,
            canvasStateRef.current.positions
          );
        }
      }
      imagesRef.current = nextImages;
      setImages(nextImages);
      if (outputConnectionSourceId && workflowNodesRef.current.some((node) => node.id === outputConnectionSourceId)) {
        const sourceNode = workflowNodesRef.current.find((node) => node.id === outputConnectionSourceId);
        const connections = canvasStateRef.current.connections;
        const additions = createMissingGenerationOutputConnections({
          sourceId: outputConnectionSourceId,
          targetIds: clientIds,
          existing: connections,
          label: sourceNode?.type === "comic-character" ? "角色形象" : "生成结果"
        });
        if (additions.length > 0) {
          canvasStateRef.current = {
            ...canvasStateRef.current,
            connections: [...connections, ...additions]
          };
          window.setTimeout(() => {
            setCanvasConnectionsVersion((value) => value + 1);
          }, 80);
        }
      }
      // Reuse the same targeted canvas focus used by history clicks. The placeholder keeps
      // this id after completion, so the camera does not jump again when the result arrives.
      const firstPlaceholderId = clientIds[0];
      if (firstPlaceholderId) {
        setFocusTarget((current) => ({ key: firstPlaceholderId, nonce: (current?.nonce ?? 0) + 1 }));
      }
    }
    // The composer text "left" as particles — clear it so the input is ready for the next prompt.
    if (!options?.preservePrompt) {
      setInput((current) => ({ ...current, prompt: "" }));
    }

    // Track the placeholder by id so the burst follows it while React Flow pans or zooms.
    if (!isEditSession && sourceRect && submittedPrompt) {
      const firstId = clientIds[0];
      if (firstId) triggerParticleBurst(submittedPrompt, sourceRect, firstId);
    }

    setActiveGenerations((count) => count + 1);
    setActiveBoardGenerations((current) => [
      ...current,
      {
        id: activeGenerationId,
        boardId: originBoard.id,
        mode: generationInput.workflowMode,
        prompt: submittedPrompt,
        requestedCount: Math.max(1, generationInput.n),
        startedAt: Date.now(),
        status: queueTicket.queued ? "queued" : "running"
      }
    ]);
    setStatus(queueTicket.queued
      ? "任务排队中..."
      : options?.createDerivedEditNode || generationInput.workflowMode !== "edit" ? "正在生成图片..." : "正在编辑图片...");
    let delayedNoticeId: string | number | undefined;
    let delayedNoticeTimer: number | null = null;
    try {
      await queueTicket.ready;
      if (queueTicket.queued) {
        const startedAt = Date.now();
        setActiveBoardGenerations((current) => current.map((task) =>
          task.id === activeGenerationId ? { ...task, status: "running", startedAt } : task
        ));
        if (isEditSession && activeBoardRef.current?.id === originBoard.id) {
          setImages((current) => current.map((image) => {
            if (image.id !== editTargetImage.id) return image;
            return {
              ...image,
              queuedEditCount: Math.max(0, (image.queuedEditCount ?? 0) - requestedEditCount) || undefined,
              editingStartedAt: image.editingStartedAt ?? startedAt
            };
          }));
        } else if (activeBoardRef.current?.id === originBoard.id) {
          const clientIdSet = new Set(clientIds);
          setImages((current) => current.map((image) => clientIdSet.has(image.id)
            ? { ...image, generationStatus: "running", pendingStartedAt: startedAt }
            : image));
        }
      }
      setStatus(options?.createDerivedEditNode || generationInput.workflowMode !== "edit" ? "正在生成图片..." : "正在编辑图片...");
      if (!isEditSession) {
        delayedNoticeTimer = window.setTimeout(() => {
          delayedNoticeId = iterlayToast.generationPending();
        }, GENERATION_ESTIMATE_MS);
      }
      // 负面提示（避免出现）在发送时并入提示词，真正到达 provider（对纯文本与结构化都生效）。
      const avoid = generationInput.promptSpec?.avoid?.trim();
      const finalPrompt =
        avoid && !/(^|\n)\s*avoid\s*[:：]/i.test(generationInput.prompt)
          ? `${generationInput.prompt}\n\nAvoid: ${avoid}`
          : generationInput.prompt;
      const payload: GenerateImageInput = {
        ...generationInput,
        prompt: finalPrompt,
        model: options?.preserveModelOverride
          ? generationInput.model
          : activeProvider.model || generationInput.model,
        size: parseGptImageSize(generationInput.size),
        background: generationInput.background,
        outputFormat: generationInput.outputFormat,
        boardId: originBoard.id,
        providerId: activeProviderId,
        // 编辑任务始终把当前目标图（当前激活版本）作为首个参考图传给 Provider。
        referenceImages: editReferencePayload
          ? [editReferencePayload, ...generationInput.referenceImages]
          : generationInput.referenceImages
      };
      const result: GenerateResponse = await api.generateImage(payload);
      if (result.credits) {
        setCreditStatus((current) => ({
          ...(current ?? { providerAvailable: true }),
          credits: result.credits!,
          providerAvailable: current?.providerAvailable ?? true
        }));
      }
      const produced = await Promise.all(
        result.images.map(async (image) => {
          const size = await loadImageSize(image.dataUrl);
          return { ...image, width: size.width || undefined, height: size.height || undefined };
        })
      );
      if (isEditSession) {
        // 结果按顺序追加为新版本（n>1 时全部入栈，版本条里翻着对比），激活最新版。
        const newVersions: ImageVersion[] = produced.map((output) => ({
          path: output.path,
          dataUrl: output.dataUrl,
          jobId: result.job.id,
          width: output.width,
          height: output.height
        }));
        // 无论当前在哪个画板，先把新版本落盘到发起画板，保证在途编辑结果始终可恢复
        // （退出编辑 / 退出画板再进来都能看到）；后续自动保存是全量覆盖，内容一致不会重复。
        await api.appendBoardNodeVersions(
          originBoard.id,
          editTargetImage.id,
          newVersions.map((version) => ({
            imagePath: version.path,
            jobId: version.jobId,
            width: version.width,
            height: version.height
          }))
        );
        boardDetailCacheRef.current.delete(originBoard.id);
        if (activeBoardRef.current?.id === originBoard.id) {
          // 当前就在发起画板：同步更新内存即时呈现（与已落盘内容一致）。
          setImages((current) =>
            current.map((image) => {
              if (image.id !== editTargetImage.id) return image;
              const base: ImageVersion[] = image.versions ?? [
                { path: image.path, dataUrl: image.dataUrl, jobId: image.jobId, width: image.width, height: image.height }
              ];
              const versions = [...base, ...newVersions];
              const newest = versions[versions.length - 1];
              const pendingEditCount = Math.max(0, getPendingEditCount(image) - requestedEditCount);
              const queuedEditCount = Math.min(pendingEditCount, image.queuedEditCount ?? 0);
              return {
                ...image,
                versions,
                activeVersion: versions.length - 1,
                path: newest.path,
                dataUrl: newest.dataUrl,
                jobId: newest.jobId,
                width: newest.width,
                height: newest.height,
                editing: pendingEditCount > 0,
                pendingEditCount: pendingEditCount || undefined,
                queuedEditCount: queuedEditCount || undefined,
                editingStartedAt: pendingEditCount > queuedEditCount ? image.editingStartedAt : undefined
              };
            })
          );
        } else {
          // 编辑期间切走了画板：已落盘，刷新画板库摘要即可。
          void refreshBoards();
        }
        setStatus("编辑完成。");
        iterlayToast.result({
          count: newVersions.length,
          title: newVersions.length > 1 ? `已生成 ${newVersions.length} 个编辑版本` : "编辑已应用",
          detail: activeBoardRef.current?.id === originBoard.id ? "新版本已叠加到原图" : `已存入「${originBoard.name}」`,
          previews: newVersions.map((version) => version.dataUrl),
          onNavigate: () => void locateGenerationResult(
            originBoard.id,
            newVersions.map((version) => version.path)
          )
        });
        if (result.warnings?.length) result.warnings.forEach((warning) => toast.warning(warning));
        await refreshHistory();
        return newVersions.map((version) => ({
          id: crypto.randomUUID(),
          path: version.path,
          dataUrl: version.dataUrl,
          jobId: version.jobId,
          pending: false,
          source: "generated" as const,
          width: version.width,
          height: version.height
        }));
      }

      let completedImages: GeneratedImage[] = produced.map((output, index) => ({
        id: clientIds[index] ?? crypto.randomUUID(),
        path: output.path,
        dataUrl: output.dataUrl,
        jobId: result.job.id,
        pending: false,
        source: "generated" as const,
        width: output.width,
        height: output.height
      }));
      if (generationInput.generationNodeId) {
        completedImages = completedImages.map((image) => ({
          ...image,
          placementAnchorId: generationInput.generationNodeId
        }));
      }
      const completedOnOriginBoard = activeBoardRef.current?.id === originBoard.id;
      if (completedOnOriginBoard) {
        let nextImages = settleGeneratedPlaceholders(imagesRef.current, clientIds, completedImages);
        if (generationInput.generationNodeId) {
          const anchor = canvasStateRef.current.positions[generationInput.generationNodeId];
          if (anchor) {
            nextImages = centerGenerationOutputs(
              nextImages,
              generationInput.generationNodeId,
              anchor,
              canvasStateRef.current.positions
            );
            const completedById = new Map(nextImages.map((image) => [image.id, image]));
            completedImages = completedImages.map((image) => completedById.get(image.id) ?? image);
          }
        }
        imagesRef.current = nextImages;
        setImages(nextImages);
        if (generationInput.generationNodeId) {
          updateWorkflowNode(generationInput.generationNodeId, {
            status: "succeeded",
            lastGenerationId: result.job.id,
            error: undefined
          });
        }
        if (outputConnectionSourceId) {
          const connections = canvasStateRef.current.connections;
          const sourceNode = workflowNodesRef.current.find((node) => node.id === outputConnectionSourceId);
          const additions = createMissingGenerationOutputConnections({
            sourceId: outputConnectionSourceId,
            targetIds: completedImages.map((image) => image.id),
            existing: connections,
            label: sourceNode?.type === "comic-character" ? "角色形象" : "生成结果"
          });
          if (additions.length > 0) {
            canvasStateRef.current = {
              ...canvasStateRef.current,
              connections: [...connections, ...additions]
            };
            setCanvasConnectionsVersion((value) => value + 1);
          }
        }
        // 创作页会在 generate 返回后立刻展示成功结果。先把终态落盘，避免用户
        // 随即进入画板时仍读到 pending 占位节点。
        await persistBoard();
        setStatus(`已生成 ${result.images.length} 张图片。`);
        if (produced.length < clientIds.length) {
          iterlayToast.partial({ actual: produced.length, expected: clientIds.length });
        } else {
          iterlayToast.result({
            count: result.images.length,
            previews: completedImages.map((output) => output.dataUrl),
            onNavigate: () => void locateGenerationResult(
              originBoard.id,
              completedImages.map((output) => output.path)
            )
          });
        }
      } else {
        // 用户已切到别的画板：结果直接写进发起画板的文件（摆在现有内容右侧）。
        await api.appendBoardNodes(
          originBoard.id,
          completedImages.map((output) => ({
            id: output.id,
            imagePath: output.path,
            jobId: output.jobId,
            source: output.source ?? "generated",
            width: output.width,
            height: output.height
          }))
        );
        boardDetailCacheRef.current.delete(originBoard.id);
        void refreshBoards();
        setStatus(`已生成 ${result.images.length} 张图片。`);
        iterlayToast.result({
          count: result.images.length,
          boardName: originBoard.name,
          previews: produced.map((output) => output.dataUrl),
          onNavigate: () => void locateGenerationResult(
            originBoard.id,
            completedImages.map((output) => output.path)
          )
        });
      }
      // Provider 侧的非致命问题（部分失败/返回张数不足）要说清楚，不能让占位符静默消失。
      if (result.warnings?.length) {
        result.warnings.forEach((warning) => toast.warning(warning));
      } else if (produced.length < clientIds.length && !completedOnOriginBoard) {
        toast.warning(`请求 ${clientIds.length} 张，实际返回 ${produced.length} 张。`);
      }
      await refreshHistory();
      return completedImages;
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "生成失败。");
      if (isEditSession && activeBoardRef.current?.id === originBoard.id) {
        setImages((current) =>
          current.map((image) =>
            image.id === editTargetImage.id
              ? (() => {
                  const pendingEditCount = Math.max(0, getPendingEditCount(image) - requestedEditCount);
                  const queuedEditCount = Math.min(pendingEditCount, image.queuedEditCount ?? 0);
                  return {
                    ...image,
                    editing: pendingEditCount > 0,
                    pendingEditCount: pendingEditCount || undefined,
                    queuedEditCount: queuedEditCount || undefined,
                    editingStartedAt: pendingEditCount > queuedEditCount ? image.editingStartedAt : undefined
                  };
                })()
              : image
          )
        );
      } else if (!isEditSession && activeBoardRef.current?.id === originBoard.id) {
        const nextImages = removeGeneratedPlaceholders(imagesRef.current, clientIds);
        imagesRef.current = nextImages;
        setImages(nextImages);
      }
      setStatus(message);
      toast.error(message);
      await refreshHistory();
      return [];
    } finally {
      if (delayedNoticeTimer !== null) window.clearTimeout(delayedNoticeTimer);
      if (delayedNoticeId !== undefined) iterlayToast.dismiss(delayedNoticeId);
      generationQueueRef.current?.release(activeGenerationId);
      setActiveGenerations((count) => count - 1);
      setActiveBoardGenerations((current) => current.filter((task) => task.id !== activeGenerationId));
    }
  }

  function createWorkflowNode(
    type: "text" | "generation" | "video-generation" | "comic-setting" | "comic-character" | "comic-segment-script",
    position: CanvasDropPoint,
    initial?: {
      text?: string;
      prompt?: string;
      model?: string;
      size?: string;
      count?: number;
      duration?: number;
      aspectRatio?: string;
      resolution?: string;
      generateAudio?: boolean;
      focusOnCreate?: boolean;
    }
  ): string {
    const base = {
      id: crypto.randomUUID(),
      x: position.x,
      y: position.y
    };
    const videoProvider = videoProviders.find((provider) => provider.id === activeVideoProviderId) ?? videoProviders[0];
    const node: CanvasPersistedNode = type === "text"
      ? { ...base, type: "text", title: "文本", text: initial?.text ?? "" }
      : type === "generation" ? {
          ...base,
          type: "generation",
          title: "图片生成",
          prompt: initial?.prompt ?? "",
          model: initial?.model ?? activeProvider.model,
          size: initial?.size ?? inputRef.current.size,
          count: initial?.count ?? 1,
          status: "idle"
        } : type === "video-generation" ? {
          ...base,
          type: "video-generation",
          title: "视频生成",
          prompt: initial?.prompt ?? "",
          providerId: videoProvider?.id,
          model: initial?.model ?? videoProvider?.model ?? "doubao-seedance-1-5-pro-250528",
          duration: initial?.duration ?? 5,
          aspectRatio: initial?.aspectRatio ?? "16:9",
          resolution: initial?.resolution ?? "720p",
          generateAudio: initial?.generateAudio ?? false,
          status: "draft"
        } : type === "comic-setting" ? {
          ...base, type: "comic-setting", status: "draft", activeVersionId: crypto.randomUUID(),
          versions: []
        } : type === "comic-character" ? {
          ...base, type: "comic-character", name: "新角色", status: "draft", activeVersionId: crypto.randomUUID(),
          versions: []
        } : {
          ...base, type: "comic-segment-script", order: workflowNodesRef.current.filter(isComicDramaNode).filter((item) => item.type === "comic-segment-script").length + 1,
          title: "新片段", status: "draft", activeVersionId: crypto.randomUUID(), versions: []
        };
    if (node.type === "comic-setting") {
      node.versions = [{ versionId: node.activeVersionId, createdAt: new Date().toISOString(), fields: {
        title: "未命名漫剧", synopsis: "", genre: "", tone: "", worldRules: [], visualStyle: "", constraints: [], aspectRatio: "9:16", targetDurationSeconds: 30
      } }];
    } else if (node.type === "comic-character") {
      node.versions = [{ versionId: node.activeVersionId, createdAt: new Date().toISOString(), fields: { role: "", profile: "", appearanceAnchors: [], visualPrompt: "" } }];
    } else if (node.type === "comic-segment-script") {
      node.versions = [{ versionId: node.activeVersionId, createdAt: new Date().toISOString(), fields: {
        purpose: "", scene: "", action: "", dialogue: "", emotion: "", visualDirection: "", cameraDirection: "", durationSeconds: 6
      } }];
    }
    setWorkflowNodes((current) => {
      const next = [...current, node];
      workflowNodesRef.current = next;
      return next;
    });
    if (isComicDramaNode(node)) {
      setComicDramaSnapshot((current) => current ? { ...current, nodes: [...current.nodes, node] } : current);
    }
    if (initial?.focusOnCreate) {
      setFocusTarget((current) => ({ key: node.id, nonce: (current?.nonce ?? 0) + 1 }));
    }
    scheduleBoardSave();
    return node.id;
  }

  function openComicDramaSetting(nodeId: string): void {
    setSelectionTarget({ ids: [nodeId], nonce: Date.now() });
    setComicDramaEntryPosition(null);
  }

  function createComicDramaSettingFromEntry(position: CanvasDropPoint): void {
    const nodeId = createWorkflowNode("comic-setting", position, { focusOnCreate: true });
    setSelectionTarget({ ids: [nodeId], nonce: Date.now() });
    setComicDramaEntryPosition(null);
  }

  async function createComicDramaProjectAt(position: CanvasDropPoint, requestedName?: string): Promise<void> {
    const parentBoard = activeBoardRef.current;
    if (!parentBoard) return;
    try {
      await flushBoardSave();
      const result = await getImageWorkbenchApi().createComicDramaProject({
        parentBoardId: parentBoard.id,
        name: requestedName?.trim() || "未命名漫剧",
        position
      });
      boardDetailCacheRef.current.delete(parentBoard.id);
      boardDetailCacheRef.current.delete(result.childBoard.id);
      await refreshBoards();
      await openBoard(result.childBoard.id, undefined, {
        forceReload: true,
        resetPromptDraft: true,
        suppressLoadingScreen: true
      });
      setComicDramaEntryPosition(null);
      toast.success(`已进入「${result.childBoard.name}」漫剧画板`);
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "创建漫剧子画板失败。"));
    }
  }

  function openComicDramaProject(node: BoardComicDramaEntryNode, origin?: BoardEnterOrigin): void {
    setComicDramaEntryPosition(null);
    void openBoard(node.childBoardId, origin, {
      resetPromptDraft: true,
      suppressLoadingScreen: true
    });
  }

  function startComicDramaAt(position: CanvasDropPoint): void {
    const hasLegacyInlineComicNodes = workflowNodesRef.current.some(isComicDramaNode)
      && !workflowNodesRef.current.some((node) => node.type === "comic-drama-entry");
    if (activeBoardRef.current?.kind === "comic-drama" || hasLegacyInlineComicNodes) {
      const setting = workflowNodesRef.current.find((node) => node.type === "comic-setting");
      if (setting) openComicDramaSetting(setting.id);
      else createComicDramaSettingFromEntry(position);
      return;
    }
    const projects = workflowNodesRef.current.filter((node) => node.type === "comic-drama-entry");
    if (projects.length === 0) void createComicDramaProjectAt(position);
    else setComicDramaEntryPosition(position);
  }

  function updateWorkflowNode(
    id: string,
    patch: Partial<CanvasPersistedNode>
  ): void {
    const previous = workflowNodesRef.current.find((node) => node.id === id);
    const invalidated = new Set<string>();
    const nextActiveVersionId = "activeVersionId" in patch ? patch.activeVersionId : undefined;
    const nextGenerationId = "lastGenerationId" in patch ? patch.lastGenerationId : undefined;
    const activeVersionChanged = previous && isComicDramaNode(previous)
      && typeof nextActiveVersionId === "string"
      && nextActiveVersionId !== previous.activeVersionId;
    const adoptedFrameChanged = previous && isBoardGenerationNode(previous)
      && previous.comicFrameRole
      && typeof nextGenerationId === "string"
      && nextGenerationId !== previous.lastGenerationId;
    if (activeVersionChanged || adoptedFrameChanged) {
      for (const connection of canvasStateRef.current.connections) {
        if (connection.kind === "reference" && connection.source === id && (adoptedFrameChanged || connection.versionBinding?.mode !== "pinned")) invalidated.add(connection.target);
      }
    }
    const next = workflowNodesRef.current.map((node) => {
      if (node.id === id) return { ...node, ...patch } as typeof node;
      if (!invalidated.has(node.id)) return node;
      if (isBoardGenerationNode(node)) {
        return { ...node, status: "idle" as const, error: previous && isBoardGenerationNode(previous) && previous.comicFrameRole === "first-frame"
          ? "首帧已更新，请重新生成并采用尾帧。" : "上游版本已更新，请重新生成。" };
      }
      if (isBoardVideoGenerationNode(node)) {
        return { ...node, status: "modified" as const, error: previous && isBoardGenerationNode(previous)
          ? previous.comicFrameRole === "first-frame" ? "首帧已更新，尾帧和视频输入已变化。" : "尾帧已更新，视频输入已变化。"
          : "脚本、角色或共享视觉已更新，首帧、尾帧和视频输入已变化。" };
      }
      return node;
    });
    workflowNodesRef.current = next;
    setWorkflowNodes(next);
    setComicDramaSnapshot((current) => current ? {
      ...current,
      nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } as typeof node : node)
    } : current);
    scheduleBoardSave();
  }

  function deleteWorkflowNodes(ids: string[]): void {
    const idSet = new Set(ids);
    const childBoardIds = workflowNodesRef.current.flatMap((node) => (
      idSet.has(node.id) && node.type === "comic-drama-entry" ? [node.childBoardId] : []
    ));
    queueComicDramaBoardState([], childBoardIds);
    setWorkflowNodes((current) => {
      const next = current.filter((node) => !idSet.has(node.id));
      workflowNodesRef.current = next;
      return next;
    });
    setComicDramaSnapshot((current) => current ? {
      ...current,
      nodes: current.nodes.filter((node) => !idSet.has(node.id)),
      connections: current.connections.filter((connection) => !idSet.has(connection.source) && !idSet.has(connection.target))
    } : current);
    canvasStateRef.current.connections = canvasStateRef.current.connections.filter(
      (connection) => !idSet.has(connection.source) && !idSet.has(connection.target)
    );
    scheduleBoardSave();
  }

  async function runGenerationNode(
    node: BoardGenerationNode,
    resolved: { prompt: string; images: GeneratedImage[]; sourceNodeIds: string[]; versionConflicts?: string[] }
  ): Promise<GeneratedImage[]> {
    const originBoardId = activeBoardRef.current?.id;
    if (!originBoardId) return [];
    if ((resolved.versionConflicts?.length ?? 0) > 0) {
      toast.error(`固定版本冲突：${resolved.versionConflicts![0]}`);
      return [];
    }
    if (paidSubmissionInFlightRef.current.has(node.id)) return [];
    paidSubmissionInFlightRef.current.add(node.id);
    try {
      const selectedImageProvider = providers.find((provider) => provider.id === (node.providerId ?? activeProvider.id)) ?? activeProvider;
      const model = node.model?.trim() || selectedImageProvider.model;
      const count = Math.min(Math.max(1, node.count ?? 1), getProviderMaxImageCount(selectedImageProvider));
      const inputFingerprint = await generationFingerprint({ boardId: originBoardId, nodeId: node.id, prompt: resolved.prompt, model, size: node.size || "auto", count, references: resolved.images.map((image) => ({ id: image.id, jobId: image.jobId, path: image.path })) });
      const metadata: Partial<GenerateImageInput> = selectedImageProvider.type === "official"
        ? await paidGenerationMetadata(inputFingerprint, node.comicFrameRole ?? "first-frame", { kind: "image", providerId: selectedImageProvider.id, boardId: originBoardId ?? "global", requestScope: node.id, operation: "image:generate", imageCount: count })
        : {};
      const costLabel = metadata.priceSnapshot?.amount ? metadata.priceSnapshot.amount + " Credit" : "由 Provider 计费";
      const confirmed = await requestGenerationConfirmation({
        title: node.comicFrameRole === "first-frame" ? "确认生成首帧" : node.comicFrameRole === "last-frame" ? "确认生成尾帧" : "确认生成图片",
        providerLabel: selectedImageProvider.name,
        model,
        totalCostLabel: costLabel,
        items: [{ id: node.id, label: node.title || "图片生成", task: `生成 ${count} 张图片`, costLabel, quoteId: metadata.quoteId, quoteExpiresAt: metadata.quoteExpiresAt }],
        confirmLabel: `确认并生成 ${count} 张图片`
      });
      if (!confirmed || activeBoardRef.current?.id !== originBoardId) return [];
      const references: ReferenceImagePayload[] = [];
      for (const image of resolved.images.slice(0, 4)) {
        let source = image.dataUrl;
        if (!source.startsWith("data:") && image.path) source = await getImageWorkbenchApi().readAssetDataUrl(image.path);
        const payload = dataUrlToReferencePayload(source, "画板上游图片", "reference");
        if (!payload) continue;
        payload.sourceNodeId = image.id;
        references.push(payload);
      }
      if (activeBoardRef.current?.id !== originBoardId) return [];
      updateWorkflowNode(node.id, { status: "running", error: undefined });
      const segmentNode = workflowNodesRef.current.find((candidate) => resolved.sourceNodeIds.includes(candidate.id) && candidate.type === "comic-segment-script");
      const characterVersions = workflowNodesRef.current.flatMap((candidate) => candidate.type === "comic-character" && resolved.sourceNodeIds.includes(candidate.id)
        ? [{ nodeId: candidate.id, versionId: candidate.activeVersionId }] : []);
      const adoptedFirstFrame = node.comicFrameRole === "last-frame" ? resolved.images.find((image) => image.jobId) : undefined;
      const comicDramaContextSnapshot = node.comicFrameRole && segmentNode?.type === "comic-segment-script" ? {
        role: node.comicFrameRole, segmentNodeId: segmentNode.id, segmentScriptVersionId: segmentNode.activeVersionId,
        characterVersions, sharedVisualVersions: [],
        ...(adoptedFirstFrame ? { adoptedFirstFrame: { nodeId: adoptedFirstFrame.id, versionId: adoptedFirstFrame.jobId } } : {})
      } : undefined;
      if (node.comicFrameRole === "last-frame" && !adoptedFirstFrame) throw new Error("尾帧生成必须先采用并固定首帧版本。");
      const outputs = await generate(undefined, {
        boardId: originBoardId,
        workflowMode: "generate",
        comicDramaContextSnapshot,
        generationNodeId: node.id,
        prompt: resolved.prompt,
        model,
        size: node.size || "auto",
        n: count,
        referenceImages: references,
        providerId: selectedImageProvider.id,
        ...metadata
      }, { preservePrompt: true, placementAnchorId: node.id, preserveModelOverride: true });
      const completionPatch: Partial<BoardGenerationNode> = outputs.length > 0
        ? { status: "succeeded", ...(node.comicFrameRole ? { latestGenerationId: outputs[0].jobId } : { lastGenerationId: outputs[0].jobId }), error: undefined }
        : { status: "failed", error: "未生成可用图片" };
      if (!originBoardId || activeBoardRef.current?.id === originBoardId) {
        updateWorkflowNode(node.id, completionPatch);
      } else {
        const api = getWorkbenchApi();
        if (!api) return outputs;
        const detail = await api.getBoard(originBoardId);
        if (detail) {
          const outputConnections: BoardConnection[] = outputs.map((image) => ({
            id: crypto.randomUUID(),
            source: node.id,
            target: image.id,
            sourceHandle: "source-right",
            targetHandle: "target-left",
            kind: "visual",
            label: "生成结果",
            routing: { mode: "auto", kind: "curved", waypoints: [] }
          }));
          await api.saveBoard({
            id: originBoardId,
            nodes: detail.nodes.map((candidate) => candidate.id === node.id && isBoardGenerationNode(candidate)
              ? { ...candidate, ...completionPatch }
              : candidate),
            connections: [...(detail.connections ?? []), ...outputConnections]
          });
          boardDetailCacheRef.current.delete(originBoardId);
        }
      }
      return outputs;
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "生成失败。");
      if (!originBoardId || activeBoardRef.current?.id === originBoardId) {
        updateWorkflowNode(node.id, { status: "failed", error: message });
      }
      toast.error(message);
      return [];
    } finally {
      paidSubmissionInFlightRef.current.delete(node.id);
    }
  }

  async function runVideoGenerationNode(
    node: BoardVideoGenerationNode,
    resolved: {
      prompt: string;
      images: GeneratedImage[];
      sourceNodeIds: string[];
      versionConflicts?: string[];
      startFrame?: GeneratedImage;
      endFrame?: GeneratedImage;
      referenceImages: GeneratedImage[];
      referenceVideos: VideoReferenceInput[];
      requiresFirstLastFrame: boolean;
    }
  ): Promise<void> {
    if ((resolved.versionConflicts?.length ?? 0) > 0) {
      toast.error(`固定版本冲突：${resolved.versionConflicts![0]}`);
      return;
    }
    const boardId = activeBoardRef.current?.id;
    if (!boardId) {
      toast.error("请先打开一个画板。");
      return;
    }
    const api = getWorkbenchApi();
    if (!api) {
      toast.error(missingImageWorkbenchMessage);
      return;
    }
    const prompt = resolved.prompt.trim();
    if (resolved.referenceImages.length > VIDEO_MAX_REFERENCE_IMAGES) {
      toast.error(`当前模型最多接收 ${VIDEO_MAX_REFERENCE_IMAGES} 张参考图，请先移除多余连接。`);
      return;
    }
    if (!prompt && resolved.images.length === 0 && resolved.referenceVideos.length === 0 && !node.sourceVideoPath) {
      toast.error("请填写运动描述，或连接图片/视频参考。");
      return;
    }
    const selectedVideoProvider = videoProviders.find((provider) => provider.id === (node.providerId || activeVideoProviderId));
    if (!selectedVideoProvider) {
      const message = "当前视频服务已被删除，请重新选择模型。";
      updateWorkflowNode(node.id, { status: "failed", error: message });
      toast.error(message);
      return;
    }
    if (selectedVideoProvider?.type === "official") {
      const requiredGoldBeans = Math.max(1, node.duration ?? 5) * (creditStatus?.videoGoldBeanCostPerSecond ?? 1);
      const goldBeanBalance = creditStatus?.goldBeans?.balance;
      if (goldBeanBalance !== undefined && goldBeanBalance < requiredGoldBeans) {
        toast.error(`金豆余额不足，本次需要 ${requiredGoldBeans} 金豆，请联系管理员添加金豆。`);
        return;
      }
    }
    if (resolved.requiresFirstLastFrame && (!resolved.startFrame || !resolved.endFrame)) {
      toast.error("请先分别采用首帧和尾帧，并保持固定版本连接。");
      return;
    }
    if (paidSubmissionInFlightRef.current.has(node.id)) return;
    const inputFingerprint = await generationFingerprint({ boardId, nodeId: node.id, prompt, model: node.model?.trim() || selectedVideoProvider.model, duration: node.duration ?? 5, aspectRatio: node.aspectRatio || "16:9", resolution: node.resolution || "720p", generateAudio: node.generateAudio ?? false, firstFrame: resolved.startFrame ? { id: resolved.startFrame.id, versionId: resolved.startFrame.jobId, path: resolved.startFrame.path } : undefined, lastFrame: resolved.endFrame ? { id: resolved.endFrame.id, versionId: resolved.endFrame.jobId, path: resolved.endFrame.path } : undefined, references: resolved.referenceImages.map((image) => ({ id: image.id, versionId: image.jobId, path: image.path })) });
    const metadata: Partial<VideoGenerationInput> = selectedVideoProvider.type === "official"
      ? await paidGenerationMetadata(inputFingerprint, "video", { kind: "video", providerId: selectedVideoProvider.id, boardId, requestScope: node.id, operation: "video:start", durationSeconds: Math.max(1, node.duration ?? 5), model: node.model?.trim() || selectedVideoProvider.model, resolution: node.resolution || "720p", generateAudio: node.generateAudio ?? false })
      : {};
    const videoCostLabel = metadata.priceSnapshot?.amount ? metadata.priceSnapshot.amount + " 金豆" : "由 Provider 计费";
    const confirmed = await requestGenerationConfirmation({
      title: "确认生成视频",
      providerLabel: selectedVideoProvider.name,
      model: node.model?.trim() || selectedVideoProvider.model,
      totalCostLabel: videoCostLabel,
      items: [{
        id: node.id,
        label: node.title || "片段视频",
        task: `生成 ${node.duration ?? 5} 秒视频`,
        costLabel: videoCostLabel,
        quoteId: metadata.quoteId,
        quoteExpiresAt: metadata.quoteExpiresAt
      }],
      confirmLabel: "确认并生成视频"
    });
    if (!confirmed) return;
    paidSubmissionInFlightRef.current.add(node.id);
    const pendingJobId = `pending-`;
    const pendingOutputId = `video-output-${pendingJobId}`;
    updateWorkflowNode(node.id, { status: "submitting", lastGenerationId: undefined, error: undefined });
    const syncPlaceholder = (
      job: Pick<VideoGenerationJob, "id" | "status" | "outputVideoPath" | "outputPosterPath" | "error">
    ): void => {
      if (node.mode === "remix" || activeBoardRef.current?.id !== boardId) return;
      const placeholderId = `video-output-${job.id}`;
      const current = workflowNodesRef.current;
      const existing = current.find((candidate): candidate is BoardVideoNode => (
        (candidate.id === placeholderId || candidate.id === pendingOutputId) && isBoardVideoNode(candidate)
      ));
      const placeholder: BoardVideoNode = {
        id: placeholderId,
        type: "video",
        title: "视频结果",
        videoPath: job.outputVideoPath ?? existing?.videoPath ?? "",
        posterPath: job.outputPosterPath ?? existing?.posterPath,
        jobId: job.id,
        source: "generated",
        generationNodeId: node.id,
        aspectRatio: existing?.aspectRatio ?? node.aspectRatio ?? "16:9",
        status: job.status,
        error: job.error,
        x: existing?.x ?? node.x + Math.max(1, node.displayWidth ?? 340)
          + GENERATION_OUTPUT_HORIZONTAL_GAP,
        y: existing?.y ?? node.y
      };
      const next = existing
        ? current.map((candidate) => candidate.id === existing.id ? placeholder : candidate)
        : [...current, placeholder];
      workflowNodesRef.current = next;
      setWorkflowNodes(next);
      const existingConnection = canvasStateRef.current.connections.find((connection) => (
        connection.source === node.id
        && (connection.target === placeholderId || connection.target === pendingOutputId)
      ));
      if (existingConnection) {
        canvasStateRef.current.connections = canvasStateRef.current.connections.map((connection) => (
          connection.id === existingConnection.id
            ? {
                ...connection,
                target: placeholderId,
                sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
                targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
                routing: { mode: "auto", kind: "curved", waypoints: [] }
              }
            : connection
        ));
        setCanvasConnectionsVersion((value) => value + 1);
      } else {
        canvasStateRef.current.connections = [...canvasStateRef.current.connections, {
          id: crypto.randomUUID(), source: node.id, target: placeholderId,
          sourceHandle: "source-right", targetHandle: "target-left", kind: "visual", label: "生成结果",
          sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
          targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
          routing: { mode: "auto", kind: "curved", waypoints: [] }
        }];
        setCanvasConnectionsVersion((value) => value + 1);
      }
      scheduleBoardSave();
    };
    syncPlaceholder({
      id: pendingJobId,
      status: "submitting",
      outputVideoPath: undefined,
      outputPosterPath: undefined,
      error: undefined
    });
    await flushBoardSave();
    try {
      const imageInputs = resolveVideoGenerationImageInputs(
        selectedVideoProvider.type === "official",
        resolved.startFrame,
        resolved.endFrame,
        resolved.referenceImages
      );
      const segmentNode = workflowNodesRef.current.find((candidate) => resolved.sourceNodeIds.includes(candidate.id) && candidate.type === "comic-segment-script");
      const comicDramaContextSnapshot = resolved.requiresFirstLastFrame && segmentNode?.type === "comic-segment-script" && resolved.startFrame && resolved.endFrame ? {
        segmentNodeId: segmentNode.id,
        segmentScriptVersionId: segmentNode.activeVersionId,
        characterVersions: canvasStateRef.current.connections.flatMap((connection) => {
          if (connection.kind !== "reference" || connection.target !== segmentNode.id) return [];
          const source = workflowNodesRef.current.find((candidate) => candidate.id === connection.source);
          if (!source || source.type !== "comic-character") return [];
          return [{ nodeId: source.id, versionId: connection.versionBinding?.mode === "pinned" ? connection.versionBinding.versionId : source.activeVersionId }];
        }),
        sharedVisualVersions: [],
        adoptedFirstFrame: { nodeId: resolved.startFrame.id, versionId: resolved.startFrame.jobId },
        adoptedLastFrame: { nodeId: resolved.endFrame.id, versionId: resolved.endFrame.jobId }
      } : undefined;
      const input: VideoGenerationInput = {
        mode: node.mode ?? "generate",
        prompt,
        model: node.model?.trim() || selectedVideoProvider.model,
        aspectRatio: node.aspectRatio || "16:9",
        resolution: node.resolution || "720p",
        durationSeconds: node.duration ?? 5,
        referenceImagePaths: imageInputs.referenceImagePaths,
        referenceVideoPaths: Array.from(new Set([
          ...(node.referenceVideoPaths ?? []),
          ...resolved.referenceVideos.map((video) => video.path)
        ].filter(Boolean))),
        referenceAudioPaths: node.referenceAudioPaths ?? [],
        requireFirstLastFrameCapability: resolved.requiresFirstLastFrame,
        comicDramaContextSnapshot,
        sourceVideoPath: node.sourceVideoPath,
        targetVideoNodeId: node.targetVideoNodeId,
        firstFramePath: imageInputs.firstFramePath,
        lastFramePath: imageInputs.lastFramePath,
        generateAudio: node.generateAudio ?? false,
        watermark: node.watermark ?? false,
        providerId: node.providerId,
        boardId,
        generationNodeId: node.id,
        ...metadata
      };
      let job = await api.startVideoGeneration(input);
      videoPollingStoppedRef.current.delete(job.id);
      if (activeBoardRef.current?.id === boardId) {
        updateWorkflowNode(node.id, {
          status: job.status,
          lastGenerationId: job.id,
          error: job.error,
          ...(job.input.prompt !== prompt ? { prompt: job.input.prompt } : {})
        });
        syncPlaceholder(job);
      }
      void refreshHistory();
      for (let attempt = 0; attempt < 300 && !isTerminalVideoJob(job) && !videoPollingStoppedRef.current.has(job.id); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const latest = await api.getVideoJob(job.id);
        if (!latest) break;
        job = latest;
        if (activeBoardRef.current?.id === boardId) {
          updateWorkflowNode(node.id, {
            status: job.status,
            error: job.error,
            lastGenerationId: job.id
          });
          syncPlaceholder(job);
        }
      }
      if (job.status === "completed") {
        boardDetailCacheRef.current.delete(boardId);
        if (activeBoardRef.current?.id === boardId) await openBoard(boardId, undefined, { forceReload: true });
        notifyVideoJob(job);
      } else if (job.status === "failed") {
        notifyVideoJob(job);
      }
      void refreshHistory();
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "视频生成失败。");
      updateWorkflowNode(node.id, { status: "failed", error: message });
      syncPlaceholder({
        id: pendingJobId,
        status: "failed",
        outputVideoPath: undefined,
        outputPosterPath: undefined,
        error: message
      });
      toast.error(message);
    } finally {
      paidSubmissionInFlightRef.current.delete(node.id);
      if (selectedVideoProvider?.type === "official") refreshCreditStatus();
    }
  }

  function chooseVideoReferenceAudio(nodeId: string): void {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "audio/*,.mp3,.wav,.m4a,.aac,.ogg";
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;
      void (async () => {
        try {
          const imported = await getImageWorkbenchApi().importAudio(
            await file.arrayBuffer(),
            file.type || inferAudioMimeType(file.name)
          );
          const node = workflowNodesRef.current.find(
            (candidate): candidate is BoardVideoGenerationNode => candidate.id === nodeId && isBoardVideoGenerationNode(candidate)
          );
          if (!node) return;
          updateWorkflowNode(nodeId, {
            referenceAudioPaths: Array.from(new Set([...(node.referenceAudioPaths ?? []), imported.path])),
            referenceAudioNames: { ...(node.referenceAudioNames ?? {}), [imported.path]: file.name }
          });
          toast.success("参考音频已添加");
        } catch (error) {
          toast.error(getWorkbenchErrorMessage(error, "参考音频导入失败。"));
        }
      })();
    };
    picker.click();
  }

  function removeVideoReferenceAudio(nodeId: string, audioPath: string): void {
    const node = workflowNodesRef.current.find(
      (candidate): candidate is BoardVideoGenerationNode => candidate.id === nodeId && isBoardVideoGenerationNode(candidate)
    );
    if (!node) return;
    updateWorkflowNode(nodeId, {
      referenceAudioPaths: (node.referenceAudioPaths ?? []).filter((path) => path !== audioPath),
      referenceAudioNames: Object.fromEntries(
        Object.entries(node.referenceAudioNames ?? {}).filter(([path]) => path !== audioPath)
      )
    });
  }

  function selectVideoVersion(nodeId: string, versionIndex: number): void {
    const node = workflowNodesRef.current.find(
      (candidate): candidate is BoardVideoNode => candidate.id === nodeId && isBoardVideoNode(candidate)
    );
    const version = node?.versions?.[versionIndex];
    if (!node || !version) return;
    updateWorkflowNode(nodeId, {
      activeVersion: versionIndex,
      videoPath: version.videoPath,
      posterPath: version.posterPath,
      jobId: version.jobId,
      mimeType: version.mimeType,
      width: version.width,
      height: version.height,
      aspectRatio: version.aspectRatio ?? node.aspectRatio,
      durationMs: version.durationMs
    });
  }

  function createVideoIteration(nodeId: string, mode: "extend" | "remix"): void {
    const source = workflowNodesRef.current.find(
      (candidate): candidate is BoardVideoNode => candidate.id === nodeId && isBoardVideoNode(candidate)
    );
    if (!source) return;
    const videoProvider = videoProviders.find((provider) => provider.id === activeVideoProviderId) ?? videoProviders[0];
    const generationId = crypto.randomUUID();
    const iterationIndex = workflowNodesRef.current.filter((candidate) => (
      isBoardVideoGenerationNode(candidate) && candidate.sourceVideoPath === source.videoPath
    )).length;
    const generationNode: BoardVideoGenerationNode = {
      id: generationId,
      type: "video-generation",
      title: mode === "extend" ? "继续视频" : "改编视频",
      x: source.x + (source.displayWidth ?? VIDEO_NODE_WIDTH) + 96,
      y: source.y + iterationIndex * (VIDEO_GENERATION_NODE_HEIGHT + 48),
      mode,
      prompt: "",
      providerId: videoProvider?.id,
      model: videoProvider?.model ?? "doubao-seedance-1-5-pro-250528",
      duration: 5,
      aspectRatio: source.width && source.height
        ? Math.abs(source.width / source.height - 1) < 0.15 ? "1:1" : source.width > source.height ? "16:9" : "9:16"
        : source.aspectRatio ?? "16:9",
      resolution: "720p",
      generateAudio: false,
      sourceVideoPath: source.videoPath,
      targetVideoNodeId: mode === "remix" ? source.id : undefined,
      status: "ready"
    };
    setWorkflowNodes((current) => {
      const next = [...current, generationNode];
      workflowNodesRef.current = next;
      return next;
    });
    canvasStateRef.current.connections = [...canvasStateRef.current.connections, {
      id: crypto.randomUUID(),
      source: source.id,
      target: generationId,
      sourceHandle: "source-right",
      targetHandle: "target-video-reference",
      kind: "reference",
      label: mode === "extend" ? "继续源视频" : "改编源视频"
    }];
    setCanvasConnectionsVersion((version) => version + 1);
    scheduleBoardSave();
  }

  function compareVideoVersions(nodeId: string, leftIndex: number, rightIndex: number): void {
    const node = workflowNodesRef.current.find(
      (candidate): candidate is BoardVideoNode => candidate.id === nodeId && isBoardVideoNode(candidate)
    );
    if (!node?.versions) return;
    const toGeneratedVideo = (index: number): GeneratedVideo | null => {
      const version = node.versions?.[index];
      if (!version) return null;
      return {
        id: `${node.id}-v${index + 1}`,
        path: version.videoPath,
        dataUrl: videoUrls[version.videoPath] ?? "",
        posterPath: version.posterPath,
        posterDataUrl: version.posterPath ? videoUrls[version.posterPath] : undefined,
        width: version.width,
        height: version.height,
        durationMs: version.durationMs,
        mimeType: version.mimeType,
        version: index + 1,
        title: node.title,
        status: "completed"
      };
    };
    const left = toGeneratedVideo(leftIndex);
    const right = toGeneratedVideo(rightIndex);
    if (left && right) setVideoCompare({ left, right });
  }

  async function stopVideoPolling(nodeId: string): Promise<void> {
    const node = workflowNodesRef.current.find(
      (candidate): candidate is BoardVideoGenerationNode => candidate.id === nodeId && isBoardVideoGenerationNode(candidate)
    );
    if (!node?.lastGenerationId) return;
    try {
      videoPollingStoppedRef.current.add(node.lastGenerationId);
      await getImageWorkbenchApi().stopVideoPolling(node.lastGenerationId);
      updateWorkflowNode(nodeId, {
        status: "polling_stopped",
        error: "仅停止本地等待，远端任务可能继续运行并产生费用。"
      });
      toast.info("已停止本地等待，远端任务可能仍在运行");
    } catch (error) {
      videoPollingStoppedRef.current.delete(node.lastGenerationId);
      toast.error(getWorkbenchErrorMessage(error, "停止本地等待失败。"));
    }
  }

  async function resumeVideoPolling(nodeId: string): Promise<void> {
    const node = workflowNodesRef.current.find(
      (candidate): candidate is BoardVideoGenerationNode => candidate.id === nodeId && isBoardVideoGenerationNode(candidate)
    );
    const boardId = activeBoardRef.current?.id;
    if (!node?.lastGenerationId || !boardId) return;
    try {
      videoPollingStoppedRef.current.delete(node.lastGenerationId);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const recovered = await getImageWorkbenchApi().recoverVideoGenerations();
      let job = recovered.find((candidate) => candidate.id === node.lastGenerationId)
        ?? await getImageWorkbenchApi().getVideoJob(node.lastGenerationId);
      if (!job) throw new Error("视频任务已不存在。");
      updateWorkflowNode(nodeId, { status: job.status, error: undefined });
      for (let attempt = 0; attempt < 300 && !isTerminalVideoJob(job) && !videoPollingStoppedRef.current.has(job.id); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const latest = await getImageWorkbenchApi().getVideoJob(job.id);
        if (!latest) break;
        job = latest;
        if (activeBoardRef.current?.id === boardId) updateWorkflowNode(nodeId, { status: job.status, error: job.error });
      }
      if (job.status === "completed") {
        boardDetailCacheRef.current.delete(boardId);
        if (activeBoardRef.current?.id === boardId) await openBoard(boardId, undefined, { forceReload: true });
        notifyVideoJob(job);
      } else if (job.status === "failed") {
        notifyVideoJob(job);
      }
    } catch (error) {
      updateWorkflowNode(nodeId, { status: "polling_stopped" });
      toast.error(getWorkbenchErrorMessage(error, "恢复本地等待失败。"));
    }
  }

  // ---------- 图片编辑会话 ----------

  const enterEditSession = useCallback((image: GeneratedImage): void => {
    // 进入编辑：记住历史栏状态并收起，聚焦层不再被右侧历史挤占。
    historyOpenBeforeEditRef.current = historyOpen;
    setHistoryOpen(false);
    // FLIP 起点使用窗口坐标；编辑预览会自行根据顶栏实测高度预留安全区。
    const node = document.querySelector(`.react-flow__node[data-id="${image.id}"]`);
    const rect = node?.getBoundingClientRect() ?? null;
    setEditSourceRect(rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null);
    setAdvancedEditOpen(false);
    setEditTargetId(image.id);
    const useCase = getDefaultUseCase("edit");
    setInput((current) => ({
      ...current,
      workflowMode: "edit",
      creationMode: "general",
      useCase,
      sceneId: findSceneForMode(scenes, current.sceneId, "edit")?.id,
      quality: qualityEditedByUser ? current.quality : getDefaultQuality("edit", useCase),
      // 尺寸默认跟随原图（原图尺寸不合法时保持不变）。
      size: adoptableSize(image) ?? current.size
    }));
  }, [historyOpen, qualityEditedByUser, scenes]);

  const exitEditSession = useCallback((): void => {
    setAdvancedEditOpen(false);
    setEditTargetId(null);
    setEditSourceRect(null);
    const useCase = getDefaultUseCase("generate");
    setInput((current) => ({
      ...current,
      workflowMode: "generate",
      useCase,
      sceneId: findSceneForMode(scenes, current.sceneId, "generate")?.id,
      quality: qualityEditedByUser ? current.quality : getDefaultQuality("generate", useCase)
    }));
    setHistoryOpen(historyOpenBeforeEditRef.current);
  }, [qualityEditedByUser, scenes]);

  // ---------- 首次引导 ----------

  const openGallery = useCallback((_origin: { x: number; y: number }, recordVisit = true): void => {
    void _origin;
    void loadBoardGallery().then(() => {
      setGallerySceneMounted(true);
      setHistoryOpen(false);
      setCommentOpen(false);
      if (recordVisit) markTourSeen(GALLERY_TOUR.id, GALLERY_TOUR.version, "skipped");
      setGalleryOpen(true);
    }).catch((error: unknown) => {
      toast.error(getWorkbenchErrorMessage(error, "画廊加载失败，请重试。"));
    });
  }, []);

  // 首次进入画板：画布无遮挡浮层时延迟弹出，给舞台淡入和布局留出时间。
  useEffect(() => {
    if (!activeBoard || images.length === 0 || libraryOpen || galleryOpen || settingsOpen || editTargetId || openingBoardId) return;
    if (activeTour || tourAutoShownRef.current.has(BOARD_TOUR.id)) return;
    if (hasSeenTour(BOARD_TOUR.id, BOARD_TOUR.version)) return;
    const timer = window.setTimeout(() => {
      tourAutoShownRef.current.add(BOARD_TOUR.id);
      // 记录“已经自动展示”，即使演示过程中退出 App，下次启动也不会再次强制弹出。
      markTourSeen(BOARD_TOUR.id, BOARD_TOUR.version, "skipped");
      setActiveTour(BOARD_TOUR);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [activeBoard, images.length, libraryOpen, galleryOpen, settingsOpen, editTargetId, openingBoardId, activeTour]);

  // 首次进入编辑模式：等聚焦 FLIP 动画结束再弹，避免洞追着移动中的元素。
  useEffect(() => {
    if (!editTargetId) return;
    if (activeTour || tourAutoShownRef.current.has(EDIT_TOUR.id)) return;
    if (hasSeenTour(EDIT_TOUR.id, EDIT_TOUR.version)) return;
    const timer = window.setTimeout(() => {
      tourAutoShownRef.current.add(EDIT_TOUR.id);
      setActiveTour(EDIT_TOUR);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [editTargetId, activeTour]);

  // 首次打开画板库（通常是从画板返回）：告知自动保存与库页导航。
  // 仅在画板引导已看过之后触发，保证"先画布、后库页"的叙事顺序。
  useEffect(() => {
    if (!libraryOpen) return;
    if (activeTour || tourAutoShownRef.current.has(LIBRARY_TOUR.id)) return;
    if (!hasSeenTour(BOARD_TOUR.id, BOARD_TOUR.version)) return;
    if (hasSeenTour(LIBRARY_TOUR.id, LIBRARY_TOUR.version)) return;
    const timer = window.setTimeout(() => {
      tourAutoShownRef.current.add(LIBRARY_TOUR.id);
      setActiveTour(LIBRARY_TOUR);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [libraryOpen, activeTour]);

  // 画板已经积累出跨日回顾价值、且用户从未进入过画廊时，主动介绍一次入口与核心功能。
  useEffect(() => {
    if (!activeBoard || libraryOpen || galleryOpen || settingsOpen || editTargetId || openingBoardId) return;
    if (activeTour || tourAutoShownRef.current.has(GALLERY_TOUR.id)) return;
    if (!hasSeenTour(BOARD_TOUR.id, BOARD_TOUR.version)) return;
    if (hasSeenTour(GALLERY_TOUR.id, GALLERY_TOUR.version)) return;
    if (!hasGalleryTourContent(history, activeBoard.id, images)) return;
    const timer = window.setTimeout(() => {
      tourAutoShownRef.current.add(GALLERY_TOUR.id);
      setActiveTour(GALLERY_TOUR);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [activeBoard, activeTour, editTargetId, galleryOpen, history, images, libraryOpen, openingBoardId, settingsOpen]);

  // 引导依附的视图被外部关闭时收起对应引导（不写标记，下次进入再展示）。
  useEffect(() => {
    if (activeTour?.id === "edit" && !editTargetId) setActiveTour(null);
    if (activeTour?.id === "library" && !libraryOpen) setActiveTour(null);
  }, [activeTour, editTargetId, libraryOpen]);

  // 画板引导激活时预载演示图为 dataUrl，"生成完成"一步零等待揭示。
  useEffect(() => {
    if (activeTour?.id !== "board" || tourDemoDataUrlRef.current) return;
    let cancelled = false;
    void fetch(tourDemoImageUrl)
      .then((response) => response.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          })
      )
      .then((dataUrl) => {
        if (!cancelled) tourDemoDataUrlRef.current = dataUrl;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeTour]);

  const clearTourTyping = useCallback((): void => {
    if (tourTypingTimerRef.current !== null) {
      window.clearInterval(tourTypingTimerRef.current);
      tourTypingTimerRef.current = null;
    }
  }, []);

  // 模拟生成演示的三个副作用：自动打字 → 插入生成占位卡 → 揭示演示成品图。全部幂等，"上一步"重放安全。
  const handleTourStepEnter = useCallback(
    (stepId: string): void => {
      if (activeTour?.id === "gallery") {
        if (stepId === "entry") {
          setGalleryOpen(false);
          return;
        }
        const entry = document.querySelector<HTMLElement>('[data-tour="gallery-entry"]');
        const rect = entry?.getBoundingClientRect();
        openGallery(rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : { x: window.innerWidth - 160, y: 28 }, false);
        return;
      }
      if (activeTour?.id !== "board") return;
      // 菜单步骤保持画板菜单展开，进入其他步骤（含"上一步"退回）时收起。
      setTourBoardMenuOpen(stepId === "menu-boards" || stepId === "menu-manage" || stepId === "menu-replay");
      if (stepId === "demo-type") {
        clearTourTyping();
        if (prefersReducedMotion) {
          setInput((current) => ({ ...current, prompt: TOUR_DEMO_PROMPT }));
          return;
        }
        let length = 0;
        tourTypingTimerRef.current = window.setInterval(() => {
          length += 1;
          setInput((current) => ({ ...current, prompt: TOUR_DEMO_PROMPT.slice(0, length) }));
          if (length >= TOUR_DEMO_PROMPT.length) clearTourTyping();
        }, 45);
      } else if (stepId === "demo-generating") {
        clearTourTyping();
        setInput((current) => ({ ...current, prompt: TOUR_DEMO_PROMPT }));
        const demoPlaceholder: GeneratedImage = {
          id: TOUR_DEMO_IMAGE_ID,
          path: "",
          dataUrl: "",
          jobId: "",
          pending: true,
          pendingStartedAt: Date.now(),
          pendingPrompt: TOUR_DEMO_PROMPT,
          source: "generated",
          width: 1024,
          height: 1024
        };
        setImages((current) => [demoPlaceholder, ...current.filter((image) => image.id !== TOUR_DEMO_IMAGE_ID)]);
        setFocusTarget((current) => ({ key: TOUR_DEMO_IMAGE_ID, nonce: (current?.nonce ?? 0) + 1 }));
      } else if (stepId === "demo-result") {
        const dataUrl = tourDemoDataUrlRef.current ?? tourDemoImageUrl;
        setImages((current) =>
          current.map((image) =>
            image.id === TOUR_DEMO_IMAGE_ID
              ? { ...image, pending: false, pendingStartedAt: undefined, dataUrl, width: 1024, height: 1024 }
              : image
          )
        );
      }
    },
    [activeTour, prefersReducedMotion, clearTourTyping, openGallery]
  );

  const finishActiveTour = useCallback(
    (status: "completed" | "skipped"): void => {
      if (activeTour) markTourSeen(activeTour.id, activeTour.version, status);
      if (activeTour?.id === "board") {
        // 清理演示痕迹：停止打字、移除演示图、收起画板菜单；仅当输入框仍是演示文案（或其前缀）时清空。
        clearTourTyping();
        setImages((current) => current.filter((image) => image.id !== TOUR_DEMO_IMAGE_ID));
        setInput((current) =>
          current.prompt && TOUR_DEMO_PROMPT.startsWith(current.prompt) ? { ...current, prompt: "" } : current
        );
        setTourBoardMenuOpen(false);
      }
      setActiveTour(null);
    },
    [activeTour, clearTourTyping]
  );

  const replayOnboarding = useCallback((): void => {
    clearTourSeen(BOARD_TOUR.id, BOARD_TOUR.version);
    clearTourSeen(EDIT_TOUR.id, EDIT_TOUR.version);
    clearTourSeen(LIBRARY_TOUR.id, LIBRARY_TOUR.version);
    clearTourSeen(GALLERY_TOUR.id, GALLERY_TOUR.version);
    tourAutoShownRef.current.clear();
    setActiveTour(editTargetId ? EDIT_TOUR : BOARD_TOUR);
  }, [editTargetId]);

  const switchImageVersion = useCallback((imageId: string, index: number): void => {
    setImages((current) =>
      current.map((image) => {
        const version = image.versions?.[index];
        if (image.id !== imageId || !version) return image;
        return {
          ...image,
          activeVersion: index,
          path: version.path,
          dataUrl: version.dataUrl,
          jobId: version.jobId,
          width: version.width ?? image.width,
          height: version.height ?? image.height
        };
      })
    );
  }, []);

  const separateVersions = useCallback((
    imageId: string,
    versionIndex: number | undefined,
    placement: VersionSeparationPlacement
  ): void => {
    const source = imagesRef.current.find((image) => image.id === imageId);
    if (!source) return;
    if (versionSeparationMode === "copy") {
      const copies = versionIndex === undefined
        ? copyImageVersions(source, () => crypto.randomUUID(), placement)
        : (() => {
            const copy = createDetachedVersionImage(
              source,
              versionIndex,
              crypto.randomUUID(),
              placement.position
            );
            return copy ? [copy] : null;
          })();
      if (!copies) return;
      setImages((current) => current.flatMap((image) => image.id === imageId ? [image, ...copies] : [image]));
      iterlayToast.placed({
        title: versionIndex === undefined ? `已复制分离 ${copies.length} 个版本` : `v${versionIndex + 1} 已复制分离`,
        detail: "原版本仍保留在版本栈中",
        previews: copies.map((image) => image.dataUrl)
      });
      return;
    }

    const extracted = versionIndex === undefined
      ? separateImageVersions(source, () => crypto.randomUUID(), placement)
      : extractImageVersion(source, versionIndex, crypto.randomUUID(), placement.position);
    if (!extracted) return;
    setImages((current) => current.flatMap((image) => image.id === imageId ? extracted : [image]));
    iterlayToast.placed({
      title: versionIndex === undefined ? `已直接分离 ${extracted.length} 个版本` : `v${versionIndex + 1} 已直接分离`,
      detail: "已作为独立图片放入画板",
      previews: extracted.map((image) => image.dataUrl)
    });
  }, [versionSeparationMode]);

  // 编辑目标从画布消失（切换画板/删除）时自动收尾会话。
  useEffect(() => {
    if (!editTargetId) return;
    if (images.some((image) => image.id === editTargetId)) return;
    setEditTargetId(null);
    setEditSourceRect(null);
    setHistoryOpen(historyOpenBeforeEditRef.current);
    setInput((current) =>
      current.workflowMode === "edit"
        ? {
            ...current,
            workflowMode: "generate",
            useCase: getDefaultUseCase("generate"),
            sceneId: findSceneForMode(scenes, current.sceneId, "generate")?.id
          }
        : current
    );
  }, [images, editTargetId, scenes]);

  useEffect(() => {
    if (sliceTargetId && !images.some((image) => image.id === sliceTargetId)) setSliceTargetId(null);
  }, [images, sliceTargetId]);

  const toggleFavoriteScene = useCallback((id: string): void => {
    setFavoriteSceneIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeFavoriteSceneIds(next);
      return next;
    });
  }, []);

  const openTemplateDetail = useCallback((scene: SceneDefinition): void => {
    setLibraryInitialSceneRequest((current) => ({
      id: scene.id,
      nonce: (current?.nonce ?? 0) + 1
    }));
    setLibraryInitialTab("scenes");
    setLibraryOpen(true);
  }, []);

  const findImageSourceTemplate = useCallback((image: GeneratedImage): SceneDefinition | undefined => {
    const activeVersionJobId = image.versions?.[image.activeVersion ?? -1]?.jobId;
    const jobIds = [activeVersionJobId, image.jobId, ...image.versions?.map((version) => version.jobId) ?? []]
      .filter((jobId, index, values): jobId is string => Boolean(jobId) && values.indexOf(jobId) === index);
    const sceneId = jobIds
      .map((jobId) => history.find((job) => job.id === jobId)?.input.sceneId)
      .find((candidate): candidate is string => Boolean(candidate));
    return sceneId ? scenes.find((scene) => scene.id === sceneId) : undefined;
  }, [history, scenes]);

  const templateSourceImageIds = useMemo(
    () => images.filter((image) => findImageSourceTemplate(image)).map((image) => image.id),
    [findImageSourceTemplate, images]
  );

  const openImageSourceTemplate = useCallback((image: GeneratedImage): void => {
    const scene = findImageSourceTemplate(image);
    if (!scene) {
      toast.error("来源模板已删除，无法打开。");
      return;
    }
    setHistoryOpen(false);
    setCommentOpen(false);
    openTemplateDetail(scene);
  }, [findImageSourceTemplate, openTemplateDetail]);

  const applyScene = useCallback((scene: SceneDefinition): void => {
    setInput((current) => ({
      ...current,
      workflowMode: scene.mode,
      useCase: scene.useCase,
      sceneId: scene.id,
      promptSpec: undefined,
      quality: qualityEditedByUser ? current.quality : getDefaultQuality(scene.mode, scene.useCase)
    }));
    setLibraryOpen(false);
    toast.success(`已套用模板「${scene.name}」`);
  }, [qualityEditedByUser]);

  const saveScene = useCallback((draft: NewSceneInput): SceneDefinition => {
    const scene = createCustomScene(draft);
    setCustomScenes((current) => {
      const next = [scene, ...current];
      writeCustomScenes(next);
      return next;
    });
    iterlayToast.templateSaved({ name: scene.name, onNavigate: () => openTemplateDetail(scene) });
    return scene;
  }, [openTemplateDetail]);

  const updateScene = useCallback((scene: SceneDefinition, draft: NewSceneInput): SceneDefinition => {
    const updated = scene.source === "preset"
      ? createCustomSceneFromScene(scene, draft)
      : updateCustomScene(scene, draft);
    setCustomScenes((current) => {
      const next = scene.source === "preset"
        ? [updated, ...current]
        : current.map((item) => (item.id === scene.id ? updated : item));
      writeCustomScenes(next);
      return next;
    });
    iterlayToast.templateSaved({ name: updated.name, updated: true, onNavigate: () => openTemplateDetail(updated) });
    return updated;
  }, [openTemplateDetail]);

  const deleteScene = useCallback((id: string): void => {
    setCustomScenes((current) => {
      const next = current.filter((scene) => scene.id !== id);
      writeCustomScenes(next);
      return next;
    });
    setFavoriteSceneIds((current) => {
      if (!current.includes(id)) return current;
      const next = current.filter((item) => item !== id);
      writeFavoriteSceneIds(next);
      return next;
    });
    toast.success("模板已删除");
  }, []);

  async function exportSceneTemplate(scene: SceneDefinition): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      const result = await api.exportScene(scene);
      if (result.ok && result.path) {
        iterlayToast.exported({ title: "模板已导出", path: result.path });
      }
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

  async function submitSceneTemplate(
    scene: SceneDefinition,
    authorName: string,
    exampleResultIds: string[]
  ): Promise<TemplateSubmissionResult> {
    const api = getWorkbenchApi();
    if (!api) throw new Error("桌面应用通信未就绪，请重启 Iterlay 后重试。");
    const submission = await api.submitSceneTemplate(scene, authorName, exampleResultIds);
    toast.success("发布申请已提交，审核通过后会出现在模板广场");
    return submission;
  }

  async function getSceneTemplateSubmission(scene: SceneDefinition): Promise<TemplateSubmissionResult | null> {
    const api = getWorkbenchApi();
    if (!api) throw new Error("桌面应用通信未就绪，请重启 Iterlay 后重试。");
    return api.getSceneTemplateSubmission(scene.id);
  }

  async function importSceneTemplate(): Promise<SceneDefinition | null> {
    const api = getWorkbenchApi();
    if (!api) return null;
    try {
      const result = await api.importScene();
      if (!result) return null;
      return persistImportedSceneResults([result])[0] ?? null;
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "导入模板失败。"));
      return null;
    }
  }

  function persistImportedSceneResults(results: SceneTemplateImportResult[]): SceneDefinition[] {
    const importedScenes: SceneDefinition[] = results.map((result) => result.scene);
    if (importedScenes.length === 0) return [];
    setCustomScenes((current) => {
      const next = [...importedScenes, ...current];
      writeCustomScenes(next);
      return next;
    });
    results.forEach((result) => {
      const scene = result.scene;
      toast.success(
        result.instanceCount > 0
          ? `已导入模板「${scene.name}」和 ${result.instanceCount} 个实例`
          : `已导入模板「${scene.name}」`
      );
    });
    return importedScenes;
  }

  async function importSceneTemplateFiles(files: File[]): Promise<SceneDefinition[]> {
    const api = getWorkbenchApi();
    if (!api) return [];
    const results: SceneTemplateImportResult[] = [];
    for (const file of files) {
      try {
        results.push(await api.importSceneData(await file.arrayBuffer()));
      } catch (error) {
        toast.error(`导入 ${file.name} 失败：${getWorkbenchErrorMessage(error, "导入模板失败。")}`);
      }
    }
    return persistImportedSceneResults(results);
  }

  const optimizeSceneDescription = useCallback(
    async (scene: SceneDefinition, prompt: string, templatePrompt?: string): Promise<string> => {
      if (!hasImageWorkbenchApi()) throw new Error(missingImageWorkbenchMessage);
      const result = await getImageWorkbenchApi().enhancePrompt({
        prompt,
        workflowMode: scene.mode,
        useCase: scene.useCase,
        ...(templatePrompt ? { templatePrompt } : {})
      });
      refreshCreditStatus();
      return result.prompt;
    },
    [refreshCreditStatus]
  );

  const collaborateScene = useCallback(
    async (request: Omit<CollaborateSceneRequest, "textProviderId">): Promise<CollaborateSceneResult> => {
      if (!hasImageWorkbenchApi()) throw new Error(missingImageWorkbenchMessage);
      const activeBoardId = activeBoardRef.current?.id;
      const result = await getImageWorkbenchApi().collaborateScene({
        ...request,
        memoryQuery: {
          ...(activeBoardId ? { boardId: activeBoardId } : {}),
          ...request.memoryQuery
        }
      });
      refreshCreditStatus();
      return result;
    },
    [refreshCreditStatus]
  );

  const interpretCreateChat = useCallback(
    async (request: CollaborateSceneRequest): Promise<CollaborateSceneResult> => {
      if (!hasImageWorkbenchApi()) throw new Error(missingImageWorkbenchMessage);
      const result = await getImageWorkbenchApi().collaborateScene(request);
      refreshCreditStatus();
      return result;
    },
    [refreshCreditStatus]
  );

  const resolveTemplatePromptSet = useCallback(async (
    scene: SceneDefinition,
    request: string,
    referenceImages: CollaborateSceneRequest["referenceImages"],
    variationCount: number
  ): Promise<TemplatePromptSet> => {
    const normalizedVariationCount = Math.max(1, Math.min(3, Math.trunc(variationCount) || 1));
    const result = await collaborateScene({
      instruction: buildTemplatePreviewInstruction(
        referenceImages.length,
        normalizedVariationCount,
        scene.extractionScenario
      ),
      referenceImages,
      currentFields: [
        { label: "模板规则", value: scene.prompt },
        { label: "本次需求", value: request }
      ],
      generationSettings: {
        count: normalizedVariationCount,
        maxCount: normalizedVariationCount
      },
      clarificationRounds: 1,
      recordInHistory: false,
      assistantSurface: "canvas-prompt",
      memoryQuery: {
        ...(activeBoardRef.current?.id ? { boardId: activeBoardRef.current.id } : {}),
        sceneId: scene.id
      },
      workflowMode: scene.mode,
      useCase: scene.useCase
    });
    return createTemplatePromptSet(result, normalizedVariationCount);
  }, [collaborateScene]);

  const resolveTemplatePrompt = useCallback(async (
    scene: SceneDefinition,
    request: string,
    referenceImages: CollaborateSceneRequest["referenceImages"]
  ): Promise<string> => (
    await resolveTemplatePromptSet(scene, request, referenceImages, 1)
  ).basePrompt, [resolveTemplatePromptSet]);

  const resolveUiDesignBrief = useCallback(async (
    request: string,
    materials: ReferenceImagePayload[],
    scene: SceneDefinition | null
  ): Promise<UiDesignBrief> => {
    const descriptors = materials.map((material) => ({
      name: material.name,
      role: material.semanticRole ?? inferUiMaterialRole(material.name)
    }));
    const result = await collaborateScene({
      instruction: buildUiDesignBriefInstruction(descriptors, Boolean(scene)),
      locale,
      referenceImages: materials.map(({ name, mimeType, dataBase64 }) => ({
        name,
        mimeType,
        dataBase64
      })),
      currentFields: [
        ...(request.trim() ? [{ label: "用户需求", value: request.trim() }] : []),
        ...(descriptors.length > 0
          ? [{ label: "材料职责", value: descriptors.map((item, index) => `${index + 1}. ${item.name}：${item.role}`).join("\n") }]
          : []),
        ...(scene ? [{ label: "模板规则", value: scene.prompt }] : [])
      ],
      clarificationRounds: 1,
      recordInHistory: false,
      assistantSurface: "canvas-prompt",
      memoryQuery: {
        ...(activeBoardRef.current?.id ? { boardId: activeBoardRef.current.id } : {}),
        ...(scene ? { sceneId: scene.id } : {})
      },
      workflowMode: "generate",
      useCase: "ui-mockup"
    });
    return createUiDesignBrief(result);
  }, [collaborateScene, locale]);

  const openTemplateExtraction = useCallback((image: GeneratedImage): void => {
    if (!textProviderReady) {
      toast.error("沉淀模板需要先配置可用的文本 AI。");
      openProviderSetup();
      return;
    }
    const activeVersionJobId = image.versions?.[image.activeVersion ?? -1]?.jobId;
    const jobId = activeVersionJobId || image.jobId;
    const job = history.find((item) => item.id === jobId);
    const sourcePrompt = job?.prompt?.trim() || job?.input.prompt?.trim() || "";
    if (!image.dataUrl && !image.path) {
      toast.error("无法读取这张画板图片，暂时不能沉淀为模板。");
      return;
    }
    const workflowMode = job?.input.workflowMode ?? "generate";
    const useCase = job?.useCase ?? job?.input.useCase ?? getDefaultUseCase(workflowMode);
    const sourceScene = job?.input.sceneId ? scenes.find((scene) => scene.id === job.input.sceneId) : undefined;
    setTemplateExtractionSource({
      id: `${image.id}:${job?.id ?? image.activeVersion ?? "image"}`,
      imageUrl: image.dataUrl,
      imagePath: image.path,
      sourcePrompt,
      workflowMode,
      useCase,
      category: sourceScene?.category
    });
  }, [history, openProviderSetup, scenes, textProviderReady]);

  const extractTemplateFromCanvas = useCallback(async (
    source: TemplateExtractionSource,
    workflowMode: ImageWorkflowMode,
    scenario: TemplateExtractionScenario,
    onItems: (items: TemplateExtractionResult["items"]) => void
  ): Promise<TemplateExtractionResult> => {
    const api = getWorkbenchApi();
    const dataUrl = source.imageUrl.startsWith("data:")
      ? source.imageUrl
      : source.imagePath && api
        ? await api.readAssetDataUrl(source.imagePath)
        : "";
    const reference = dataUrlToReferencePayload(dataUrl, "已验证的画板结果", "reference");
    if (!reference) throw new Error("无法读取这张画板图片。");
    const extractionContext = retargetTemplateExtractionContext({
      sourcePrompt: source.sourcePrompt,
      workflowMode: source.workflowMode,
      useCase: source.useCase,
      category: source.category,
      extractionScenario: scenario
    }, workflowMode);
    const request = {
      instruction: buildTemplateExtractionInstruction(
        workflowMode,
        Boolean(source.sourcePrompt.trim()),
        scenario
      ),
      referenceImages: [{
        name: reference.name,
        mimeType: reference.mimeType,
        dataBase64: reference.dataBase64
      }],
      currentFields: parseSceneFields(source.sourcePrompt).map((field) => ({
        label: field.label || "生成提示词",
        value: field.value
      })),
      workflowMode,
      useCase: extractionContext.useCase,
      assistantSurface: "scene-template",
      recordInHistory: false,
      memoryQuery: source.imagePath ? { assetPath: source.imagePath } : undefined
    } satisfies CollaborateSceneRequest;
    const result = await new Promise<CollaborateSceneResult>((resolve, reject) => {
      startSceneCollaborationStream(request, {
        onDelta: () => undefined,
        onFields: (fields) => onItems(parseTemplateExtractionItems({ message: "", fields })),
        onResult: resolve,
        onError: (message) => reject(new Error(message)),
        onCancelled: () => reject(new Error("已停止提炼模板。"))
      });
    });
    refreshCreditStatus();
    return createTemplateExtractionFromAssistant(result, extractionContext);
  }, [getWorkbenchApi, refreshCreditStatus]);

  const saveExtractedTemplate = useCallback(async (
    source: TemplateExtractionSource,
    draft: NewSceneInput,
    decision: TemplateExtractionSaveDecision
  ): Promise<void> => {
    const scene = decision.action === "replace"
      ? updateScene(decision.template, draft)
      : saveScene(draft);
    const api = getWorkbenchApi();
    if (api && source.imagePath) {
      try {
        await api.addSceneExample(scene.id, source.imagePath, scene.prompt);
      } catch (error) {
        toast.warning(getWorkbenchErrorMessage(error, "模板已保存，但示例图暂时无法加入。"));
      }
    }
    setTemplateExtractionSource(null);
  }, [getWorkbenchApi, saveScene, updateScene]);

  const openLibrary = useCallback((initialTab?: LibraryInitialTab): void => {
    setLibraryInitialTab(initialTab);
    setLibraryOpen(true);
  }, []);

  const changePrompt = useCallback((prompt: string): void => {
    setInput((current) => ({
      ...current,
      prompt
    }));
  }, []);

  const startEmptyCanvasPrompt = useCallback((prompt?: string): void => {
    if (prompt !== undefined) changePrompt(prompt);
    setPromptFocusNonce((current) => current + 1);
  }, [changePrompt]);

  const applySuggestedEdit = useCallback((prompt: string): void => {
    setInput((current) => ({ ...current, prompt, sceneId: undefined }));
  }, []);

  const updateInput = useCallback((patch: Partial<GenerateImageInput>): void => {
    if (patch.quality) setQualityEditedByUser(true);
    setInput((current) => ({ ...current, ...patch }));
  }, []);

  const addReferencePayloads = useCallback((payloads: ReferenceImagePayload[]): void => {
    if (payloads.length === 0) return;
    setInput((current) => {
      const existingKeys = new Set(current.referenceImages.map((image) => image.dataBase64));
      const fresh = payloads
        .filter((payload) => !existingKeys.has(payload.dataBase64))
        .map((payload) => current.creationMode === "ui-design" && !payload.semanticRole
          ? { ...payload, semanticRole: inferUiMaterialRole(payload.name) }
          : payload);
      if (fresh.length === 0) return current;
      return { ...current, referenceImages: [...current.referenceImages, ...fresh].slice(0, 4) };
    });
  }, []);

  const onReferenceFiles = useCallback(async (files: FileList | null): Promise<void> => {
    if (!files) return;
    const current = inputRef.current;
    const role: ReferenceImageRole = current.workflowMode === "edit" ? "edit-target" : "reference";
    const selected = Array.from(files).slice(0, Math.max(0, 4 - current.referenceImages.length));
    const payloads = await Promise.all(selected.map((file) => fileToReferencePayload(file, role)));
    addReferencePayloads(payloads);
  }, [addReferencePayloads]);

  // Add images dropped or pasted onto the canvas as "upload" nodes (they share the canvas with generated images).
  async function addUploadedImages(
    files: FileList | File[] | null,
    imageUrls: string[] = [],
    dropPosition?: CanvasDropPoint,
    options: {
      notifyPlacement?: boolean;
      generationReferenceTarget?: GenerationReferencePlacementTarget;
    } = {}
  ): Promise<GeneratedImage[]> {
    const originBoard = activeBoardRef.current;
    const fileList = files ? Array.from(files) : [];
    // 拖入 .itb / 旧版 .irb 画板包走导入流程，其余按图片处理。
    const boardFiles = fileList.filter((file) => /\.(itb|irb)$/i.test(file.name));
    const videoFiles = fileList.filter((file) => file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name));
    if (boardFiles.length > 0) void importBoardFiles(boardFiles);
    const imageFiles = fileList.filter((file) => file.type.startsWith("image/"));
    // 浏览器拖出图片时常同时携带临时文件与远程 URL，优先本地文件避免重复导入。
    const remoteUrls = imageFiles.length > 0 ? [] : imageUrls;
    if (imageFiles.length === 0 && remoteUrls.length === 0) {
      if (boardFiles.length === 0 && videoFiles.length === 0) toast.error("未识别到图片、视频或可导入链接。");
      return [];
    }
    const api = getWorkbenchApi();
    const uploadedFiles: GeneratedImage[] = await Promise.all(
      imageFiles.map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file);
        const size = await loadImageSize(dataUrl);
        // 落盘拿到路径后画板才能持久化引用；失败时仅本次会话可见。
        let path = "";
        try {
          if (api) path = (await api.importUploadedImage(dataUrl)).path;
        } catch {
          /* 保持 path 为空 */
        }
        return {
          id: crypto.randomUUID(),
          path,
          dataUrl,
          jobId: `upload-${crypto.randomUUID()}`,
          source: "upload" as const,
          width: size.width || undefined,
          height: size.height || undefined
        };
      })
    );
    const remoteResults = api
      ? await Promise.allSettled(
          remoteUrls.map(async (imageUrl): Promise<GeneratedImage> => {
            const imported = await api.importImageUrl(imageUrl);
            return {
              id: crypto.randomUUID(),
              path: imported.path,
              dataUrl: imported.dataUrl,
              jobId: `upload-${crypto.randomUUID()}`,
              source: "upload",
              width: imported.width,
              height: imported.height
            };
          })
        )
      : [];
    const uploadedRemote = remoteResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const failedRemote = remoteResults.filter((result) => result.status === "rejected");
    if (failedRemote.length > 0) {
      const first = failedRemote[0];
      const message = first?.status === "rejected"
        ? getWorkbenchErrorMessage(first.reason, "图片链接下载失败。")
        : "图片链接下载失败。";
      toast.error(remoteUrls.length === 1 ? message : `${failedRemote.length} 个图片链接导入失败：${message}`);
    }

    const imported = [...uploadedFiles, ...uploadedRemote];
    const uploaded = options.generationReferenceTarget
      ? placeGenerationReferenceImages(imported, options.generationReferenceTarget)
      : imported.map((image, index, all) => {
          if (!dropPosition) return image;
          if (index === 0) {
            return {
              ...image,
              preserveViewportOnCreate: true,
              placementPosition: centerNodeAtDrop(dropPosition, IMAGE_NODE_WIDTH, image.width, image.height)
            };
          }
          return { ...image, preserveViewportOnCreate: true, placementAnchorId: all[index - 1].id };
        });
    if (uploaded.length === 0) return [];
    if (originBoard && activeBoardRef.current?.id !== originBoard.id) {
      const persistable = uploaded.filter((image) => image.path);
      if (api && persistable.length > 0) {
        await api.appendBoardNodes(
          originBoard.id,
          persistable.map((image) => ({
            id: image.id,
            imagePath: image.path,
            jobId: image.jobId,
            source: image.source ?? "upload",
            width: image.width,
            height: image.height
          }))
        );
        boardDetailCacheRef.current.delete(originBoard.id);
        void refreshBoards();
        iterlayToast.result({
          count: persistable.length,
          title: `已添加 ${persistable.length} 张图片`,
          boardName: originBoard.name,
          previews: persistable.map((image) => image.dataUrl),
          onNavigate: () => void openBoard(originBoard.id)
        });
      }
      if (persistable.length < uploaded.length) {
        toast.warning(`${uploaded.length - persistable.length} 张图片未能保存到来源画板。`);
      }
      return [];
    }
    setImages((current) => [...uploaded, ...current]);
    if (options.notifyPlacement !== false) {
      iterlayToast.placed({
        title: `已添加 ${uploaded.length} 张图片到画布`,
        detail: "可用作生成参考图",
        previews: uploaded.map((image) => image.dataUrl),
        onUseReference: () => uploaded.forEach((image) => void addImageReference(image))
      });
    }
    return uploaded;
  }

  async function addUploadedVideos(files: File[], dropPosition?: CanvasDropPoint): Promise<void> {
    const videoFiles = files.filter((file) => file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name));
    if (videoFiles.length === 0) return;
    const originBoard = activeBoardRef.current;
    if (!originBoard) {
      toast.error("请先打开一个画板。");
      return;
    }
    const api = getImageWorkbenchApi();
    const imported: Array<{ node: BoardVideoNode; url: string }> = [];
    for (const [index, file] of videoFiles.entries()) {
      try {
        const metadata = await loadVideoMetadata(file);
        const result = await api.importVideo(
          await file.arrayBuffer(),
          file.type || inferVideoMimeType(file.name)
        );
        const node: BoardVideoNode = {
          id: crypto.randomUUID(),
          type: "video",
          title: file.name.replace(/\.[^.]+$/, "") || "视频",
          x: (dropPosition?.x ?? 0) - VIDEO_NODE_WIDTH / 2 + index * 32,
          y: (dropPosition?.y ?? 0) - VIDEO_NODE_HEIGHT / 2 + index * 32,
          videoPath: result.path,
          jobId: `upload-${crypto.randomUUID()}`,
          source: "upload",
          mimeType: result.mimeType,
          width: metadata.width,
          height: metadata.height,
          durationMs: metadata.durationMs,
          displayWidth: VIDEO_NODE_WIDTH,
          displayHeight: VIDEO_NODE_HEIGHT
        };
        imported.push({ node, url: result.videoUrl });
      } catch (error) {
        toast.error(getWorkbenchErrorMessage(error, `无法导入 ${file.name}`));
      }
    }
    if (imported.length === 0) return;
    if (activeBoardRef.current?.id !== originBoard.id) {
      await api.appendBoardNodes(originBoard.id, imported.map(({ node }) => {
        // Coordinates belong to the current canvas; background append computes its own placement.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { x: _x, y: _y, ...unpositioned } = node;
        return unpositioned;
      }));
      boardDetailCacheRef.current.delete(originBoard.id);
      toast.success(`已将 ${imported.length} 个视频加入「${originBoard.name}」`);
      return;
    }
    setVideoUrls((current) => Object.fromEntries([
      ...Object.entries(current),
      ...imported.map(({ node, url }) => [node.videoPath, url] as const)
    ]));
    setWorkflowNodes((current) => {
      const next = [...current, ...imported.map(({ node }) => node)];
      workflowNodesRef.current = next;
      return next;
    });
    scheduleBoardSave();
    toast.success(imported.length === 1 ? "视频已添加到画布" : `已添加 ${imported.length} 个视频到画布`);
  }

  const addUploadedImagesRef = useRef(addUploadedImages);
  addUploadedImagesRef.current = addUploadedImages;
  const addUploadedVideosRef = useRef(addUploadedVideos);
  addUploadedVideosRef.current = addUploadedVideos;
  const handleImportGenerationReferences = useCallback((
    files: File[],
    target: GenerationReferencePlacementTarget
  ): Promise<GeneratedImage[]> => addUploadedImagesRef.current(
    files,
    [],
    undefined,
    { notifyPlacement: false, generationReferenceTarget: target }
  ), []);
  const handleDropImages = useCallback((payload: {
    files: File[];
    imageUrls: string[];
    position?: CanvasDropPoint;
  }): void => {
    void addUploadedImagesRef.current(payload.files, payload.imageUrls, payload.position);
    void addUploadedVideosRef.current(payload.files, payload.position);
  }, []);

  const handlePasteCanvasImages = useCallback((
    items: CanvasClipboardItem[],
    action: "paste" | "duplicate" = "paste"
  ): void => {
    const copies = duplicateClipboardImages(items, () => crypto.randomUUID());
    if (copies.length === 0) return;
    setImages((current) => [...current, ...copies]);
    iterlayToast.placed({
      title: action === "duplicate"
        ? copies.length === 1 ? "已创建图片副本" : `已创建 ${copies.length} 个图片副本`
        : `已粘贴 ${copies.length} 张图片`,
      detail: action === "duplicate" ? "副本已排列在原图旁" : "已放到鼠标位置",
      previews: copies.map((image) => image.dataUrl)
    });
  }, []);

  const addRecentAssetsToCanvas = useCallback((assets: AssetLibraryItem[]): void => {
    if (assets.length === 0) return;
    const imageAssets = assets.filter((asset) => asset.mediaType !== "video");
    const videoAssets = assets.filter((asset) => asset.mediaType === "video");
    const imageIds = imageAssets.map(() => crypto.randomUUID());
    const addedImages: GeneratedImage[] = imageAssets.map((asset, index) => ({
      id: imageIds[index],
      path: asset.imagePath,
      dataUrl: asset.dataUrl,
      jobId: asset.jobId,
      source: asset.source,
      width: asset.width,
      height: asset.height,
      selectOnCreate: index === 0,
      placementAnchorId: index > 0 ? imageIds[index - 1] : undefined
    }));
    if (addedImages.length > 0) setImages((current) => [...addedImages, ...current]);
    if (videoAssets.length > 0) {
      const videoNodes = videoAssets.map((asset, index): BoardVideoNode => ({
        id: crypto.randomUUID(),
        type: "video",
        title: asset.prompt || "视频",
        x: index * 32,
        y: index * 32,
        videoPath: asset.imagePath,
        jobId: asset.jobId,
        source: asset.source === "upload" ? "upload" : "generated",
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        displayWidth: VIDEO_NODE_WIDTH,
        displayHeight: VIDEO_NODE_HEIGHT
      }));
      setVideoUrls((current) => Object.fromEntries([
        ...Object.entries(current),
        ...videoAssets.map((asset) => [asset.imagePath, asset.dataUrl] as const)
      ]));
      setWorkflowNodes((current) => {
        const next = [...videoNodes, ...current];
        workflowNodesRef.current = next;
        return next;
      });
      scheduleBoardSave();
    }
    iterlayToast.placed({
      title: assets.length === 1 ? "已将素材放入画板" : `已将 ${assets.length} 项素材放入画板`,
      detail: assets.length === 1 ? `来自「${assets[0].boardName}」` : "已按选择顺序排列",
      previews: assets.map((asset) => asset.thumbnailUrl || asset.dataUrl)
    });
  }, [scheduleBoardSave]);

  // 前 9 个最近画板对应 Command/Ctrl + 1-9；切换复用完整的保存与预加载流程。
  useEffect(() => {
    if (
      !activeBoard ||
      libraryOpen ||
      galleryOpen ||
      settingsOpen ||
      shortcutHelpOpen ||
      editTargetId ||
      advancedEditOpen ||
      sliceTargetId ||
      wechatExportRequest ||
      deleteTargetIds ||
      activeTour ||
      openingBoardId
    ) return;
    const activeBoardId = activeBoard.id;

    function handleBoardShortcut(event: KeyboardEvent): void {
      const shortcutIndex = resolveBoardShortcutIndex({
        key: event.key,
        code: event.code,
        commandKey: IS_MAC_PLATFORM ? event.metaKey : event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat
      });
      if (shortcutIndex === null) return;

      const target = sortBoardsByRecentUse(boards).slice(0, MAX_BOARD_SHORTCUTS)[shortcutIndex];
      if (!target) return;
      event.preventDefault();
      if (target.id !== activeBoardId) void openBoard(target.id);
    }

    window.addEventListener("keydown", handleBoardShortcut);
    return () => window.removeEventListener("keydown", handleBoardShortcut);
  }, [
    activeBoard,
    activeTour,
    advancedEditOpen,
    boards,
    deleteTargetIds,
    editTargetId,
    galleryOpen,
    libraryOpen,
    openBoard,
    openingBoardId,
    settingsOpen,
    shortcutHelpOpen,
    sliceTargetId,
    wechatExportRequest
  ]);

  // 全局设置快捷键：macOS 使用 Command + ,，其他平台同时支持 Ctrl + ,。
  useEffect(() => {
    function handleSettingsShortcut(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.code !== "Comma") return;
      event.preventDefault();
      setSettingsOpen(true);
    }
    window.addEventListener("keydown", handleSettingsShortcut);
    return () => window.removeEventListener("keydown", handleSettingsShortcut);
  }, []);

  // 快捷键帮助是画板级全局入口：即使焦点在提示词输入框中也可以直接打开。
  useEffect(() => {
    if (
      shortcutHelpOpen ||
      libraryOpen ||
      galleryOpen ||
      settingsOpen ||
      editTargetId ||
      advancedEditOpen ||
      sliceTargetId ||
      wechatExportRequest ||
      deleteTargetIds ||
      activeTour ||
      openingBoardId ||
      pendingComment
    ) return;

    function handleShortcutHelpCommand(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.isComposing) return;
      if (!isShortcutHelpCommand({
        key: event.key,
        code: event.code,
        commandKey: IS_MAC_PLATFORM ? event.metaKey : event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat
      })) return;
      event.preventDefault();
      setShortcutHelpOpen(true);
    }

    window.addEventListener("keydown", handleShortcutHelpCommand);
    return () => window.removeEventListener("keydown", handleShortcutHelpCommand);
  }, [
    activeTour,
    advancedEditOpen,
    deleteTargetIds,
    editTargetId,
    galleryOpen,
    libraryOpen,
    openingBoardId,
    pendingComment,
    settingsOpen,
    shortcutHelpOpen,
    sliceTargetId,
    wechatExportRequest
  ]);

  // 快捷键 C：进入/退出评论模式；Esc 退出评论态或关闭待输入。
  // 输入框聚焦、编辑会话、画板库/设置打开时不触发，避免与文字输入冲突。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        if (pendingComment) setPendingComment(null);
        if (commentMode) setCommentMode(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        (event.key === "c" || event.key === "C") &&
        !editTargetId &&
        !wechatExportRequest &&
        !libraryOpen &&
        !settingsOpen
      ) {
        event.preventDefault();
        setCommentMode((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commentMode, pendingComment, editTargetId, libraryOpen, settingsOpen, wechatExportRequest]);

  // Reference an image already on the canvas (generated or uploaded).
  const addImageReference = useCallback(async (image: GeneratedImage): Promise<void> => {
    const current = inputRef.current;
    if (current.referenceImages.length >= 4) {
      toast.error("最多引用 4 张参考图。");
      return;
    }
    const role: ReferenceImageRole = current.workflowMode === "edit" ? "edit-target" : "reference";
    const name = image.source === "upload" ? "上传图片" : image.source === "slice" ? "切图图片" : "生成图片";
    let source = image.dataUrl;
    if (!source.startsWith("data:") && image.path) {
      try {
        source = await getImageWorkbenchApi().readAssetDataUrl(image.path);
      } catch {
        toast.error("无法读取该图片。");
        return;
      }
    }
    const payload = dataUrlToReferencePayload(source, name, role);
    if (!payload) {
      toast.error("无法将该图片用作参考图。");
      return;
    }
    payload.sourceNodeId = image.id;
    if (current.referenceImages.some((item) => item.dataBase64 === payload.dataBase64)) {
      toast("该图片已在参考图中");
      return;
    }
    addReferencePayloads([payload]);
    iterlayToast.referenceAdded({
      imageUrl: source,
      count: Math.min(4, current.referenceImages.length + 1)
    });
  }, [addReferencePayloads]);

  const toggleImageReference = useCallback(async (image: GeneratedImage): Promise<void> => {
    const existingReference = inputRef.current.referenceImages.find(
      (reference) => reference.sourceNodeId === image.id
    );
    if (existingReference) {
      setInput((current) => ({
        ...current,
        referenceImages: current.referenceImages.filter(
          (reference) => reference.sourceNodeId !== image.id
        )
      }));
      return;
    }
    await addImageReference(image);
  }, [addImageReference]);

  const addImageReferences = useCallback(async (
    selectedImages: GeneratedImage[],
    successDetail?: string
  ): Promise<void> => {
    const current = inputRef.current;
    const availableSlots = Math.max(0, 4 - current.referenceImages.length);
    if (availableSlots === 0) {
      toast.error("最多引用 4 张参考图。");
      return;
    }

    const images = selectedImages.filter((image) => !image.pending);
    if (images.length === 0) {
      toast.error("生成中的图片暂不能用作参考图。");
      return;
    }

    const role: ReferenceImageRole = current.workflowMode === "edit" ? "edit-target" : "reference";
    const existingData = new Set(current.referenceImages.map((image) => image.dataBase64));
    const existingNodeIds = new Set(
      current.referenceImages.map((image) => image.sourceNodeId).filter((id): id is string => Boolean(id))
    );
    const payloads: ReferenceImagePayload[] = [];
    let duplicateCount = 0;
    let failedCount = 0;
    let limitSkipped = 0;

    for (let index = 0; index < images.length; index += 1) {
      if (payloads.length >= availableSlots) {
        limitSkipped = images.length - index;
        break;
      }

      const image = images[index];
      if (existingNodeIds.has(image.id)) {
        duplicateCount += 1;
        continue;
      }

      let source = image.dataUrl;
      if (!source.startsWith("data:") && image.path) {
        try {
          source = await getImageWorkbenchApi().readAssetDataUrl(image.path);
        } catch {
          failedCount += 1;
          continue;
        }
      }
      const payload = dataUrlToReferencePayload(
        source,
        image.source === "upload" ? "上传图片" : image.source === "slice" ? "切图图片" : "生成图片",
        role
      );
      if (!payload) {
        failedCount += 1;
        continue;
      }
      if (existingData.has(payload.dataBase64)) {
        duplicateCount += 1;
        continue;
      }

      if (imagesRef.current.some((currentImage) => currentImage.id === image.id)) {
        payload.sourceNodeId = image.id;
      }
      existingData.add(payload.dataBase64);
      existingNodeIds.add(image.id);
      payloads.push(payload);
    }

    if (payloads.length === 0) {
      if (duplicateCount > 0 && failedCount === 0) toast("所选图片已在参考图中");
      else toast.error("无法将所选图片用作参考图。");
      return;
    }

    addReferencePayloads(payloads);
    const details: string[] = successDetail ? [successDetail] : [];
    if (duplicateCount > 0) details.push(`跳过 ${duplicateCount} 张已加入的图片`);
    if (failedCount > 0) details.push(`跳过 ${failedCount} 张不可读取的图片`);
    if (limitSkipped > 0) details.push(`另有 ${limitSkipped} 张超出 4 张上限`);
    iterlayToast.referenceAdded({
      imageUrls: payloads.map((payload) => `data:${payload.mimeType};base64,${payload.dataBase64}`),
      count: Math.min(4, current.referenceImages.length + payloads.length),
      addedCount: payloads.length,
      detail: details.length > 0 ? details.join("；") : undefined
    });
  }, [addReferencePayloads]);

  const handlePastePromptImages = useCallback(async (files: File[]): Promise<void> => {
    const uploaded = await addUploadedImagesRef.current(files, [], undefined, { notifyPlacement: false });
    if (uploaded.length === 0) return;
    if (inputRef.current.referenceImages.length >= 4) {
      toast.info("图片已上传到画板；参考图已达 4 张上限。");
      return;
    }
    await addImageReferences(uploaded, "已上传到画板");
  }, [addImageReferences]);

  const handlePasteAdvancedEditImages = useCallback(async (
    files: File[]
  ): Promise<Array<{ name: string; dataUrl: string }>> => {
    const uploaded = await addUploadedImagesRef.current(files, [], undefined, { notifyPlacement: false });
    return uploaded.map((image, index) => ({
      name: files[index]?.name || "粘贴图片",
      dataUrl: image.dataUrl
    }));
  }, []);

  const handlePasteAdvancedCanvasReferences = useCallback(async (
    selectedImages: GeneratedImage[]
  ): Promise<Array<{ name: string; dataUrl: string }>> => {
    const references: Array<{ name: string; dataUrl: string }> = [];
    for (const image of selectedImages) {
      let dataUrl = image.dataUrl;
      if (!dataUrl.startsWith("data:") && image.path) {
        dataUrl = await getImageWorkbenchApi().readAssetDataUrl(image.path);
      }
      if (!dataUrl.startsWith("data:")) continue;
      references.push({
        name: image.source === "upload" ? "上传图片" : image.source === "slice" ? "切图图片" : "生成图片",
        dataUrl
      });
    }
    return references;
  }, []);

  const removeReference = useCallback((id: string): void => {
    setInput((current) => ({
      ...current,
      referenceImages: current.referenceImages.filter((image) => image.id !== id)
    }));
  }, []);

  async function reuseJob(job: GenerationJob): Promise<void> {
    // 编辑参数只在编辑会话里有意义；不在会话中时按生成模式复用（模式切换已从输入框移除）。
    const workflowMode = job.input.workflowMode === "edit" && !editTargetId ? "generate" : job.input.workflowMode || "generate";
    setInput({
      ...initialInput,
      ...job.input,
      workflowMode,
      useCase: job.input.useCase || job.useCase || getDefaultUseCase(workflowMode),
      promptSpec: job.input.promptSpec || initialPromptSpec,
      referenceImages: []
    });
    setQualityEditedByUser(Boolean(job.input.quality));

    // 复用历史里保存的参考图：按 referenceImagePaths 从本机读回并回填输入框。
    const role: ReferenceImageRole = workflowMode === "edit" ? "edit-target" : "reference";
    const paths = (job.referenceImagePaths ?? []).slice(0, 4);
    const payloads: ReferenceImagePayload[] = [];
    const api = getWorkbenchApi();
    if (api && paths.length > 0) {
      for (const path of paths) {
        try {
          const dataUrl = await api.readAssetDataUrl(path);
          const payload = dataUrlToReferencePayload(dataUrl, "参考图", role);
          if (payload) payloads.push(payload);
        } catch {
          /* 单张参考图读取失败时跳过，不阻断整体复用 */
        }
      }
    }

    if (payloads.length > 0) {
      setInput((current) => ({ ...current, referenceImages: payloads }));
      setStatus("已复用提示词和参考图。");
      toast("已复用提示词和参考图");
    } else {
      setStatus("已复用提示词。");
      toast("已复用提示词");
    }
  }

  function focusJob(job: GenerationJob): void {
    const image = images.find((item) => item.jobId === job.id);
    if (!image) {
      // 原图不在当前画布（已删除 / 旧会话 / 失败任务）：只提示，不改动输入框；
      // 需要重新生成时用卡片右下角的复用按钮。
      toast("原图不在当前画布，可用卡片右下角按钮复用参数重新生成");
      return;
    }
    if (!historyOpen) setHistoryOpen(true);
    setFocusTarget((current) => ({ key: imageKey(image), nonce: (current?.nonce ?? 0) + 1 }));
  }

  // ---------- 评论（持久化，按图片文件 imagePath 归属；画布评论栏与素材详情共用） ----------

  async function persistComment(
    imagePath: string,
    text: string,
    position?: AssetComment["position"]
  ): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      const comment = await api.addComment(imagePath, text, position);
      setComments((current) => [comment, ...current]);
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

  const handleCommentImage = useCallback((
    image: GeneratedImage,
    x: number,
    y: number,
    position: NonNullable<AssetComment["position"]>
  ): void => {
    if (!image.path) {
      toast.error("该图片尚未保存，暂不能评论。");
      return;
    }
    // 点击图片后退出评论光标态，在点击处弹出输入框。
    setCommentMode(false);
    setPendingComment({ imagePath: image.path, x, y, position });
  }, []);

  async function submitComment(text: string): Promise<void> {
    if (!pendingComment) return;
    const { imagePath, position } = pendingComment;
    setPendingComment(null);
    await persistComment(imagePath, text, position);
    // 提交后弹出评论栏（与历史栏互斥占用右侧）。
    setHistoryOpen(false);
    setCommentOpen(true);
  }

  const deleteComment = useCallback((id: string): void => {
    setComments((current) => current.filter((comment) => comment.id !== id));
    const api = getWorkbenchApi();
    void api?.removeComment(id).catch(reportWorkbenchError);
  }, [getWorkbenchApi, reportWorkbenchError]);

  const moveComment = useCallback((
    id: string,
    position: NonNullable<AssetComment["position"]>
  ): void => {
    setComments((current) => current.map((comment) => (
      comment.id === id ? { ...comment, position } : comment
    )));
    const api = getWorkbenchApi();
    void api?.updateCommentPosition(id, position).catch((error) => {
      reportWorkbenchError(error);
      void api.listComments().then(setComments).catch(reportWorkbenchError);
    });
  }, [getWorkbenchApi, reportWorkbenchError]);

  const focusCommentImage = useCallback((imagePath: string): void => {
    const image = imagesRef.current.find((item) => item.path === imagePath);
    if (!image) return;
    setFocusTarget((current) => ({ key: imageKey(image), nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  // 素材库"进入画板并定位"：打开来源画板后居中并选中该节点。
  async function locateAsset(boardId: string, nodeId: string): Promise<void> {
    await openBoard(boardId);
    requestAnimationFrame(() =>
      setFocusTarget((current) => ({ key: nodeId, nonce: (current?.nonce ?? 0) + 1 }))
    );
  }

  async function locateOnlineShare(boardId: string, nodeIds: string[]): Promise<void> {
    if (!boards.some((board) => board.id === boardId)) {
      toast.error("分享内容所在的画板已被删除。");
      return;
    }
    await openBoard(boardId);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const availableIds = nodeIds.filter((nodeId) =>
        imagesRef.current.some((image) => image.id === nodeId)
      );
      if (availableIds.length === 0) {
        toast.error("分享的图片已不在来源画板中。");
        return;
      }
      if (availableIds.length === 1) {
        setFocusTarget((current) => ({
          key: availableIds[0],
          nonce: (current?.nonce ?? 0) + 1
        }));
        return;
      }
      setSelectionTarget((current) => ({
        ids: availableIds,
        nonce: (current?.nonce ?? 0) + 1
      }));
    }));
  }

  // 场景历史可来自任意画板。先切换来源画板，再按图片路径或版本链匹配节点并聚焦。
  async function locateSceneHistory(job: GenerationJob, imagePath: string): Promise<void> {
    const boardId = job.boardId ?? activeBoardRef.current?.id;
    if (!boardId) {
      toast.error("这条历史没有可用的来源画板。");
      return;
    }
    if (job.boardId && !boards.some((board) => board.id === job.boardId)) {
      toast.error("来源画板已删除，无法定位这张图片。");
      return;
    }

    await openBoard(boardId);
    setLibraryOpen(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = imagesRef.current.find(
          (image) =>
            image.path === imagePath ||
            image.jobId === job.id ||
            image.versions?.some((version) => version.path === imagePath || version.jobId === job.id)
        );
        if (!target) {
          toast("图片已不在来源画板，可复用参数重新生成");
          return;
        }
        setFocusTarget((current) => ({ key: imageKey(target), nonce: (current?.nonce ?? 0) + 1 }));
      })
    );
  }

  async function reuseSceneHistory(job: GenerationJob): Promise<void> {
    await reuseJob(job);
    setLibraryOpen(false);
  }

  async function addSceneHistoryAsReference(imagePath: string): Promise<void> {
    try {
      const dataUrl = await getImageWorkbenchApi().readAssetDataUrl(imagePath);
      const role = inputRef.current.workflowMode === "edit" ? "edit-target" as const : "reference" as const;
      const payload = dataUrlToReferencePayload(dataUrl, "模板历史图片", role);
      if (!payload) throw new Error("无法读取这张历史图片。");
      addReferencePayloads([payload]);
      setLibraryOpen(false);
      iterlayToast.referenceAdded({
        imageUrl: dataUrl,
        count: Math.min(4, inputRef.current.referenceImages.length + 1)
      });
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

  // ---------- 素材库回调 ----------

  async function reusePromptFromLibrary(prompt: string, promptSpec?: PromptSpec): Promise<void> {
    setInput((current) => ({
      ...current,
      workflowMode: "generate" as const,
      prompt,
      promptSpec: promptSpec ?? initialPromptSpec
    }));
    setLibraryOpen(false);
    toast("已填入提示词");
  }

  async function editAssetFromLibrary(boardId: string, nodeId: string): Promise<void> {
    await openBoard(boardId);
    setLibraryOpen(false);
    // Wait for canvas images to settle, then find the node and enter edit session.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = imagesRef.current.find((img) => img.id === nodeId);
        if (target) enterEditSession(target);
      })
    );
  }

  const handleDeepLink = useCallback(async (link: IterlayDeepLink): Promise<void> => {
    const closeTransientSurfaces = (): void => {
      setSettingsOpen(false);
      setGalleryOpen(false);
      setReferralInviteOpen(false);
    };

    if (link.kind === "library") {
      closeTransientSurfaces();
      const tab = link.tab === "templates" ? "scenes" : link.tab;
      openLibrary(tab);
      return;
    }

    if (link.kind === "settings") {
      setGalleryOpen(false);
      setReferralInviteOpen(false);
      setLibraryOpen(false);
      setSettingsEntryPoint(
        link.section === "providers"
          ? "provider-setup"
          : link.section === "models"
            ? "model-management"
            : "default"
      );
      setSettingsOpen(true);
      return;
    }

    if (link.kind === "template") {
      const scene = scenes.find((candidate) => candidate.id === link.templateId);
      if (!scene) {
        toast.error("链接中的模板不存在或已被删除。");
        return;
      }
      closeTransientSurfaces();
      if (link.action === "apply") {
        applyScene(scene);
        setPromptFocusNonce((current) => current + 1);
      } else {
        setLibraryInitialSceneRequest((current) => ({
          id: scene.id,
          nonce: (current?.nonce ?? 0) + 1
        }));
        openLibrary("scenes");
      }
      return;
    }

    if (link.kind === "compose") {
      if (link.boardId && !await loadBoardDetail(link.boardId)) {
        toast.error("链接中的画板不存在或已被删除。");
        return;
      }
      const template = link.templateId
        ? scenes.find((candidate) => candidate.id === link.templateId)
        : undefined;
      if (link.templateId && !template) {
        toast.error("链接中的模板不存在或已被删除。");
        return;
      }
      closeTransientSurfaces();
      if (link.boardId) await openBoard(link.boardId);
      if (link.templateId) {
        applyScene(template!);
      } else {
        setLibraryOpen(false);
      }
      setInput((current) => ({
        ...current,
        ...(link.mode ? { workflowMode: link.mode } : {}),
        ...(link.prompt ? { prompt: link.prompt } : {})
      }));
      setPromptFocusNonce((current) => current + 1);
      return;
    }

    if (link.kind === "import") {
      if (!activeBoardRef.current) {
        toast.error("请先打开一个画板，再使用分享的创作设置。");
        return;
      }
      const api = getWorkbenchApi();
      if (!api) return;
      const shared = await api.readOnlineShareImport(link.source);
      const importedReferences = await Promise.all(shared.referenceUrls.map(async (referenceUrl, index) => {
        const imported = await api.importImageUrl(referenceUrl);
        const dataUrl = await api.readAssetDataUrl(imported.path);
        const payload = dataUrlToReferencePayload(dataUrl, `参考图片 ${index + 1}`, "reference");
        if (!payload) throw new Error("参考图片格式无效。");
        return payload;
      }));
      closeTransientSurfaces();
      setInput((current) => ({
        ...current,
        prompt: shared.prompt,
        sceneId: undefined,
        referenceImages: importedReferences
      }));
      setPromptFocusNonce((current) => current + 1);
      toast.success("已将提示词和参考图片导入当前画板。");
      return;
    }

    if (link.kind === "gallery") {
      if (link.boardId && !await loadBoardDetail(link.boardId)) {
        toast.error("链接中的画板不存在或已被删除。");
        return;
      }
      closeTransientSurfaces();
      if (link.boardId) await openBoard(link.boardId);
      setLibraryOpen(false);
      openGallery({ x: window.innerWidth / 2, y: 0 });
      return;
    }

    const detail = await loadBoardDetail(link.boardId);
    if (!detail) {
      toast.error("链接中的画板不存在或已被删除。");
      return;
    }
    if (link.nodeId && !detail.nodes.some((node) => node.id === link.nodeId)) {
      toast.error("链接中的图片节点不存在或已被删除。");
      return;
    }
    closeTransientSurfaces();
    await openBoard(link.boardId);
    setLibraryOpen(false);
    if (!link.nodeId) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = imagesRef.current.find((image) => image.id === link.nodeId);
        if (!target) {
          toast.error("链接中的图片节点不存在或已被删除。");
          return;
        }
        setFocusTarget((current) => ({
          key: imageKey(target),
          nonce: (current?.nonce ?? 0) + 1
        }));
        if (link.prompt) changePrompt(link.prompt);
        if (link.view === "details") {
          setHistoryOpen(false);
          setCommentOpen(false);
          setImageDetailsTargetId(target.id);
        } else if (link.view === "edit") {
          enterEditSession(target);
          if (link.prompt) setPromptFocusNonce((current) => current + 1);
        }
      });
    });
  }, [
    applyScene,
    changePrompt,
    enterEditSession,
    getWorkbenchApi,
    loadBoardDetail,
    openBoard,
    openGallery,
    openLibrary,
    scenes
  ]);

  const deepLinkHandlerRef = useRef(handleDeepLink);
  deepLinkHandlerRef.current = handleDeepLink;
  const deepLinkQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    if (startupLoading) return;
    const api = getWorkbenchApi();
    if (!api) return;
    let active = true;
    const receive = (rawUrl: string): void => {
      const parsed = parseIterlayDeepLink(rawUrl);
      if (!parsed.ok) {
        toast.error(parsed.reason);
        return;
      }
      deepLinkQueueRef.current = deepLinkQueueRef.current
        .then(() => deepLinkHandlerRef.current(parsed.value))
        .catch(reportWorkbenchError);
    };
    const unsubscribe = api.onDeepLink(receive);
    void api.activateDeepLinks()
      .then((urls) => {
        if (active) urls.forEach(receive);
      })
      .catch(reportWorkbenchError);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [getWorkbenchApi, reportWorkbenchError, startupLoading]);

  function useReferenceFromLibrary(dataUrl: string): void {
    const role = input.workflowMode === "edit" ? "edit-target" as const : "reference" as const;
    const payload = dataUrlToReferencePayload(dataUrl, "素材", role);
    if (payload) addReferencePayloads([payload]);
    setLibraryOpen(false);
    if (payload) {
      iterlayToast.referenceAdded({
        imageUrl: dataUrl,
        count: Math.min(4, inputRef.current.referenceImages.length + 1)
      });
    }
  }

  async function deleteAssetFromLibrary(boardId: string, nodeId: string): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) throw new Error(missingImageWorkbenchMessage);
    const isActiveBoard = activeBoardRef.current?.id === boardId;
    if (isActiveBoard) {
      // 当前画板可能还有尚未写入的节点，先落盘再由主进程原子移入回收站。
      await flushBoardSave();
      if (boardSaveInFlightRef.current) await boardSaveInFlightRef.current;
    }
    const detail = await api.getBoard(boardId);
    const targetNode = detail?.nodes.find((node) => node.id === nodeId);
    if (detail && targetNode && isBoardVideoNode(targetNode)) {
      await api.saveBoard({
        id: boardId,
        nodes: detail.nodes.filter((node) => node.id !== nodeId),
        connections: (detail.connections ?? []).filter(
          (connection) => connection.source !== nodeId && connection.target !== nodeId
        )
      });
      boardDetailCacheRef.current.delete(boardId);
      if (isActiveBoard) {
        setWorkflowNodes((current) => {
          const next = current.filter((node) => node.id !== nodeId);
          workflowNodesRef.current = next;
          return next;
        });
        canvasStateRef.current.connections = canvasStateRef.current.connections.filter(
          (connection) => connection.source !== nodeId && connection.target !== nodeId
        );
      }
      toast.success("已从画板移除视频");
      return;
    }
    const result = await api.trashBoardImages(boardId, [nodeId]);
    if (result.count === 0) throw new Error("图片已不存在于当前画板。 ");
    if (isActiveBoard) {
      pushCanvasUndoSnapshot({
        positions: { ...canvasStateRef.current.positions },
        selectedIds: [nodeId]
      });
      setImages((current) => current.filter((image) => image.id !== nodeId));
      if (editTargetId === nodeId) {
        setEditTargetId(null);
        setAdvancedEditOpen(false);
      }
    }
    toast.success("进入了回收站");
  }

  // ---------- 删除画布图片（生成 / 上传） ----------

  const requestDeleteWorkflowNodes = useCallback((ids: string[]): Promise<boolean> => {
    const valid = ids.filter((id) => workflowNodesRef.current.some(
      (node) => node.id === id && node.type === "comic-drama-entry"
    ));
    if (valid.length === 0) return Promise.resolve(true);
    workflowDeleteConfirmationRef.current?.(false);
    setWorkflowDeleteTargetIds(valid);
    return new Promise<boolean>((resolve) => {
      workflowDeleteConfirmationRef.current = resolve;
    });
  }, []);

  const cancelDeleteWorkflowNodes = useCallback((): void => {
    setWorkflowDeleteTargetIds(null);
    workflowDeleteConfirmationRef.current?.(false);
    workflowDeleteConfirmationRef.current = null;
  }, []);

  const confirmDeleteWorkflowNodes = useCallback((): void => {
    setWorkflowDeleteTargetIds(null);
    workflowDeleteConfirmationRef.current?.(true);
    workflowDeleteConfirmationRef.current = null;
  }, []);

  const requestDeleteImages = useCallback((ids: string[]): Promise<boolean> => {
    // 只删画布上已落定的图片（跳过生成中的占位）。
    const valid = ids.filter((id) => imagesRef.current.some((image) => image.id === id && !image.pending));
    if (valid.length === 0) return Promise.resolve(false);
    deleteConfirmationRef.current?.(false);
    setDeleteTargetIds(valid);
    return new Promise<boolean>((resolve) => {
      deleteConfirmationRef.current = resolve;
    });
  }, []);

  const cancelDeleteImages = useCallback((): void => {
    if (trashingImages) return;
    setDeleteTargetIds(null);
    deleteConfirmationRef.current?.(false);
    deleteConfirmationRef.current = null;
  }, [trashingImages]);

  async function confirmDeleteImages(): Promise<void> {
    const ids = deleteTargetIds;
    if (!ids || ids.length === 0 || trashingImages) return;
    const boardId = activeBoardRef.current?.id;
    if (!boardId) return;
    let movedCount = 0;
    setTrashingImages(true);
    try {
      // 先冲刷可能尚未落盘的节点，再由主进程原子地记录回收站并移除画板节点。
      await flushBoardSave();
      if (boardSaveInFlightRef.current) await boardSaveInFlightRef.current;
      const api = getWorkbenchApi();
      if (!api) throw new Error(missingImageWorkbenchMessage);
      const result = await api.trashBoardImages(boardId, ids);
      if (result.count === 0) throw new Error("图片已不存在于当前画板。 ");
      movedCount = result.count;
      setDeleteTargetIds(null);
      deleteConfirmationRef.current?.(true);
      deleteConfirmationRef.current = null;
    } catch (error) {
      reportWorkbenchError(error);
      return;
    } finally {
      setTrashingImages(false);
    }
    const idSet = new Set(ids);
    pushCanvasUndoSnapshot({
      positions: { ...canvasStateRef.current.positions },
      selectedIds: ids
    });
    // 主进程已经移除持久化节点；这里同步画布，随后自动保存同一份状态。
    setImages((current) => current.filter((image) => !idSet.has(image.id)));
    if (editTargetId && idSet.has(editTargetId)) {
      setEditTargetId(null);
      setAdvancedEditOpen(false);
    }
    toast.success(movedCount > 1 ? `${movedCount} 张图片已移入回收站` : "图片已移入回收站");
  }

  async function restoreTrashedBoardImage(result: RestoreTrashedBoardImageResult): Promise<void> {
    const { item, imageUrls } = result;
    if (activeBoardRef.current?.id !== item.boardId) {
      await openBoard(item.boardId);
      return;
    }
    const { node } = item;
    const restoredImage = hydrateGeneratedImage(node, imageUrls);
    if (!restoredImage) throw new Error("图片文件已丢失，无法恢复。 ");
    const restoredLayout = hydrateBoardNodeImageLayout(node);
    canvasStateRef.current = {
      ...canvasStateRef.current,
      positions: {
        ...canvasStateRef.current.positions,
        [node.id]: restoredLayout
      }
    };
    setImages((current) => current.some((image) => image.id === node.id)
      ? current
      : [...current, restoredImage]);
  }

  function triggerParticleBurst(
    text: string,
    rect: ParticleBurstTrigger["rect"],
    targetNodeId?: ParticleBurstTrigger["targetNodeId"]
  ): void {
    const color = effectiveTheme === "dark" ? "245,245,245" : "23,23,23";
    setParticleBurst((current) => ({ text, rect, targetNodeId, color, nonce: (current?.nonce ?? 0) + 1 }));
  }

  const copyText = useCallback((text: string): void => {
    void navigator.clipboard.writeText(text);
    iterlayToast.copied({ title: "已复制文本" });
  }, []);

  const copyImageReferences = useCallback(async (references: AssetReference[]): Promise<void> => {
    const current = inputRef.current;
    const available = Math.max(0, 4 - current.referenceImages.length);
    if (available === 0) {
      toast.error("参考图已达 4 张上限。");
      return;
    }
    const role: ReferenceImageRole = current.workflowMode === "edit" ? "edit-target" : "reference";
    const payloads: ReferenceImagePayload[] = [];
    const imageUrls: string[] = [];
    for (const [index, reference] of references.slice(0, available).entries()) {
      try {
        const dataUrl = await getImageWorkbenchApi().readAssetDataUrl(reference.imagePath);
        const payload = dataUrlToReferencePayload(dataUrl, `引用图片 ${index + 1}`, role);
        if (payload) {
          payloads.push(payload);
          imageUrls.push(dataUrl);
        }
      } catch {
        // 单张来源失效时继续复制其余可用引用。
      }
    }
    if (payloads.length === 0) {
      toast.error("没有可复制的引用图片。");
      return;
    }
    addReferencePayloads(payloads);
    iterlayToast.referenceAdded({
      imageUrls,
      count: Math.min(4, current.referenceImages.length + payloads.length),
      addedCount: payloads.length
    });
  }, [addReferencePayloads]);

  const saveImage = useCallback(
    async (path: string): Promise<void> => {
      try {
        const api = getImageWorkbenchApi();
        const result = await api.saveAsset(path);
        if (result.directory) setDownloadDirectory(result.directory);
        setStatus(result?.ok ? "图片已下载。" : "已取消下载。");
        if (result?.ok) iterlayToast.exported({ path: result.path });
      } catch (error) {
        reportWorkbenchError(error);
      }
    },
    [reportWorkbenchError, setStatus]
  );

  const saveVideo = useCallback(async (video: GeneratedVideo): Promise<void> => {
    if (!video.path) return;
    try {
      const result = await getImageWorkbenchApi().saveVideo(video.path);
      if (result.ok) toast.success("视频已保存");
    } catch (error) {
      reportWorkbenchError(error);
    }
  }, [reportWorkbenchError]);

  const saveImageWithoutBackground = useCallback(
    async (image: GeneratedImage): Promise<void> => {
      if (!image.path) return;
      try {
        const api = getImageWorkbenchApi();
        const source = image.dataUrl.startsWith("data:") ? image.dataUrl : await api.readAssetDataUrl(image.path);
        const processed = await removeImageBackground(source);
        const sourceName = image.path.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, "") || "image";
        const result = await api.saveImageDataUrl(processed.dataUrl, `${sourceName}-no-bg.png`);
        if (result.directory) setDownloadDirectory(result.directory);
        if (!result.ok) {
          setStatus("已取消下载。");
          return;
        }
        setStatus(processed.alreadyTransparent ? "透明原图已下载。" : "背景已去除并下载。");
        iterlayToast.exported({
          title: processed.alreadyTransparent ? "原图已有透明背景，已下载" : "背景已去除并下载",
          path: result.path
        });
      } catch (error) {
        reportWorkbenchError(error);
      }
    },
    [reportWorkbenchError, setStatus]
  );

  const saveImagesAsZip = useCallback(
    async (selectedImages: GeneratedImage[]): Promise<void> => {
      const paths = [...new Set(selectedImages.map((image) => image.path).filter(Boolean))];
      if (paths.length === 0) return;
      try {
        const result = await getImageWorkbenchApi().saveAssetsAsZip(paths);
        if (result.directory) setDownloadDirectory(result.directory);
        if (!result.ok) {
          setStatus("已取消批量下载。");
          return;
        }
        const count = result.count ?? paths.length;
        const skipped = result.skipped ?? 0;
        setStatus(`已将 ${count} 张图片打包下载。`);
        iterlayToast.exported({
          count,
          path: result.path,
          detail: skipped > 0 ? `另有 ${skipped} 张图片无法读取，已跳过` : undefined
        });
      } catch (error) {
        reportWorkbenchError(error);
      }
    },
    [reportWorkbenchError, setStatus]
  );

  const openSliceDialog = useCallback((image: GeneratedImage): void => {
    if (!image.path || !image.width || !image.height || image.pending) {
      toast.error("当前图片暂不能切图。");
      return;
    }
    setSliceTargetId(image.id);
  }, []);

  const revealVideo = useCallback(async (video: GeneratedVideo): Promise<void> => {
    if (!video.path) return;
    try {
      await getImageWorkbenchApi().revealVideo(video.path);
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法在访达中显示视频。"));
    }
  }, []);

  const extractVideoFrame = useCallback(async (video: GeneratedVideo, frameDataUrl: string): Promise<void> => {
    try {
      const imported = await getImageWorkbenchApi().importUploadedImage(frameDataUrl);
      const image: GeneratedImage = {
        id: crypto.randomUUID(),
        path: imported.path,
        dataUrl: frameDataUrl,
        jobId: `frame-${crypto.randomUUID()}`,
        source: "slice",
        width: video.width,
        height: video.height,
        selectOnCreate: true
      };
      setImages((current) => [image, ...current]);
      scheduleBoardSave();
      toast.success("当前帧已添加到画布");
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "当前帧提取失败。"));
    }
  }, [scheduleBoardSave]);

  const openWechatExportDialog = useCallback((selectedImages: GeneratedImage[]): void => {
    const available = selectedImages.filter((image) => !image.pending && Boolean(image.path));
    if (available.length === 0) {
      toast.error("所选图片暂不可导出为微信表情。");
      return;
    }
    setWechatExportRequest({
      images: available,
      mode: "personal"
    });
  }, []);

  const analyzeSliceSubjects = useCallback(
    async (crops: ImageCropRect[]): Promise<SliceSubjectDetection[]> => {
      const target = imagesRef.current.find((image) => image.id === sliceTargetId);
      if (!target?.path) throw new Error("待识别图片已不可用。");
      const api = getWorkbenchApi();
      if (!api) throw new Error(missingImageWorkbenchMessage);
      const result = await api.analyzeSliceSubjects({
        sourcePath: target.path,
        crops
      });
      refreshCreditStatus();
      return result.items;
    },
    [getWorkbenchApi, refreshCreditStatus, sliceTargetId]
  );

  const analyzeEditSubject = useCallback(async (): Promise<ImageCropRect> => {
    const target = imagesRef.current.find((image) => image.id === editTargetId);
    if (!target?.path) throw new Error("当前编辑图片已不可用。");
    const api = getWorkbenchApi();
    if (!api) throw new Error(missingImageWorkbenchMessage);
    const fallbackSize = target.width && target.height
      ? { width: target.width, height: target.height }
      : await loadImageSize(target.dataUrl);
    if (!fallbackSize.width || !fallbackSize.height) throw new Error("无法读取当前图片尺寸。");
    const result = await api.analyzeSliceSubjects({
      sourcePath: target.path,
      crops: [{ x: 0, y: 0, width: fallbackSize.width, height: fallbackSize.height }]
    });
    refreshCreditStatus();
    const detection = [...result.items].sort((left, right) => right.confidence - left.confidence)[0];
    if (!detection) throw new Error("未识别到清晰主体，请改用框选或画笔。 ");
    return detection.bounds;
  }, [editTargetId, getWorkbenchApi, refreshCreditStatus]);

  async function applyAdvancedEdit(
    request: import("@/components/canvas/AdvancedImageEditor").AdvancedEditRequest
  ): Promise<void> {
    const mask = dataUrlToReferencePayload(request.maskDataUrl, "区域蒙版", "reference");
    if (!mask) {
      toast.error("无法生成区域蒙版，请重新选择编辑区域。 ");
      return;
    }
    const references = request.referenceImages
      .map((reference) => dataUrlToReferencePayload(reference.dataUrl, reference.name, "reference"))
      .filter((reference): reference is ReferenceImagePayload => reference !== null);
    await generate(undefined, {
      workflowMode: "edit",
      prompt: request.prompt,
      promptSpec: undefined,
      n: 1,
      referenceImages: [mask, ...references]
    }, { preservePrompt: true });
  }

  async function interpretRelaxFlow(
    request: import("@/components/canvas/RelaxFlowBoard").RelaxFlowRequest,
    refinement?: { interpretation: import("@/components/canvas/RelaxFlowBoard").RelaxFlowInterpretation; instruction: string },
    onDelta?: (delta: string) => void
  ): Promise<import("@/components/canvas/RelaxFlowBoard").RelaxFlowInterpretation> {
    const target = imagesRef.current.find((image) => image.id === editTargetId);
    if (!target?.path) throw new Error("当前编辑图片已不可用。 ");
    const api = getWorkbenchApi();
    if (!api) throw new Error(missingImageWorkbenchMessage);
    const targetDataUrl = target.dataUrl.startsWith("data:")
      ? target.dataUrl
      : await api.readAssetDataUrl(target.path);
    const targetReference = dataUrlToReferencePayload(targetDataUrl, "当前编辑目标图", "edit-target");
    const boardReference = dataUrlToReferencePayload(request.boardDataUrl, "Relax Flow 标注画板", "reference");
    if (!targetReference || !boardReference) throw new Error("无法生成 Relax Flow 视觉上下文。 ");

    const collaborationRequest = {
      instruction: [
        refinement
          ? "这是一次 Relax Flow 图片编辑意图修订任务。请在已识别意图的基础上理解用户追加要求，并更新完整的编辑方案。"
          : "这是一次 Relax Flow 图片编辑意图解释任务。你要先理解用户画板，再把理解结果转写成可执行的编辑提示词。",
        "第一张图是未标注的当前编辑目标；第二张图是完整的 React Flow 意图画板，其中的中心图片节点对应第一张图，周围或上方分布着用户添加的笔迹、图形、箭头和文字节点。",
        "画板上的彩色线条、半透明图形、箭头、节点边界和文字只用于表达编辑意图，绝不是最终图片中要保留、绘制或复刻的视觉元素。",
        "综合图片内容、组件相对中心图片的位置、箭头方向、包围范围、组件之间的关系与文字含义，推断用户真正想修改的对象、区域、结果和需要保持不变的内容。不要机械地逐条拼接标注，也不要把颜色或形状本身当作编辑要求，除非文字明确要求这么做。",
        "把存在歧义的空间标注优先解释为最符合原图语义和用户文字的编辑意图；没有被画板意图影响的主体、构图、光线和画布尺寸必须保持不变。",
        "不要提问，不要给多个方向，不要执行生成动作。fields 必须且只能返回一个字段：label 为“提示词”，value 为一条完整、明确、可直接交给图片编辑模型的中文提示词；提示词只描述最终图片该如何变化，不得提及画板、标注、箭头、节点或 React Flow。",
        refinement ? `当前已识别的编辑方案：\n${refinement.interpretation.prompt}` : null,
        refinement ? `用户追加要求：\n${refinement.instruction}` : null,
        `结构化标注摘要：\n${request.annotationSummary}`
      ].filter(Boolean).join("\n"),
      referenceImages: [
        { name: targetReference.name, mimeType: targetReference.mimeType, dataBase64: targetReference.dataBase64 },
        { name: boardReference.name, mimeType: boardReference.mimeType, dataBase64: boardReference.dataBase64 }
      ],
      currentFields: inputRef.current.prompt.trim()
        ? [{ label: "当前编辑指令（仅作补充上下文）", value: inputRef.current.prompt.trim() }]
        : [],
      workflowMode: "edit",
      assistantSurface: "canvas-edit",
      textProviderId: activeTextProviderId,
      memoryQuery: {
        ...(activeBoardRef.current?.id ? { boardId: activeBoardRef.current.id } : {}),
        assetPath: target.path
      }
    } satisfies CollaborateSceneRequest;
    const assistantResult = onDelta
      ? await new Promise<CollaborateSceneResult>((resolve, reject) => {
          startSceneCollaborationStream(collaborationRequest, {
            onDelta,
            onResult: resolve,
            onError: (message) => reject(new Error(message)),
            onCancelled: () => reject(new Error("已停止本次理解。"))
          });
        })
      : await api.collaborateScene(collaborationRequest);
    refreshCreditStatus();
    const interpretedPrompt = sceneAssistantFieldsToPrompt(assistantResult.fields)
      || assistantResult.detailedPrompt?.trim()
      || "";
    if (!interpretedPrompt) throw new Error("AI 没有返回可执行的编辑提示词，请调整画板后重试。 ");
    return { prompt: interpretedPrompt, explanation: assistantResult.message };
  }

  async function generateRelaxFlow(prompt: string): Promise<GeneratedImage[]> {
    if (!prompt.trim()) throw new Error("请先识别编辑意图。 ");
    return generate(undefined, {
      workflowMode: "edit",
      // 画板仅供文本 AI 推断意图。图片模型只接收原始编辑目标和解释后的提示词，
      // 避免把箭头、涂鸦或文字误当成最终画面的一部分。
      prompt,
      promptSpec: undefined,
      n: 1,
      referenceImages: []
    }, { preservePrompt: true });
  }

  const confirmSliceImage = useCallback(
    async (selection: SliceSelection): Promise<void> => {
      const target = imagesRef.current.find((image) => image.id === sliceTargetId);
      if (!target?.path || !target.width || !target.height) throw new Error("待切图片已不可用。");
      const api = getWorkbenchApi();
      if (!api) throw new Error(missingImageWorkbenchMessage);

      try {
        const outputs = await api.sliceImage({
          sourcePath: target.path,
          crops: selection.items.map((item) => item.crop)
        });
        if (outputs.length !== selection.items.length) throw new Error("切图结果数量不完整。");

        const currentImages = imagesRef.current;
        const positions = canvasStateRef.current.positions;
        const rightEdge = currentImages.reduce((right, image) => {
          const position = positions[image.id];
          return position ? Math.max(right, position.x + IMAGE_NODE_WIDTH) : right;
        }, 0);
        const sourceY = positions[target.id]?.y ?? 0;
        const placementCells = selection.items.map((item, outputIndex) =>
          getSliceResultCell(
            item.index,
            outputIndex,
            selection.columns,
            selection.items.length,
            selection.resultLayout
          )
        );
        const resultRowCount = Math.max(...placementCells.map((cell) => cell.row)) + 1;
        const rowHeights = Array.from({ length: resultRowCount }, () => 0);
        selection.items.forEach((item, outputIndex) => {
          const { row } = placementCells[outputIndex];
          rowHeights[row] = Math.max(rowHeights[row], (IMAGE_NODE_WIDTH * item.crop.height) / item.crop.width);
        });
        const rowOffsets = rowHeights.map((_, row) =>
          rowHeights.slice(0, row).reduce((offset, height) => offset + height + 40, 0)
        );
        const baseX = rightEdge + 40;

        const slices: GeneratedImage[] = outputs.map((output, outputIndex) => {
          const item = selection.items[outputIndex];
          const { row, column } = placementCells[outputIndex];
          return {
            id: crypto.randomUUID(),
            path: output.path,
            dataUrl: output.dataUrl,
            jobId: target.jobId,
            source: "slice",
            width: output.width,
            height: output.height,
            derivation: {
              sourceNodeId: target.id,
              sourceImagePath: target.path,
              crop: item.crop
            },
            placementPosition: {
              x: baseX + column * (IMAGE_NODE_WIDTH + 40),
              y: sourceY + rowOffsets[row]
            },
            selectOnCreate: true
          };
        });

        setImages((current) => current.some((image) => image.id === target.id) ? [...current, ...slices] : current);
        setStatus(`已切出 ${slices.length} 张图片。`);
        iterlayToast.sliced({
          count: slices.length,
          previews: slices.map((image) => image.dataUrl),
          onDownload: () => void saveImagesAsZip(slices)
        });
      } catch (error) {
        reportWorkbenchError(error);
        throw error;
      }
    },
    [getWorkbenchApi, reportWorkbenchError, saveImagesAsZip, setStatus, sliceTargetId]
  );

  function getBlockedGenerateMessage(targetInput: GenerateImageInput = inputRef.current): string | null {
    if (bridgeError) return bridgeError;
    if (isOfficialProvider && creditLoading) return "正在读取官方 Provider 余额，请稍候。";
    if (isOfficialProvider && !creditStatus?.providerAvailable) return creditError || "官方 Provider 暂时不可用。";
    if (!isOfficialProvider && !setupComplete) return "请先在设置中添加并保存 Provider。";
    if (!isOfficialProvider && !activeHasKey) return "请先为当前 Provider 保存 API Key。";
    if (!targetInput.prompt.trim()) return "请先填写 Prompt。";
    if (targetInput.workflowMode === "edit" && providerBlocksEditing) return "当前 Provider 不支持参考图编辑，请切换 Provider。";
    if (targetInput.workflowMode === "edit" && !editTargetId) return "请先打开要编辑的图片。";
    if (providerBlocksGenerateReferences && targetInput.workflowMode === "generate" && targetInput.referenceImages.length > 0) {
      return "当前 Provider 的生成模式不支持参考图，请移除参考图或切换 Provider。";
    }
    return null;
  }

  async function generateAssistantPrompts(
    requests: AssistantGenerationRequest[],
    assistantConversationId?: string
  ): Promise<void> {
    const normalized = requests
      .map((request) => ({
        prompt: request.prompt.trim(),
        count: Math.min(
          getProviderMaxImageCount(activeProvider),
          Math.max(1, Math.trunc(request.count) || 1)
        ),
        preservePrompt: request.preservePrompt
      }))
      .filter((request) => request.prompt);
    if (normalized.length === 0) {
      toast.error("AI 助手没有提供可生成的提示词。");
      return;
    }
    const blockedMessage = getBlockedGenerateMessage({
      ...inputRef.current,
      prompt: normalized[0].prompt,
      n: normalized[0].count
    });
    if (blockedMessage) {
      toast.error(blockedMessage);
      return;
    }
    if (isOfficialProvider) {
      const required = normalized.reduce((total, request) => total + request.count, 0) * IMAGE_CREDIT_COST;
      const balance = creditStatus?.credits.balance ?? 0;
      if (balance < required) {
        iterlayToast.balance({
          balance,
          required,
          onActivate: licenseStatus?.state === "LICENSED" ? undefined : openLicenseActivation
        });
        return;
      }
    }
    await Promise.all(normalized.map((request) => generate(
      undefined,
      { prompt: request.prompt, n: request.count, sceneId: undefined, assistantConversationId },
      { skipOfficialCreditCheck: isOfficialProvider, preservePrompt: request.preservePrompt }
    )));
  }

  const visibleHistory = useMemo(
    () => history.filter((job) => job.boardId === activeBoard?.id),
    [activeBoard?.id, history]
  );
  const visibleVideoHistory = useMemo(
    () => videoHistory.filter((job) => job.input.boardId === activeBoard?.id),
    [activeBoard?.id, videoHistory]
  );
  const galleryPreloadPaths = useMemo(
    () => collectGalleryPreloadPaths(visibleHistory),
    [visibleHistory]
  );
  useEffect(() => {
    if (galleryPreloadPaths.length === 0) return;
    const preload = (): void => { void preloadGalleryThumbnails(galleryPreloadPaths); };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(preload, { timeout: 600 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timerId = window.setTimeout(preload, 300);
    return () => window.clearTimeout(timerId);
  }, [galleryPreloadPaths]);
  const galleryAvailable = images.some((image) => Boolean(image.path) && !image.pending);
  const demoStartBoard = boards.find((board) => board.name === INITIAL_DEMO_BOARD_NAME);
  const showFirstRunDemoStart = Boolean(
    demoStartBoard &&
    demoStartBoard.id !== activeBoard?.id &&
    firstDemoStartVisitRef.current
  );
  const emptyCanvasSuggestedMode = useMemo<EmptyCanvasMode>(
    () => showFirstRunDemoStart
      ? "compass"
      : boards.some((board) => board.imageCount > 0) ? "recent" : "preview",
    [boards, showFirstRunDemoStart]
  );
  const canvasInitialLayout = useMemo(
    () => ({
      boardId: activeBoard?.id,
      positions: canvasStateRef.current.positions,
      connections: canvasStateRef.current.connections,
      connectionRevision: canvasConnectionsVersion
    }),
    [activeBoard?.id, canvasConnectionsVersion]
  );
  const openCanvasAssetLibrary = useCallback((): void => openLibrary("assets"), [openLibrary]);
  const openCanvasDemoStart = useCallback((): void => {
    if (demoStartBoard) void openBoard(demoStartBoard.id);
  }, [demoStartBoard, openBoard]);
  const openCanvasShortcutHelp = useCallback((): void => setShortcutHelpOpen(true), []);
  const imageByPath = useMemo(
    () => new Map(images.filter((image) => image.path).map((image) => [image.path, image])),
    [images]
  );
  const visibleComments = useMemo(
    () => comments.filter((comment) => imageByPath.has(comment.imagePath)),
    [comments, imageByPath]
  );
  const getImageThumbnail = useCallback(
    (path: string): string | undefined => imageByPath.get(path)?.dataUrl,
    [imageByPath]
  );
  const loadHistoryThumbnail = useCallback((path: string): Promise<string | undefined> => {
    return historyThumbnailCacheRef.current.getOrLoad(
      path,
      () => getImageWorkbenchApi().readAssetDataUrl(path)
    );
  }, []);
  const handleCreateWorkflowNode = useStableCallback(createWorkflowNode);
  const handleUpdateWorkflowNode = useStableCallback(updateWorkflowNode);
  const handleDeleteWorkflowNodes = useStableCallback(deleteWorkflowNodes);
  const handleRunGenerationNode = useStableCallback(runGenerationNode);
  const handleRunVideoGenerationNode = useStableCallback(runVideoGenerationNode);
  const handleChooseVideoReferenceAudio = useStableCallback(chooseVideoReferenceAudio);
  const handleRemoveVideoReferenceAudio = useStableCallback(removeVideoReferenceAudio);
  const handleSelectVideoVersion = useStableCallback(selectVideoVersion);
  const handleCreateVideoIteration = useStableCallback(createVideoIteration);
  const handleCompareVideoVersions = useStableCallback(compareVideoVersions);
  const handleStopVideoPolling = useStableCallback(stopVideoPolling);
  const handleResumeVideoPolling = useStableCallback(resumeVideoPolling);
  const handleCanvasMinimapVisibleChange = useStableCallback(changeCanvasMinimapVisible);
  const openCanvasComments = useCallback((): void => {
    setHistoryOpen(false);
    setCommentOpen(true);
  }, []);
  const shareCanvasImages = useCallback((shareImages: GeneratedImage[]): void => {
    setQuickImageShareImages(shareImages);
  }, []);
  const viewCanvasImageDetails = useCallback((image: GeneratedImage): void => {
    setHistoryOpen(false);
    setCommentOpen(false);
    setImageDetailsTargetId(image.id);
  }, []);
  const exitCanvas = useStableCallback((): void => {
    if (!commentMode && !pendingComment) openLibrary();
  });
  const licenseLoading = hasImageWorkbenchApi() && !licenseStatus;
  const rightRailCanvasInset = imageDetailsTarget
    ? 376
    : commentOpen ? 336 : historyOpen ? 320 : 0;
  const effectiveRightRailCanvasInset = reserveCanvasSpaceForRightRail ? rightRailCanvasInset : 0;

  const refreshActiveVideoSequence = useCallback(async (): Promise<void> => {
    const current = activeVideoSequence;
    if (!current) return;
    const next = await getImageWorkbenchApi().getVideoSequence({ boardId: current.boardId, sequenceId: current.id });
    if (next) setActiveVideoSequence(next);
  }, [activeVideoSequence]);

  useEffect(() => {
    if (!activeVideoSequence || !hasImageWorkbenchApi()) return;
    return getImageWorkbenchApi().onVideoSequenceEvent((event) => {
      const update = event as { boardId?: string; sequenceId?: string };
      if (update.boardId === activeVideoSequence.boardId && update.sequenceId === activeVideoSequence.id) {
        void refreshActiveVideoSequence();
      }
    });
  }, [activeVideoSequence, refreshActiveVideoSequence]);

  const openPersistedVideoSequence = useCallback(async (sequenceId: string): Promise<void> => {
    const boardId = activeBoardRef.current?.id;
    if (!boardId) return;
    try {
      const sequence = await getImageWorkbenchApi().getVideoSequence({ boardId, sequenceId });
      if (!sequence) throw new Error("视频序列不存在或已被删除。");
      setActiveVideoSequence(sequence);
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法打开视频序列。"));
    }
  }, []);

  const createVideoSequenceFromImages = useCallback(async (selected: GeneratedImage[]): Promise<void> => {
    if (!activeBoard || selected.length < 2) return;
    try {
      const sequence = await getImageWorkbenchApi().createVideoSequence({
        boardId: activeBoard.id,
        name: `${activeBoard.name}镜头序列`,
        imageNodeIds: selected.map((image) => image.id),
        defaults: {
          providerId: activeVideoProviderId,
          model: videoProviders.find((provider) => provider.id === activeVideoProviderId)?.model ?? DEFAULT_VIDEO_PROVIDER_CONFIG.model
        }
      });
      setVideoSequenceTemplates(await getImageWorkbenchApi().listVideoSequenceTemplates());
      await openBoard(activeBoard.id, undefined, { forceReload: true, suppressLoadingScreen: true });
      setActiveVideoSequence(sequence);
      toast.success(`已创建 ${selected.length - 1} 个视频片段`);
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "创建镜头序列失败。"));
    }
  }, [activeBoard, activeVideoProviderId, openBoard, videoProviders]);

  const createVideoAssemblyFromVideos = useCallback(async (selected: BoardVideoNode[]): Promise<void> => {
    if (!activeBoard || selected.length < 2) return;
    try {
      const sequence = await getImageWorkbenchApi().createVideoSequenceFromVideos({
        boardId: activeBoard.id,
        name: activeBoard.name + "成片序列",
        videoNodeIds: selected.map((video) => video.id),
        defaults: {
          providerId: activeVideoProviderId,
          model: videoProviders.find((provider) => provider.id === activeVideoProviderId)?.model ?? DEFAULT_VIDEO_PROVIDER_CONFIG.model
        }
      });
      await openBoard(activeBoard.id, undefined, { forceReload: true, suppressLoadingScreen: true });
      setActiveVideoSequence(sequence);
      toast.success("已按画布顺序合并 " + selected.length + " 个视频；未调用生成服务");
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "合并视频失败，画板未发生变化。"));
    }
  }, [activeBoard, activeVideoProviderId, openBoard, videoProviders]);

  const mutateActiveVideoSequence = useCallback(async (
    operation: Parameters<ReturnType<typeof getImageWorkbenchApi>["mutateVideoSequence"]>[0],
    input: Record<string, unknown>
  ): Promise<void> => {
    const current = activeVideoSequence;
    if (!current) return;
    setVideoSequenceSaving(true);
    setVideoSequenceSaveError(undefined);
    try {
      const next = await getImageWorkbenchApi().mutateVideoSequence(operation, {
        boardId: current.boardId,
        sequenceId: current.id,
        expectedRevision: current.revision,
        ...input
      });
      setActiveVideoSequence(next);
    } catch (error) {
      setVideoSequenceSaveError(getWorkbenchErrorMessage(error, "保存失败。"));
      throw error;
    } finally {
      setVideoSequenceSaving(false);
    }
  }, [activeVideoSequence]);

  const updateActiveVideoSequence = useCallback((draft: EditorVideoSequence): void => {
    const current = activeVideoSequence;
    if (!current) return;
    const currentFrameIds = [...current.keyframes].sort((a, b) => a.order - b.order).map((frame) => frame.id);
    const draftFrameIds = [...draft.keyframes].sort((a, b) => a.order - b.order).map((frame) => frame.id);
    if (current.kind === "video-assembly") {
      const currentSegmentIds = [...current.segments].sort((a, b) => a.order - b.order).map((segment) => segment.id);
      const draftSegmentIds = [...draft.segments].sort((a, b) => a.order - b.order).map((segment) => segment.id);
      if (currentSegmentIds.join(":") !== draftSegmentIds.join(":")) {
        void mutateActiveVideoSequence("reorderSegments", { segmentIds: draftSegmentIds });
        return;
      }
    }
    if (draftFrameIds.length < currentFrameIds.length) {
      const removedId = currentFrameIds.find((id) => !draftFrameIds.includes(id));
      if (removedId) void mutateActiveVideoSequence("removeKeyframe", { keyframeId: removedId });
      return;
    }
    if (currentFrameIds.join(":") !== draftFrameIds.join(":")) {
      void mutateActiveVideoSequence("reorderKeyframes", { keyframeIds: draftFrameIds });
      return;
    }
    const changed = draft.segments.find((segment) => {
      const source = current.segments.find((item) => item.id === segment.id);
      if (!source) return false;
      return segment.prompt !== source.config.prompt
        || segment.providerId !== source.config.providerId
        || segment.model !== source.config.model
        || segment.durationSeconds !== source.config.durationSeconds
        || segment.aspectRatio !== source.config.aspectRatio
        || segment.resolution !== source.config.resolution
        || segment.generateAudio !== source.config.generateAudio
        || segment.watermark !== source.config.watermark
        || segment.trimInMs !== source.trim.inMs
        || segment.trimOutMs !== source.trim.outMs
        || segment.muted !== source.trim.muted
        || segment.activeVersionId !== source.activeVersionId;
    });
    if (!changed) return;
    const source = current.segments.find((item) => item.id === changed.id)!;
    if (changed.activeVersionId !== source.activeVersionId && changed.activeVersionId) {
      void mutateActiveVideoSequence("selectSegmentVersion", { segmentId: changed.id, versionId: changed.activeVersionId });
      return;
    }
    void mutateActiveVideoSequence("updateSegment", {
      segmentId: changed.id,
      configPatch: {
        prompt: changed.prompt,
        providerId: changed.providerId,
        model: changed.model,
        durationSeconds: changed.durationSeconds,
        aspectRatio: changed.aspectRatio,
        resolution: changed.resolution,
        generateAudio: changed.generateAudio,
        watermark: changed.watermark
      },
      trimPatch: { inMs: changed.trimInMs, outMs: changed.trimOutMs, muted: changed.muted }
    });
  }, [activeVideoSequence, mutateActiveVideoSequence]);

  const runActiveVideoSequence = useCallback(async (segmentIds?: string[]): Promise<VideoSequenceTask[]> => {
    const current = activeVideoSequence;
    if (!current) return [];
    const selected = current.segments.filter((segment) => !segmentIds || segmentIds.includes(segment.id));
    const fingerprintItems = selected.map((segment) => ({
      id: segment.id,
      segmentRevision: segment.desiredRevision,
      inputFingerprint: segment.inputFingerprint,
      providerId: segment.config.providerId ?? current.defaults.providerId,
      durationSeconds: segment.config.durationSeconds ?? current.defaults.durationSeconds
    }));
    const inputFingerprint = await generationFingerprint(fingerprintItems);
    const officialItems = fingerprintItems.filter((item) => videoProviders.find((provider) => provider.id === (item.providerId ?? activeVideoProviderId))?.type === "official");
    let metadata: Partial<GenerateImageInput> = {};
    if (officialItems.length > 0) {
      const generationAttemptId = crypto.randomUUID();
      const quote = await getImageWorkbenchApi().quotePaidMedia({
        kind: "video-sequence",
        clientRequestId: generationAttemptId,
        inputFingerprint,
        boardId: current.boardId,
        requestScope: current.id,
        operation: "videoSequence:run",
        videoItems: officialItems.map((item) => ({
          clientRequestId: `${generationAttemptId}:${item.id}`,
          providerId: item.providerId ?? activeVideoProviderId,
          model: selected.find((segment) => segment.id === item.id)?.config.model ?? current.defaults.model,
          durationSeconds: item.durationSeconds,
          resolution: selected.find((segment) => segment.id === item.id)?.config.resolution ?? current.defaults.resolution,
          generateAudio: selected.find((segment) => segment.id === item.id)?.config.generateAudio ?? current.defaults.generateAudio
        })),
        stage: "video"
      });
      metadata = {
        generationAttemptId,
        inputFingerprint,
        quoteId: quote.quoteId,
        quoteExpiresAt: quote.expiresAt,
        idempotencyKey: [generationAttemptId, inputFingerprint, quote.quoteId].join(":"),
        priceSnapshot: quote.priceSnapshot,
        quoteBoardId: current.boardId,
        quoteRequestScope: current.id,
        quotePurpose: "video",
        quoteOperation: "videoSequence:run"
      };
    }
    const confirmationItems = selected.map((segment) => {
      const provider = videoProviders.find((item) => item.id === (segment.config.providerId ?? current.defaults.providerId ?? activeVideoProviderId));
      const duration = segment.config.durationSeconds ?? current.defaults.durationSeconds;
      const official = provider?.type === "official";
      const cost = official && creditStatus?.videoGoldBeanCostPerSecond !== undefined
        ? `${Math.ceil(duration * creditStatus.videoGoldBeanCostPerSecond)} 金豆`
        : "Provider 计费";
      return {
        id: segment.id,
        label: `片段 ${segment.order + 1}`,
        task: `更新 ${duration} 秒视频`,
        costLabel: cost,
        quoteId: metadata.quoteId,
        quoteExpiresAt: metadata.quoteExpiresAt
      };
    });
    const quotedCost = metadata.priceSnapshot
      ? `${metadata.priceSnapshot.amount} ${metadata.priceSnapshot.currency === "gold-bean" ? "金豆" : metadata.priceSnapshot.currency}`
      : "由 Provider 计费";
    const confirmed = await requestGenerationConfirmation({
      title: segmentIds ? "确认更新片段" : "确认批量生成",
      providerLabel: selected.map((segment) => videoProviders.find((provider) => provider.id === (segment.config.providerId ?? current.defaults.providerId ?? activeVideoProviderId))?.name ?? "未知 Provider").filter((value, index, values) => values.indexOf(value) === index).join("、"),
      model: selected.map((segment) => segment.config.model ?? current.defaults.model).filter((value, index, values) => values.indexOf(value) === index).join("、"),
      totalCostLabel: quotedCost,
      items: confirmationItems,
      confirmLabel: `确认提交 ${selected.length} 个片段`
    });
    if (!confirmed) return [];
    const result = await getImageWorkbenchApi().runVideoSequence({
      boardId: current.boardId,
      sequenceId: current.id,
      expectedRevision: current.revision,
      scope: segmentIds ? { segmentIds } : "affected",
      ...metadata
    });
    setActiveVideoSequence((value) => value ? { ...value, sequenceTasks: [...(value.sequenceTasks ?? []), ...result.jobs] } : value);
    await refreshActiveVideoSequence();
    return result.jobs;
  }, [activeVideoProviderId, activeVideoSequence, creditStatus?.videoGoldBeanCostPerSecond, refreshActiveVideoSequence, requestGenerationConfirmation, videoProviders]);

  const exportActiveVideoSequence = useCallback(async (options: VideoSequenceExportOptions): Promise<void> => {
    let current = activeVideoSequence;
    if (!current) return;
    const retry = (): void => { void exportActiveVideoSequence(options); };
    const toastId = toast.loading(options.updateBeforeExport ? "正在更新待生成片段..." : "正在准备导出...");
    try {
      if (options.updateBeforeExport) {
        const staleIds = current.segments
          .filter((segment) => segment.renderedRevision !== segment.desiredRevision || !segment.activeVersionId)
          .map((segment) => segment.id);
        if (staleIds.length > 0) {
          const submitted = await runActiveVideoSequence(staleIds);
          const submittedIds = new Set(submitted.map((task) => task.id));
          if (submittedIds.size === 0) throw new Error("没有创建本次更新任务，已停止导出。");
          let finished = false;
          for (let attempt = 0; attempt < 300; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1_000));
            const latest = await getImageWorkbenchApi().getVideoSequence({ boardId: current.boardId, sequenceId: current.id });
            if (!latest) throw new Error("视频序列不存在，已停止导出。");
            current = latest;
            const currentTasks = (latest.sequenceTasks ?? []).filter((task) => submittedIds.has(task.id));
            const failed = currentTasks.find((task) => ["failed_retryable", "failed_terminal", "remote_unknown", "cancelled"].includes(task.status));
            if (failed) throw new Error(failed.error || "本次更新片段失败，已停止导出。");
            if (currentTasks.length === submittedIds.size && currentTasks.every((task) => task.status === "completed")) {
              const stillStale = latest.segments.some((segment) => staleIds.includes(segment.id)
                && (segment.renderedRevision !== segment.desiredRevision || !segment.activeVersionId));
              if (stillStale) throw new Error("本次更新结果已被新的片段修改取代，已停止导出。");
              finished = true;
              break;
            }
          }
          if (!finished) throw new Error("等待本次片段更新超时，已停止导出。");
        }
      }
      toast.loading("正在拼接视频...", { id: toastId });
      let job = await getImageWorkbenchApi().exportVideoSequence({
        boardId: current.boardId, sequenceId: current.id, expectedRevision: current.revision,
        fileName: options.fileName, resolution: options.resolution, fps: options.fps, includeAudio: options.includeAudio
      });
      for (let attempt = 0; attempt < 1_800 && job.status !== "completed"; attempt += 1) {
        if (["failed", "cancelled"].includes(job.status)) break;
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const latest = await getImageWorkbenchApi().getVideoSequenceExport(job.id);
        if (!latest) throw new Error("导出任务状态丢失，请重试导出。");
        job = latest;
        toast.loading(`正在拼接视频... ${Math.round((job.progress ?? 0) * 100)}%`, { id: toastId });
      }
      if (job.status !== "completed") {
        throw new Error(job.error?.message || (job.status === "cancelled" ? "导出已取消。" : "导出失败或等待超时。"));
      }
      const exportVersionId = job.exportVersionId
        ?? (await getImageWorkbenchApi().getVideoSequence({ boardId: current.boardId, sequenceId: current.id }))?.activeExportVersionId;
      if (!exportVersionId) throw new Error("导出完成但缺少可保存的版本记录。");
      const saved = await getImageWorkbenchApi().saveVideoSequenceExport({
        boardId: current.boardId, sequenceId: current.id, exportVersionId
      });
      toast.success(saved.ok ? "视频已保存" : "导出已完成，可再次点击导出保存", { id: toastId });
      await refreshActiveVideoSequence();
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "视频导出失败。");
      toast.error(message, { id: toastId, duration: Infinity, action: { label: "重试", onClick: retry } });
    }
  }, [activeVideoSequence, refreshActiveVideoSequence, runActiveVideoSequence]);

  const editorVideoSequence = useMemo(() => activeVideoSequence ? toEditorVideoSequence(activeVideoSequence, activeBoard?.name) : null, [activeBoard?.name, activeVideoSequence]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 701px)");
    const sync = (): void => setReserveCanvasSpaceForRightRail(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  function renderCanvasBoard(rightRailInset = effectiveRightRailCanvasInset): React.ReactElement {
    return (
      <MemoizedCanvasBoard
        key={activeBoard?.id ?? "empty"}
        images={images}
        workflowNodes={workflowNodes}
        videoUrls={videoUrls}
        activeImageProvider={activeProvider}
        videoProviders={videoProviders}
        activeVideoProviderId={activeVideoProviderId}
        goldBeanBalance={creditStatus?.goldBeans?.balance}
        goldBeanLoading={creditLoading}
        videoGoldBeanCostPerSecond={creditStatus?.videoGoldBeanCostPerSecond}
        advancedVideoModesEnabled={advancedVideoModesEnabled}
        onStartComicDrama={startComicDramaAt}
        comicDramaBoard={activeBoard?.kind === "comic-drama" || (
          workflowNodes.some(isComicDramaNode)
          && !workflowNodes.some((node) => node.type === "comic-drama-entry")
        )}
        onOpenComicDramaProject={openComicDramaProject}
        onCreateWorkflowNode={handleCreateWorkflowNode}
        onUpdateWorkflowNode={handleUpdateWorkflowNode}
        onSelectionChange={setSelectedCanvasNodeIds}
        onRequestDeleteWorkflowNodes={requestDeleteWorkflowNodes}
        onDeleteWorkflowNodes={handleDeleteWorkflowNodes}
        onContinueComicDrama={openComicDramaSetting}
        onRetryComicCharacter={(node) => void retryComicCharacterGeneration(node)}
        onRunGenerationNode={handleRunGenerationNode}
        onRunVideoGenerationNode={handleRunVideoGenerationNode}
        onDownloadVideo={saveVideo}
        onExtractVideoFrame={extractVideoFrame}
        onRevealVideo={revealVideo}
        onChooseVideoReferenceAudio={handleChooseVideoReferenceAudio}
        onRemoveVideoReferenceAudio={handleRemoveVideoReferenceAudio}
        onSelectVideoVersion={handleSelectVideoVersion}
        onCreateVideoIteration={handleCreateVideoIteration}
        onCompareVideoVersions={handleCompareVideoVersions}
        onStopVideoPolling={handleStopVideoPolling}
        onResumeVideoPolling={handleResumeVideoPolling}
        comments={visibleComments}
        initialPositions={canvasInitialLayout.positions}
        initialViewport={activeBoard?.viewport}
        initialConnections={canvasInitialLayout.connections}
        connectionRevision={canvasInitialLayout.connectionRevision}
        rightRailInset={rightRailInset}
        onCanvasChange={handleCanvasChange}
        focusKey={focusTarget?.key ?? null}
        focusNonce={focusTarget?.nonce}
        selectionTargetIds={selectionTarget?.ids}
        selectionTargetNonce={selectionTarget?.nonce}
        canEditImages={!bridgeError}
        useThumbnailPreview={canvasThumbnailPreview}
        showMinimap={canvasMinimapVisible}
        onShowMinimapChange={handleCanvasMinimapVisibleChange}
        imageToolbarOnHover={canvasImageToolbarOnHover}
        relationshipHoverHighlight={canvasRelationshipHoverHighlight}
        copyImageFormat={copyImageFormat}
        imageDoubleClickAction={imageDoubleClickAction}
        commentMode={commentMode}
        onCommentImage={handleCommentImage}
        onOpenComments={openCanvasComments}
        onMoveComment={moveComment}
        onDeleteComment={deleteComment}
        onRequestDelete={requestDeleteImages}
        onSave={saveImage}
        onQuickShareImage={onlineImageSharingEnabled ? shareCanvasImages : undefined}
        onRemoveBackground={saveImageWithoutBackground}
        onUseReference={toggleImageReference}
        onUseReferences={addImageReferences}
        canAddReferences={input.referenceImages.length < 4}
        referenceNodeIds={referencedCanvasNodeIds}
        referenceCount={input.referenceImages.length}
        onDownloadImages={saveImagesAsZip}
        onExportWechatImages={wechatStickerExportEnabled ? openWechatExportDialog : undefined}
        onCreateVideoSequence={createVideoSequenceFromImages}
        onCreateVideoAssembly={createVideoAssemblyFromVideos}
        onOpenVideoSequence={openPersistedVideoSequence}
        onReconstructInMasterGo={setMasterGoReconstructionImage}
        onEditImage={enterEditSession}
        onSliceImage={openSliceDialog}
        onSaveAsTemplate={openTemplateExtraction}
        sourceTemplateImageIds={templateSourceImageIds}
        onOpenSourceTemplate={openImageSourceTemplate}
        onViewImageDetails={viewCanvasImageDetails}
        onSwitchVersion={switchImageVersion}
        onSeparateVersions={separateVersions}
        clipboardEnabled={
          !libraryOpen &&
          !galleryOpen &&
          !settingsOpen &&
          !editTargetId &&
          !sliceTargetId &&
          !wechatExportRequest &&
          !quickImageShareImages &&
          !shortcutHelpOpen &&
          !referralInviteOpen &&
          deleteTargetIds === null &&
          workflowDeleteTargetIds === null
        }
        restoreSnapshot={canvasRestoreSnapshot}
        onBeforeCanvasChange={pushCanvasUndoSnapshot}
        onUndo={undoCanvasChange}
        onRedo={redoCanvasChange}
        onPasteImages={handlePasteCanvasImages}
        onDropImages={handleDropImages}
        onImportGenerationReferences={handleImportGenerationReferences}
        showEmptyCanvasStart={activeBoard !== null}
        emptyCanvasSuggestedMode={emptyCanvasSuggestedMode}
        promptFocused={promptFocused}
        onStartPrompt={startEmptyCanvasPrompt}
        onAddRecentAssets={addRecentAssetsToCanvas}
        onOpenAssetLibrary={openCanvasAssetLibrary}
        showDemoStart={showFirstRunDemoStart}
        onOpenDemoStart={openCanvasDemoStart}
        onOpenShortcutHelp={openCanvasShortcutHelp}
        onExitCanvas={exitCanvas}
      />
    );
  }

  if (startupLoading || licenseLoading || boardLoading) {
    return (
      <StartupLoading
        label={boardLoading && !startupLoading ? "正在打开画板" : "正在打开 Iterlay"}
        error={licenseLoading ? licenseStartupError : undefined}
        onRetry={licenseLoading ? retryLicenseStatus : undefined}
      />
    );
  }
  if (activeBoard?.kind === "comic-drama" && comicDramaSnapshot) {
    return (
      <div className="workspace-surface relative h-screen w-screen overflow-hidden text-foreground">
        <Suspense fallback={<StartupLoading />}>
          <CanvasRoot>
            <ComicDramaWorkspace
              snapshot={comicDramaSnapshot}
              selectedNodeIds={selectedCanvasNodeIds}
              onBack={() => void openBoard(activeBoard.parentBoardId!, undefined, { suppressLoadingScreen: true })}
              onBeforeAgentRequest={flushBoardSave}
              onAgentMutation={handleComicDramaAgentMutation}
            >
              <Suspense fallback={<div aria-hidden className="absolute inset-0 bg-background" />}>
                {renderCanvasBoard(0)}
              </Suspense>
            </ComicDramaWorkspace>
          </CanvasRoot>
        </Suspense>
        <GenerationConfirmationDialog
          confirmation={generationConfirmation}
          locale={locale}
          onCancel={cancelGenerationConfirmation}
          onConfirm={confirmGenerationSubmission}
        />
        <Toaster theme={effectiveTheme} position="top-center" />
      </div>
    );
  }
  return (
    <div className="workspace-surface relative h-screen w-screen overflow-hidden text-foreground">
      <Suspense fallback={<StartupLoading />}>
      <CanvasRoot>
        {/* 进入全屏画廊时让画板退到背景；只动透明度，避免缩放 React Flow 触发额外栅格化。 */}
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{
            left: assistantDockLayout?.side === "left" ? assistantDockLayout.width : 0,
            right: assistantDockLayout?.side === "right" ? assistantDockLayout.width : 0,
            opacity: galleryOpen ? 0.62 : 1
          }}
          transition={{
            left: { duration: prefersReducedMotion ? 0 : 0.24, ease: EASE_OUT },
            right: { duration: prefersReducedMotion ? 0 : 0.24, ease: EASE_OUT },
            opacity: {
              duration: prefersReducedMotion ? 0 : galleryOpen ? 0.38 : 0.24,
              ease: EASE_OUT
            }
          }}
        >
        {/* 画板切换自身的轻量淡入控制与画廊转场分层，避免两个状态互相覆盖。 */}
        <motion.div className="absolute inset-0" animate={stageControls}>
        <motion.div
          className="absolute top-0 z-20 h-12"
          initial={false}
          animate={{
            left: assistantDockLayout?.side === "left" ? -assistantDockLayout.width : 0,
            right: assistantDockLayout?.side === "right" ? -assistantDockLayout.width : 0
          }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.24,
            ease: EASE_OUT
          }}
        >
          <Suspense fallback={null}>
          <TopBar
          historyOpen={historyOpen}
          commentOpen={commentOpen}
          boardName={activeBoard?.name ?? null}
          activeBoardId={activeBoard?.id}
          boards={topLevelBoards}
          openingBoardId={openingBoardId}
          onOpenLibrary={() => openLibrary()}
          onOpenBoard={(id) => void openBoard(id)}
          onPrefetchBoard={prefetchBoard}
          onCreateBoard={() => void createBoardAndOpen()}
          onRenameBoard={(name) => {
            if (activeBoardRef.current) void renameBoardById(activeBoardRef.current.id, name);
          }}
          canBatchDownload={images.some((image) => Boolean(image.path) && !image.pending)}
          onBatchDownload={() => {
            void saveImagesAsZip(imagesRef.current.filter((image) => !image.pending));
          }}
          onExportBoard={() => {
            if (activeBoardRef.current) void exportBoardById(activeBoardRef.current.id);
          }}
          canUndo={canvasHistoryStatus.canUndo}
          canRedo={canvasHistoryStatus.canRedo}
          onUndo={undoCanvasChange}
          onRedo={redoCanvasChange}
          onToggleHistory={() => {
            setHistoryOpen((value) => !value);
            setCommentOpen(false);
            setImageDetailsTargetId(null);
          }}
          galleryAvailable={galleryAvailable}
          galleryShortcutEnabled={!galleryOpen && !settingsOpen && !editTargetId && !libraryOpen}
          onOpenGallery={openGallery}
          onToggleComment={() => {
            setCommentOpen((value) => !value);
            setHistoryOpen(false);
            setImageDetailsTargetId(null);
          }}
          onOpenImageTrash={() => setImageTrashOpen(true)}
          onOpenShortcutHelp={() => setShortcutHelpOpen(true)}
          onReplayTour={replayOnboarding}
          tourMenuOpen={tourBoardMenuOpen}
          />
          </Suspense>
        </motion.div>

        {!creditLoading && (creditError || bridgeError) ? (
          <ProviderStatusNotice
            message={creditError || bridgeError || "生成服务暂不可用。"}
            onAction={creditError?.includes("设备凭证已失效") ? openLicenseCenter : refreshCreditStatus}
            actionLabel={creditError?.includes("设备凭证已失效") ? "检查授权" : "重新检查"}
          />
        ) : null}

        {licenseStatus &&
        !commentMode &&
        !libraryOpen &&
        !galleryOpen &&
        !settingsOpen &&
        (licenseStatus.state === "UNACTIVATED" || licenseStatus.state === "TRIAL_ACTIVE") ? (
          <ActivationNotice
            state={licenseStatus.state}
            creditBalance={creditStatus?.credits.balance}
            creditLoading={creditLoading}
            creditError={creditError}
            onActivate={openLicenseActivation}
          />
        ) : null}

        {/* 画板铺满窗口，顶栏以毛玻璃浮层叠在画板上方。 */}
        <motion.div
          data-canvas-visible-area=""
          className="absolute inset-y-0 left-0 max-[700px]:!right-0"
          initial={false}
          animate={{ right: effectiveRightRailCanvasInset }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: EASE_OUT }}
        >
          <Suspense fallback={<div aria-hidden className="absolute inset-0 bg-background" />}>
            {renderCanvasBoard()}
          </Suspense>
        </motion.div>

        <AnimatePresence>
          {videoCompare ? (
            <motion.div
              className="fixed inset-0 z-[80] flex flex-col bg-background/96 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="dialog"
              aria-modal="true"
              aria-label="视频版本比较"
            >
              <header className="flex h-12 shrink-0 items-center border-b border-border px-4">
                <span className="text-sm font-semibold">视频版本比较</span>
                <span className="ml-2 text-xs text-muted-foreground">独立播放并检查画面、节奏与声音</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8"
                  aria-label="关闭视频版本比较"
                  onClick={() => setVideoCompare(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </header>
              <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border max-[800px]:grid-cols-1 max-[800px]:divide-x-0 max-[800px]:divide-y">
                {[videoCompare.left, videoCompare.right].map((video, index) => (
                  <section key={`${video.id}-${index}`} className="flex min-h-0 flex-col p-4">
                    <div className="mb-3 flex items-center justify-between text-xs">
                      <strong>版本 {video.version ?? index + 1}</strong>
                      <span className="text-muted-foreground">
                        {video.width && video.height ? `${video.width}×${video.height}` : "自适应画幅"}
                      </span>
                    </div>
                    <video
                      src={video.dataUrl || video.path}
                      poster={video.posterDataUrl || video.posterPath}
                      controls
                      preload="metadata"
                      playsInline
                      className="min-h-0 flex-1 bg-black object-contain"
                      aria-label={`版本 ${video.version ?? index + 1} 播放器`}
                    />
                  </section>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <ReferralInviteDialog
          open={referralInviteOpen}
          onOpenChange={setReferralInviteOpen}
          eligible={Boolean(licenseStatus?.licenseEmail)}
          onActivate={openLicenseActivation}
        />
        {masterGoReconstructionImage ? <Suspense fallback={null}><MasterGoReconstructionDialog
          open
          source={{
            path: masterGoReconstructionImage.path,
            name: masterGoReconstructionImage.path.split("/").pop() || "设计稿",
            dataUrl: masterGoReconstructionImage.dataUrl,
            width: masterGoReconstructionImage.width,
            height: masterGoReconstructionImage.height
          }}
          textProviderId={activeTextProviderId}
          onOpenChange={(open) => { if (!open) setMasterGoReconstructionImage(null); }}
        /></Suspense> : null}

        <AnimatePresence>
          {imageDetailsTarget && activeBoard ? (
            <Suspense fallback={null}>
              <ImageDetailsPanel
                boardId={activeBoard.id}
                image={imageDetailsTarget}
                onClose={() => setImageDetailsTargetId(null)}
                onCopyText={copyText}
                onCopyReferences={copyImageReferences}
                onOpenAssistant={(conversationId) => {
                  setImageDetailsTargetId(null);
                  setAssistantConversationRequest((current) => ({
                    conversationId,
                    nonce: (current?.nonce ?? 0) + 1
                  }));
                }}
              />
            </Suspense>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {historyOpen ? (
            <Suspense fallback={null}>
              <HistoryRail
                history={visibleHistory}
                videoHistory={visibleVideoHistory}
                providers={providers}
                thumbnailFor={getImageThumbnail}
                loadThumbnail={loadHistoryThumbnail}
                onFocusJob={focusJob}
                onReuseJob={reuseJob}
                onClear={clearCurrentBoardHistory}
                onClose={() => setHistoryOpen(false)}
              />
            </Suspense>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {commentOpen ? (
            <Suspense fallback={null}>
              <CommentRail
                comments={visibleComments}
                thumbFor={getImageThumbnail}
                onFocusImage={focusCommentImage}
                onDeleteComment={deleteComment}
                onClose={() => setCommentOpen(false)}
              />
            </Suspense>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {editTarget && !advancedEditOpen ? (
            <Suspense fallback={null}>
              <EditLightbox
                image={editTarget}
                sourceRect={editSourceRect}
                infoMode={editInfoMode}
                onSwitchVersion={switchImageVersion}
                onDownload={saveImage}
                onClose={exitEditSession}
              />
            </Suspense>
          ) : null}
        </AnimatePresence>
        {editTarget && advancedEditOpen ? (
          <Suspense fallback={null}>
            <AdvancedImageEditor
              image={editTarget}
              initialPrompt={input.prompt}
              providerName={activeProvider.name}
              providerLimitation={advancedEditProviderLimitation}
              canDetectSubject={Boolean(textProviderReady && editTarget.path)}
              canInterpretBoard={Boolean(textProviderReady && editTarget.path)}
              onDetectSubject={analyzeEditSubject}
              onSwitchVersion={switchImageVersion}
              onPasteCanvasReferences={handlePasteAdvancedCanvasReferences}
              onPasteReferences={handlePasteAdvancedEditImages}
              onApply={applyAdvancedEdit}
              onInterpretRelaxFlow={(request, onDelta) => interpretRelaxFlow(request, undefined, onDelta)}
              onRefineRelaxFlow={(request, interpretation, instruction, onDelta) => interpretRelaxFlow(request, { interpretation, instruction }, onDelta)}
              onGenerateRelaxFlow={generateRelaxFlow}
              onBack={() => setAdvancedEditOpen(false)}
              onClose={exitEditSession}
            />
          </Suspense>
        ) : null}
        {!advancedEditOpen ? <Suspense fallback={null}><PromptDock
          boardId={activeBoard?.id ?? ""}
          boardNameById={boardNameById}
          input={input}
          scenes={scenes}
          favoriteSceneIds={favoriteSceneIds}
          activeCount={activeGenerations}
          queuedCount={activeBoardGenerations.filter((task) => task.status === "queued").length}
          canGenerate={canGenerate}
          generateButtonStyle={generateButtonStyle}
          needsProviderSetup={needsProviderSetup}
          providerBlocksGenerateReferences={providerBlocksGenerateReferences}
          providers={providers}
          activeProviderId={activeProvider.id}
          creditStatus={creditStatus}
          creditLoading={creditLoading}
          officialRequiredCredits={Math.max(1, input.n) * IMAGE_CREDIT_COST}
          onSelectProvider={selectActiveProvider}
          comicDramaSnapshot={comicDramaSnapshot}
          comicDramaSelectedNodeIds={selectedCanvasNodeIds}
          onApplyComicDramaPlan={applyComicDramaPlan}
          rightRailOpen={historyOpen || commentOpen || Boolean(imageDetailsTarget)}
          autoCollapse={promptDockAutoCollapse}
          boardSmartSuggestionsEnabled={boardSmartSuggestionsEnabled}
           assistantEnabled={boardAssistantEnabled}
           assistantAgentModeEnabled={
             boardAssistantAgentModeEnabled &&
             activeTextProvider?.type === "official" &&
             Boolean(creditStatus?.textFunctionCallingAvailable)
           }
          assistantAwarenessEnabled={boardAssistantEnabled && boardAssistantAwarenessEnabled}
          assistantIntentSuggestionsEnabled={boardAssistantEnabled && boardAssistantIntentSuggestionsEnabled}
          assistantIntentSuggestionCount={boardAssistantIntentSuggestionCount}
          editSmartSuggestionsEnabled={editSmartSuggestionsEnabled}
          memoryEnabled={memoryEnabled}
          memoryUsageLevel={memoryUsageLevel}
          editTarget={promptDockEditTarget}
          boardImages={images}
          suggestingEdits={suggestingEdits}
          suggestedEdits={suggestedEdits}
          canSuggestEdits={Boolean(editSmartSuggestionsEnabled && editTarget?.path && textProviderReady)}
          supportsPromptEnhancement={textProviderReady}
          promptEnhancementUnavailableReason={textProviderReadiness}
          promptEnhancementUnavailableMessage={textProviderUnavailableMessage}
          assistantShortcutEnabled={boardAssistantEnabled && !libraryOpen &&
            !galleryOpen &&
            !settingsOpen &&
            !shortcutHelpOpen &&
            !sliceTargetId &&
            !wechatExportRequest &&
            !deleteTargetIds &&
            !activeTour &&
            !openingBoardId &&
            !commentMode &&
            !pendingComment}
          onAssistantCreditsUsed={refreshCreditStatus}
          onExitEdit={exitEditSession}
          onOpenAdvancedEdit={() => setAdvancedEditOpen(true)}
          onApplyScene={applyScene}
          onToggleFavoriteScene={toggleFavoriteScene}
          onSaveScene={saveScene}
          onResolveTemplatePrompt={resolveTemplatePrompt}
          onResolveUiDesignBrief={resolveUiDesignBrief}
          onOpenSceneLibrary={() => openLibrary("scenes")}
          onPromptChange={changePrompt}
          onApplySuggestedEdit={applySuggestedEdit}
          onRegenerateSuggestedEdits={regenerateSuggestedEdits}
          onInputChange={updateInput}
          onReferenceFiles={(files) => void onReferenceFiles(files)}
          onPasteCanvasReferences={(selectedImages) => void addImageReferences(selectedImages)}
          onPasteImages={(files) => void handlePastePromptImages(files)}
          onAddCanvasReference={(image) => void addImageReference(image)}
          onRemoveReference={removeReference}
          onGenerate={(rect, prompt) => void generate(rect, { prompt })}
          onGeneratePrompts={(requests, conversationId) => void generateAssistantPrompts(requests, conversationId)}
          onOpenAssistantConversation={(conversationId, targetBoardId) => {
            void (async () => {
              if (targetBoardId && targetBoardId !== activeBoardRef.current?.id) {
                await openBoard(targetBoardId);
                if (activeBoardRef.current?.id !== targetBoardId) return;
              }
              setAssistantConversationRequest((current) => ({
                conversationId,
                nonce: (current?.nonce ?? 0) + 1
              }));
            })();
          }}
          assistantConversationRequest={assistantConversationRequest}
          onOpenSettings={() => {
            setSettingsOpen(true);
          }}
          onOpenModelManagement={openModelManagement}
          onAssistantDockLayoutChange={changeAssistantDockLayout}
          promptFocusNonce={promptFocusNonce}
          onPromptFocusChange={setPromptFocused}
        /></Suspense> : null}
        </motion.div>
        </motion.div>

        {gallerySceneMounted ? (
          <motion.div
            data-gallery-transition=""
            aria-hidden={!galleryOpen}
            className="absolute inset-0 z-40 overflow-hidden"
            initial={false}
            animate={galleryOpen
              ? { opacity: 1, visibility: "visible" }
              : { opacity: 0, transitionEnd: { visibility: "hidden" } }}
            transition={{
              duration: prefersReducedMotion ? 0 : galleryOpen
                ? GALLERY_REVEAL_DURATION
                : GALLERY_EXIT_DURATION,
              ease: EASE_OUT
            }}
            style={{ pointerEvents: galleryOpen ? "auto" : "none" }}
          >
            <Suspense fallback={(
              <div aria-hidden className="absolute inset-0 bg-[rgba(9,10,11,0.88)]" />
            )}>
              <BoardGallery
                active={galleryOpen}
                boardId={activeBoard?.id ?? ""}
                boardName={activeBoard?.name ?? "未命名画板"}
                history={visibleHistory}
                canCollaborate={textProviderReady}
                onCollaborate={collaborateScene}
                onLocate={(nodeId) => {
                  setGalleryOpen(false);
                  if (activeBoard) void locateAsset(activeBoard.id, nodeId);
                }}
                onReuse={(job) => {
                  setGalleryOpen(false);
                  void reuseSceneHistory(job);
                }}
                onCopyText={copyText}
                onOpenSettings={() => {
                  setGalleryOpen(false);
                  setSettingsOpen(true);
                }}
                onClose={() => setGalleryOpen(false)}
              />
            </Suspense>
          </motion.div>
        ) : null}

        <AnimatePresence>
          {libraryOpen ? (
            <Suspense key="library" fallback={null}>
              <LibraryShell
                initialTab={libraryInitialTab}
                initialSceneRequest={libraryInitialSceneRequest}
                playAssetLibraryEntrance={!assetLibraryEntrancePlayedRef.current}
                onAssetLibraryEntrancePlayed={markAssetLibraryEntrancePlayed}
                boards={topLevelBoards}
                activeBoardGenerations={activeBoardGenerations}
                activeBoardId={activeBoard?.id}
                openingBoardId={openingBoardId}
                onOpenBoard={(id, origin) => void openBoard(id, origin)}
                onPrefetchBoard={prefetchBoard}
                onCreateBoard={() => void createBoardAndOpen()}
                onCreateFromChat={createFromChat}
                onRenameBoard={(id, name) => void renameBoardById(id, name)}
                onDuplicateBoard={(id) => void duplicateBoardById(id)}
                onDeleteBoard={deleteBoardById}
                onBoardRestored={refreshRestoredBoard}
                onExportBoard={(id) => void exportBoardById(id)}
                onImportBoard={importBoardFromDialog}
                onImportBoardFiles={importBoardFiles}
                comments={comments}
                onAddComment={(imagePath, text) => void persistComment(imagePath, text)}
                onDeleteComment={deleteComment}
                onLocateAsset={(boardId, nodeId) => void locateAsset(boardId, nodeId)}
                onCopyText={copyText}
                onReusePrompt={(prompt, promptSpec) => void reusePromptFromLibrary(prompt, promptSpec)}
                onEditAsset={(boardId, nodeId) => void editAssetFromLibrary(boardId, nodeId)}
                onUseReference={useReferenceFromLibrary}
                onDeleteAsset={deleteAssetFromLibrary}
                scenes={scenes}
                favoriteSceneIds={favoriteSceneIds}
                currentPrompt={input.promptSpec?.sceneBackdrop?.trim() || input.prompt}
                workflowMode={input.workflowMode}
                useCase={input.useCase ?? "other"}
                onApplyScene={applyScene}
                onToggleFavoriteScene={toggleFavoriteScene}
                onSaveScene={saveScene}
                onUpdateScene={updateScene}
                onDeleteScene={deleteScene}
                onExportScene={(scene) => void exportSceneTemplate(scene)}
                onSubmitScene={submitSceneTemplate}
                onGetSceneSubmission={getSceneTemplateSubmission}
                onImportScene={importSceneTemplate}
                onImportSceneFiles={importSceneTemplateFiles}
                sceneHistory={history}
                canOptimizeScene={textProviderReady}
                canCollaborateScene={textProviderReady}
                onGenerateTemplateVerification={(submission, task) => {
                  const provider = providers.find((item) => item.id === submission.providerId);
                  if (!provider) return Promise.reject(new Error("验证稿使用的图片 Provider 已不可用，请重新选择。"));
                  return generateTemplateVerification(submission, task, {
                    provider,
                    api: getImageWorkbenchApi(),
                    confirm: requestGenerationConfirmation
                  });
                }}
                sceneGenerationDefaults={{
                  providerId: activeProvider.id,
                  providerName: activeProvider.name,
                  model: activeProvider.model || input.model,
                  size: input.size,
                  quality: input.quality,
                  style: input.style,
                  canGenerate: !bridgeError && (
                    isOfficialProvider
                      ? Boolean(creditStatus?.providerAvailable) && !creditLoading
                      : setupComplete && activeHasKey
                  ),
                  supportsEditing: activeProvider.supportsReferenceImages
                }}
                onOptimizeScene={optimizeSceneDescription}
                onCollaborateScene={collaborateScene}
                onInterpretCreateChat={interpretCreateChat}
                onLocateSceneHistory={(job, imagePath) => void locateSceneHistory(job, imagePath)}
                onReuseSceneHistory={(job) => void reuseSceneHistory(job)}
                onUseSceneHistoryAsReference={(imagePath) => void addSceneHistoryAsReference(imagePath)}
                loadSceneThumbnail={loadHistoryThumbnail}
                onLocateOnlineShare={(boardId, nodeIds) => void locateOnlineShare(boardId, nodeIds)}
                onOpenReferralInvite={() => setReferralInviteOpen(true)}
                onOpenSettings={() => setSettingsOpen(true)}
                onClose={() => setLibraryOpen(false)}
              />
            </Suspense>
          ) : null}
        </AnimatePresence>
      </CanvasRoot>
      </Suspense>
      {editorVideoSequence && activeVideoSequence ? (
        <div className="fixed inset-0 z-[90] bg-background">
          <Suspense fallback={<StartupLoading label="正在打开镜头序列" />}>
            <VideoSequenceEditor
              sequence={editorVideoSequence}
              mediaUrls={activeVideoSequence.mediaUrls}
              providers={videoProviders}
              credits={{
                balance: creditStatus?.goldBeans?.balance,
                videoGoldBeanCostPerSecond: creditStatus?.videoGoldBeanCostPerSecond,
                quoteLabel: "由外部服务商计费"
              }}
              templates={videoSequenceTemplates.map((template) => ({
                id: template.id,
                name: template.name,
                slotCount: template.slots.length,
                segmentCount: template.segments.length,
                aspectRatio: template.defaults.aspectRatio,
                updatedAt: template.updatedAt
              }))}
              saving={videoSequenceSaving}
              saveError={videoSequenceSaveError}
              onChange={updateActiveVideoSequence}
              onGenerateSegment={async (segmentId) => { await runActiveVideoSequence([segmentId]); }}
              onGenerateBatch={async (segmentIds) => { await runActiveVideoSequence(segmentIds); }}
              onSaveTemplate={async (name) => {
                const template = await getImageWorkbenchApi().createVideoSequenceTemplate({ sequence: activeVideoSequence, name, description: "" });
                setVideoSequenceTemplates((items) => [...items.filter((item) => item.id !== template.id), template]);
              }}
              onApplyTemplate={async (templateId) => {
                const sequence = await getImageWorkbenchApi().instantiateVideoSequenceTemplate({
                  boardId: activeVideoSequence.boardId,
                  templateId,
                  imageNodeIds: activeVideoSequence.keyframes.map((frame) => frame.source.nodeId).filter((id): id is string => Boolean(id))
                });
                const hydrated = await getImageWorkbenchApi().getVideoSequence({ boardId: sequence.boardId, sequenceId: sequence.id });
                if (hydrated) setActiveVideoSequence(hydrated);
              }}
              onExport={exportActiveVideoSequence}
              onClose={() => setActiveVideoSequence(null)}
              onLocateKeyframe={(keyframeId) => {
                const nodeId = activeVideoSequence.keyframes.find((frame) => frame.id === keyframeId)?.source.nodeId;
                if (nodeId) setSelectionTarget({ ids: [nodeId], nonce: Date.now() });
                setActiveVideoSequence(null);
              }}
            />
          </Suspense>
        </div>
      ) : null}

      {!libraryOpen ? <PiTemplateAgentStatus /> : null}

      {templateExtractionSource ? (
        <Suspense fallback={null}>
          <TemplateExtractionDialog
            key={templateExtractionSource.id}
            open
            source={templateExtractionSource}
            existingTemplates={customScenes}
            onOpenChange={(open) => !open && setTemplateExtractionSource(null)}
            onExtract={extractTemplateFromCanvas}
            onSave={saveExtractedTemplate}
          />
        </Suspense>
      ) : null}

      {settingsOpen || settingsDialogMounted ? (
        <Suspense fallback={null}>
          <ProviderSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            entryPoint={settingsEntryPoint}
            providers={providers}
            activeProviderId={activeProviderId}
            textProviders={textProviders}
            activeTextProviderId={activeTextProviderId}
            videoProviders={videoProviders}
            activeVideoProviderId={activeVideoProviderId}
            providerKeyStatus={providerKeyStatus}
            bridgeError={bridgeError}
            language={language}
            onLanguageChange={changeLanguage}
            theme={theme}
            onThemeChange={changeTheme}
            promptDockAutoCollapse={promptDockAutoCollapse}
            onPromptDockAutoCollapseChange={changePromptDockAutoCollapse}
            advancedVideoModesEnabled={advancedVideoModesEnabled}
            onAdvancedVideoModesEnabledChange={changeAdvancedVideoModesEnabled}
            canvasThumbnailPreview={canvasThumbnailPreview}
            onCanvasThumbnailPreviewChange={changeCanvasThumbnailPreview}
            canvasMinimapVisible={canvasMinimapVisible}
            onCanvasMinimapVisibleChange={changeCanvasMinimapVisible}
            canvasImageToolbarOnHover={canvasImageToolbarOnHover}
            onCanvasImageToolbarOnHoverChange={changeCanvasImageToolbarOnHover}
            canvasRelationshipHoverHighlight={canvasRelationshipHoverHighlight}
            onCanvasRelationshipHoverHighlightChange={changeCanvasRelationshipHoverHighlight}
            wechatStickerExportEnabled={wechatStickerExportEnabled}
            onWechatStickerExportEnabledChange={changeWechatStickerExportEnabled}
            onlineImageSharingEnabled={onlineImageSharingEnabled}
            onOnlineImageSharingEnabledChange={changeOnlineImageSharingEnabled}
            copyImageFormat={copyImageFormat}
            onCopyImageFormatChange={changeCopyImageFormat}
            boardSmartSuggestionsEnabled={boardSmartSuggestionsEnabled}
            onBoardSmartSuggestionsEnabledChange={changeBoardSmartSuggestionsEnabled}
             boardAssistantEnabled={boardAssistantEnabled}
             onBoardAssistantEnabledChange={changeBoardAssistantEnabled}
             boardAssistantAgentModeEnabled={boardAssistantAgentModeEnabled}
             boardAssistantAgentModeAvailable={
               resolveTextProviderReadiness(
                 activeTextProvider,
                 providerKeyStatus,
                 creditStatus,
                 creditError
               ) === "ready" &&
               (
                 activeTextProvider?.type !== "official" ||
                 Boolean(creditStatus?.textFunctionCallingAvailable)
               )
             }
             boardAssistantAgentModeModel={creditStatus?.textModel}
             onBoardAssistantAgentModeEnabledChange={changeBoardAssistantAgentModeEnabled}
             piAgentBuiltinTools={piAgentBuiltinTools ?? []}
             onPiAgentBuiltinToolsChange={changePiAgentBuiltinTools}
             piAgentIterlayTools={piAgentIterlayTools}
             onPiAgentIterlayToolsChange={changePiAgentIterlayTools}
             piAgentSkillPaths={piAgentSkillPaths}
             onPiAgentSkillPathsChange={changePiAgentSkillPaths}
             piAgentExtensionPaths={piAgentExtensionPaths}
             onPiAgentExtensionPathsChange={changePiAgentExtensionPaths}
             piAgentCustomSkillPaths={piAgentCustomSkillPaths}
             onPiAgentCustomSkillPathsChange={changePiAgentCustomSkillPaths}
             piAgentCustomExtensionPaths={piAgentCustomExtensionPaths}
             onPiAgentCustomExtensionPathsChange={changePiAgentCustomExtensionPaths}
             piAgentMaxTurns={piAgentMaxTurns}
             onPiAgentMaxTurnsChange={changePiAgentMaxTurns}
             piAgentWebSearchMaxResults={piAgentWebSearchMaxResults}
             onPiAgentWebSearchMaxResultsChange={changePiAgentWebSearchMaxResults}
            boardAssistantAwarenessEnabled={boardAssistantAwarenessEnabled}
            onBoardAssistantAwarenessEnabledChange={changeBoardAssistantAwarenessEnabled}
            boardAssistantIntentSuggestionsEnabled={boardAssistantIntentSuggestionsEnabled}
            onBoardAssistantIntentSuggestionsEnabledChange={changeBoardAssistantIntentSuggestionsEnabled}
            boardAssistantIntentSuggestionCount={boardAssistantIntentSuggestionCount}
            onBoardAssistantIntentSuggestionCountChange={changeBoardAssistantIntentSuggestionCount}
            editSmartSuggestionsEnabled={editSmartSuggestionsEnabled}
            editSmartSuggestionsAvailable={editSmartSuggestionsAvailable}
            onEditSmartSuggestionsEnabledChange={changeEditSmartSuggestionsEnabled}
            memoryEnabled={memoryEnabled}
            onMemoryEnabledChange={changeMemoryEnabled}
            memoryUsageLevel={memoryUsageLevel}
            onMemoryUsageLevelChange={changeMemoryUsageLevel}
            editInfoMode={editInfoMode}
            onEditInfoModeChange={changeEditInfoMode}
            imageDoubleClickAction={imageDoubleClickAction}
            onImageDoubleClickActionChange={changeImageDoubleClickAction}
            versionSeparationMode={versionSeparationMode}
            onVersionSeparationModeChange={changeVersionSeparationMode}
            generateButtonStyle={generateButtonStyle}
            onGenerateButtonStyleChange={changeGenerateButtonStyle}
            downloadDirectory={downloadDirectory}
            onDownloadDirectoryChange={setDownloadDirectory}
            onSaved={persistProviders}
          />
        </Suspense>
      ) : null}

      {commentMode ? (
        <div className="pointer-events-none fixed left-1/2 top-16 z-40 -translate-x-1/2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
          评论模式 · 点击图片添加评论 · Esc 退出
        </div>
      ) : null}
      {pendingComment ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPendingComment(null)} />
          <CommentComposer
            x={pendingComment.x}
            y={pendingComment.y}
            onSubmit={submitComment}
            onCancel={() => setPendingComment(null)}
          />
        </>
      ) : null}

      {imageTrashOpen ? (
        <Suspense fallback={null}>
          <ImageTrashDialog
            open
            onOpenChange={setImageTrashOpen}
            onRestore={restoreTrashedBoardImage}
          />
        </Suspense>
      ) : null}

      <Dialog open={comicDramaEntryPosition !== null} onOpenChange={(open) => !open && setComicDramaEntryPosition(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>漫剧项目</DialogTitle>
            <DialogDescription>打开已有项目，或创建一个新的独立漫剧子画板。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {workflowNodes.filter((node) => node.type === "comic-drama-entry").map((node) => {
              return <Button key={node.id} type="button" variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => openComicDramaProject(node)}>
                <span><b className="block">打开 · {node.name}</b><small className="mt-0.5 block font-normal text-muted-foreground">进入独立漫剧制作画板</small></span>
              </Button>;
            })}
            <Button type="button" variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => comicDramaEntryPosition && void createComicDramaProjectAt(comicDramaEntryPosition)}>
              <span><b className="block">新建漫剧项目</b><small className="mt-0.5 block font-normal text-muted-foreground">创建入口卡与独立子画板，不调用 Provider</small></span>
            </Button>
          </div>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setComicDramaEntryPosition(null)}>取消</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <GenerationConfirmationDialog
        confirmation={generationConfirmation}
        locale={locale}
        onCancel={cancelGenerationConfirmation}
        onConfirm={confirmGenerationSubmission}
      />

      <Dialog open={deleteTargetIds !== null} onOpenChange={(open) => !open && cancelDeleteImages()}>
        <DialogContent
          className="max-w-sm"
          onKeyDown={(event) => {
            // 回车即删除（无论焦点在哪个按钮）。
            if (event.key === "Enter") {
              event.preventDefault();
              void confirmDeleteImages();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>删除图片</DialogTitle>
            <DialogDescription>
              将从画布移除
              {deleteTargetIds && deleteTargetIds.length > 1 ? ` ${deleteTargetIds.length} 张图片` : "这张图片"}
              。图片会移入回收站，可在自动清理前恢复（评论仍会保留）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={trashingImages} onClick={cancelDeleteImages}>
              取消
            </Button>
            <Button variant="destructive" disabled={trashingImages} onClick={() => void confirmDeleteImages()}>
              {trashingImages ? "正在移入回收站…" : "移入回收站（回车）"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={workflowDeleteTargetIds !== null}
        onOpenChange={(open) => !open && cancelDeleteWorkflowNodes()}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除漫剧项目？</DialogTitle>
            <DialogDescription>
              {workflowDeleteTargetIds && workflowDeleteTargetIds.length > 1
                ? `将删除选中的 ${workflowDeleteTargetIds.length} 个漫剧项目入口，并把对应子画板移入回收站。`
                : "将删除这个漫剧项目入口，并把对应子画板移入回收站。"}
              可使用撤销恢复，之后也可重做删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDeleteWorkflowNodes}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDeleteWorkflowNodes}>
              删除项目
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {shortcutHelpOpen ? (
        <Suspense fallback={null}>
          <CanvasShortcutHelpDialog open onOpenChange={setShortcutHelpOpen} />
        </Suspense>
      ) : null}

      {sliceTarget ? (
        <Suspense fallback={null}>
          <ImageSliceDialog
            open
            image={sliceTarget}
            aiAvailable={setupComplete && activeHasKey}
            aiProviderName={activeProvider.name}
            onOpenChange={(open) => !open && setSliceTargetId(null)}
            onConfirm={confirmSliceImage}
            onAnalyzeSubjects={analyzeSliceSubjects}
          />
        </Suspense>
      ) : null}

      {wechatExportRequest ? (
        <Suspense fallback={null}>
          <WechatStickerExportDialog
            open
            images={wechatExportRequest.images}
            boardId={activeBoard?.id}
            initialMode={wechatExportRequest.mode}
            onOpenChange={(open) => !open && setWechatExportRequest(null)}
            onExported={(result, count) => {
              if (result.directory) setDownloadDirectory(result.directory);
              setStatus(`已导出 ${count} 张微信表情。`);
              iterlayToast.exported({
                title: "微信表情素材已导出",
                count,
                path: result.folderPath ?? result.zipPath
              });
            }}
          />
        </Suspense>
      ) : null}
      {quickImageShareImages ? (
        <Suspense fallback={null}>
          <QuickImageShareDialog
            images={quickImageShareImages}
            boardId={activeBoard?.id}
            onOpenChange={(open) => {
              if (!open) setQuickImageShareImages(null);
            }}
          />
        </Suspense>
      ) : null}

      {skillUpgradeDetails.length > 0 ? (
        <Suspense fallback={null}>
          <SkillUpgradeDetailsDialog
            open={skillUpgradeDetailsOpen}
            details={skillUpgradeDetails}
            onOpenChange={setSkillUpgradeDetailsOpen}
          />
        </Suspense>
      ) : null}

      <Toaster theme={effectiveTheme} position="top-center" />
      <Suspense fallback={null}>
        <FeedbackWidget
          boardId={activeBoard?.id}
          boardName={activeBoard?.name}
          view={
            settingsOpen
              ? "settings"
              : libraryOpen
                ? "library"
                : galleryOpen
                  ? "gallery"
                  : imageDetailsTargetId
                    ? "asset-detail"
                    : editTargetId
                      ? "image-editor"
                      : sliceTargetId
                        ? "image-slicing"
                        : activeBoard
                          ? "board"
                          : "home"
          }
        />
      </Suspense>
      <AnimatePresence>
        {activeTour ? (
          <Suspense fallback={null}>
            <FeatureTour
              key={activeTour.id}
              tour={activeTour}
              onFinish={finishActiveTour}
              onStepEnter={handleTourStepEnter}
              welcomeCreditBalance={creditStatus?.credits.balance}
              welcomeLicenseState={licenseStatus?.state}
              onWelcomeUseOfficial={() => selectActiveProvider(OFFICIAL_PROVIDER_ID)}
              onWelcomeConnectProvider={openProviderSetup}
              onWelcomeOpenLicense={openLicenseActivation}
            />
          </Suspense>
        ) : null}
      </AnimatePresence>
      <ParticleBurst
        trigger={particleBurst}
        onComplete={(nonce) => {
          // A completed older burst must not cancel a newer generation's animation.
          setParticleBurst((current) => current?.nonce === nonce ? null : current);
        }}
      />
    </div>
  );
}

/** 评论输入浮层：在点击处弹出，Enter 发送、Shift+Enter 换行、Esc 取消。 */
function CommentComposer({
  x,
  y,
  onSubmit,
  onCancel
}: {
  x: number;
  y: number;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  // 贴着点击点弹出，并夹在视口内，避免超出边缘。
  const left = Math.max(12, Math.min(x, window.innerWidth - 300));
  const top = Math.max(60, Math.min(y, window.innerHeight - 176));

  function submit(): void {
    const trimmed = text.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <div
      className="fixed z-50 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      style={{ left, top }}
      onClick={(event) => event.stopPropagation()}
    >
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (isSendEnter(event)) {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="写下评论建议…（Enter 发送 · Esc 取消）"
        className="min-h-[76px] resize-none border-0 bg-transparent px-3 py-2.5 text-sm leading-6 shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center justify-end gap-2 border-t border-border px-2.5 py-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" disabled={!text.trim()} onClick={submit}>
          评论
        </Button>
      </div>
    </div>
  );
}

function readLibraryOpenPref(): boolean {
  try {
    return (localStorage.getItem("iterlay.libraryOpen") ?? localStorage.getItem("ir.libraryOpen")) === "1";
  } catch {
    return false;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function parseSizeDimensions(size: string): { width: number; height: number } | null {
  try {
    const parsed = parseGptImageSize(size);
    // auto：比例由模型决定，占位卡走正方形回退，避免 "auto".split("x") 产生 NaN。
    if (parsed === "auto") return null;
    const [width, height] = parsed.split("x").map(Number);
    return { width, height };
  } catch {
    return null;
  }
}

function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

function loadVideoMetadata(file: File): Promise<{ width?: number; height?: number; durationMs?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1_000) : undefined;
      resolve({
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        durationMs
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    video.src = url;
  });
}

function inferVideoMimeType(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  if (extension === "m4v") return "video/x-m4v";
  return "video/mp4";
}

function inferAudioMimeType(name: string): string {
  const extension = name.split(".").pop()?.toLocaleLowerCase();
  if (extension === "wav") return "audio/wav";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "aac") return "audio/aac";
  if (extension === "ogg") return "audio/ogg";
  return "audio/mpeg";
}

async function fileToReferencePayload(file: File, role: ReferenceImageRole): Promise<ReferenceImagePayload> {
  const dataUrl = await readFileAsDataUrl(file);
  const [, base64 = ""] = dataUrl.split(",");
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || "image/png",
    dataBase64: base64,
    role
  };
}

function dataUrlToReferencePayload(
  dataUrl: string,
  name: string,
  role: ReferenceImageRole
): ReferenceImagePayload | null {
  const match = /^data:(.+?);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const [, mimeType, base64] = match;
  return { id: crypto.randomUUID(), name, mimeType, dataBase64: base64, role };
}
