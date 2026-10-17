import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent
} from "react";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Library,
  Loader2,
  Megaphone,
  Mountain,
  Package,
  Paintbrush,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shapes,
  Smartphone,
  Star,
  Trash2,
  Upload,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import type {
  BoardSummary,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  GenerationJob,
  GptImageUseCase,
  ImageWorkflowMode,
  SceneMediaSummary,
  TemplateSubmissionResult
} from "@shared/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SceneDetail } from "@/components/workbench/SceneDetail";
import { LibraryFilterTabs } from "@/components/workbench/LibraryFilterTabs";
import { PiTemplateSmartCreateDialog } from "@/components/workbench/PiTemplateSmartCreateDialog";
import { PiTemplateTaskCenter } from "@/components/workbench/PiTemplateTaskCenter";
import { useMasonryGrid } from "@/components/workbench/asset/useMasonryGrid";
import { partitionTemplateImportFiles } from "@/components/workbench/template-import";
import { getImageWorkbenchApi, getWorkbenchErrorMessage, hasImageWorkbenchApi } from "@/lib/image-workbench-api";
import type { GenerateTemplateVerification } from "@/lib/template-verification";
import { getScenePreviewImages, type SceneGenerationDefaults, type ScenePreviewImage } from "@/lib/scene-media";
import {
  SCENE_CATEGORY_LABELS,
  sortScenesForLibrary,
  type NewSceneInput,
  type SceneCategory,
  type SceneDefinition
} from "@/lib/scene-library";
import type { MasonryRect } from "@/lib/masonry";
import { cn } from "@/lib/utils";

type SceneFilter = "all" | "favorite" | "preset" | "custom";
type SceneCardLayout = "collage" | "filmstrip";

interface SceneBrowserProps {
  scenes: SceneDefinition[];
  favoriteSceneIds: string[];
  mediaBySceneId: Record<string, SceneMediaSummary>;
  mediaLoaded: boolean;
  compact?: boolean;
  compactActions?: React.ReactNode;
  pageHeaderActions?: React.ReactNode;
  onSelect: (scene: SceneDefinition) => void;
  onToggleFavorite: (id: string) => void;
  onRequestDelete?: (scene: SceneDefinition) => void;
}

interface SaveSceneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPrompt: string;
  mode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  onSave: (input: NewSceneInput) => void;
}

interface SceneLibraryPageProps {
  onGenerateVerification?: GenerateTemplateVerification;
  scenes: SceneDefinition[];
  initialSceneRequest?: { id: string; nonce: number };
  activeBoardId?: string;
  favoriteSceneIds: string[];
  boards: BoardSummary[];
  currentPrompt: string;
  mode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  history: GenerationJob[];
  canOptimize: boolean;
  canCollaborate: boolean;
  generationDefaults: SceneGenerationDefaults;
  onSelect: (scene: SceneDefinition) => void;
  onToggleFavorite: (id: string) => void;
  onSave: (input: NewSceneInput) => SceneDefinition;
  onUpdate: (scene: SceneDefinition, input: NewSceneInput) => SceneDefinition;
  onDelete: (id: string) => void;
  onExport: (scene: SceneDefinition) => void;
  onSubmit: (scene: SceneDefinition, authorName: string, exampleResultIds: string[]) => Promise<TemplateSubmissionResult>;
  onGetSubmission: (scene: SceneDefinition) => Promise<TemplateSubmissionResult | null>;
  onImport: () => Promise<SceneDefinition | null>;
  onImportFiles: (files: File[]) => Promise<SceneDefinition[]>;
  onOptimize: (scene: SceneDefinition, prompt: string, templatePrompt?: string) => Promise<string>;
  onCollaborate: (request: Omit<CollaborateSceneRequest, "providerId">) => Promise<CollaborateSceneResult>;
  onCopyText: (text: string) => void;
  onLocateHistory: (job: GenerationJob, imagePath: string) => void;
  onReuseHistory: (job: GenerationJob) => void;
  onUseHistoryAsReference: (imagePath: string) => void;
  loadThumbnail: (path: string) => Promise<string | undefined>;
  onOpenSettings: () => void;
  onClose: () => void;
}

export interface ScenePickerDialogProps {
  open: boolean;
  scenes: SceneDefinition[];
  favoriteSceneIds: string[];
  currentPrompt: string;
  mode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  onOpenChange: (open: boolean) => void;
  onSelect: (scene: SceneDefinition) => void;
  onToggleFavorite: (id: string) => void;
  onSave: (input: NewSceneInput) => SceneDefinition | void;
  onManage: () => void;
}

const CATEGORY_ICONS: Record<SceneCategory, LucideIcon> = {
  marketing: Megaphone,
  product: Package,
  social: Smartphone,
  illustration: Paintbrush,
  portrait: UserRound,
  brand: Shapes,
  concept: Mountain,
  editing: Pencil,
  other: ImageIcon
};

const CATEGORY_OPTIONS = Object.entries(SCENE_CATEGORY_LABELS) as Array<[SceneCategory, string]>;
const SCENE_MASONRY_OPTIONS = {
  gap: 16,
  targetColumnWidth: 300,
  minColumns: 1,
  maxColumns: 5
} as const;
const DEFAULT_SCENE_PREVIEW_RATIO = 2 / 3;
const EMPTY_SCENE_PREVIEW_RATIO = 4 / 3;
const SEARCH_FEEDBACK_DELAY_MS = 450;
const loadSceneCreator = () =>
  import("@/components/workbench/SceneCreator").then((module) => ({ default: module.SceneCreator }));
const SceneCreator = lazy(loadSceneCreator);

function useSceneMediaLibrary(): {
  mediaBySceneId: Record<string, SceneMediaSummary>;
  mediaLoaded: boolean;
  refreshSceneMedia: () => Promise<void>;
} {
  const bridgeAvailable = hasImageWorkbenchApi();
  const [mediaBySceneId, setMediaBySceneId] = useState<Record<string, SceneMediaSummary>>({});
  const [mediaLoaded, setMediaLoaded] = useState(!bridgeAvailable);
  const requestRevisionRef = useRef(0);

  const refreshSceneMedia = useCallback(async (): Promise<void> => {
    const revision = ++requestRevisionRef.current;
    if (!bridgeAvailable) {
      if (requestRevisionRef.current === revision) setMediaLoaded(true);
      return;
    }
    try {
      const summaries = await getImageWorkbenchApi().listSceneMedia();
      if (requestRevisionRef.current !== revision) return;
      setMediaBySceneId(Object.fromEntries(summaries.map((summary) => [summary.sceneId, summary])));
    } catch (error) {
      if (requestRevisionRef.current !== revision) return;
      toast.error(getWorkbenchErrorMessage(error, "无法加载模板示例图。"));
    } finally {
      if (requestRevisionRef.current === revision) setMediaLoaded(true);
    }
  }, [bridgeAvailable]);

  useEffect(() => {
    void refreshSceneMedia();
    return () => { requestRevisionRef.current += 1; };
  }, [refreshSceneMedia]);

  return { mediaBySceneId, mediaLoaded, refreshSceneMedia };
}

export function SceneLibraryPage({
  scenes,
  initialSceneRequest,
  activeBoardId,
  favoriteSceneIds,
  boards,
  currentPrompt,
  mode,
  useCase,
  history,
  canOptimize,
  canCollaborate,
  generationDefaults,
  onGenerateVerification,
  onSelect,
  onToggleFavorite,
  onSave,
  onUpdate,
  onDelete,
  onExport,
  onSubmit,
  onGetSubmission,
  onImport,
  onImportFiles,
  onOptimize,
  onCollaborate,
  onCopyText,
  onLocateHistory,
  onReuseHistory,
  onUseHistoryAsReference,
  loadThumbnail,
  onOpenSettings,
  onClose
}: SceneLibraryPageProps): React.ReactElement {
  const uiText = useUiText();

  const [editorScene, setEditorScene] = useState<SceneDefinition | null | undefined>(undefined);
  const [creationMethodOpen, setCreationMethodOpen] = useState(false);
  const [smartCreateOpen, setSmartCreateOpen] = useState(false);
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [selectedScene, setSelectedScene] = useState<SceneDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SceneDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [importingCount, setImportingCount] = useState(0);
  const dragDepthRef = useRef(0);
  const isImporting = importingCount > 0;
  const { mediaBySceneId, mediaLoaded, refreshSceneMedia } = useSceneMediaLibrary();

  useEffect(() => {
    if (!initialSceneRequest) return;
    const scene = scenes.find((candidate) => candidate.id === initialSceneRequest.id);
    if (scene) setSelectedScene(scene);
  }, [initialSceneRequest, scenes]);

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      if (hasImageWorkbenchApi()) await getImageWorkbenchApi().deleteSceneMedia(deleteTarget.id);
      onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "删除模板媒体失败。"));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, onDelete]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (
        event.key !== "Escape" ||
        editorScene !== undefined ||
        creationMethodOpen ||
        smartCreateOpen ||
        isFileDragActive ||
        isImporting
      ) return;
      if (deleteTarget) return;
      if (selectedScene) setSelectedScene(null);
      else onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [creationMethodOpen, deleteTarget, editorScene, isFileDragActive, isImporting, onClose, selectedScene, smartCreateOpen]);

  function hasDraggedFiles(event: ReactDragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (isImporting) return;
    dragDepthRef.current += 1;
    setIsFileDragActive(true);
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = isImporting ? "none" : "copy";
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>): void {
    if (dragDepthRef.current === 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsFileDragActive(false);
  }

  async function handleImportedScenes(importedScenes: SceneDefinition[]): Promise<void> {
    if (importedScenes.length === 0) return;
    await refreshSceneMedia();
    if (importedScenes.length === 1) setSelectedScene(importedScenes[0]);
  }

  async function handleDrop(event: ReactDragEvent<HTMLDivElement>): Promise<void> {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsFileDragActive(false);
    if (isImporting) return;

    const { accepted, rejected } = partitionTemplateImportFiles(Array.from(event.dataTransfer.files));
    if (accepted.length === 0) {
      if (rejected.length > 0) toast.error(translateSourceText("只支持 .itt 模板文件"));
      return;
    }
    if (rejected.length > 0) toast.warning(translateSourceText("已忽略 {{ui:0}} 个非 .itt 文件", [rejected.length]));

    setImportingCount(accepted.length);
    try {
      await handleImportedScenes(await onImportFiles(accepted));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "导入模板失败。"));
    } finally {
      setImportingCount(0);
    }
  }

  async function handleImportFromDialog(): Promise<void> {
    if (isImporting) return;
    setImportingCount(1);
    try {
      const scene = await onImport();
      await handleImportedScenes(scene ? [scene] : []);
    } finally {
      setImportingCount(0);
    }
  }

  function startSmartCreation(): void {
    setCreationMethodOpen(false);
    setSmartCreateOpen(true);
  }

  function startManualCreation(): void {
    setCreationMethodOpen(false);
    setEditorScene(null);
  }

  if (editorScene !== undefined) {
    return (
      <Suspense fallback={<div className="h-full bg-background" aria-busy="true" />}>
        <SceneCreator
          boardId={activeBoardId}
          currentPrompt={currentPrompt}
          initialScene={editorScene ?? undefined}
          initialWorkflowMode={mode}
          initialUseCase={useCase}
          generationDefaults={generationDefaults}
          canOptimize={canOptimize}
          canCollaborate={canCollaborate}
          onCollaborate={onCollaborate}
          onOptimize={onOptimize}
          onSave={onSave}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onCreated={(scene) => {
            setEditorScene(undefined);
            setSelectedScene(scene);
          }}
          onCancel={() => setEditorScene(undefined)}
          onMediaChange={refreshSceneMedia}
          onOpenSettings={onOpenSettings}
          mediaBySceneId={mediaBySceneId}
        />
      </Suspense>
    );
  }

  if (selectedScene) {
    return (
      <SceneDetail
        scene={selectedScene}
        isFavorite={favoriteSceneIds.includes(selectedScene.id)}
        boards={boards}
        history={history}
        media={mediaBySceneId[selectedScene.id]}
        generationDefaults={generationDefaults}
        canOptimize={canOptimize}
        onBack={() => setSelectedScene(null)}
        onApply={onSelect}
        onToggleFavorite={onToggleFavorite}
        onEdit={() => setEditorScene(selectedScene)}
        onExport={onExport}
        onSubmit={onSubmit}
        onGetSubmission={onGetSubmission}
        onCollaborate={onCollaborate}
        onCopyText={onCopyText}
        onLocateHistory={onLocateHistory}
        onReuseHistory={onReuseHistory}
        onUseHistoryAsReference={onUseHistoryAsReference}
        loadThumbnail={loadThumbnail}
        onMediaChange={refreshSceneMedia}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <div
      data-template-library-dropzone
      aria-busy={isImporting}
      className="library-content relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => void handleDrop(event)}
    >
      <SceneBrowser
        scenes={scenes}
        favoriteSceneIds={favoriteSceneIds}
        mediaBySceneId={mediaBySceneId}
        mediaLoaded={mediaLoaded}
        pageHeaderActions={(
          <>
            <PiTemplateTaskCenter open={taskCenterOpen} onOpenChange={setTaskCenterOpen} />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={isImporting}
              onClick={() => void handleImportFromDialog()}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isImporting ? uiText("导入中") : uiText("导入模板")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onMouseEnter={() => void loadSceneCreator()}
              onFocus={() => void loadSceneCreator()}
              onClick={() => setCreationMethodOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {uiText("创建模板")}</Button>
          </>
        )}
        onSelect={setSelectedScene}
        onToggleFavorite={onToggleFavorite}
        onRequestDelete={setDeleteTarget}
      />

      <Dialog open={creationMethodOpen} onOpenChange={setCreationMethodOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[600px]">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle>{uiText("创建模板")}</DialogTitle>
            <DialogDescription>{uiText("选择一种创建方式，后续仍可继续编辑模板内容。")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <button
              type="button"
              className="group flex min-h-44 flex-col rounded-lg border border-border bg-[hsl(var(--ai-muted))] p-5 text-left transition-[border-color,background-color] duration-200 hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              onClick={startSmartCreation}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--ai-accent))] text-[hsl(var(--ai-accent-foreground))]">
                <Bot className="h-[18px] w-[18px]" />
              </span>
              <span className="mt-5 flex items-center justify-between gap-3">
                <strong className="text-sm font-semibold">{uiText("智能创建")}</strong>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </span>
              <span className="mt-2 text-xs leading-5 text-muted-foreground">
                {uiText("描述目标或上传参考图，自动提取规则、生成验证稿并完成复核。")}</span>
              <span className="mt-auto pt-4 text-[11px] font-medium text-foreground/70">{uiText("后台运行，可继续浏览")}</span>
            </button>

            <button
              type="button"
              className="group flex min-h-44 flex-col rounded-lg border border-border bg-background p-5 text-left transition-[border-color,background-color] duration-200 hover:border-foreground/30 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              onClick={startManualCreation}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground">
                <Pencil className="h-[18px] w-[18px]" />
              </span>
              <span className="mt-5 flex items-center justify-between gap-3">
                <strong className="text-sm font-semibold">{uiText("普通创建")}</strong>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </span>
              <span className="mt-2 text-xs leading-5 text-muted-foreground">
                {uiText("手动填写模板信息、提示词字段和生成示例，完整控制每项内容。")}</span>
              <span className="mt-auto pt-4 text-[11px] font-medium text-foreground/70">{uiText("适合已有清晰模板结构")}</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <PiTemplateSmartCreateDialog
        onGenerateVerification={onGenerateVerification}
        open={smartCreateOpen}
        boardId={activeBoardId}
        currentPrompt={currentPrompt}
        initialWorkflowMode={mode}
        initialUseCase={useCase}
        generationDefaults={generationDefaults}
        canOptimize={canOptimize}
        canCollaborate={canCollaborate}
        onOpenChange={setSmartCreateOpen}
        onCollaborate={onCollaborate}
        onOptimize={onOptimize}
        onSave={onSave}
        onUpdate={onUpdate}
        onMediaChange={refreshSceneMedia}
        onOpenSettings={onOpenSettings}
      />

      {isFileDragActive || isImporting ? (
        <div
          data-template-drop-overlay
          role="status"
          aria-live="polite"
          className="absolute inset-x-3 bottom-3 top-[60px] z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-foreground/40 bg-background/95 px-6 text-center"
        >
          <div className="flex max-w-sm flex-col items-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
              {isImporting ? (
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </span>
            <p className="text-sm font-semibold">{isImporting ? uiText("正在导入模板") : uiText("松手导入模板")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isImporting ? uiText("正在解析并还原 {{ui:0}} 个文件", [importingCount]) : uiText("仅支持 .itt 文件")}
            </p>
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiText("删除“")}{deleteTarget?.name}”？</DialogTitle>
            <DialogDescription>{uiText("历史生成图片不会被删除，但这个自定义模板无法恢复。")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              {uiText("取消")}</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {uiText("删除模板")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ScenePickerDialog({
  open,
  scenes,
  favoriteSceneIds,
  currentPrompt,
  mode,
  useCase,
  onOpenChange,
  onSelect,
  onToggleFavorite,
  onSave,
  onManage
}: ScenePickerDialogProps): React.ReactElement {
  const uiText = useUiText();

  const [saveOpen, setSaveOpen] = useState(false);
  const { mediaBySceneId, mediaLoaded } = useSceneMediaLibrary();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideClose
          className="flex h-[min(820px,calc(100dvh-32px))] w-[min(1280px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{uiText("选择模板")}</DialogTitle>
            <DialogDescription>{uiText("选择后回到画板描述本次需求，AI 会自动套用模板。")}</DialogDescription>
          </DialogHeader>

          <SceneBrowser
            compact
            scenes={scenes}
            favoriteSceneIds={favoriteSceneIds}
            mediaBySceneId={mediaBySceneId}
            mediaLoaded={mediaLoaded}
            compactActions={(
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={uiText("关闭选择模板")}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            )}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
          />

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={onManage}>
              <Library className="h-4 w-4" />
              {uiText("打开模版库")}<ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setSaveOpen(true)}>
              <Plus className="h-4 w-4" />
              {uiText("保存为模板")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <SaveSceneDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultPrompt={currentPrompt}
        mode={mode}
        useCase={useCase}
        onSave={(input) => {
          const scene = onSave(input);
          if (scene) onSelect(scene);
          setSaveOpen(false);
        }}
      />
    </>
  );
}

function SceneBrowser({
  scenes,
  favoriteSceneIds,
  mediaBySceneId,
  mediaLoaded,
  compact = false,
  compactActions,
  pageHeaderActions,
  onSelect,
  onToggleFavorite,
  onRequestDelete
}: SceneBrowserProps): React.ReactElement {
  const uiText = useUiText();

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [completedSearchSequence, setCompletedSearchSequence] = useState(0);
  const [filter, setFilter] = useState<SceneFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedSearchSequenceRef = useRef(0);
  const [previewRatioBySrc, setPreviewRatioBySrc] = useState<Record<string, number>>({});
  const favoriteIds = useMemo(() => new Set(favoriteSceneIds), [favoriteSceneIds]);
  const orderedScenes = useMemo(() => sortScenesForLibrary(scenes), [scenes]);
  const customCount = scenes.filter((scene) => scene.source === "custom").length;
  const presetCount = scenes.length - customCount;
  const favoriteCount = scenes.filter((scene) => favoriteIds.has(scene.id)).length;
  const filterOptions: Array<{ value: SceneFilter; label: string; count: number }> = compact
    ? [
        { value: "all", label: "全部", count: scenes.length },
        { value: "favorite", label: "收藏", count: favoriteCount },
        { value: "preset", label: "模板", count: presetCount },
        { value: "custom", label: "我的", count: customCount }
      ]
    : [
        { value: "all", label: "发现", count: scenes.length },
        { value: "preset", label: "模板", count: presetCount },
        { value: "favorite", label: "收藏", count: favoriteCount },
        { value: "custom", label: "我的", count: customCount }
      ];
  const filteredScenes = useMemo(() => {
    const normalizedQuery = submittedQuery.toLocaleLowerCase();
    return orderedScenes.filter((scene) => {
      if (filter === "favorite" && !favoriteIds.has(scene.id)) return false;
      if ((filter === "preset" || filter === "custom") && scene.source !== filter) return false;
      if (!normalizedQuery) return true;
      const category = SCENE_CATEGORY_LABELS[scene.category];
      return [scene.name, scene.description, scene.prompt, category].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery)
      );
    });
  }, [favoriteIds, filter, orderedScenes, submittedQuery]);
  const previewBySceneId = useMemo(() => Object.fromEntries(
    filteredScenes.map((scene) => [scene.id, getScenePreviewImages(scene, mediaBySceneId[scene.id])])
  ), [filteredScenes, mediaBySceneId]);
  const masonryItems = useMemo(() => !compact
    ? filteredScenes.map((scene) => {
        const previewSrc = previewBySceneId[scene.id]?.[0]?.src;
        return {
          key: scene.id,
          ratio: previewSrc
            ? (previewRatioBySrc[previewSrc] ?? DEFAULT_SCENE_PREVIEW_RATIO)
            : EMPTY_SCENE_PREVIEW_RATIO
        };
      })
    : [], [compact, filteredScenes, previewBySceneId, previewRatioBySrc]);
  const masonry = useMasonryGrid({
    items: masonryItems,
    scrollRef,
    layoutOptions: SCENE_MASONRY_OPTIONS
  });
  const visibleMasonryScenes = useMemo(
    () => filteredScenes.filter((scene) => masonry.visibleKeys.has(scene.id)),
    [filteredScenes, masonry.visibleKeys]
  );

  useEffect(() => {
    if (compact || !mediaLoaded) return;
    const previewSources = Array.from(new Set(
      filteredScenes
        .map((scene) => previewBySceneId[scene.id]?.[0]?.src)
        .filter((src): src is string => typeof src === "string" && previewRatioBySrc[src] === undefined)
    ));
    if (previewSources.length === 0) return;
    let cancelled = false;
    const pendingImages: HTMLImageElement[] = [];

    void Promise.all(previewSources.map((src) => new Promise<[string, number] | null>((resolve) => {
      const image = new Image();
      pendingImages.push(image);
      image.onload = () => resolve([
        src,
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : DEFAULT_SCENE_PREVIEW_RATIO
      ]);
      image.onerror = () => resolve(null);
      image.src = src;
    }))).then((ratios) => {
      if (cancelled) return;
      setPreviewRatioBySrc((current) => ({
        ...current,
        ...Object.fromEntries(ratios.filter((entry): entry is [string, number] => Boolean(entry)))
      }));
    });

    return () => {
      cancelled = true;
      for (const image of pendingImages) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [compact, filteredScenes, mediaLoaded, previewBySceneId, previewRatioBySrc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filter, submittedQuery]);

  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (
      isSearching
      || completedSearchSequence === 0
      || notifiedSearchSequenceRef.current === completedSearchSequence
    ) return;
    notifiedSearchSequenceRef.current = completedSearchSequence;
    if (submittedQuery && filteredScenes.length === 0) {
      toast.info(translateSourceText("没有找到匹配的模版，可以尝试创建一个新模版。"));
    }
  }, [completedSearchSequence, filteredScenes.length, isSearching, submittedQuery]);

  const clearSearch = useCallback(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = null;
    setQuery("");
    setSubmittedQuery("");
    setIsSearching(false);
  }, []);

  const submitSearch = useCallback(() => {
    const nextQuery = query.trim();
    if (!nextQuery) {
      clearSearch();
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setIsSearching(true);
    scrollRef.current?.scrollTo({ top: 0 });
    searchTimeoutRef.current = setTimeout(() => {
      searchTimeoutRef.current = null;
      setSubmittedQuery(nextQuery);
      setIsSearching(false);
      setCompletedSearchSequence((sequence) => sequence + 1);
    }, SEARCH_FEEDBACK_DELAY_MS);
  }, [clearSearch, query]);
  const hasCustomizedView = filter !== "all" || query.length > 0 || submittedQuery.length > 0;

  const resetView = useCallback(() => {
    clearSearch();
    setFilter("all");
    scrollRef.current?.scrollTo({ top: 0 });
  }, [clearSearch]);

  const filterTabs = (
    <LibraryFilterTabs
      value={filter}
      options={filterOptions}
      ariaLabel="模版范围"
      className={compact ? "order-3 max-w-full min-[790px]:order-none" : undefined}
      countClassName={!compact ? "max-[1180px]:hidden" : undefined}
      onValueChange={setFilter}
    />
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {!compact ? (
        <header className="window-titlebar-overlay-safe flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2 [-webkit-app-region:drag]">
          <div className="flex shrink-0 items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight">{uiText("探索模版")}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{scenes.length} {uiText("个模板")}</span>
          </div>
          <div className="shrink-0 [-webkit-app-region:no-drag]">{filterTabs}</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground [-webkit-app-region:no-drag]"
            disabled={!hasCustomizedView}
            onClick={resetView}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {uiText("重置")}</Button>
          {pageHeaderActions ? (
            <div className="ml-auto flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">
              {pageHeaderActions}
            </div>
          ) : null}
        </header>
      ) : null}

      <div
        className={cn(
          "flex shrink-0 items-center gap-2",
          compact
            ? "flex-wrap border-b border-border px-3 py-3 sm:px-4"
            : "absolute bottom-4 left-1/2 z-20 w-[min(560px,calc(100%-48px))] -translate-x-1/2 max-[900px]:left-4 max-[900px]:right-4 max-[900px]:w-auto max-[900px]:translate-x-0"
        )}
      >
        <div
          className={cn(
            "relative min-w-[220px] flex-1",
            !compact && "min-w-0",
            compact && "order-1 basis-[calc(100%-44px)] min-[790px]:order-none min-[790px]:basis-0"
          )}
        >
          <Search
            className={cn(
              "pointer-events-none absolute top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground",
              compact ? "left-3" : "left-4"
            )}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <Input
              ref={searchInputRef}
              autoFocus={compact}
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                if (nextQuery) setQuery(nextQuery);
                else clearSearch();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !event.currentTarget.value) return;
                event.preventDefault();
                clearSearch();
              }}
              placeholder={uiText("搜索图片风格或 Prompt")}
              aria-label={uiText("搜索图片风格或 Prompt")}
              className={cn(
                "text-sm placeholder:text-muted-foreground transition-[border-color,background-color,box-shadow] duration-200 ease-out focus-visible:border-foreground/40 motion-reduce:transition-none",
                compact
                  ? "h-9 rounded-md border-border/70 bg-muted/60 pl-9 pr-9"
                  : "h-12 rounded-2xl border-border/80 bg-card pl-11 pr-12 shadow-[0_2px_8px_hsl(0_0%_0%/0.12)] focus-visible:shadow-[0_2px_10px_hsl(0_0%_0%/0.16)]",
                query && (compact ? "pr-[68px]" : "pr-[84px]")
              )}
            />
            {query ? (
              <button
                type="button"
                aria-label={uiText("清除搜索")}
                className={cn(
                  "absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  compact ? "right-8" : "right-12"
                )}
                onClick={() => {
                  clearSearch();
                  searchInputRef.current?.focus();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!query.trim() || isSearching}
              aria-label={isSearching ? uiText("正在搜索模版") : uiText("搜索模版")}
              className={cn(
                "absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md transition-[color,background-color,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default motion-reduce:transition-none",
                compact ? "right-1 h-7 w-7" : "right-1.5 h-9 w-9",
                query.trim()
                  ? "bg-foreground text-background hover:bg-foreground/85"
                  : "bg-muted text-muted-foreground/55"
              )}
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
          </form>
        </div>

        {compact ? filterTabs : null}

        {compact && compactActions ? (
          <div className="order-2 ml-auto flex items-center min-[790px]:order-none">{compactActions}</div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        aria-busy={isSearching}
        className={cn("min-h-0 flex-1 overflow-y-auto", !compact && "scroll-pb-24 pb-24")}
      >
        {isSearching ? (
          <SceneSearchSkeleton compact={compact} />
        ) : filteredScenes.length > 0 ? (
          !compact ? (
            <div
              data-scene-masonry=""
              className="relative mx-6 my-4"
              style={{ height: masonry.totalHeight }}
            >
              {visibleMasonryScenes.map((scene) => {
                const rect = masonry.layout.rects.get(scene.id);
                if (!rect) return null;
                return (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    favorite={favoriteIds.has(scene.id)}
                    media={mediaBySceneId[scene.id]}
                    mediaLoaded={mediaLoaded}
                    showDetails
                    layout="collage"
                    masonryRect={rect}
                    onSelect={onSelect}
                    onToggleFavorite={onToggleFavorite}
                    onRequestDelete={onRequestDelete}
                  />
                );
              })}
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-4",
                "grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]",
                compact ? "gap-3 p-3 sm:p-4" : "p-6"
              )}
            >
              {filteredScenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                favorite={favoriteIds.has(scene.id)}
                media={mediaBySceneId[scene.id]}
                mediaLoaded={mediaLoaded}
                showDetails={!compact}
                layout="filmstrip"
                onSelect={onSelect}
                onToggleFavorite={onToggleFavorite}
                onRequestDelete={onRequestDelete}
              />
              ))}
            </div>
          )
        ) : (
          <div className={cn("flex h-full min-h-52 items-center justify-center px-6 text-center", !compact && "pb-20")}>
            <div>
              <Search className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">{uiText("没有匹配的模版")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{uiText("试试其他图片风格、Prompt 关键词或筛选范围")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SceneSearchSkeleton({ compact }: { compact: boolean }): React.ReactElement {
  const uiText = useUiText();

  const heights = compact
    ? [220, 220, 220, 220, 220, 220]
    : [310, 430, 350, 400, 390, 320, 440, 360];

  return (
    <div
      data-scene-search-skeleton=""
      role="status"
      aria-label={uiText("正在搜索模版")}
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4",
        compact ? "gap-3 p-3 sm:p-4" : "mx-6 my-4"
      )}
    >
      {heights.map((height, index) => (
        <Skeleton
          key={`${height}-${index}`}
          aria-hidden="true"
          className="w-full rounded-lg"
          style={{ height }}
        />
      ))}
    </div>
  );
}

const SceneCard = memo(function SceneCard({
  scene,
  favorite,
  media,
  mediaLoaded,
  showDetails,
  layout,
  masonryRect,
  onSelect,
  onToggleFavorite,
  onRequestDelete
}: {
  scene: SceneDefinition;
  favorite: boolean;
  media?: SceneMediaSummary;
  mediaLoaded: boolean;
  showDetails: boolean;
  layout: SceneCardLayout;
  masonryRect?: MasonryRect;
  onSelect: (scene: SceneDefinition) => void;
  onToggleFavorite: (id: string) => void;
  onRequestDelete?: (scene: SceneDefinition) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const [promptExpanded, setPromptExpanded] = useState(false);
  const Icon = CATEGORY_ICONS[scene.category];
  const previews = mediaLoaded ? getScenePreviewImages(scene, media) : [];
  const isMasonryGallery = layout === "collage" && Boolean(masonryRect);
  const hasPromptOverlay = isMasonryGallery;

  useEffect(() => {
    if (!hasPromptOverlay) setPromptExpanded(false);
  }, [hasPromptOverlay]);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-[border-color,box-shadow,transform,width,height] duration-200",
        isMasonryGallery && "absolute left-0 top-0",
        showDetails
          ? "hover:border-foreground/35 hover:shadow-lg hover:shadow-foreground/5"
          : "min-h-[218px] hover:border-foreground/45 hover:shadow-sm",
        showDetails && !isMasonryGallery && "min-h-[294px]"
      )}
      style={masonryRect ? {
        width: masonryRect.width,
        height: masonryRect.height,
        transform: `translate3d(${masonryRect.x}px, ${masonryRect.y}px, 0)`
      } : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !promptExpanded) return;
        event.stopPropagation();
        setPromptExpanded(false);
      }}
    >
      {scene.source === "custom" && onRequestDelete ? (
        <button
          type="button"
          aria-label={uiText("删除 {{ui:0}} 模板", [scene.name])}
          title={uiText("删除模板")}
          onClick={() => onRequestDelete(scene)}
          className={cn(
            "absolute z-20 flex items-center justify-center rounded-md border border-white/30 bg-background text-muted-foreground shadow-sm opacity-0 transition-[opacity,color,background-color] hover:bg-destructive hover:text-destructive-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100",
            showDetails ? "right-12 top-3 h-8 w-8" : "right-10 top-2.5 h-7 w-7"
          )}
        >
          <Trash2 className={showDetails ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={favorite ? uiText("取消收藏 {{ui:0}}", [scene.source === "preset" ? uiText(scene.name) : scene.name]) : uiText("收藏 {{ui:0}}", [scene.source === "preset" ? uiText(scene.name) : scene.name])}
        title={favorite ? uiText("取消收藏") : uiText("收藏这个模板")}
        onClick={() => onToggleFavorite(scene.id)}
        className={cn(
          "absolute z-20 flex items-center justify-center rounded-md border border-white/30 bg-background text-muted-foreground shadow-sm opacity-0 transition-[opacity,color] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-focus-within:opacity-100",
          showDetails ? "right-3 top-3 h-8 w-8" : "right-2.5 top-2.5 h-7 w-7",
          favorite && "text-amber-500 hover:text-amber-600"
        )}
      >
        <Star className={cn(showDetails ? "h-4 w-4" : "h-3.5 w-3.5", favorite && "fill-current")} />
      </button>
      <button
        type="button"
        className={cn(
          "flex min-h-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          isMasonryGallery && "absolute inset-0 h-full w-full"
        )}
        tabIndex={promptExpanded ? -1 : 0}
        onClick={() => onSelect(scene)}
      >
        {!mediaLoaded ? (
          <div className={cn("w-full animate-pulse bg-muted", isMasonryGallery ? "absolute inset-0 h-full" : layout === "collage" ? "h-52" : showDetails ? "h-40" : "h-32")} />
        ) : previews.length > 0 ? (
          <ScenePreviewGallery sceneName={scene.source === "preset" ? uiText(scene.name) : scene.name} images={previews} layout={layout} compact={!showDetails} masonry={isMasonryGallery} />
        ) : (
          <div className={cn(
            "flex w-full items-center gap-3 bg-muted/55",
            isMasonryGallery ? "absolute inset-0 h-full justify-center px-4" : showDetails ? "h-28 px-4" : "h-32 px-3"
          )}>
            <span className={cn("flex items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm", showDetails ? "h-10 w-10" : "h-9 w-9")}>
              <Icon className={showDetails ? "h-5 w-5" : "h-4 w-4"} />
            </span>
            <div>
              <p className="text-xs font-medium">{uiText("尚未添加示例图")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{uiText("我的模板")}</p>
            </div>
          </div>
        )}

        {!hasPromptOverlay ? (
          <SceneCardContent
            scene={scene}
            showDetails={showDetails}
            previewCount={previews.length}
            generatedPreview={Boolean(previews[0]?.generated)}
          />
        ) : null}
      </button>

      {hasPromptOverlay ? (
        <ScenePromptOverlay
          scene={scene}
          expanded={promptExpanded}
          onExpandedChange={setPromptExpanded}
        />
      ) : null}
    </article>
  );
});

function ScenePromptOverlay({
  scene,
  expanded,
  onExpandedChange
}: {
  scene: SceneDefinition;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const promptRegionId = `scene-prompt-${scene.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden text-white transition-[height,background-color] duration-300 ease-out motion-reduce:transition-none",
        expanded
          ? "h-full bg-black/90"
          : "h-24 bg-gradient-to-t from-black/95 via-black/75 to-transparent group-hover:h-36 group-focus-within:h-36"
      )}
    >
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={promptRegionId}
              aria-label={expanded ? uiText("收起 {{ui:0}} 的完整提示词", [scene.source === "preset" ? uiText(scene.name) : scene.name]) : uiText("展开 {{ui:0}} 的完整提示词", [scene.source === "preset" ? uiText(scene.name) : scene.name])}
              onClick={() => onExpandedChange(!expanded)}
              className={cn(
                "pointer-events-auto absolute bottom-2 left-1/2 z-30 flex h-7 w-12 -translate-x-1/2 items-center justify-center opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none motion-reduce:transition-none",
                expanded
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              )}
            >
              <span
                aria-hidden="true"
                className="flex h-4 w-8 items-center justify-center rounded-sm bg-neutral-950/55 text-white/75 shadow-[0_1px_3px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-white/15 transition-[width,background-color,color,transform] duration-200 ease-out group-hover:w-9 group-hover:-translate-y-0.5 group-hover:bg-neutral-950/75 group-hover:text-white group-focus-within:w-9 group-focus-within:bg-neutral-950/75 group-focus-within:text-white motion-reduce:transform-none motion-reduce:transition-none"
              >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{expanded ? uiText("收起提示词") : uiText("查看完整提示词")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className={cn("flex min-h-0 flex-1 flex-col px-4", expanded ? "pb-12 pt-12" : "justify-end py-4")}>
        <div className="flex shrink-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{scene.source === "preset" ? uiText(scene.name) : scene.name}</h3>
            {!expanded ? (
              <p className="mt-0 max-h-0 -translate-y-1 overflow-hidden text-xs leading-5 text-white/75 opacity-0 transition-[max-height,opacity,transform,margin] duration-300 ease-out group-hover:mt-1 group-hover:max-h-10 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:mt-1 group-focus-within:max-h-10 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none">
                {scene.source === "preset" ? uiText(scene.description || SCENE_CATEGORY_LABELS[scene.category]) : scene.description || uiText(SCENE_CATEGORY_LABELS[scene.category])}
              </p>
            ) : (
              <p className="mt-1 text-[11px] font-medium text-white/60">{uiText("完整提示词")}</p>
            )}
          </div>
          {!expanded ? (
            <span className="mt-0.5 flex shrink-0 translate-x-1 items-center gap-1 text-[10px] font-medium text-white/75 opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100 motion-reduce:transition-none">
              {uiText("查看详情")}<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          ) : null}
        </div>

        {expanded ? (
          <div
            id={promptRegionId}
            role="region"
            aria-label={uiText("{{ui:0}} 的完整提示词", [scene.source === "preset" ? uiText(scene.name) : scene.name])}
            className="pointer-events-auto mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/15 pt-3 pr-2 text-sm leading-6 text-white/90 [scrollbar-color:rgba(255,255,255,0.38)_transparent] [scrollbar-width:thin]"
          >
            <p className="whitespace-pre-wrap break-words pb-3">{scene.prompt}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScenePreviewGallery({
  sceneName,
  images,
  layout,
  compact = false,
  masonry = false
}: {
  sceneName: string;
  images: ScenePreviewImage[];
  layout: SceneCardLayout;
  compact?: boolean;
  masonry?: boolean;
}): React.ReactElement {
  const uiText = useUiText();
  if (layout === "collage") {
    if (masonry) {
      const image = images[0];
      return (
        <img
          src={image.src}
          alt={`${sceneName} ${uiText(image.generated ? "生成示例" : "内置示例")}`}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
          style={{ objectPosition: `${image.focus.x * 100}% ${image.focus.y * 100}%` }}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      );
    }
    if (images.length === 1) {
      const image = images[0];
      return (
        <img
          src={image.src}
          alt={`${sceneName} ${uiText(image.generated ? "生成示例" : "内置示例")}`}
          className="h-52 w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
          style={{ objectPosition: `${image.focus.x * 100}% ${image.focus.y * 100}%` }}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      );
    }
    return (
      <div className="grid h-52 w-full grid-cols-[1.5fr_1fr] grid-rows-2 gap-0.5 bg-border">
        {images.map((image, index) => (
          <img
            key={image.src}
            src={image.src}
            alt={`${sceneName} ${uiText(image.generated ? "生成示例" : "内置示例")} ${index + 1}`}
            className={cn(
              "h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]",
              index === 0 && "row-span-2",
              images.length === 2 && index === 1 && "row-span-2"
            )}
            style={{ objectPosition: `${image.focus.x * 100}% ${image.focus.y * 100}%` }}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid w-full overflow-hidden gap-0.5 bg-border", compact ? "h-32" : "h-40", images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {images.map((image, index) => (
        <img
          key={image.src}
          src={image.src}
          alt={`${sceneName} ${uiText(image.generated ? "生成示例" : "内置示例")} ${index + 1}`}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
          style={{ objectPosition: `${image.focus.x * 100}% ${image.focus.y * 100}%` }}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ))}
    </div>
  );
}

function SceneCardContent({
  scene,
  showDetails,
  previewCount,
  generatedPreview
}: {
  scene: SceneDefinition;
  showDetails: boolean;
  previewCount: number;
  generatedPreview: boolean;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <div
      className={cn(
        "flex w-full flex-1 flex-col",
        showDetails ? "p-4" : "px-3 py-3"
      )}
    >
      {showDetails ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-sm bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {scene.mode === "edit" ? uiText("图片编辑") : uiText(SCENE_CATEGORY_LABELS[scene.category])}
          </span>
          <span className="rounded-sm border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {scene.source === "preset" ? uiText("官方模板") : uiText("我的模板")}
          </span>
          {previewCount > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              {previewCount} {uiText("张")}{generatedPreview ? uiText("生成示例") : uiText("内置示例")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className={cn("truncate font-semibold", showDetails ? "text-base" : "text-sm")}>{scene.source === "preset" ? uiText(scene.name) : scene.name}</h3>
          <p className={cn(
            "mt-1 truncate text-muted-foreground",
            showDetails ? "text-xs" : "text-[11px]"
          )}>
            {scene.source === "preset" ? uiText(scene.description || SCENE_CATEGORY_LABELS[scene.category]) : scene.description || uiText(SCENE_CATEGORY_LABELS[scene.category])}
          </p>
        </div>
        <span className={cn("mt-0.5 flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground", !showDetails && "transition-colors group-hover:text-foreground")}>
          {showDetails ? uiText("查看 Prompt") : uiText("套用 Prompt")}
          {showDetails ? <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /> : null}
        </span>
      </div>

      {showDetails ? (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{scene.prompt}</p>
      ) : null}
    </div>
  );
}

function SaveSceneDialog({
  open,
  onOpenChange,
  defaultPrompt,
  mode,
  useCase,
  onSave
}: SaveSceneDialogProps): React.ReactElement {
  const uiText = useUiText();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<SceneCategory>("other");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setPrompt(defaultPrompt);
    setCategory("other");
  }, [open, defaultPrompt]);

  const canSave = name.trim().length > 0 && prompt.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{uiText("保存为模板")}</DialogTitle>
          <DialogDescription>{uiText("保存后会出现在模版库的“我的”中。")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-3 max-sm:grid-cols-1">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">{uiText("名称")}</span>
              <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={uiText("例如：雨夜街头")} />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">{uiText("分类")}</span>
              <Select value={category} onValueChange={(value) => setCategory(value as SceneCategory)}>
                <SelectTrigger>{uiText(SCENE_CATEGORY_LABELS[category])}</SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="text-sm font-medium">{uiText("说明")}</span>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={uiText("简短描述用途或视觉特征")} />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium">{uiText("Prompt 内容")}</span>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={uiText("输入可复用的完整 Prompt")}
              className="min-h-32 resize-y leading-6"
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {uiText("取消")}</Button>
          <Button
            disabled={!canSave}
            onClick={() => onSave({ name, description, prompt, category, mode, useCase })}
          >
            {uiText("保存模板")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
