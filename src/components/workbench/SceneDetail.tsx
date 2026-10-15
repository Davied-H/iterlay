import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleX,
  Clock3,
  Copy,
  CopyPlus,
  Download,
  GripVertical,
  Grid3X3,
  Image as ImageIcon,
  ImagePlus,
  Info,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  PanelRight,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
  type LucideIcon
} from "lucide-react";
import { toast } from "sonner";
import type {
  BoardSummary,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  GenerationJob,
  ImageQuality,
  ReferenceImagePayload,
  SceneMediaResult,
  SceneMediaSummary,
  TemplateSubmissionResult,
  TemplateSubmissionStatus
} from "@shared/types";
import { constrainReferenceImageDimensions } from "@shared/reference-image-limits";
import { Button } from "@/components/ui/button";
import { iterlayToast } from "@/components/ui/iterlay-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AiAssistantContextImage, AiAssistantMessage } from "@/components/assistant/AiAssistant";
import { TemplateUseAssistant } from "@/components/assistant/TemplateUseAssistant";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import { LibraryFilterTabs } from "@/components/workbench/LibraryFilterTabs";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";
import { finishActiveSceneGeneration, startActiveSceneGeneration, useActiveSceneGeneration } from "@/lib/active-scene-generation";
import { GENERATION_ESTIMATE_MS, getGenerationTiming, type GenerationTiming } from "@/lib/generation-timing";
import { SCENE_CATEGORY_LABELS, sceneMatchesGeneration, type SceneDefinition } from "@/lib/scene-library";
import { getImageWorkbenchApi, getWorkbenchErrorMessage, hasImageWorkbenchApi } from "@/lib/image-workbench-api";
import { sceneAssistantFieldsToPrompt } from "@/lib/prompt-assistant";
import type { SceneGenerationDefaults } from "@/lib/scene-media";
import { isSendEnter } from "@/lib/send-on-enter";
import { composeTemplateVariationPrompt, type TemplatePromptVariation } from "@/lib/template-workflow";
import { cn } from "@/lib/utils";

interface SceneDetailProps {
  scene: SceneDefinition;
  isFavorite: boolean;
  boards: BoardSummary[];
  history: GenerationJob[];
  media?: SceneMediaSummary;
  generationDefaults: SceneGenerationDefaults;
  canOptimize: boolean;
  onBack: () => void;
  onApply: (scene: SceneDefinition) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: () => void;
  onExport: (scene: SceneDefinition) => void;
  onSubmit: (scene: SceneDefinition, authorName: string, exampleResultIds: string[]) => Promise<TemplateSubmissionResult>;
  onGetSubmission: (scene: SceneDefinition) => Promise<TemplateSubmissionResult | null>;
  onCollaborate: (
    request: Omit<CollaborateSceneRequest, "textProviderId">
  ) => Promise<CollaborateSceneResult>;
  onCopyText: (text: string) => void;
  onLocateHistory: (job: GenerationJob, imagePath: string) => void;
  onReuseHistory: (job: GenerationJob) => void;
  onUseHistoryAsReference: (imagePath: string) => void;
  loadThumbnail: (path: string) => Promise<string | undefined>;
  onMediaChange: () => Promise<void>;
  onOpenSettings: () => void;
}

interface SceneHistoryItem {
  id: string;
  path: string;
  prompt: string;
  createdAt: string;
  boardName: string;
  job: GenerationJob;
}

type HistoryView = "grid" | "list";
type HistorySort = "newest" | "oldest";
type GenerationCount = 1 | 2 | 3;
type PromptView = "example" | "template";

interface ScenePreviewPrompt {
  key: string;
  label: string;
  prompt: string;
}

interface SceneSourceImage {
  payload: ReferenceImagePayload;
  previewUrl: string;
}

type SceneGenerationTaskStatus = "queued" | "running" | "succeeded" | "failed";

interface SceneGenerationTask {
  id: string;
  title: string;
  status: SceneGenerationTaskStatus;
  error?: string;
}

interface CreationPromptDragState {
  pointerId: number;
  startY: number;
  startHeight: number;
  currentHeight: number;
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 4;
const CREATION_PROMPT_MIN_HEIGHT = 56;
const CREATION_PROMPT_MAX_HEIGHT = 360;
const CREATION_PROMPT_VIEWPORT_RESERVED_HEIGHT = 500;
const EMPTY_SCENE_MEDIA_RESULTS: SceneMediaResult[] = [];
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat((document.documentElement.lang || "zh-CN"), {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
const QUALITY_LABELS = {
  auto: "自动",
  low: "低",
  medium: "标准",
  high: "高"
} as const;
const QUALITY_OPTIONS: Array<{ value: ImageQuality; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "low", label: "低" },
  { value: "medium", label: "标准" },
  { value: "high", label: "高" }
];

const TEMPLATE_SUBMISSION_STATUS_META: Record<TemplateSubmissionStatus, {
  label: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  iconSurfaceClassName: string;
}> = {
  pending: {
    label: "待审核",
    description: "Manager 正在审核这份模板，审核通过后会出现在模板广场。",
    icon: Clock3,
    iconClassName: "text-amber-700 dark:text-amber-300",
    iconSurfaceClassName: "bg-amber-500/10"
  },
  published: {
    label: "已发布",
    description: "这份模板已通过审核并发布到模板广场。",
    icon: Check,
    iconClassName: "text-emerald-700 dark:text-emerald-300",
    iconSurfaceClassName: "bg-emerald-500/10"
  },
  rejected: {
    label: "被拒绝",
    description: "这份模板未通过审核，请根据拒绝原因修改后重新提交。",
    icon: CircleX,
    iconClassName: "text-destructive",
    iconSurfaceClassName: "bg-destructive/10"
  },
  taken_down: {
    label: "已下架",
    description: "这份模板已从模板广场下架，可修改后重新提交审核。",
    icon: CircleAlert,
    iconClassName: "text-amber-700 dark:text-amber-300",
    iconSurfaceClassName: "bg-amber-500/10"
  },
  withdrawn: {
    label: "已撤回",
    description: "这份模板的发布申请已撤回，可重新提交审核。",
    icon: RotateCcw,
    iconClassName: "text-muted-foreground",
    iconSurfaceClassName: "bg-muted"
  }
};
const SIZE_OPTIONS = [
  { value: "auto", label: "自动", description: "由模型决定" },
  { value: "1024x1024", label: "1024 x 1024", description: "1:1 方形" },
  { value: "1536x1024", label: "1536 x 1024", description: "3:2 横图" },
  { value: "1024x1536", label: "1024 x 1536", description: "2:3 竖图" },
  { value: "2048x2048", label: "2048 x 2048", description: "1:1 2K 方形" },
  { value: "2048x1152", label: "2048 x 1152", description: "16:9 2K 横图" },
  { value: "3840x2160", label: "3840 x 2160", description: "16:9 4K 横图" },
  { value: "2160x3840", label: "2160 x 3840", description: "9:16 4K 竖图" }
] as const;

function useSceneGenerationTiming(startedAt: number | null): GenerationTiming | null {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const update = (): void => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return startedAt === null ? null : getGenerationTiming(startedAt, now);
}

function formatDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function clampCreationPromptHeight(value: number, maxHeight: number): number {
  return Math.min(maxHeight, Math.max(CREATION_PROMPT_MIN_HEIGHT, value));
}

function measureCreationPromptContentHeight(textarea: HTMLTextAreaElement, maxHeight: number): number {
  const renderedHeight = textarea.getBoundingClientRect().height;
  const inlineTransition = textarea.style.transition;
  textarea.style.transition = "none";
  textarea.style.height = `${CREATION_PROMPT_MIN_HEIGHT}px`;
  const contentHeight = clampCreationPromptHeight(textarea.scrollHeight, maxHeight);
  textarea.style.height = `${renderedHeight}px`;
  void textarea.offsetHeight;
  textarea.style.transition = inlineTransition;
  return contentHeight;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取“${file.name}”。`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取内置示例图片。"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function readConstrainedImageAsDataUrl(file: File): Promise<{
  previewUrl: string;
  mimeType: string;
  resized: boolean;
}> {
  const bitmap = await createImageBitmap(file);
  try {
    const target = constrainReferenceImageDimensions(bitmap.width, bitmap.height);
    if (target.width === bitmap.width && target.height === bitmap.height) {
      return { previewUrl: await readFileAsDataUrl(file), mimeType: file.type, resized: false };
    }
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法缩小图片。");
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("无法缩小图片。")), "image/jpeg", 0.9);
    });
    return { previewUrl: await readBlobAsDataUrl(blob), mimeType: blob.type, resized: true };
  } finally {
    bitmap.close();
  }
}

function buildScenePreviewDownloadName(sceneName: string, label: string, source: string): string {
  const safeBaseName = `${sceneName}-${label}`
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "preview";
  const extension = source.split(/[?#]/, 1)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() || "png";
  return `${safeBaseName}.${extension}`;
}

function GenerationTaskStatus({ task }: { task: SceneGenerationTask }): React.ReactElement {
  const content = task.status === "queued"
    ? { label: "排队中", icon: <Clock3 className="h-3 w-3" />, className: "text-muted-foreground" }
    : task.status === "running"
      ? { label: "生成中", icon: <Loader2 className="h-3 w-3 animate-spin" />, className: "text-foreground" }
      : task.status === "succeeded"
        ? { label: "已完成", icon: <Check className="h-3 w-3" />, className: "text-[hsl(var(--success))]" }
        : { label: "失败", icon: <X className="h-3 w-3" />, className: "text-destructive" };
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-[11px] font-medium", content.className)}>
      {content.icon}
      {content.label}
    </span>
  );
}

export function SceneDetail({
  scene,
  isFavorite,
  boards,
  history,
  media,
  generationDefaults,
  canOptimize,
  onBack,
  onApply,
  onToggleFavorite,
  onEdit,
  onExport,
  onSubmit,
  onGetSubmission,
  onCollaborate,
  onCopyText,
  onLocateHistory,
  onReuseHistory,
  onUseHistoryAsReference,
  loadThumbnail,
  onMediaChange,
  onOpenSettings
}: SceneDetailProps): React.ReactElement {
  const uiText = useUiText();

  const reduceMotion = Boolean(useReducedMotion());
  const segmentedControlId = useId();
  const [activeScene, setActiveScene] = useState(scene);
  const [generationBrief, setGenerationBrief] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [generatedVariations, setGeneratedVariations] = useState<TemplatePromptVariation[]>([]);
  const [generatedForCount, setGeneratedForCount] = useState<GenerationCount>(1);
  const [generatedFromBrief, setGeneratedFromBrief] = useState("");
  const [generatedFromReferences, setGeneratedFromReferences] = useState("");
  const [templateExpanded, setTemplateExpanded] = useState(false);
  const [promptView, setPromptView] = useState<PromptView>("example");
  const [previewPrompt, setPreviewPrompt] = useState<ScenePreviewPrompt | null>(null);
  const [assistantMessages, setAssistantMessages] = useState<AiAssistantMessage[]>([]);
  const [appliedAssistantPrompt, setAppliedAssistantPrompt] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantSuggestions, setAssistantSuggestions] = useState<string[]>([]);
  const [assistantSuggestionsLoading, setAssistantSuggestionsLoading] = useState(false);
  const [generationCount, setGenerationCount] = useState<GenerationCount>(1);
  const [generationSize, setGenerationSize] = useState(generationDefaults.size);
  const [generationQuality, setGenerationQuality] = useState<ImageQuality>(generationDefaults.quality ?? "auto");
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [sourceImage, setSourceImage] = useState<SceneSourceImage | null>(null);
  const [referenceImages, setReferenceImages] = useState<SceneSourceImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generationTasks, setGenerationTasks] = useState<SceneGenerationTask[]>([]);
  const [mediaMutating, setMediaMutating] = useState(false);
  const [deleteResultTarget, setDeleteResultTarget] = useState<SceneMediaResult | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [submissionAuthor, setSubmissionAuthor] = useState("");
  const [submissionExampleIds, setSubmissionExampleIds] = useState<string[]>([]);
  const [submissionConsent, setSubmissionConsent] = useState(false);
  const [submissionPhase, setSubmissionPhase] = useState<"idle" | "loading" | "submitting">("idle");
  const [submission, setSubmission] = useState<TemplateSubmissionResult | null>(null);
  const [submissionError, setSubmissionError] = useState("");
  const [submissionLoadError, setSubmissionLoadError] = useState("");
  const [workspaceView, setWorkspaceView] = useState<MediaStageView>("preview");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantLayoutOpen, setAssistantLayoutOpen] = useState(false);
  const [creationTrayOpen, setCreationTrayOpen] = useState(false);
  const [creationPromptHeight, setCreationPromptHeight] = useState(CREATION_PROMPT_MIN_HEIGHT);
  const [creationPromptMaxHeight, setCreationPromptMaxHeight] = useState(CREATION_PROMPT_MAX_HEIGHT);
  const [creationPromptDragging, setCreationPromptDragging] = useState(false);
  const [wideWorkspace, setWideWorkspace] = useState(() => window.matchMedia("(min-width: 1280px)").matches);
  const generationRunRef = useRef(false);
  const assistantRequestRef = useRef(0);
  const assistantSuggestionRequestRef = useRef(0);
  const assistantSuggestionHistoryRef = useRef<string[]>([]);
  const assistantFileInputRef = useRef<HTMLInputElement>(null);
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);
  const creationActionRef = useRef<HTMLButtonElement>(null);
  const creationPromptRef = useRef<HTMLTextAreaElement>(null);
  const creationPromptDragRef = useRef<CreationPromptDragState | null>(null);
  const creationPromptDragFrameRef = useRef<number | null>(null);
  const creationPromptManualHeightRef = useRef(false);
  const assistantExitFocusRef = useRef<"trigger" | "creation" | null>(null);
  const submissionRequestRef = useRef(0);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorTitleRef = useRef<HTMLHeadingElement>(null);
  const activeSceneGeneration = useActiveSceneGeneration(activeScene.id);
  const sceneGenerationActive = generating || Boolean(activeSceneGeneration);
  const generationTiming = useSceneGenerationTiming(
    activeSceneGeneration?.startedAt ?? generationStartedAt
  );

  useEffect(() => {
    setActiveScene(scene);
    setGenerationBrief("");
    setGeneratedPrompt("");
    setGeneratedVariations([]);
    setGeneratedForCount(1);
    setGeneratedFromBrief("");
    setGeneratedFromReferences("");
    setTemplateExpanded(false);
    setPromptView("example");
    setPreviewPrompt(null);
    setAssistantMessages([]);
    setAppliedAssistantPrompt("");
    setAssistantLoading(false);
    setAssistantSuggestions([]);
    setAssistantSuggestionsLoading(false);
    assistantRequestRef.current += 1;
    assistantSuggestionRequestRef.current += 1;
    assistantSuggestionHistoryRef.current = [];
    setGenerationCount(1);
    setGenerationStartedAt(null);
    setGenerationTasks([]);
    setSourceImage(null);
    setReferenceImages([]);
    setDeleteResultTarget(null);
    setPromptCopied(false);
    submissionRequestRef.current += 1;
    setSubmissionOpen(false);
    setSubmission(null);
    setSubmissionPhase("idle");
    setSubmissionError("");
    setSubmissionLoadError("");
    setWorkspaceView("preview");
    setInspectorOpen(false);
    setAssistantOpen(false);
    setAssistantLayoutOpen(false);
    setCreationTrayOpen(false);
    setCreationPromptHeight(CREATION_PROMPT_MIN_HEIGHT);
    creationPromptManualHeightRef.current = false;
  }, [scene]);

  useEffect(() => {
    function recomputeCreationPromptMaxHeight(): void {
      setCreationPromptMaxHeight(Math.max(
        160,
        Math.min(CREATION_PROMPT_MAX_HEIGHT, window.innerHeight - CREATION_PROMPT_VIEWPORT_RESERVED_HEIGHT)
      ));
    }
    recomputeCreationPromptMaxHeight();
    window.addEventListener("resize", recomputeCreationPromptMaxHeight);
    return () => window.removeEventListener("resize", recomputeCreationPromptMaxHeight);
  }, []);

  useEffect(() => () => {
    if (creationPromptDragFrameRef.current !== null) {
      window.cancelAnimationFrame(creationPromptDragFrameRef.current);
    }
  }, []);

  useEffect(() => {
    setCreationPromptHeight((current) => clampCreationPromptHeight(current, creationPromptMaxHeight));
  }, [creationPromptMaxHeight]);

  useLayoutEffect(() => {
    if (creationPromptManualHeightRef.current || assistantLayoutOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const textarea = creationPromptRef.current;
      if (!textarea) return;
      const nextHeight = measureCreationPromptContentHeight(textarea, creationPromptMaxHeight);
      textarea.style.height = `${nextHeight}px`;
      setCreationPromptHeight(nextHeight);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assistantLayoutOpen, creationPromptMaxHeight, generationBrief]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = (): void => setWideWorkspace(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!inspectorOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeInspector();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [inspectorOpen]);

  useEffect(() => {
    if (!assistantOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeTemplateAssistant();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assistantOpen]);

  useEffect(() => {
    setGenerationSize(generationDefaults.size);
    setGenerationQuality(generationDefaults.quality ?? "auto");
  }, [generationDefaults.providerId, generationDefaults.quality, generationDefaults.size]);

  useEffect(() => {
    setPromptCopied(false);
  }, [activeScene.prompt, generatedPrompt, previewPrompt?.key, promptView]);

  useEffect(() => {
    if (!promptCopied) return;
    const timeout = window.setTimeout(() => setPromptCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [promptCopied]);

  const boardNameById = useMemo(() => new Map(boards.map((board) => [board.id, board.name])), [boards]);
  const historyItems = useMemo<SceneHistoryItem[]>(
    () =>
      history
        .filter(
          (job) =>
            job.status === "succeeded" &&
            sceneMatchesGeneration(activeScene, job.prompt || job.input.prompt, job.input.sceneId)
        )
        .flatMap((job) =>
          job.outputImagePaths.map((path, index) => ({
            id: `${job.id}:${index}`,
            path,
            prompt: job.prompt || job.input.prompt,
            createdAt: job.completedAt ?? job.createdAt,
            boardName: job.boardId ? boardNameById.get(job.boardId) ?? "来源画板已删除" : "未记录来源画板",
            job
          }))
        ),
    [activeScene, boardNameById, history]
  );
  const canGenerateInDetail =
    hasImageWorkbenchApi() &&
    generationDefaults.canGenerate &&
    (activeScene.mode !== "edit" || generationDefaults.supportsEditing);
  const displayedReferencePrompt = promptView === "example" && previewPrompt?.prompt
    ? previewPrompt.prompt
    : activeScene.prompt;
  const referenceLimit = activeScene.mode === "edit" ? MAX_REFERENCE_IMAGES - 1 : MAX_REFERENCE_IMAGES;
  const referenceSignature = referenceImages.map((image) => image.payload.id).join("|");
  const referencesUnsupported = referenceImages.length > 0 && !generationDefaults.supportsEditing;

  async function generateSceneResults(retryFailedOnly = false, promptOverride?: string): Promise<void> {
    if (!canGenerateInDetail || sceneGenerationActive || generationRunRef.current) return;
    if (activeScene.mode === "edit" && !sourceImage) {
      toast.error(translateSourceText("编辑模板需要先上传源图。"));
      return;
    }
    const basePrompt = promptOverride?.trim() || generatedPrompt.trim();
    if (!basePrompt) {
      toast.error(translateSourceText("本次生成内容不能为空。"));
      return;
    }
    const activeVariations = promptOverride ? [] : generatedVariations;
    const allPromptTasks = activeVariations.length > 0
      ? activeVariations.map((variation) => ({
          id: variation.id,
          title: variation.title,
          prompt: composeTemplateVariationPrompt(basePrompt, variation.prompt)
        }))
      : Array.from({ length: generationCount }, (_, index) => ({
          id: `instance:${index + 1}`,
          title: generationCount === 1 ? "本次实例" : `实例 ${index + 1}`,
          prompt: basePrompt
        }));
    const failedTaskIds = new Set(generationTasks.filter((task) => task.status === "failed").map((task) => task.id));
    const promptTasks = retryFailedOnly && failedTaskIds.size > 0
      ? allPromptTasks.filter((task) => failedTaskIds.has(task.id))
      : allPromptTasks;
    if (promptTasks.some((task) => !task.prompt.trim())) {
      toast.error(translateSourceText("提示词不能为空。"));
      return;
    }

    const activeGeneration = startActiveSceneGeneration({
      sceneId: activeScene.id,
      source: "detail",
      requestedCount: promptTasks.length
    });
    generationRunRef.current = true;
    creationPromptManualHeightRef.current = false;
    setGenerationBrief("");
    setGeneratedFromBrief("");
    setGenerationTasks(promptTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: "queued"
    })));
    setGenerating(true);
    let delayedNoticeId: string | number | undefined;
    const delayedNoticeTimer = window.setTimeout(() => {
      delayedNoticeId = iterlayToast.generationPending();
    }, GENERATION_ESTIMATE_MS);
    const previews: string[] = [];
    const warnings: string[] = [];
    const failureMessages: string[] = [];
    let completedCount = 0;
    let failedCount = 0;
    try {
      for (const task of promptTasks) {
        setGenerationStartedAt(Date.now());
        setGenerationTasks((current) => current.map((item) => (
          item.id === task.id ? { ...item, status: "running", error: undefined } : item
        )));
        try {
          const result = await getImageWorkbenchApi().generateImage({
            workflowMode: activeScene.mode,
            useCase: activeScene.useCase,
            sceneId: activeScene.id,
            sceneOnly: true,
            prompt: task.prompt,
            model: generationDefaults.model,
            size: generationSize,
            n: 1,
            quality: generationQuality,
            style: generationDefaults.style,
            providerId: generationDefaults.providerId,
            referenceImages: sourceImage
              ? [sourceImage.payload, ...referenceImages.map((image) => image.payload)]
              : referenceImages.map((image) => image.payload)
          });
          completedCount += result.images.length;
          previews.push(...result.images.map((image) => image.dataUrl));
          warnings.push(...(result.warnings ?? []));
          setGenerationTasks((current) => current.map((item) => (
            item.id === task.id ? { ...item, status: "succeeded", error: undefined } : item
          )));
          await onMediaChange();
        } catch (error) {
          failedCount += 1;
          const message = getWorkbenchErrorMessage(error, "示例图生成失败。");
          failureMessages.push(message);
          setGenerationTasks((current) => current.map((item) => (
            item.id === task.id ? { ...item, status: "failed", error: message } : item
          )));
        }
      }

      if (completedCount > 0) {
        iterlayToast.result({
          count: completedCount,
          title: translateSourceText("已生成 {{ui:0}} 张示例图", [completedCount]),
          detail: failedCount > 0
            ? translateSourceText("{{ui:0}} 个任务失败，其余结果已加入当前模板，未自动发布", [failedCount])
            : translateSourceText("已生成并加入当前模板，未自动发布"),
          previews
        });
      }
      if (failedCount > 0) {
        toast.error(failedCount === 1
          ? failureMessages[0] ?? "示例图生成失败。"
          : translateSourceText("{{ui:0}} 个生成任务失败：{{ui:1}}", [failedCount, failureMessages[0] ?? "请调整提示词后重试。"]));
      }
      warnings.forEach((warning) => toast.warning(warning));
    } finally {
      window.clearTimeout(delayedNoticeTimer);
      if (delayedNoticeId !== undefined) iterlayToast.dismiss(delayedNoticeId);
      generationRunRef.current = false;
      setGenerating(false);
      setGenerationStartedAt(null);
      finishActiveSceneGeneration(activeScene.id, activeGeneration.id);
    }
  }

  async function deleteSceneResult(): Promise<void> {
    if (!deleteResultTarget || mediaMutating) return;
    setMediaMutating(true);
    try {
      await getImageWorkbenchApi().deleteSceneResult(activeScene.id, deleteResultTarget.id);
      await onMediaChange();
      setDeleteResultTarget(null);
      toast.success(translateSourceText("已从当前模板移除示例图"));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "删除示例图失败。"));
    } finally {
      setMediaMutating(false);
    }
  }

  async function reorderSceneResults(sourceId: string, targetId: string): Promise<void> {
    const results = media?.results ?? [];
    const sourceIndex = results.findIndex((result) => result.id === sourceId);
    const targetIndex = results.findIndex((result) => result.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex || mediaMutating) return;
    const reordered = [...results];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setMediaMutating(true);
    try {
      await getImageWorkbenchApi().reorderSceneResults(activeScene.id, reordered.map((result) => result.id));
      await onMediaChange();
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "示例图排序失败。"));
    } finally {
      setMediaMutating(false);
    }
  }

  async function addHistoryAsExample(imagePath: string, prompt: string): Promise<void> {
    if (mediaMutating) return;
    setMediaMutating(true);
    try {
      await getImageWorkbenchApi().addSceneExample(activeScene.id, imagePath, prompt || activeScene.prompt);
      await onMediaChange();
      toast.success(translateSourceText("已复制到当前模板的示例图"));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "复制示例图失败。"));
    } finally {
      setMediaMutating(false);
    }
  }

  async function selectSourceImage(file?: File): Promise<void> {
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      toast.error(translateSourceText("仅支持 PNG、JPEG 或 WebP 图片。"));
      return;
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      toast.error(translateSourceText("源图不能超过 20 MB。"));
      return;
    }
    try {
      const prepared = await readConstrainedImageAsDataUrl(file);
      if (prepared.resized) toast.info(translateSourceText("图片尺寸过大，已自动缩小后用于生成。"));
      setSourceImage({
        previewUrl: prepared.previewUrl,
        payload: {
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: prepared.mimeType,
          dataBase64: prepared.previewUrl.slice(prepared.previewUrl.indexOf(",") + 1),
          role: "edit-target"
        }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : translateSourceText("无法读取源图。"));
    }
  }

  function pasteSourceImage(event: ClipboardEvent<HTMLElement>): void {
    const file = extractClipboardImageFiles(event.clipboardData)[0];
    if (!file) return;
    event.preventDefault();
    void selectSourceImage(file);
  }

  function pasteReferenceImages(event: ClipboardEvent<HTMLElement>): void {
    const files = extractClipboardImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    void addReferenceImages(files);
  }

  async function addReferenceImages(files: File[]): Promise<void> {
    const availableSlots = Math.max(0, referenceLimit - referenceImages.length);
    if (availableSlots === 0) {
      toast.info(translateSourceText("最多添加 {{ui:0}} 张参考图。", [referenceLimit]));
      return;
    }

    const acceptedFiles: File[] = [];
    for (const file of files) {
      if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
        toast.error(translateSourceText("“{{ui:0}}”不是支持的图片格式。", [file.name || "该文件"]));
        continue;
      }
      if (file.size > MAX_SOURCE_IMAGE_BYTES) {
        toast.error(translateSourceText("“{{ui:0}}”超过 20 MB。", [file.name || "该图片"]));
        continue;
      }
      acceptedFiles.push(file);
    }

    const selectedFiles = acceptedFiles.slice(0, availableSlots);
    if (acceptedFiles.length > availableSlots) toast.info(translateSourceText("本次只添加前 {{ui:0}} 张参考图。", [availableSlots]));
    if (selectedFiles.length === 0) return;

    try {
      const nextImages = await Promise.all(selectedFiles.map(async (file, index) => {
        const prepared = await readConstrainedImageAsDataUrl(file);
        return {
          previewUrl: prepared.previewUrl,
          resized: prepared.resized,
          payload: {
            id: crypto.randomUUID(),
            name: file.name || `参考图 ${referenceImages.length + index + 1}`,
            mimeType: prepared.mimeType,
            dataBase64: prepared.previewUrl.slice(prepared.previewUrl.indexOf(",") + 1),
            role: "reference" as const
          }
        };
      }));
      setReferenceImages((current) => {
        const seen = new Set(current.map((image) => image.payload.dataBase64));
        const uniqueNext = nextImages.filter((image) => {
          if (seen.has(image.payload.dataBase64)) return false;
          seen.add(image.payload.dataBase64);
          return true;
        });
        return [...current, ...uniqueNext].slice(0, referenceLimit);
      });
      const resizedCount = nextImages.filter((image) => image.resized).length;
      if (resizedCount > 0) toast.info(translateSourceText("已自动缩小 {{ui:0}} 张超大参考图。", [resizedCount]));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : translateSourceText("无法读取参考图。"));
    }
  }

  const assistantContextImages = useMemo<AiAssistantContextImage[]>(() => [
    ...(sourceImage ? [{
      id: sourceImage.payload.id,
      src: sourceImage.previewUrl,
      alt: sourceImage.payload.name,
      role: "edit-target" as const,
      onRemove: () => setSourceImage(null)
    }] : []),
    ...referenceImages.map((image) => ({
      id: image.payload.id,
      src: image.previewUrl,
      alt: image.payload.name,
      role: "reference" as const,
      onRemove: () => setReferenceImages((current) => current.filter((item) => item.payload.id !== image.payload.id))
    }))
  ], [referenceImages, sourceImage]);

  const assistantFields = useMemo(() => [
    ...(activeScene.fields?.length
      ? activeScene.fields.map(({ label, value }) => ({ label, value }))
      : [{ label: "模板规则", value: activeScene.prompt }]),
    ...(generationBrief.trim() ? [{ label: "当前生成需求", value: generationBrief.trim() }] : [])
  ].slice(0, 16), [activeScene.fields, activeScene.prompt, generationBrief]);

  function commitAssistantPrompt(prompt: string): string {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return "";
    creationPromptManualHeightRef.current = false;
    setAssistantMessages((current) => {
      const proposalIndex = current.findLastIndex((message) => Boolean(message.generatedPrompt?.trim()));
      return proposalIndex < 0
        ? current
        : current.map((message, index) => index === proposalIndex ? { ...message, generatedPrompt: nextPrompt } : message);
    });
    setGeneratedPrompt(nextPrompt);
    setGenerationBrief(nextPrompt);
    setGeneratedVariations([]);
    setGeneratedForCount(generationCount);
    setGeneratedFromBrief(nextPrompt);
    setGeneratedFromReferences(referenceSignature);
    setAppliedAssistantPrompt(nextPrompt);
    setGenerationTasks([]);
    return nextPrompt;
  }

  function applyAssistantPrompt(prompt: string): void {
    const nextPrompt = commitAssistantPrompt(prompt);
    if (!nextPrompt) return;
    assistantExitFocusRef.current = "creation";
    setAssistantOpen(false);
    setCreationTrayOpen(false);
  }

  function generateAssistantPrompt(prompt: string): void {
    const nextPrompt = commitAssistantPrompt(prompt);
    if (!nextPrompt) return;
    assistantExitFocusRef.current = null;
    setAssistantOpen(false);
    setCreationTrayOpen(false);
    void generateSceneResults(false, nextPrompt);
  }

  async function requestTemplateAssistantSuggestions(
    mode: "contextual" | "divergent" = "contextual"
  ): Promise<void> {
    if (!canOptimize || assistantLoading) return;
    const requestId = assistantSuggestionRequestRef.current + 1;
    assistantSuggestionRequestRef.current = requestId;
    setAssistantSuggestionsLoading(true);
    try {
      const result = await getImageWorkbenchApi().suggestAssistantIntents({
        assistantSurface: "scene-template",
        templateWorkflow: "use",
        conversation: assistantMessages
          .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
          .slice(-12)
          .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content })),
        currentFields: assistantFields,
        templateScenario: activeScene.extractionScenario,
        referenceImageCount: assistantContextImages.length,
        suggestionCount: 3,
        suggestionMode: mode,
        previousSuggestions: mode === "divergent" ? assistantSuggestionHistoryRef.current : []
      });
      if (assistantSuggestionRequestRef.current !== requestId) return;
      assistantSuggestionHistoryRef.current = mode === "divergent"
        ? [...assistantSuggestionHistoryRef.current, ...result.suggestions].slice(-20)
        : result.suggestions;
      setAssistantSuggestions(result.suggestions);
    } catch {
      if (assistantSuggestionRequestRef.current === requestId && mode === "contextual") setAssistantSuggestions([]);
    } finally {
      if (assistantSuggestionRequestRef.current === requestId) setAssistantSuggestionsLoading(false);
    }
  }

  function openTemplateAssistant(): void {
    assistantExitFocusRef.current = null;
    setAssistantLayoutOpen(true);
    setAssistantOpen(true);
    setInspectorOpen(false);
    if (assistantMessages.length === 0) {
      const imageNote = assistantContextImages.length > 0
        ? `已带入 ${assistantContextImages.length} 张参考图。描述要替换的主体、内容或场景即可。`
        : "模板规则已带入。描述要替换的主体、内容或场景即可。";
      setAssistantMessages([{ id: crypto.randomUUID(), role: "assistant", content: imageNote }]);
      void requestTemplateAssistantSuggestions();
    }
  }

  function closeTemplateAssistant(): void {
    assistantExitFocusRef.current = "trigger";
    setAssistantOpen(false);
  }

  function finishAssistantExit(): void {
    if (assistantOpen) return;
    setAssistantLayoutOpen(false);
    const focusTarget = assistantExitFocusRef.current;
    assistantExitFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (focusTarget === "creation") creationActionRef.current?.focus();
      if (focusTarget === "trigger") assistantTriggerRef.current?.focus();
    });
  }

  function resetCreationPromptHeight(): void {
    creationPromptManualHeightRef.current = false;
    const textarea = creationPromptRef.current;
    if (!textarea) {
      setCreationPromptHeight(CREATION_PROMPT_MIN_HEIGHT);
      return;
    }
    const nextHeight = measureCreationPromptContentHeight(textarea, creationPromptMaxHeight);
    setCreationPromptHeight(nextHeight);
  }

  function startCreationPromptDrag(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startHeight = clampCreationPromptHeight(
      creationPromptRef.current?.getBoundingClientRect().height ?? creationPromptHeight,
      creationPromptMaxHeight
    );
    creationPromptManualHeightRef.current = true;
    creationPromptDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
      currentHeight: startHeight
    };
    setCreationPromptDragging(true);
  }

  function moveCreationPromptDrag(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = creationPromptDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.currentHeight = clampCreationPromptHeight(
      drag.startHeight + drag.startY - event.clientY,
      creationPromptMaxHeight
    );
    if (creationPromptDragFrameRef.current !== null) return;
    creationPromptDragFrameRef.current = window.requestAnimationFrame(() => {
      creationPromptDragFrameRef.current = null;
      const currentDrag = creationPromptDragRef.current;
      if (!currentDrag) return;
      creationPromptRef.current?.style.setProperty("height", `${currentDrag.currentHeight}px`);
    });
  }

  function endCreationPromptDrag(event: React.PointerEvent<HTMLDivElement>, cancelled = false): void {
    const drag = creationPromptDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (creationPromptDragFrameRef.current !== null) {
      window.cancelAnimationFrame(creationPromptDragFrameRef.current);
      creationPromptDragFrameRef.current = null;
    }
    const nextHeight = cancelled
      ? drag.startHeight
      : clampCreationPromptHeight(drag.startHeight + drag.startY - event.clientY, creationPromptMaxHeight);
    creationPromptRef.current?.style.setProperty("height", `${nextHeight}px`);
    setCreationPromptHeight(nextHeight);
    creationPromptDragRef.current = null;
    setCreationPromptDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleCreationPromptGripKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    let nextHeight: number | null = null;
    if (event.key === "ArrowUp") nextHeight = creationPromptHeight + 16;
    if (event.key === "ArrowDown") nextHeight = creationPromptHeight - 16;
    if (event.key === "Home") nextHeight = CREATION_PROMPT_MIN_HEIGHT;
    if (event.key === "End") nextHeight = creationPromptMaxHeight;
    if (nextHeight === null) return;
    event.preventDefault();
    creationPromptManualHeightRef.current = true;
    setCreationPromptHeight(clampCreationPromptHeight(nextHeight, creationPromptMaxHeight));
  }

  async function sendTemplateAssistantMessage(rawInstruction: string, displayContent = rawInstruction): Promise<void> {
    const instruction = rawInstruction.trim() || (assistantContextImages.length > 0
      ? "请结合我附上的图片，按当前模板生成一份可直接用于本次实例的完整提示词。"
      : "");
    if (!instruction || assistantLoading) return;
    if (!canOptimize) {
      onOpenSettings();
      return;
    }
    const requestId = assistantRequestRef.current + 1;
    assistantRequestRef.current = requestId;
    assistantSuggestionRequestRef.current += 1;
    setAssistantSuggestions([]);
    const messageId = crypto.randomUUID();
    setAssistantMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: displayContent || "已附图片，请应用模板" },
      { id: messageId, role: "assistant", content: "", streaming: true }
    ]);
    creationPromptManualHeightRef.current = false;
    setGenerationBrief("");
    setAssistantLoading(true);
    try {
      const result = await onCollaborate({
        // 与画板全局助手一致：用户原话是 instruction，模板和图片只作为上下文注入。
        instruction,
        referenceImages: assistantContextImages.map((image) => {
          const source = sourceImage?.payload.id === image.id ? sourceImage : referenceImages.find((item) => item.payload.id === image.id);
          return {
            name: image.alt,
            mimeType: source!.payload.mimeType,
            dataBase64: source!.payload.dataBase64
          };
        }),
        currentFields: assistantFields,
        templateWorkflow: "use",
        templateScenario: activeScene.extractionScenario,
        clarificationRounds: 0,
        conversation: assistantMessages
          .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
          .slice(-16)
          .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content })),
        recordInHistory: false,
        assistantSurface: "scene-template",
        memoryQuery: { sceneId: activeScene.id },
        workflowMode: activeScene.mode,
        useCase: activeScene.useCase
      });
      if (assistantRequestRef.current !== requestId) return;
      const generated = result.intent === "chat"
        ? ""
        : sceneAssistantFieldsToPrompt(result.fields) || result.detailedPrompt?.trim() || "";
      setAssistantMessages((current) => current.map((message) => (
        message.id === messageId
          ? {
              ...message,
              content: result.message || "已整理出本次模板应用方案。",
              streaming: false,
              ...(generated ? { generatedPrompt: generated } : {})
            }
          : message
      )));
      if (!generated) toast.error(translateSourceText("AI 没有返回可应用的提示词，请补充描述后重试。") );
    } catch (error) {
      if (assistantRequestRef.current !== requestId) return;
      const message = getWorkbenchErrorMessage(error, "AI 助手暂时不可用。" );
      setAssistantMessages((current) => current.map((item) => (
        item.id === messageId ? { ...item, content: message, streaming: false, tone: "error" } : item
      )));
    } finally {
      if (assistantRequestRef.current === requestId) setAssistantLoading(false);
    }
  }

  function submitQuickTemplateRequest(): void {
    const instruction = generationBrief.trim();
    if (!instruction && assistantContextImages.length === 0) return;
    openTemplateAssistant();
    void sendTemplateAssistantMessage(instruction, instruction || "已附图片，请应用模板");
  }

  function openInspector(): void {
    assistantExitFocusRef.current = null;
    setAssistantOpen(false);
    setInspectorOpen(true);
    if (!wideWorkspace) setCreationTrayOpen(false);
    window.requestAnimationFrame(() => inspectorTitleRef.current?.focus());
  }

  function closeInspector(): void {
    setInspectorOpen(false);
    window.requestAnimationFrame(() => inspectorTriggerRef.current?.focus());
  }

  const promptOutdated = Boolean(generatedPrompt) && (
    generationBrief.trim() !== generatedFromBrief ||
    referenceSignature !== generatedFromReferences ||
    generationCount !== generatedForCount
  );
  const hasUnresolvedPlaceholders = [generatedPrompt, ...generatedVariations.map((variation) => variation.prompt)]
    .some((prompt) => /【[^】]+】/.test(prompt));
  const canGenerateInstance =
    canGenerateInDetail &&
    !sceneGenerationActive &&
    Boolean(generatedPrompt.trim()) &&
    generatedVariations.every((variation) => Boolean(variation.prompt.trim())) &&
    !promptOutdated &&
    !hasUnresolvedPlaceholders &&
    !referencesUnsupported &&
    (activeScene.mode !== "edit" || Boolean(sourceImage));
  const hasCreationInput = Boolean(generationBrief.trim() || referenceImages.length > 0);
  const hasFailedGenerationTasks = generationTasks.some((task) => task.status === "failed");
  const assistantProposedPrompt = [...assistantMessages]
    .reverse()
    .find((message) => !message.streaming && message.generatedPrompt?.trim())
    ?.generatedPrompt?.trim() ?? "";
  const hasPendingAssistantProposal = Boolean(assistantProposedPrompt) && assistantProposedPrompt !== appliedAssistantPrompt;
  const hasAppliedPrompt = Boolean(generatedPrompt.trim()) && generatedPrompt.trim() === appliedAssistantPrompt && !promptOutdated;
  const canGenerateAssistantPrompt =
    canGenerateInDetail &&
    !sceneGenerationActive &&
    Boolean(assistantProposedPrompt) &&
    !/【[^】]+】/.test(assistantProposedPrompt) &&
    !referencesUnsupported &&
    (activeScene.mode !== "edit" || Boolean(sourceImage));
  const creationStage = sceneGenerationActive || hasAppliedPrompt
    ? 2
    : hasPendingAssistantProposal || (Boolean(generatedPrompt.trim()) && !promptOutdated)
      ? 1
      : 0;
  const creationAction: {
    label: string;
    disabled: boolean;
    kind: "prepare" | "apply-proposal" | "generate" | "settings" | "waiting";
  } = sceneGenerationActive
    ? {
        label: generationTiming
          ? `生成中 · ${generationTiming.overdue ? `已用 ${generationTiming.elapsedLabel}` : `剩余 ${generationTiming.remainingLabel}`}`
          : "正在生成并加入模板",
        disabled: true,
        kind: "waiting"
      }
    : assistantLoading
      ? { label: "正在整理", disabled: true, kind: "waiting" }
    : hasPendingAssistantProposal
      ? assistantOpen
        ? { label: "在助手中确认", disabled: true, kind: "waiting" }
        : { label: "采用方案", disabled: false, kind: "apply-proposal" }
    : !generatedPrompt.trim() || promptOutdated
      ? !canOptimize
        ? { label: "配置 AI 服务", disabled: false, kind: "settings" }
        : {
            label: promptOutdated ? "更新方案" : "继续",
            disabled: !hasCreationInput,
            kind: "prepare"
          }
      : hasUnresolvedPlaceholders
        ? { label: "补全方案中的占位符", disabled: true, kind: "waiting" }
        : !canGenerateInDetail
          ? { label: "配置生成服务", disabled: false, kind: "settings" }
          : hasFailedGenerationTasks
            ? { label: "重试失败项", disabled: !canGenerateInstance, kind: "generate" }
            : {
                label: `生成 ${generationCount} 张`,
                disabled: !canGenerateInstance,
                kind: "generate"
              };

  function runCreationAction(): void {
    if (creationAction.disabled) return;
    if (creationAction.kind === "settings") {
      onOpenSettings();
      return;
    }
    if (creationAction.kind === "apply-proposal") {
      applyAssistantPrompt(assistantProposedPrompt);
      return;
    }
    if (creationAction.kind === "generate") {
      void generateSceneResults(hasFailedGenerationTasks);
      return;
    }
    submitQuickTemplateRequest();
  }

  async function refreshSubmission(): Promise<void> {
    const requestVersion = ++submissionRequestRef.current;
    setSubmissionPhase("loading");
    setSubmissionLoadError("");
    try {
      const nextSubmission = await onGetSubmission(activeScene);
      if (submissionRequestRef.current !== requestVersion) return;
      setSubmission(nextSubmission);
      if (nextSubmission?.authorName) setSubmissionAuthor(nextSubmission.authorName);
    } catch (error) {
      if (submissionRequestRef.current !== requestVersion) return;
      setSubmissionLoadError(getWorkbenchErrorMessage(error, "暂时无法获取模板审核状态。"));
    } finally {
      if (submissionRequestRef.current === requestVersion) setSubmissionPhase("idle");
    }
  }

  function openSubmission(): void {
    setSubmissionError("");
    setSubmissionLoadError("");
    setSubmission(null);
    setSubmissionExampleIds(media?.results.map((result) => result.id) ?? []);
    setSubmissionOpen(true);
    void refreshSubmission();
  }

  function changeSubmissionOpen(open: boolean): void {
    if (submissionPhase === "submitting") return;
    setSubmissionOpen(open);
    if (!open) {
      submissionRequestRef.current += 1;
      setSubmissionAuthor("");
      setSubmissionExampleIds([]);
      setSubmissionConsent(false);
      setSubmission(null);
      setSubmissionError("");
      setSubmissionLoadError("");
      setSubmissionPhase("idle");
    }
  }

  async function submitTemplate(): Promise<void> {
    if (!submissionConsent || submissionPhase === "submitting" || submissionExampleIds.length === 0) return;
    setSubmissionError("");
    setSubmissionPhase("submitting");
    try {
      const nextSubmission = await onSubmit(activeScene, submissionAuthor.trim(), submissionExampleIds);
      setSubmission(nextSubmission);
      setSubmissionAuthor(nextSubmission.authorName);
      setSubmissionConsent(false);
    } catch (error) {
      setSubmissionError(getWorkbenchErrorMessage(error, "模板发布失败，请稍后重试。"));
    } finally {
      setSubmissionPhase("idle");
    }
  }

  function prepareSubmissionRetry(): void {
    setSubmission(null);
    setSubmissionConsent(false);
    setSubmissionError("");
    setSubmissionLoadError("");
  }

  const submissionMeta = submission ? TEMPLATE_SUBMISSION_STATUS_META[submission.status] : null;
  const SubmissionStatusIcon = submissionMeta?.icon;
  const canRetrySubmission = submission?.status === "rejected" ||
    submission?.status === "taken_down" ||
    submission?.status === "withdrawn";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 [-webkit-app-region:drag]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-template-library-back=""
            className="h-8 w-8 text-muted-foreground [-webkit-app-region:no-drag]"
            aria-label={uiText("返回模版库")}
            title={uiText("返回模版库")}
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="hidden min-w-0 truncate text-sm font-semibold min-[700px]:block">{activeScene.name}</span>

          <div className="ml-2 shrink-0 [-webkit-app-region:no-drag]">
            <LibraryFilterTabs
              value={workspaceView}
              options={[
                {
                  value: "preview",
                  label: "示例",
                  count: (media?.results.length ?? 0) + Math.min(activeScene.previewImages?.length ?? 0, 3),
                  id: "scene-examples-tab",
                  controls: "scene-examples-panel"
                },
                {
                  value: "history",
                  label: "历史",
                  count: historyItems.length,
                  id: "scene-history-tab",
                  controls: "scene-history-panel"
                }
              ]}
              ariaLabel="模板内容"
              semantics="tablist"
              onValueChange={setWorkspaceView}
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5 [-webkit-app-region:no-drag]">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={inspectorTriggerRef}
                  variant={inspectorOpen ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  aria-label={uiText("模板信息")}
                  aria-expanded={inspectorOpen}
                  aria-controls="template-info-inspector"
                  onClick={() => inspectorOpen ? closeInspector() : openInspector()}
                >
                  <PanelRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{uiText("模板信息")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8", isFavorite && "text-amber-500 hover:text-amber-600")}
                  aria-label={isFavorite ? uiText("取消收藏 {{ui:0}}", [activeScene.name]) : uiText("收藏 {{ui:0}}", [activeScene.name])}
                  onClick={() => onToggleFavorite(activeScene.id)}
                >
                  <Star className={cn("h-4 w-4", isFavorite && "fill-current")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFavorite ? uiText("取消收藏") : uiText("收藏后显示在画板快捷模板中")}</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2 text-muted-foreground min-[900px]:px-3"
              aria-label={uiText("导出模板")}
              title={uiText("导出模板")}
              onClick={() => onExport(activeScene)}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden min-[900px]:inline">{uiText("导出模板")}</span>
            </Button>
            {activeScene.source === "custom" ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 px-2 text-muted-foreground min-[1100px]:px-3"
                aria-label={uiText("发布到模板广场")}
                title={uiText("发布到模板广场")}
                onClick={openSubmission}
              >
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden min-[1100px]:inline">{uiText("发布")}</span>
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-muted-foreground min-[900px]:px-3" aria-label={uiText("在画板使用")} title={uiText("在画板使用")} onClick={() => onApply(activeScene)}>
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden min-[900px]:inline">{uiText("在画板使用")}</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 px-2 min-[900px]:px-3" aria-label={uiText("编辑模板")} title={uiText("编辑模板")} onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden min-[900px]:inline">{uiText("编辑模板")}</span>
            </Button>
          </div>
        </header>

        <div
          data-template-detail-workspace="concept-c"
          className={cn(
            "grid min-h-0 min-w-0 flex-1 overflow-hidden",
            assistantLayoutOpen
              ? "grid-cols-1 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]"
              : inspectorOpen
              ? "grid-cols-[minmax(0,1fr)_minmax(300px,320px)] min-[1280px]:grid-cols-[minmax(0,1fr)_344px]"
              : "grid-cols-1"
          )}
        >
          <main
            data-template-assistant-primary=""
            className={cn(
              "grid min-h-0 min-w-0 grid-rows-[minmax(320px,1fr)_auto] overflow-hidden",
              assistantLayoutOpen && "max-[899px]:hidden"
            )}
          >
            <SceneMediaStage
              scene={activeScene}
              results={media?.results ?? EMPTY_SCENE_MEDIA_RESULTS}
              historyItems={historyItems}
              busy={mediaMutating}
              view={workspaceView}
              onViewChange={setWorkspaceView}
              loadThumbnail={loadThumbnail}
              onDeleteResult={setDeleteResultTarget}
              onReorderResults={(sourceId, targetId) => void reorderSceneResults(sourceId, targetId)}
              onLocateHistory={onLocateHistory}
              onReuseHistory={onReuseHistory}
              onAddHistoryAsExample={(imagePath, prompt) => void addHistoryAsExample(imagePath, prompt)}
              onUseHistoryAsReference={onUseHistoryAsReference}
              onPromptChange={setPreviewPrompt}
              generationTiming={sceneGenerationActive ? generationTiming : null}
            />

            {workspaceView === "preview" && (!inspectorOpen || wideWorkspace) ? (
              <section data-template-creation-dock="" className="min-w-0 border-t border-border bg-background" aria-label={uiText("模板创作坞")}>
                <AnimatePresence initial={false}>
                  {creationTrayOpen ? (
                    <motion.div
                      id="template-creation-tray"
                      data-template-creation-tray="prompt"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "clamp(160px, calc(100dvh - 441px), 300px)", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="min-h-0 overflow-hidden border-b border-border"
                    >
                      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
                        <span className="text-xs font-semibold">{uiText("生成方案")}</span>
                        <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label={uiText("收起创作托盘")} title={uiText("收起创作托盘")} onClick={() => setCreationTrayOpen(false)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="h-[calc(100%-40px)] overflow-y-auto px-4 py-3">
                          {activeScene.mode === "edit" ? (
                            <section className="mb-3 border-b border-border pb-3" onPaste={pasteSourceImage}>
                              <p className="text-xs font-semibold">{uiText("编辑源图")}</p>
                              {sourceImage ? (
                                <div className="mt-2 flex items-center gap-2">
                                  <img src={sourceImage.previewUrl} alt={uiText("编辑源图")} className="h-10 w-10 rounded-md border border-border object-cover" />
                                  <p className="min-w-0 flex-1 truncate text-xs">{sourceImage.payload.name}</p>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={uiText("移除源图")} onClick={() => setSourceImage(null)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              ) : (
                                <label className="mt-2 flex h-12 cursor-pointer items-center justify-center gap-2 border border-dashed border-border text-xs text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
                                  <Upload className="h-3.5 w-3.5" />{uiText("上传或直接粘贴编辑源图")}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void selectSourceImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                                </label>
                              )}
                            </section>
                          ) : null}
                          {generatedPrompt ? (
                            <>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold">{uiText("生成方案")}</p>
                                <p className={cn("truncate text-[11px]", promptOutdated || hasUnresolvedPlaceholders ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                                  {promptOutdated ? uiText("需求已变化，请重新整理") : hasUnresolvedPlaceholders ? uiText("仍有未补全占位符") : uiText("可编辑，仅影响本次生成")}
                                </p>
                              </div>
                              <Textarea value={generatedPrompt} aria-label={uiText("本次生成母提示词")} onChange={(event) => { setGeneratedPrompt(event.target.value); setGenerationTasks([]); }} className="mt-2 min-h-24 resize-y text-xs leading-5" />
                              {generatedVariations.map((variation, index) => {
                                const task = generationTasks.find((item) => item.id === variation.id);
                                return (
                                  <label key={variation.id} className="mt-3 block border-t border-border pt-3">
                                    <span className="mb-1.5 flex items-center gap-2 text-[11px] font-medium"><span>{index + 1}. {variation.title}</span>{task ? <GenerationTaskStatus task={task} /> : null}</span>
                                    <Textarea value={variation.prompt} aria-label={uiText("子提示词 {{ui:0}}：{{ui:1}}", [index + 1, variation.title])} onChange={(event) => { setGeneratedVariations((current) => current.map((item) => item.id === variation.id ? { ...item, prompt: event.target.value } : item)); setGenerationTasks([]); }} className="min-h-20 resize-y text-xs leading-5" />
                                  </label>
                                );
                              })}
                            </>
                          ) : <p className="py-8 text-center text-xs text-muted-foreground">{uiText("先在创作坞描述需求，再让助手整理生成方案。")}</p>}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="bg-muted/30 px-3 py-3">
                  <div className="mx-auto max-w-[1080px]">
                    <div className="mb-2 flex h-5 items-center gap-1.5 px-1 text-[11px] font-medium" aria-label={uiText("当前创作阶段：{{ui:0}}", [creationStage === 0 ? "描述需求" : creationStage === 1 ? "确认方案" : "生成示例"])}>
                      <span className={cn("flex items-center gap-1.5", creationStage === 0 ? "text-foreground" : "text-muted-foreground")}>
                        <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[10px]", creationStage === 0 ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{creationStage > 0 ? <Check className="h-2.5 w-2.5" /> : uiText("1")}</span>
                        {uiText("描述需求")}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                      <span className={cn("flex items-center gap-1.5", creationStage === 1 ? "text-foreground" : "text-muted-foreground")}>
                        <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[10px]", creationStage === 1 ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{creationStage > 1 ? <Check className="h-2.5 w-2.5" /> : "2"}</span>
                        {uiText("确认方案")}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                      <span className={cn("flex items-center gap-1.5", creationStage === 2 ? "text-foreground" : "text-muted-foreground")}>
                        <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[10px]", creationStage === 2 ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>3</span>
                        {uiText("生成示例")}</span>
                    </div>

                    <div data-template-prompt-dock="" className="rounded-lg border border-border bg-background shadow-sm transition-[border-color,box-shadow] focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/20">
                      <div className="flex h-4 items-center justify-center">
                        <div
                          data-template-prompt-grip=""
                          data-resizing={creationPromptDragging ? "true" : undefined}
                          role="separator"
                          tabIndex={0}
                          aria-orientation="horizontal"
                          aria-label={uiText("拖拽调整模板提示词高度")}
                          aria-valuemin={CREATION_PROMPT_MIN_HEIGHT}
                          aria-valuemax={creationPromptMaxHeight}
                          aria-valuenow={Math.round(creationPromptHeight)}
                          title={uiText("拖拽调整高度 · 双击自动适应内容")}
                          onPointerDown={startCreationPromptDrag}
                          onPointerMove={moveCreationPromptDrag}
                          onPointerUp={endCreationPromptDrag}
                          onPointerCancel={(event) => endCreationPromptDrag(event, true)}
                          onDoubleClick={resetCreationPromptHeight}
                          onKeyDown={handleCreationPromptGripKeyDown}
                          className="group/grip flex h-4 w-14 touch-none select-none items-center justify-center rounded-full cursor-ns-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                        >
                          <span className={cn(
                            "h-1.5 w-9 rounded-full bg-border transition-[width,background-color] duration-150",
                            "group-hover/grip:w-11 group-hover/grip:bg-muted-foreground/50 group-focus-visible/grip:w-11 group-focus-visible/grip:bg-muted-foreground/50",
                            creationPromptDragging && "w-11 bg-muted-foreground/50"
                          )} />
                        </div>
                      </div>
                      <input ref={assistantFileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(event) => { void addReferenceImages(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
                      <Textarea
                        ref={creationPromptRef}
                        value={generationBrief}
                        aria-label={uiText("描述本次要生成的画面")}
                        placeholder={sceneGenerationActive
                          ? uiText("正在生成，可继续输入下一轮提示词…")
                          : uiText("描述你想生成的画面，例如：白色机甲模型的电商展示广告，突出关节细节和价格…")}
                        style={{ height: creationPromptHeight, maxHeight: creationPromptMaxHeight }}
                        className={cn(
                          "min-h-14 resize-none overflow-y-auto border-0 bg-transparent px-3.5 py-2 text-sm leading-5 shadow-none focus-visible:ring-0",
                          !creationPromptDragging && !reduceMotion && "transition-[height] duration-200 ease-out"
                        )}
                        onChange={(event) => {
                          if (!event.target.value) creationPromptManualHeightRef.current = false;
                          setGenerationBrief(event.target.value);
                        }}
                        onPaste={pasteReferenceImages}
                        onKeyDown={(event) => {
                          if (!isSendEnter(event) || creationAction.disabled) return;
                          event.preventDefault();
                          runCreationAction();
                        }}
                      />

                      <div className="flex min-h-11 items-center gap-1.5 px-2 pb-2">
                        {activeScene.mode === "edit" ? sourceImage ? (
                          <Tooltip><TooltipTrigger asChild><button type="button" className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border" aria-label={uiText("更换编辑源图")} onClick={() => setCreationTrayOpen(true)}><img src={sourceImage.previewUrl} alt={uiText("编辑源图")} className="h-full w-full object-cover" /></button></TooltipTrigger><TooltipContent>{uiText("编辑源图")}</TooltipContent></Tooltip>
                        ) : (
                          <Tooltip><TooltipTrigger asChild><label className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground focus-within:ring-2 focus-within:ring-ring"><Upload className="h-3.5 w-3.5" /><span className="sr-only">{uiText("上传编辑源图")}</span><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void selectSourceImage(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></TooltipTrigger><TooltipContent>{uiText("上传编辑源图")}</TooltipContent></Tooltip>
                        ) : null}
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" aria-label={uiText("添加参考图")} onClick={() => assistantFileInputRef.current?.click()}><ImagePlus className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{uiText("添加参考图，最多 ")}{referenceLimit} {uiText("张")}</TooltipContent></Tooltip>
                        {referenceImages.slice(0, 3).map((image) => (
                          <div key={image.payload.id} className="group relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border">
                            <img src={image.previewUrl} alt={image.payload.name} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              aria-label={uiText("移除参考图 {{ui:0}}", [image.payload.name])}
                              onClick={() => setReferenceImages((current) => current.filter((item) => item.payload.id !== image.payload.id))}
                              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm bg-black/65 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                        {referenceImages.length > 3 ? <span className="text-[11px] tabular-nums text-muted-foreground">+{referenceImages.length - 3}</span> : null}

                        <Button ref={assistantTriggerRef} variant={assistantOpen ? "secondary" : "ghost"} size="sm" className="shrink-0 gap-1.5 text-muted-foreground" aria-label={uiText("AI 助手")} aria-expanded={assistantOpen} aria-controls="template-assistant-sidebar" onClick={assistantOpen ? closeTemplateAssistant : openTemplateAssistant}>
                          <Sparkles className="h-3.5 w-3.5" /><span className="max-[640px]:hidden">{uiText("AI 助手")}</span>
                        </Button>
                        {generatedPrompt ? (
                          <Button variant="ghost" size="sm" className="shrink-0 gap-1.5 text-muted-foreground" aria-controls="template-assistant-sidebar" onClick={openTemplateAssistant}>
                            <List className="h-3.5 w-3.5" /><span className="max-[720px]:hidden">{uiText("调整方案")}</span>
                          </Button>
                        ) : null}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="min-w-0 shrink-0 gap-1.5 text-muted-foreground">
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                              <span className="max-[700px]:hidden">{generationSize === "auto" ? uiText("自动尺寸") : generationSize}</span>
                              <span className="text-border max-[700px]:hidden">·</span>
                              <span>{generationCount} {uiText("张")}</span>
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent side="top" align="start" className="w-80 rounded-lg p-4 shadow-md">
                            <div className="flex items-center justify-between gap-3">
                              <div><p className="text-sm font-semibold">{uiText("生成设置")}</p><p className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={generationDefaults.model}>{generationDefaults.providerName} · {generationDefaults.model || "未选择模型"}</p></div>
                              {!canGenerateInDetail ? <Button variant="ghost" size="sm" onClick={onOpenSettings}>{uiText("配置")}</Button> : null}
                            </div>
                            <div className="mt-4 grid gap-3">
                              <label className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 text-xs"><span className="text-muted-foreground">{uiText("尺寸")}</span><Select value={generationSize} onValueChange={setGenerationSize} disabled={sceneGenerationActive}><SelectTrigger className="h-8 text-xs tabular-nums">{generationSize === "auto" ? uiText("自动") : generationSize}</SelectTrigger><SelectContent>{SIZE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label} · {option.description}</SelectItem>)}</SelectContent></Select></label>
                              <label className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 text-xs"><span className="text-muted-foreground">{uiText("质量")}</span><Select value={generationQuality} onValueChange={(value) => setGenerationQuality(value as ImageQuality)} disabled={sceneGenerationActive}><SelectTrigger className="h-8 text-xs">{QUALITY_LABELS[generationQuality]}</SelectTrigger><SelectContent>{QUALITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>
                              <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 text-xs">
                                <span className="text-muted-foreground">{uiText("数量")}</span>
                                <div className="flex h-8 rounded-md bg-muted p-0.5" role="group" aria-label={uiText("生成张数")}>
                                  {([1, 2, 3] as GenerationCount[]).map((value) => {
                                    const active = generationCount === value;
                                    return (
                                      <button
                                        key={value}
                                        type="button"
                                        disabled={sceneGenerationActive}
                                        aria-pressed={active}
                                        onClick={() => setGenerationCount(value)}
                                        className={cn(
                                          "relative isolate h-7 flex-1 rounded-sm text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                        )}
                                      >
                                        {active ? <SegmentedControlIndicator layoutId={`scene-count-${segmentedControlId}`} className="rounded-sm bg-background shadow-sm" /> : null}
                                        <span className="relative z-10">{value}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>

                        <Button
                          ref={creationActionRef}
                          data-template-creation-action=""
                          className="ml-auto h-9 min-w-[104px] shrink-0 gap-1.5 px-3"
                          disabled={creationAction.disabled}
                          aria-live="polite"
                          onClick={runCreationAction}
                        >
                          {sceneGenerationActive || assistantLoading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : creationAction.kind === "generate" ? <ImageIcon className="h-4 w-4" /> : creationAction.kind === "settings" ? <SlidersHorizontal className="h-4 w-4" /> : creationAction.kind === "apply-proposal" ? <Check className="h-4 w-4" /> : creationAction.kind === "waiting" ? <CircleAlert className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="truncate">{creationAction.label}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="sr-only" aria-live="polite">{hasUnresolvedPlaceholders ? uiText("生成方案仍有未填写的占位符，补全后才能生成。") : promptOutdated ? uiText("需求、参考图或数量已变化，需要重新整理生成方案。") : ""}</p>
              </section>
            ) : null}
          </main>

          <AnimatePresence mode="wait" initial={false} onExitComplete={finishAssistantExit}>
            {assistantOpen ? (
              <motion.aside
                key="template-assistant-sidebar"
                id="template-assistant-sidebar"
                data-template-assistant-sidebar="workspace"
                aria-label={uiText("模板使用助手")}
                initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduceMotion ? 0 : 12 }}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-0 min-w-0 overflow-hidden bg-background min-[900px]:border-l min-[900px]:border-border"
              >
                <TemplateUseAssistant
                  templateName={activeScene.name}
                  templatePrompt={activeScene.prompt}
                  templateFields={activeScene.fields}
                  messages={assistantMessages}
                  value={generationBrief}
                  streaming={assistantLoading}
                  canSubmitWithoutText={assistantContextImages.length > 0}
                  contextImages={assistantContextImages}
                  suggestions={assistantSuggestions}
                  suggestionsLoading={assistantSuggestionsLoading}
                  onValueChange={setGenerationBrief}
                  onSubmit={() => void sendTemplateAssistantMessage(generationBrief)}
                  onStop={() => {
                    assistantRequestRef.current += 1;
                    setAssistantLoading(false);
                    setAssistantMessages((current) => current.map((message) => message.streaming ? { ...message, streaming: false } : message));
                  }}
                  onClose={closeTemplateAssistant}
                  onAttach={() => assistantFileInputRef.current?.click()}
                  onPasteImages={(files) => void addReferenceImages(files)}
                  onSuggestionSelect={(suggestion) => void sendTemplateAssistantMessage(suggestion)}
                  onRefreshSuggestions={() => void requestTemplateAssistantSuggestions("divergent")}
                  onApplyPrompt={applyAssistantPrompt}
                  onGeneratePrompt={generateAssistantPrompt}
                  canGenerateImmediately={canGenerateAssistantPrompt}
                />
              </motion.aside>
            ) : inspectorOpen ? (
              <motion.aside
                key="template-inspector"
                id="template-info-inspector"
                data-template-info-inspector=""
                aria-label={uiText("模板信息")}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{
                  opacity: 0,
                  x: 12,
                  transition: { duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }
                }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-0 min-w-0 flex-col border-l border-border bg-background"
              >
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <h2 ref={inspectorTitleRef} tabIndex={-1} className="min-w-0 flex-1 truncate text-sm font-semibold outline-none">{uiText("模板信息")}</h2>
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={wideWorkspace ? uiText("关闭模板信息") : uiText("返回创作")} onClick={closeInspector}><X className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{wideWorkspace ? uiText("关闭模板信息") : uiText("返回创作")}</TooltipContent></Tooltip>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <h1 className="text-base font-semibold">{activeScene.name}</h1>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeScene.description || SCENE_CATEGORY_LABELS[activeScene.category]}</p>
                  <dl className="mt-4 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 border-y border-border py-3 text-xs"><dt className="text-muted-foreground">{uiText("分类")}</dt><dd>{SCENE_CATEGORY_LABELS[activeScene.category]}</dd><dt className="text-muted-foreground">{uiText("模式")}</dt><dd>{activeScene.mode === "edit" ? uiText("图片编辑") : uiText("文生图")}</dd><dt className="text-muted-foreground">{uiText("示例")}</dt><dd>{(media?.results.length ?? 0)} {uiText("张生成示例 · ")}{(activeScene.previewImages?.length ?? 0)} {uiText("张内置示例")}</dd></dl>
                  <section className="mt-5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 rounded-md bg-muted p-0.5" role="tablist" aria-label={uiText("提示词视图")}>
                        {(["example", "template"] as const).map((value) => {
                          const active = promptView === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => { setPromptView(value); setTemplateExpanded(false); }}
                              className={cn(
                                "relative isolate h-7 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {active ? <SegmentedControlIndicator layoutId={`scene-prompt-${segmentedControlId}`} className="rounded-sm bg-background shadow-sm" /> : null}
                              <span className="relative z-10">{value === "example" ? uiText("当前示例") : uiText("模板 Prompt")}</span>
                            </button>
                          );
                        })}
                      </div>
                      <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label={promptCopied ? uiText("已复制 Prompt") : uiText("复制 Prompt")} title={promptCopied ? uiText("已复制") : uiText("复制 Prompt")} onClick={() => { onCopyText(displayedReferencePrompt); setPromptCopied(true); }}>{promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>
                    </div>
                    <div role="tabpanel" className="mt-3 bg-muted/45 px-3 py-3">
                      {promptView === "example" && previewPrompt ? <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{previewPrompt.label}</p> : null}
                      <p className={cn("whitespace-pre-wrap break-words text-xs leading-5", !templateExpanded && "max-h-36 overflow-hidden")}>{displayedReferencePrompt}</p>
                      {displayedReferencePrompt.length > 150 ? <button type="button" className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setTemplateExpanded((value) => !value)}>{templateExpanded ? uiText("收起") : uiText("展开完整 Prompt")}</button> : null}
                    </div>
                  </section>
                  <section className="mt-5 border-t border-border pt-4">
                    <div className="flex items-center gap-2"><h3 className="text-xs font-semibold">{uiText("生成方案")}</h3><Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => { if (!wideWorkspace) closeInspector(); openTemplateAssistant(); }}>{generatedPrompt ? uiText("调整方案") : uiText("开始整理")}</Button></div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{generatedPrompt ? (promptOutdated ? "需求已修改，方案需要重新整理。" : `已准备 ${generatedVariations.length || generationCount} 张图片的生成方案。`) : uiText("尚未整理本次生成方案。")}</p>
                  </section>
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </div>

        <Dialog open={Boolean(deleteResultTarget)} onOpenChange={(open) => !open && setDeleteResultTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{uiText("从模板移除这张示例图？")}</DialogTitle>
              <DialogDescription>{uiText("图片将从当前模板的生成示例中移除，模板会自动使用剩余示例。")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteResultTarget(null)}>{uiText("取消")}</Button>
              <Button variant="destructive" disabled={mediaMutating} onClick={() => void deleteSceneResult()}>
                {mediaMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {uiText("从模板移除")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={submissionOpen} onOpenChange={changeSubmissionOpen}>
          <DialogContent className="max-w-md" onKeyDownCapture={(event) => event.stopPropagation()}>
            {submissionPhase === "loading" ? (
              <>
                <DialogHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                  <DialogTitle>{uiText("正在刷新审核状态")}</DialogTitle>
                  <DialogDescription>{uiText("正在从 Manager 获取「")}{activeScene.name}{uiText("」的最新发布信息。")}</DialogDescription>
                </DialogHeader>
              </>
            ) : submission && submissionMeta && SubmissionStatusIcon ? (
              <>
                <DialogHeader>
                  <div className={cn(
                    "mb-2 flex h-10 w-10 items-center justify-center rounded-full",
                    submissionMeta.iconSurfaceClassName,
                    submissionMeta.iconClassName
                  )}>
                    <SubmissionStatusIcon className="h-5 w-5" />
                  </div>
                  <DialogTitle>{submissionMeta.label}</DialogTitle>
                  <DialogDescription>{submissionMeta.description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">{uiText("模板")}</dt>
                    <dd className="min-w-0 break-words font-medium">{submission.name}</dd>
                    <dt className="text-muted-foreground">{uiText("创作者")}</dt>
                    <dd className="min-w-0 break-words">{submission.authorName || "Iterlay 创作者"}</dd>
                    <dt className="text-muted-foreground">{uiText("提交时间")}</dt>
                    <dd className="tabular-nums">{formatDateTime(submission.submittedAt)}</dd>
                    {submission.reviewedAt ? (
                      <>
                        <dt className="text-muted-foreground">{uiText("审核时间")}</dt>
                        <dd className="tabular-nums">{formatDateTime(submission.reviewedAt)}</dd>
                      </>
                    ) : null}
                  </dl>

                  {submission.reviewNote || submission.status === "rejected" ? (
                    <div className={cn(
                      "rounded-md border px-3 py-2.5 text-sm leading-6",
                      submission.status === "rejected"
                        ? "border-destructive/20 bg-destructive/5 text-destructive"
                        : "border-border bg-muted/50 text-foreground"
                    )}>
                      <p className="text-xs font-medium">
                        {submission.status === "rejected" ? uiText("拒绝原因") : uiText("Manager 说明")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words">
                        {submission.reviewNote?.trim() || "Manager 未提供拒绝原因，请联系支持人员。"}
                      </p>
                    </div>
                  ) : null}

                  {submissionLoadError ? (
                    <p role="alert" className="text-sm text-destructive">{submissionLoadError}</p>
                  ) : null}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => void refreshSubmission()}>
                    <RefreshCw className="h-4 w-4" />
                    {uiText("刷新状态")}</Button>
                  {canRetrySubmission ? (
                    <Button variant="outline" onClick={prepareSubmissionRetry}>{uiText("重新提交")}</Button>
                  ) : null}
                  <Button onClick={() => changeSubmissionOpen(false)}>{uiText("完成")}</Button>
                </DialogFooter>
              </>
            ) : submissionLoadError ? (
              <>
                <DialogHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <CircleAlert className="h-5 w-5" />
                  </div>
                  <DialogTitle>{uiText("暂时无法获取审核状态")}</DialogTitle>
                  <DialogDescription>{submissionLoadError}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => changeSubmissionOpen(false)}>{uiText("取消")}</Button>
                  <Button onClick={() => void refreshSubmission()}>
                    <RefreshCw className="h-4 w-4" />
                    {uiText("重新获取")}</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>{uiText("发布到模板广场")}</DialogTitle>
                  <DialogDescription>
                    {uiText("审核通过后，其他用户可以在 Iterlay 官网发现并下载这个模板。")}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <label className="grid gap-2 text-sm" htmlFor="template-submission-author">
                    <span className="font-medium">{uiText("创作者名称")}</span>
                    <Input
                      id="template-submission-author"
                      value={submissionAuthor}
                      onChange={(event) => setSubmissionAuthor(event.target.value)}
                      placeholder={uiText("留空将显示为 Iterlay 创作者")}
                      maxLength={40}
                      disabled={submissionPhase === "submitting"}
                    />
                  </label>

                  <div className="rounded-md bg-muted/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                    {uiText("模板名称、说明、提示词和下方选中的示例图将公开展示或提供下载。首张选中图片会作为模板封面。")}</div>

                  <fieldset className="space-y-2.5" disabled={submissionPhase === "submitting"}>
                    <div className="flex items-center justify-between gap-3">
                      <legend className="text-sm font-medium">{uiText("公开示例图")}</legend>
                      <span className="text-xs text-muted-foreground">{uiText("已选择 ")}{submissionExampleIds.length} {uiText("张")}</span>
                    </div>
                    {media?.results.length ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {media.results.map((result, index) => {
                          const checked = submissionExampleIds.includes(result.id);
                          return (
                            <label
                              key={result.id}
                              className={cn(
                                "group relative aspect-square cursor-pointer overflow-hidden rounded-md border bg-muted focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                                checked ? "border-primary" : "border-border opacity-70 hover:opacity-100"
                              )}
                            >
                              <img src={result.imageUrl} alt={uiText("公开示例图 {{ui:0}}", [index + 1])} className="h-full w-full object-cover" />
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() => setSubmissionExampleIds((current) => (
                                  checked ? current.filter((id) => id !== result.id) : [...current, result.id]
                                ))}
                              />
                              <span className={cn(
                                "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-sm border text-background",
                                checked ? "border-primary bg-primary" : "border-background/80 bg-background/70 text-transparent"
                              )}>
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              </span>
                              {checked && media.results.find((item) => submissionExampleIds.includes(item.id))?.id === result.id ? (
                                <span className="absolute bottom-0 inset-x-0 bg-foreground/80 px-1.5 py-1 text-center text-[10px] font-medium text-background">{uiText("封面")}</span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                        {uiText("请先在模板中添加至少一张示例图，再提交发布。")}</p>
                    )}
                  </fieldset>

                  <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      checked={submissionConsent}
                      onChange={(event) => setSubmissionConsent(event.target.checked)}
                      disabled={submissionPhase === "submitting"}
                    />
                    <span>{uiText("我确认拥有公开这些内容的权利，并同意将模板提交审核。")}</span>
                  </label>

                  {submissionError ? (
                    <p role="alert" className="text-sm text-destructive">{submissionError}</p>
                  ) : null}
                </div>

                <DialogFooter>
                  <Button
                    variant="ghost"
                    disabled={submissionPhase === "submitting"}
                    onClick={() => changeSubmissionOpen(false)}
                  >
                    {uiText("取消")}</Button>
                  <Button
                    disabled={!submissionConsent || submissionExampleIds.length === 0 || submissionPhase === "submitting"}
                    onClick={() => void submitTemplate()}
                  >
                    {submissionPhase === "submitting" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {submissionPhase === "submitting" ? uiText("正在提交") : uiText("发布")}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}

type MediaStageView = "preview" | "history";

type SceneStageItem =
  | {
      key: string;
      kind: "builtin";
      src: string;
      label: string;
      prompt: string;
    }
  | {
      key: string;
      kind: "result";
      src: string;
      label: string;
      prompt: string;
      result: SceneMediaResult;
    };

interface ScenePreviewLightbox {
  src: string;
  alt: string;
  sourceRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  imageWidth?: number;
  imageHeight?: number;
}

function SceneMediaStage({
  scene,
  results,
  historyItems,
  busy,
  view,
  onViewChange,
  loadThumbnail,
  onDeleteResult,
  onReorderResults,
  onLocateHistory,
  onReuseHistory,
  onAddHistoryAsExample,
  onUseHistoryAsReference,
  onPromptChange,
  generationTiming
}: {
  scene: SceneDefinition;
  results: SceneMediaResult[];
  historyItems: SceneHistoryItem[];
  busy: boolean;
  view: MediaStageView;
  onViewChange: (view: MediaStageView) => void;
  loadThumbnail: (path: string) => Promise<string | undefined>;
  onDeleteResult: (result: SceneMediaResult) => void;
  onReorderResults: (sourceId: string, targetId: string) => void;
  onLocateHistory: (job: GenerationJob, imagePath: string) => void;
  onReuseHistory: (job: GenerationJob) => void;
  onAddHistoryAsExample: (imagePath: string, prompt: string) => void;
  onUseHistoryAsReference: (imagePath: string) => void;
  onPromptChange: (selection: ScenePreviewPrompt | null) => void;
  generationTiming: GenerationTiming | null;
}): React.ReactElement {
  const uiText = useUiText();

  const reduceMotion = Boolean(useReducedMotion());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draggedResultId, setDraggedResultId] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [previewLightbox, setPreviewLightbox] = useState<ScenePreviewLightbox | null>(null);
  const previewItems = useMemo<SceneStageItem[]>(() => {
    const builtinItems: SceneStageItem[] = (scene.previewImages ?? []).slice(0, 3).map((src, index) => ({
      key: `builtin:${index}`,
      kind: "builtin",
      src,
      label: `内置示例 ${index + 1}`,
      prompt: scene.previewPrompts?.[index] || scene.prompt
    }));
    const resultItems: SceneStageItem[] = results.map((result, index) => ({
      key: `result:${result.id}`,
      kind: "result",
      src: result.imageUrl,
      label: `生成示例 ${index + 1}`,
      prompt: result.prompt || scene.prompt,
      result
    }));
    return [...resultItems, ...builtinItems];
  }, [results, scene.previewImages, scene.previewPrompts, scene.prompt]);

  useEffect(() => {
    if (previewItems.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !previewItems.some((item) => item.key === selectedKey)) {
      setSelectedKey(previewItems[0].key);
    }
  }, [previewItems, selectedKey]);

  const selectedItem = previewItems.find((item) => item.key === selectedKey) ?? previewItems[0];
  const mediaGroups = [
    {
      key: "generated",
      label: "生成示例",
      items: previewItems.filter((item) => item.kind === "result")
    },
    {
      key: "builtin",
      label: "内置示例",
      items: previewItems.filter((item) => item.kind === "builtin")
    }
  ].filter((group) => group.items.length > 0);

  useEffect(() => {
    onPromptChange(selectedItem
      ? { key: selectedItem.key, label: selectedItem.label, prompt: selectedItem.prompt }
      : null);
  }, [onPromptChange, selectedItem]);

  function handleResultDrop(event: DragEvent<HTMLElement>, targetId: string): void {
    event.preventDefault();
    if (draggedResultId) onReorderResults(draggedResultId, targetId);
    setDraggedResultId(null);
  }

  function selectAdjacentPreview(itemKey: string, direction: -1 | 1): void {
    const index = previewItems.findIndex((item) => item.key === itemKey);
    if (index < 0 || previewItems.length === 0) return;
    const nextIndex = (index + direction + previewItems.length) % previewItems.length;
    setSelectedKey(previewItems[nextIndex].key);
  }

  async function downloadPreview(item: SceneStageItem): Promise<void> {
    if (downloadingKey) return;
    setDownloadingKey(item.key);
    try {
      const api = getImageWorkbenchApi();
      const result = item.kind === "builtin"
        ? await (async () => {
            const response = await fetch(item.src);
            if (!response.ok) throw new Error("无法读取内置示例图片。");
            const dataUrl = await readBlobAsDataUrl(await response.blob());
            return api.saveImageDataUrl(
              dataUrl,
              buildScenePreviewDownloadName(scene.name, item.label, item.src)
            );
          })()
        : await api.saveAsset(item.result.path);
      if (result.ok) iterlayToast.exported({ path: result.path });
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "图片下载失败，请稍后重试。"));
    } finally {
      setDownloadingKey(null);
    }
  }

  return (
    <>
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-muted/30">
      {view === "history" ? (
        <div id="scene-history-panel" role="tabpanel" aria-labelledby="scene-history-tab" className="min-h-0 flex-1 overflow-y-auto bg-background p-5 sm:p-6">
          <SceneHistoryGallery
            items={historyItems}
            loadThumbnail={loadThumbnail}
            onLocate={onLocateHistory}
            onReuse={onReuseHistory}
            onAddAsExample={onAddHistoryAsExample}
            onUseAsReference={onUseHistoryAsReference}
            onStart={() => onViewChange("preview")}
          />
        </div>
      ) : (
        <div id="scene-examples-panel" role="tabpanel" aria-labelledby="scene-examples-tab" className="grid min-h-0 flex-1 grid-cols-[80px_minmax(0,1fr)] overflow-hidden">
          <div data-template-media-rail="" className="min-h-0 overflow-y-auto border-r border-border bg-black/10 p-3 dark:bg-black/40" role="listbox" aria-label={uiText("模板示例")}>
            {mediaGroups.map((group, groupIndex) => (
              <div key={group.key} role="group" aria-label={group.label} className={cn(groupIndex > 0 && "mt-3 border-t border-border pt-3")}>
                <div className="grid gap-2">
                  {group.items.map((item) => {
                    const sortable = item.kind === "result";
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={selectedItem?.key === item.key}
                        aria-label={uiText("查看{{ui:0}}", [item.label])}
                        draggable={sortable && !busy}
                        onDragStart={() => sortable && setDraggedResultId(item.result.id)}
                        onDragEnd={() => setDraggedResultId(null)}
                        onDragOver={(event) => sortable && event.preventDefault()}
                        onDrop={(event) => sortable && handleResultDrop(event, item.result.id)}
                        onClick={() => setSelectedKey(item.key)}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); selectAdjacentPreview(item.key, -1); }
                          if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); selectAdjacentPreview(item.key, 1); }
                          if (event.key === "Home") { event.preventDefault(); setSelectedKey(previewItems[0]?.key ?? null); }
                          if (event.key === "End") { event.preventDefault(); setSelectedKey(previewItems.at(-1)?.key ?? null); }
                        }}
                        className={cn(
                          "group relative aspect-square w-full overflow-hidden rounded-md border border-transparent bg-muted transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selectedItem?.key === item.key && "border-neutral-400/80 shadow-[0_2px_8px_rgba(24,24,20,0.18)] dark:border-neutral-500",
                          sortable && draggedResultId === item.result.id && "opacity-50"
                        )}
                      >
                        <img src={item.src} alt="" draggable={false} className="h-full w-full object-cover transition-[filter] duration-150 group-hover:brightness-90 motion-reduce:transition-none" />
                        {sortable ? <GripVertical className="absolute bottom-1 right-1 h-3 w-3 text-white drop-shadow" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div
            data-scene-preview-stage
            className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-black/10 p-5 dark:bg-black/40 sm:p-7"
          >
            {selectedItem ? (
              <>
                <button
                  type="button"
                  aria-label={uiText("放大预览{{ui:0}}", [selectedItem.label])}
                  className="flex h-full w-full min-h-0 min-w-0 cursor-zoom-in items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={(event) => {
                    const image = event.currentTarget.querySelector("img");
                    const rect = image?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
                    setPreviewLightbox({
                      src: selectedItem.src,
                      alt: `${scene.name}${selectedItem.label}放大预览`,
                      sourceRect: {
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height
                      },
                      imageWidth: image?.naturalWidth || undefined,
                      imageHeight: image?.naturalHeight || undefined
                    });
                  }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.img
                      key={selectedItem.key}
                      data-scene-preview-image
                      src={selectedItem.src}
                      alt={`${scene.name}${selectedItem.label}`}
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.992 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.17, ease: [0.22, 1, 0.36, 1] }}
                      className="h-auto w-auto max-h-full max-w-full rounded-lg object-contain"
                    />
                  </AnimatePresence>
                </button>
                <span className="absolute left-5 top-5 rounded-md bg-background/90 px-2 py-1 text-[11px] font-medium text-foreground ring-1 ring-border sm:left-7 sm:top-7">
                  {selectedItem.label}
                </span>
                <div className="absolute bottom-5 right-5 flex items-center gap-1 rounded-md bg-background/95 p-1 ring-1 ring-border sm:bottom-7 sm:right-7">
                  <ResultAction
                    label={downloadingKey === selectedItem.key ? uiText("正在下载") : uiText("下载图片")}
                    icon={downloadingKey === selectedItem.key ? Loader2 : Download}
                    loading={downloadingKey === selectedItem.key}
                    disabled={busy || downloadingKey !== null}
                    onClick={() => void downloadPreview(selectedItem)}
                  />
                  {selectedItem.kind === "result" ? (
                    <ResultAction label={uiText("从模板移除")} icon={Trash2} disabled={busy} destructive onClick={() => onDeleteResult(selectedItem.result)} />
                  ) : null}
                </div>
              </>
            ) : (
              <div className="px-6 text-center">
                <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">{uiText("还没有示例图")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{uiText("在下方描述需求并生成模板示例。")}</p>
              </div>
            )}
            {generationTiming ? (
              <div
                data-scene-generation-status
                aria-busy="true"
                aria-live="polite"
                className="absolute inset-0 z-10 flex items-center justify-center bg-background/75 px-6 text-center backdrop-blur-sm"
              >
                <div className="flex flex-col items-center gap-2.5">
                  <Loader2
                    aria-hidden
                    className="h-6 w-6 animate-spin text-muted-foreground [animation-duration:1.4s] motion-reduce:animate-none"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{uiText("正在生成示例")}</p>
                    <p className="text-xs text-muted-foreground">
                      {uiText("已用 ")}<time className="tabular-nums">{generationTiming.elapsedLabel}</time>
                    </p>
                    {generationTiming.overdue ? (
                      <p className="max-w-56 text-pretty text-xs leading-5 text-muted-foreground">
                        {uiText("比预计久一点，任务仍在处理中")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {uiText("预计剩余 ")}<time className="tabular-nums">{generationTiming.remainingLabel}</time>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
      </section>

      <AnimatePresence>
        {previewLightbox ? (
          <ImageZoomLightbox
            key={previewLightbox.src}
            src={previewLightbox.src}
            alt={previewLightbox.alt}
            sourceRect={previewLightbox.sourceRect}
            imageWidth={previewLightbox.imageWidth}
            imageHeight={previewLightbox.imageHeight}
            backdrop="dim"
            onClose={() => setPreviewLightbox(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function SceneHistoryGallery({
  items,
  loadThumbnail,
  onLocate,
  onReuse,
  onAddAsExample,
  onUseAsReference,
  onStart
}: {
  items: SceneHistoryItem[];
  loadThumbnail: (path: string) => Promise<string | undefined>;
  onLocate: (job: GenerationJob, imagePath: string) => void;
  onReuse: (job: GenerationJob) => void;
  onAddAsExample: (imagePath: string, prompt: string) => void;
  onUseAsReference: (imagePath: string) => void;
  onStart: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  const segmentedControlId = useId();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [view, setView] = useState<HistoryView>("grid");
  const [sort, setSort] = useState<HistorySort>("newest");

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      items.map(async (item) => {
        const dataUrl = await loadThumbnail(item.path);
        return [item.id, dataUrl] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setThumbnails(
        Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [items, loadThumbnail]);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const difference = Date.parse(b.createdAt) - Date.parse(a.createdAt);
        return sort === "newest" ? difference : -difference;
      }),
    [items, sort]
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold">{uiText("历史结果")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {items.length > 0 ? uiText("{{ui:0}} 张图片，点击结果进入来源画板并定位", [items.length]) : uiText("从这个模板生成的图片会集中在这里")}
          </p>
        </div>
        {items.length > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <Select value={sort} onValueChange={(value) => setSort(value as HistorySort)}>
              <SelectTrigger className="h-8 w-[104px] text-xs">{sort === "newest" ? uiText("最新优先") : uiText("最早优先")}</SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{uiText("最新优先")}</SelectItem>
                <SelectItem value="oldest">{uiText("最早优先")}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex h-8 items-center rounded-md bg-muted p-0.5" role="group" aria-label={uiText("结果视图")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={uiText("网格视图")}
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                    className={cn(
                      "relative isolate flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      view === "grid" ? "text-foreground" : "hover:text-foreground"
                    )}
                  >
                    {view === "grid" ? <SegmentedControlIndicator layoutId={`scene-history-view-${segmentedControlId}`} className="rounded-sm bg-background shadow-sm" /> : null}
                    <Grid3X3 className="relative z-10 h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{uiText("网格视图")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={uiText("列表视图")}
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                    className={cn(
                      "relative isolate flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      view === "list" ? "text-foreground" : "hover:text-foreground"
                    )}
                  >
                    {view === "list" ? <SegmentedControlIndicator layoutId={`scene-history-view-${segmentedControlId}`} className="rounded-sm bg-background shadow-sm" /> : null}
                    <List className="relative z-10 h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{uiText("列表视图")}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-52 items-center justify-center rounded-lg bg-muted/35 px-6 text-center">
          <div>
            <ImageIcon className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">{uiText("还没有历史结果")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{uiText("套用模板并完成第一次生成后，结果会自动归档。")}</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={onStart}>
              <Sparkles className="h-3.5 w-3.5" />
              {uiText("应用并开始生成")}</Button>
          </div>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
          {sortedItems.map((item) => (
            <HistoryGridItem
              key={item.id}
              item={item}
              thumbnail={thumbnails[item.id]}
              onLocate={onLocate}
              onReuse={onReuse}
              onAddAsExample={onAddAsExample}
              onUseAsReference={onUseAsReference}
            />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {sortedItems.map((item) => (
            <HistoryListItem
              key={item.id}
              item={item}
              thumbnail={thumbnails[item.id]}
              onLocate={onLocate}
              onReuse={onReuse}
              onAddAsExample={onAddAsExample}
              onUseAsReference={onUseAsReference}
            />
          ))}
        </div>
      )}
    </>
  );
}

function HistoryGridItem({
  item,
  thumbnail,
  onLocate,
  onReuse,
  onAddAsExample,
  onUseAsReference
}: {
  item: SceneHistoryItem;
  thumbnail?: string;
  onLocate: (job: GenerationJob, imagePath: string) => void;
  onReuse: (job: GenerationJob) => void;
  onAddAsExample: (imagePath: string, prompt: string) => void;
  onUseAsReference: (imagePath: string) => void;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-ring/60">
      <button
        type="button"
        onClick={() => onLocate(item.job, item.path)}
        className="relative block aspect-square w-full overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={uiText("进入{{ui:0}}并定位这张图片", [item.boardName])}
      >
        {thumbnail ? (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
        <span className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1.5 bg-black/65 px-3 py-2 text-xs font-medium text-white transition-transform duration-200 group-hover:translate-y-0 group-focus-within:translate-y-0">
          <LayoutGrid className="h-3.5 w-3.5" />
          {uiText("进入画板并定位")}</span>
      </button>
      <div className="p-3">
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-foreground/85">{item.prompt}</p>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock3 className="h-3 w-3 shrink-0" />
          <span className="truncate tabular-nums" title={formatDateTime(item.createdAt)}>{formatDateTime(item.createdAt)}</span>
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground" title={item.boardName}>{item.boardName}</p>
        <div className="mt-3 flex items-center gap-1 border-t border-border pt-2">
          <ResultAction label={uiText("进入画板")} icon={LayoutGrid} onClick={() => onLocate(item.job, item.path)} />
          <ResultAction label={uiText("复制为模板示例")} icon={CopyPlus} onClick={() => onAddAsExample(item.path, item.prompt)} />
          <ResultAction label={uiText("用作参考图")} icon={ImagePlus} onClick={() => onUseAsReference(item.path)} />
          <ResultAction label={uiText("复用参数")} icon={RotateCcw} onClick={() => onReuse(item.job)} />
        </div>
      </div>
    </article>
  );
}

function HistoryListItem({
  item,
  thumbnail,
  onLocate,
  onReuse,
  onAddAsExample,
  onUseAsReference
}: {
  item: SceneHistoryItem;
  thumbnail?: string;
  onLocate: (job: GenerationJob, imagePath: string) => void;
  onReuse: (job: GenerationJob) => void;
  onAddAsExample: (imagePath: string, prompt: string) => void;
  onUseAsReference: (imagePath: string) => void;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={() => onLocate(item.job, item.path)}
        className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={uiText("进入{{ui:0}}并定位这张图片", [item.boardName])}
      >
        {thumbnail ? (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onLocate(item.job, item.path)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="truncate text-sm font-medium">{item.prompt}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{formatDateTime(item.createdAt)}</span>
          <span>{item.boardName}</span>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <ResultAction label={uiText("进入画板")} icon={LayoutGrid} onClick={() => onLocate(item.job, item.path)} />
        <ResultAction label={uiText("复制为模板示例")} icon={CopyPlus} onClick={() => onAddAsExample(item.path, item.prompt)} />
        <ResultAction label={uiText("用作参考图")} icon={ImagePlus} onClick={() => onUseAsReference(item.path)} />
        <ResultAction label={uiText("复用参数")} icon={RotateCcw} onClick={() => onReuse(item.job)} />
      </div>
    </div>
  );
}

function ResultAction({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  loading = false,
  destructive = false
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
            destructive && "hover:bg-destructive/10 hover:text-destructive"
          )}
          aria-label={label}
          aria-busy={loading || undefined}
        >
          <Icon className={cn("h-3.5 w-3.5", loading && "animate-spin motion-reduce:animate-none")} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
