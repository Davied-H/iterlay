import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import appIconDefault from "@/assets/app-icon-default.png";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUpdateCenter } from "@/components/update/update-context";
import { AssetLibrary } from "@/components/workbench/AssetLibrary";
import { BoardGenerationStatus } from "@/components/workbench/BoardGenerationStatus";
import { BoardLibrary } from "@/components/workbench/BoardLibrary";
import { BoardTrash } from "@/components/workbench/BoardTrash";
import { CreateChatPage, type CreateChatGenerationPlan, type CreateChatResult } from "@/components/workbench/CreateChatPage";
import { InspirationSources } from "@/components/workbench/InspirationSources";
import { LibraryNavCanvasIcon, type LibraryNavIconKind } from "@/components/workbench/LibraryNavCanvasIcon";
import { OnlineShareManagerDialog } from "@/components/workbench/OnlineShareManagerDialog";
import { SceneLibraryPage } from "@/components/workbench/SceneLibrary";
import { groupActiveBoardGenerations, type ActiveBoardGeneration } from "@/lib/active-board-generation";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import {
  DEFAULT_LIBRARY_SIDEBAR_SIZE,
  LIBRARY_SIDEBAR_MAX_WIDTH,
  LIBRARY_SIDEBAR_MIN_WIDTH,
  createLibrarySidebarPreference,
  getAdjacentLibrarySidebarPreset,
  getClosestLibrarySidebarPreset,
  readLibrarySidebarSize,
  resolveLibrarySidebarSnap,
  writeLibrarySidebarSize,
  type LibrarySidebarPreset,
  type LibrarySidebarSizePreference
} from "@/lib/library-sidebar-size";
import type { NewSceneInput, SceneDefinition } from "@/lib/scene-library";
import type { SceneGenerationDefaults } from "@/lib/scene-media";
import type { GenerateTemplateVerification } from "@/lib/template-verification";
import { cn } from "@/lib/utils";
import type {
  AssetComment,
  BoardEnterOrigin,
  BoardSummary,
  BoardTrashRetentionDays,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  GenerationJob,
  GptImageUseCase,
  ImageWorkflowMode,
  PromptSpec,
  TemplateSubmissionResult,
  TrashedBoardSummary
} from "@shared/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  History,
  Images,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Settings,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export type LibraryTab = "create" | "boards" | "assets" | "scenes" | "inspiration" | "trash";

interface LibraryShellProps {
  boards: BoardSummary[];
  activeBoardGenerations?: ActiveBoardGeneration[];
  activeBoardId?: string;
  openingBoardId?: string | null;
  onOpenBoard: (id: string, origin?: BoardEnterOrigin) => void;
  onPrefetchBoard: (id: string) => void;
  onCreateBoard: () => void;
  onCreateFromChat: (plan: CreateChatGenerationPlan) => Promise<CreateChatResult>;
  onInterpretCreateChat: (request: CollaborateSceneRequest) => Promise<CollaborateSceneResult>;
  onRenameBoard: (id: string, name: string) => void;
  onDuplicateBoard: (id: string) => void;
  onDeleteBoard: (id: string) => Promise<void>;
  onBoardRestored: (id: string) => Promise<BoardSummary[]>;
  onExportBoard: (id: string) => void;
  onImportBoard: () => Promise<void>;
  onImportBoardFiles: (files: File[]) => Promise<void>;
  // 素材库 / 评论透传
  comments: AssetComment[];
  onAddComment: (imagePath: string, text: string) => void;
  onDeleteComment: (id: string) => void;
  onLocateAsset: (boardId: string, nodeId: string) => void;
  onCopyText: (text: string) => void;
  onReusePrompt: (prompt: string, promptSpec?: PromptSpec) => void;
  onEditAsset: (boardId: string, nodeId: string) => void;
  onUseReference: (dataUrl: string) => void;
  onDeleteAsset: (boardId: string, nodeId: string) => Promise<void>;
  scenes: SceneDefinition[];
  favoriteSceneIds: string[];
  currentPrompt: string;
  workflowMode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  initialTab?: LibraryTab;
  initialSceneRequest?: { id: string; nonce: number };
  playAssetLibraryEntrance: boolean;
  onAssetLibraryEntrancePlayed: () => void;
  onApplyScene: (scene: SceneDefinition) => void;
  onToggleFavoriteScene: (id: string) => void;
  onSaveScene: (input: NewSceneInput) => SceneDefinition;
  onUpdateScene: (scene: SceneDefinition, input: NewSceneInput) => SceneDefinition;
  onDeleteScene: (id: string) => void;
  onExportScene: (scene: SceneDefinition) => void;
  onSubmitScene: (scene: SceneDefinition, authorName: string, exampleResultIds: string[]) => Promise<TemplateSubmissionResult>;
  onGetSceneSubmission: (scene: SceneDefinition) => Promise<TemplateSubmissionResult | null>;
  onImportScene: () => Promise<SceneDefinition | null>;
  onImportSceneFiles: (files: File[]) => Promise<SceneDefinition[]>;
  sceneHistory: GenerationJob[];
  canOptimizeScene: boolean;
  canCollaborateScene: boolean;
  sceneGenerationDefaults: SceneGenerationDefaults;
  onGenerateTemplateVerification?: GenerateTemplateVerification;
  onOptimizeScene: (scene: SceneDefinition, prompt: string, templatePrompt?: string) => Promise<string>;
  onCollaborateScene: (request: Omit<CollaborateSceneRequest, "textProviderId">) => Promise<CollaborateSceneResult>;
  onLocateSceneHistory: (job: GenerationJob, imagePath: string) => void;
  onReuseSceneHistory: (job: GenerationJob) => void;
  onUseSceneHistoryAsReference: (imagePath: string) => void;
  loadSceneThumbnail: (path: string) => Promise<string | undefined>;
  onLocateOnlineShare: (boardId: string, nodeIds: string[]) => void;
  onOpenReferralInvite?: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const RECENT_LIMIT = 4;
const SIDEBAR_UTILITY_ENTRY_CLASS =
  "group flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-[background-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const SIDEBAR_UTILITY_ENTRY_IDLE_CLASS =
  "text-muted-foreground hover:bg-accent/70 hover:text-foreground active:bg-accent motion-reduce:transition-none";
const LIBRARY_SIDEBAR_MODE_LABEL = {
  small: "小",
  medium: "中",
  default: "默认",
  custom: "自定义"
} as const;
const LIBRARY_SIDEBAR_COMPACT_DRAG_THRESHOLD = 132;

interface LibrarySidebarResizeSession {
  pointerId: number;
  startX: number;
  startPreference: LibrarySidebarSizePreference;
  currentPreference: LibrarySidebarSizePreference;
  lockedPreset: LibrarySidebarPreset | null;
  animationFrame: number | null;
}

/**
 * 顶级工作区壳层：左侧导航切换画板库 / 素材库 / 模版库，并提供最近画板快速入口。
 */
export function LibraryShell(props: LibraryShellProps): React.ReactElement {
  const uiText = useUiText();

  const {
  boards,
  activeBoardId,
  openingBoardId,
  onOpenBoard,
  onPrefetchBoard,
  onOpenSettings,
  onClose
} = props;
  const {
  comments,
  onAddComment,
  onDeleteComment,
  onLocateAsset,
  onCopyText,
  onReusePrompt,
  onEditAsset,
  onUseReference,
  onDeleteAsset
} = props;
  const reduceMotion = useReducedMotion();
  // 记忆上次所在的库页 tab（画板库 / 素材库 / 模版库），下次进入库页时恢复。
  const [tab, setTab] = useState<LibraryTab>(() => {
    if (props.initialTab) return props.initialTab;
    try {
      const stored = localStorage.getItem("iterlay.libraryTab") ?? localStorage.getItem("ir.libraryTab");
      if (stored === "create" || stored === "assets" || stored === "scenes" || stored === "trash") return stored;
      if (stored === "inspiration" || stored === "boards") return stored;
      return "boards";
    } catch {
      return "boards";
    }
  });
  const [sidebarRenamingId, setSidebarRenamingId] = useState<string | null>(null);
  const [sidebarRenameValue, setSidebarRenameValue] = useState("");
  const [sidebarDeleteTarget, setSidebarDeleteTarget] = useState<BoardSummary | null>(null);
  const [isDeletingSidebarBoard, setIsDeletingSidebarBoard] = useState(false);
  const [boardLibraryLocked, setBoardLibraryLocked] = useState(false);
  const [onlineShareManagerOpen, setOnlineShareManagerOpen] = useState(false);
  const [trashedBoards, setTrashedBoards] = useState<TrashedBoardSummary[]>([]);
  const [trashRetentionDays, setTrashRetentionDays] = useState<BoardTrashRetentionDays>(3);
  const [trashLoading, setTrashLoading] = useState(true);
  const [sidebarSize, setSidebarSize] = useState<LibrarySidebarSizePreference>(() => readLibrarySidebarSize());
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const sidebarSizeRef = useRef(sidebarSize);
  const sidebarResizeRef = useRef<LibrarySidebarResizeSession | null>(null);
  const sidebarResizeHandleRef = useRef<HTMLButtonElement>(null);
  const sidebarElementRef = useRef<HTMLElement>(null);

  const refreshTrash = useCallback(async (): Promise<void> => {
    try {
      const api = getImageWorkbenchApi();
      const [items, settings] = await Promise.all([api.listTrashedBoards(), api.getSettings()]);
      setTrashedBoards(items);
      setTrashRetentionDays(settings.boardTrashRetentionDays ?? 3);
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法读取回收站。"));
    } finally {
      setTrashLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTrash();
  }, [refreshTrash]);
  useEffect(() => {
    try {
      localStorage.setItem("iterlay.libraryTab", tab);
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, [tab]);
  useEffect(() => {
    if (!props.initialTab) return;
    setTab(props.initialTab);
  }, [props.initialTab]);
  useEffect(() => {
    if (!isSidebarResizing) return;
    document.body.classList.add("library-sidebar-is-resizing");

    function cancelResize(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      const resize = sidebarResizeRef.current;
      if (!resize) return;
      event.preventDefault();
      if (resize.animationFrame !== null) cancelAnimationFrame(resize.animationFrame);
      sidebarResizeRef.current = null;
      renderSidebarWidth(resize.startPreference);
      setSidebarSize(resize.startPreference);
      setIsSidebarResizing(false);
      const handle = sidebarResizeHandleRef.current;
      if (handle?.hasPointerCapture(resize.pointerId)) handle.releasePointerCapture(resize.pointerId);
    }

    window.addEventListener("keydown", cancelResize, true);
    return () => {
      document.body.classList.remove("library-sidebar-is-resizing");
      window.removeEventListener("keydown", cancelResize, true);
    };
  }, [isSidebarResizing]);

  // 最近画板：按更新时间倒序取前若干，作为侧栏快速入口（点按直接打开返回画布）。
  const recentBoards = useMemo(
    () => [...boards].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, RECENT_LIMIT),
    [boards]
  );
  const activeGenerationsByBoard = useMemo(
    () => groupActiveBoardGenerations(props.activeBoardGenerations ?? []),
    [props.activeBoardGenerations]
  );

  function startSidebarRename(board: BoardSummary): void {
    setSidebarRenameValue(board.name);
    setSidebarRenamingId(board.id);
  }

  function commitSidebarRename(): void {
    const nextName = sidebarRenameValue.trim();
    const currentName = boards.find((board) => board.id === sidebarRenamingId)?.name;
    if (!nextName) {
      toast.error(translateSourceText("画板名称不能为空，已保留原名称"));
    } else if (sidebarRenamingId && nextName !== currentName) {
      props.onRenameBoard(sidebarRenamingId, nextName);
    }
    setSidebarRenamingId(null);
  }

  async function confirmSidebarDelete(): Promise<void> {
    if (!sidebarDeleteTarget || isDeletingSidebarBoard) return;
    setIsDeletingSidebarBoard(true);
    try {
      await moveBoardToTrash(sidebarDeleteTarget.id);
      setSidebarDeleteTarget(null);
    } catch {
      // App 已展示具体错误；保留确认框供用户重试或取消。
    } finally {
      setIsDeletingSidebarBoard(false);
    }
  }

  async function moveBoardToTrash(id: string): Promise<void> {
    await props.onDeleteBoard(id);
    await refreshTrash();
  }

  async function restoreBoard(id: string): Promise<void> {
    try {
      const restored = await getImageWorkbenchApi().restoreBoard(id);
      if (!restored) throw new Error("画板已不在回收站中。");
      await Promise.all([props.onBoardRestored(id), refreshTrash()]);
      toast.success(translateSourceText("已恢复「{{ui:0}}」", [restored.name]));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "恢复画板失败。"));
      throw error;
    }
  }

  async function permanentlyDeleteBoard(id: string): Promise<void> {
    try {
      const result = await getImageWorkbenchApi().permanentlyDeleteBoard(id);
      if (!result.ok) throw new Error("画板已不在回收站中。");
      await refreshTrash();
      toast.success(translateSourceText("画板已彻底删除"));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "彻底删除画板失败。"));
      throw error;
    }
  }

  async function emptyBoardTrash(): Promise<void> {
    try {
      const result = await getImageWorkbenchApi().emptyBoardTrash();
      await refreshTrash();
      toast.success(result.count > 0 ? translateSourceText("已彻底删除 {{ui:0}} 个画板", [result.count]) : translateSourceText("回收站已清空"));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "清空回收站失败。"));
      throw error;
    }
  }

  async function changeTrashRetentionDays(days: BoardTrashRetentionDays): Promise<void> {
    try {
      const api = getImageWorkbenchApi();
      const current = await api.getSettings();
      await api.saveSettings({ ...current, boardTrashRetentionDays: days });
      setTrashRetentionDays(days);
      await refreshTrash();
      toast.success(days === 0 ? translateSourceText("回收站将不再自动清理") : translateSourceText("回收站将在 {{ui:0}} 天后自动清理", [days]));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "保存回收站设置失败。"));
      throw error;
    }
  }

  function renderSidebarWidth(preference: LibrarySidebarSizePreference): void {
    const sidebar = sidebarElementRef.current;
    if (sidebar) {
      sidebar.style.width = `${preference.width}px`;
      sidebar.dataset.compact = preference.width < LIBRARY_SIDEBAR_COMPACT_DRAG_THRESHOLD ? "true" : "false";
    }
    const handle = sidebarResizeHandleRef.current;
    if (handle) handle.dataset.snapped = preference.mode === "custom" ? "false" : "true";
  }

  function applySidebarSize(preference: LibrarySidebarSizePreference): void {
    const normalized = getClosestLibrarySidebarPreset(preference.width);
    sidebarSizeRef.current = normalized;
    renderSidebarWidth(normalized);
    setSidebarSize(normalized);
    writeLibrarySidebarSize(normalized);
  }

  function startSidebarResize(event: React.PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    sidebarResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startPreference: sidebarSizeRef.current,
      currentPreference: sidebarSizeRef.current,
      lockedPreset: sidebarSizeRef.current.mode === "custom" ? null : sidebarSizeRef.current.mode,
      animationFrame: null
    };
    setIsSidebarResizing(true);
  }

  function moveSidebarResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const rawWidth = resize.startPreference.width + event.clientX - resize.startX;
    const snapped = resolveLibrarySidebarSnap(rawWidth, resize.lockedPreset);
    resize.lockedPreset = snapped.lockedPreset;
    resize.currentPreference = { width: snapped.width, mode: snapped.mode };
    if (resize.animationFrame !== null) return;
    resize.animationFrame = requestAnimationFrame(() => {
      resize.animationFrame = null;
      renderSidebarWidth(resize.currentPreference);
    });
  }

  function endSidebarResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (resize.animationFrame !== null) cancelAnimationFrame(resize.animationFrame);
    sidebarResizeRef.current = null;
    setIsSidebarResizing(false);
    applySidebarSize(resize.currentPreference);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelSidebarResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (resize.animationFrame !== null) cancelAnimationFrame(resize.animationFrame);
    sidebarResizeRef.current = null;
    renderSidebarWidth(resize.startPreference);
    sidebarSizeRef.current = resize.startPreference;
    setSidebarSize(resize.startPreference);
    setIsSidebarResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleSidebarResizeCaptureLost(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (resize.animationFrame !== null) cancelAnimationFrame(resize.animationFrame);
    sidebarResizeRef.current = null;
    setIsSidebarResizing(false);
    applySidebarSize(resize.currentPreference);
  }

  function handleSidebarResizeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    let next: LibrarySidebarSizePreference | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      next = getAdjacentLibrarySidebarPreset(sidebarSizeRef.current.width, direction);
    } else if (event.key === "Home") {
      next = createLibrarySidebarPreference(LIBRARY_SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      next = createLibrarySidebarPreference(LIBRARY_SIDEBAR_MAX_WIDTH);
    }
    if (!next) return;
    event.preventDefault();
    applySidebarSize(next);
  }

  return (
    <TooltipProvider delayDuration={180} skipDelayDuration={80}>
      <motion.div
        className={cn("library-content absolute inset-0 z-[45] flex", isSidebarResizing && "library-shell-is-resizing")}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
      >
      <aside
        ref={sidebarElementRef}
        id="library-sidebar"
        inert={boardLibraryLocked ? true : undefined}
        data-compact={sidebarSize.mode === "small" ? "true" : "false"}
        data-size-mode={sidebarSize.mode}
        data-active-tab={tab}
        className={cn(
          "library-sidebar flex shrink-0 flex-col border-r",
          !isSidebarResizing && !reduceMotion && "transition-[width] duration-150 ease-out"
        )}
        style={{ width: sidebarSize.width }}
      >
        {/* 红绿灯占据顶部拖拽区；品牌行同时承载显式的展开 / 收起控制。 */}
        <div className="library-sidebar-brand-row flex shrink-0 items-center pr-2 [-webkit-app-region:drag]">
          <div className="library-sidebar-brand flex min-w-0 flex-1 items-center gap-2.5 px-4 pb-2 pt-11">
            <img
              src={appIconDefault}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="h-8 w-8 shrink-0 rounded-md"
            />
            <span className="library-sidebar-label truncate text-lg font-semibold tracking-tight">Iterlay</span>
          </div>
          <CompactSidebarTooltip compact={sidebarSize.mode === "small"} label={sidebarSize.mode === "small" ? uiText("展开侧边栏") : uiText("收起侧边栏")}>
            <button
              type="button"
              data-sidebar-toggle
              aria-label={sidebarSize.mode === "small" ? uiText("展开侧边栏") : uiText("收起侧边栏")}
              onClick={() => applySidebarSize(
                sidebarSize.mode === "small"
                  ? DEFAULT_LIBRARY_SIDEBAR_SIZE
                  : createLibrarySidebarPreference(LIBRARY_SIDEBAR_MIN_WIDTH)
              )}
              className="library-sidebar-toggle mt-9 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-app-region:no-drag]"
            >
              {sidebarSize.mode === "small"
                ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
            </button>
          </CompactSidebarTooltip>
        </div>

        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setTab("create");
          }}
          aria-current={tab === "create" ? "page" : undefined}
          className="library-sidebar-create relative mx-3 mb-2 flex h-9 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-md bg-foreground px-3 text-[13px] font-semibold text-background transition-[background-color,transform] duration-150 hover:bg-foreground/90 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(var(--library-sidebar))] motion-reduce:transition-none [-webkit-app-region:no-drag]"
        >
          <svg
            className="library-sidebar-create__motion"
            viewBox="0 0 100 36"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="library-create-fill" gradientUnits="userSpaceOnUse" x1="-240" y1="0" x2="0" y2="0">
                <stop offset="0" stopColor="white" stopOpacity="0" />
                <stop offset="0.42" stopColor="white" stopOpacity="0.02" />
                <stop offset="0.5" stopColor="white" stopOpacity="0.18" />
                <stop offset="0.58" stopColor="white" stopOpacity="0.02" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
                <animate
                  attributeName="x1"
                  values="-240;240"
                  dur="4.8s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="x2"
                  values="0;480"
                  dur="4.8s"
                  repeatCount="indefinite"
                />
              </linearGradient>
              <filter id="library-create-fill-glow" x="-20%" y="-100%" width="140%" height="300%">
                <feGaussianBlur stdDeviation="3.5" />
              </filter>
            </defs>
            <rect className="library-sidebar-create__wash" width="240" height="36" fill="url(#library-create-fill)" />
            <path
              className="library-sidebar-create__beam"
              d="M-90 40C-32 21 8 18 74-7h62C72 16 26 28-40 48Z"
              filter="url(#library-create-fill-glow)"
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                from="-80 0"
                to="320 0"
                dur="4.8s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
          <span className="library-sidebar-create__icon-wrap">
            <svg className="library-sidebar-create__icon-effect" viewBox="0 0 28 28" aria-hidden="true">
              <circle className="library-sidebar-create__icon-ring" cx="14" cy="14" r="8" pathLength="100" />
              <path className="library-sidebar-create__icon-rays" d="M14 1.5v3M14 23.5v3M1.5 14h3M23.5 14h3" />
            </svg>
            <Plus className="library-sidebar-create__plus h-4 w-4" aria-hidden="true" />
          </span>
          <span>{uiText("新建创作")}</span>
        </button>

        <div className="library-sidebar-section-label library-sidebar-expanded-only flex h-7 shrink-0 items-center justify-between px-5 text-[11px] font-semibold text-muted-foreground">
          <span>{uiText("工作台")}</span>
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
        </div>

        <nav
          data-tour="library-nav"
          aria-label={uiText("库导航")}
          className="library-sidebar-nav flex flex-col gap-0.5 px-3 pb-2 pt-1 [-webkit-app-region:no-drag]"
        >
          <div className="library-sidebar-compact-only">
            <NavItem
              kind="create"
              label={uiText("创作")}
              active={tab === "create"}
              compact={sidebarSize.mode === "small"}
              reduceMotion={Boolean(reduceMotion)}
              onClick={() => setTab("create")}
            />
          </div>
          <NavItem
            kind="boards"
            label={uiText("画板库")}
            active={tab === "boards"}
            compact={sidebarSize.mode === "small"}
            reduceMotion={Boolean(reduceMotion)}
            onClick={() => setTab("boards")}
          />
          <NavItem
            kind="assets"
            label={uiText("素材库")}
            active={tab === "assets"}
            compact={sidebarSize.mode === "small"}
            reduceMotion={Boolean(reduceMotion)}
            onClick={() => setTab("assets")}
          />
          <NavItem
            kind="scenes"
            label={uiText("模版库")}
            active={tab === "scenes"}
            compact={sidebarSize.mode === "small"}
            reduceMotion={Boolean(reduceMotion)}
            onClick={() => setTab("scenes")}
          />
          <NavItem
            kind="inspiration"
            label={uiText("灵感")}
            active={tab === "inspiration"}
            compact={sidebarSize.mode === "small"}
            reduceMotion={Boolean(reduceMotion)}
            onClick={() => setTab("inspiration")}
          />
        </nav>

        <div className="library-sidebar-recents-full library-sidebar-recents-full--surface flex min-h-0 flex-1 flex-col border-t border-border/70 px-3 pb-3 pt-2 [-webkit-app-region:no-drag]">
          <div className="flex h-7 shrink-0 items-center justify-between px-2 text-[11px] font-semibold text-muted-foreground">
            <span>{uiText("我的画板")}</span>
            <span className="text-[10px] font-medium tabular-nums opacity-70">{boards.length}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {recentBoards.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground/70">{uiText("暂无画板")}</p>
            ) : (
              recentBoards.map((board) => {
                const isRenaming = sidebarRenamingId === board.id;
                const isOpening = openingBoardId === board.id;
                const boardGenerations = activeGenerationsByBoard.get(board.id) ?? [];
                return (
                  <div
                    key={board.id}
                    className={cn(
                      "library-sidebar-board-entry group relative flex w-full items-center rounded-md transition-colors hover:bg-accent/70 focus-within:bg-accent/70",
                      board.id === activeBoardId && "is-current"
                    )}
                  >
                    {isRenaming ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-2">
                        <SidebarBoardThumbnail board={board} isOpening={isOpening} />
                        <Input
                          autoFocus
                          value={sidebarRenameValue}
                          aria-label={uiText("重命名 {{ui:0}}", [board.name])}
                          onChange={(event) => setSidebarRenameValue(event.target.value)}
                          onBlur={commitSidebarRename}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") commitSidebarRename();
                            if (event.key === "Escape") setSidebarRenamingId(null);
                          }}
                          className="mr-1 h-7 min-w-0 flex-1 px-1.5 text-sm"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={openingBoardId !== null && openingBoardId !== undefined}
                        aria-busy={isOpening}
                        aria-label={uiText("打开画板 {{ui:0}}", [board.name])}
                        onPointerEnter={() => onPrefetchBoard(board.id)}
                        onFocus={() => onPrefetchBoard(board.id)}
                        onClick={(event) => {
                          // 传入来源位置作为库页进入动画的触发信号。
                          const rect = event.currentTarget.parentElement?.getBoundingClientRect()
                            ?? event.currentTarget.getBoundingClientRect();
                          onOpenBoard(board.id, {
                            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                            thumbnailDataUrl: board.thumbnailDataUrl
                          });
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                      >
                        <SidebarBoardThumbnail board={board} isOpening={isOpening} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-4">{board.name}</span>
                          <span className="block truncate pt-0.5 text-[10px] leading-3 text-muted-foreground">
                            {formatSidebarRelativeTime(board.updatedAt)}
                          </span>
                        </span>
                      </button>
                    )}

                    {!isRenaming ? (
                      <span className="mr-1 flex shrink-0 items-center gap-0.5">
                        {boardGenerations.length > 0 ? (
                          <BoardGenerationStatus tasks={boardGenerations} side="right" align="start" />
                        ) : board.id === activeBoardId ? (
                          <span
                            className="pointer-events-none flex h-7 w-7 items-center justify-center"
                            aria-label={uiText("当前")}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-primary transition-opacity group-hover:opacity-0 group-focus-within:opacity-0" />
                          </span>
                        ) : null}
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,opacity] hover:bg-background/80 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:bg-background/80 data-[state=open]:text-foreground data-[state=open]:opacity-100",
                                boardGenerations.length > 0 ? "opacity-0" : "absolute right-0 opacity-0"
                              )}
                              aria-label={uiText("画板 {{ui:0}} 操作", [board.name])}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            side="right"
                            align="start"
                            className="min-w-36"
                            onKeyDownCapture={(event) => event.stopPropagation()}
                          >
                            <DropdownMenuItem onSelect={() => startSidebarRename(board)}>
                              <Pencil className="h-4 w-4" />
                              {uiText("重命名")}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => props.onDuplicateBoard(board.id)}>
                              <Copy className="h-4 w-4" />
                              {uiText("创建副本")}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => props.onExportBoard(board.id)}>
                              <Download className="h-4 w-4" />
                              {uiText("导出 .itb")}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setSidebarDeleteTarget(board)}
                            >
                              <Trash2 className="h-4 w-4" />
                              {uiText("移入回收站")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => setTab("boards")}
            className="library-sidebar-recents-all flex shrink-0 items-center justify-between rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span>{uiText("查看全部画板")}</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <CompactRecentBoards
          active={sidebarSize.mode === "small"}
          boards={recentBoards}
          activeBoardId={activeBoardId}
          isSidebarResizing={isSidebarResizing}
          openingBoardId={openingBoardId}
          reduceMotion={Boolean(reduceMotion)}
          onPrefetchBoard={onPrefetchBoard}
          onOpenBoard={onOpenBoard}
        />

        <div
          data-tour="library-settings"
          className="library-sidebar-footer library-sidebar-footer--graphite flex shrink-0 flex-col gap-1 border-t border-border px-2 py-2 [-webkit-app-region:no-drag]"
        >
          <CompactSidebarTooltip compact={sidebarSize.mode === "small"} label={uiText("在线分享管理")}>
            <button
              type="button"
              data-sidebar-utility
              onClick={() => setOnlineShareManagerOpen(true)}
              className={cn(
                SIDEBAR_UTILITY_ENTRY_CLASS,
                SIDEBAR_UTILITY_ENTRY_IDLE_CLASS,
                "library-sidebar-utility--primary"
              )}
            >
              <RadioTower className="h-4 w-4 shrink-0" />
              <span className="library-sidebar-label min-w-0 flex-1 truncate text-left">{uiText("在线分享管理")}</span>
            </button>
          </CompactSidebarTooltip>
          <SidebarUtilityEntries
            compact={sidebarSize.mode === "small"}
            trashedBoardCount={trashedBoards.length}
            trashActive={tab === "trash"}
            onOpenTrash={() => setTab("trash")}
            onOpenSettings={onOpenSettings}
          />
          <CompactSidebarTooltip compact={true} label={uiText("展开侧边栏")}>
            <button
              type="button"
              data-sidebar-utility
              data-sidebar-footer-toggle
              aria-label={uiText("展开侧边栏")}
              onClick={() => applySidebarSize(DEFAULT_LIBRARY_SIDEBAR_SIZE)}
              className={cn(SIDEBAR_UTILITY_ENTRY_CLASS, SIDEBAR_UTILITY_ENTRY_IDLE_CLASS)}
            >
              <PanelLeftOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="library-sidebar-label min-w-0 flex-1 truncate text-left">{uiText("展开侧边栏")}</span>
            </button>
          </CompactSidebarTooltip>
        </div>
      </aside>

      <div className="relative z-40 w-0 shrink-0 self-stretch">
        <button
          ref={sidebarResizeHandleRef}
          type="button"
          role="separator"
          aria-label={uiText("调整侧边栏宽度")}
          aria-orientation="vertical"
          aria-controls="library-sidebar"
          aria-valuemin={LIBRARY_SIDEBAR_MIN_WIDTH}
          aria-valuemax={LIBRARY_SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebarSize.width}
          aria-valuetext={`${LIBRARY_SIDEBAR_MODE_LABEL[sidebarSize.mode]}，${sidebarSize.width} 像素`}
          title={uiText("拖动调整侧边栏；双击恢复默认")}
          data-resizing={isSidebarResizing ? "true" : undefined}
          data-snapped={isSidebarResizing && sidebarSize.mode !== "custom" ? "true" : undefined}
          className="library-sidebar-resize-handle absolute inset-y-0 -left-1.5 w-3 touch-none border-0 bg-transparent p-0 [-webkit-app-region:no-drag]"
          onPointerDown={startSidebarResize}
          onPointerMove={moveSidebarResize}
          onPointerUp={endSidebarResize}
          onPointerCancel={cancelSidebarResize}
          onLostPointerCapture={handleSidebarResizeCaptureLost}
          onDoubleClick={(event) => {
            event.preventDefault();
            applySidebarSize(DEFAULT_LIBRARY_SIDEBAR_SIZE);
          }}
          onKeyDown={handleSidebarResizeKeyDown}
        />
      </div>

      <main className="library-content flex min-w-0 flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="flex min-h-0 flex-1 flex-col"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === "create" ? (
              <CreateChatPage
                boards={boards}
                activeBoardId={activeBoardId}
                canUseAgent={props.canCollaborateScene}
                onInterpret={props.onInterpretCreateChat}
                onCreate={props.onCreateFromChat}
                onOpenBoard={(boardId) => onOpenBoard(boardId)}
                onOpenSettings={props.onOpenSettings}
              />
            ) : tab === "boards" ? (
              <BoardLibrary
                {...props}
                onDeleteBoard={moveBoardToTrash}
                onInteractionLockChange={setBoardLibraryLocked}
              />
            ) : tab === "assets" ? (
              <AssetLibrary
                playInitialEntrance={props.playAssetLibraryEntrance}
                onInitialEntrancePlayed={props.onAssetLibraryEntrancePlayed}
                comments={comments}
                onCopyText={onCopyText}
                onLocateAsset={onLocateAsset}
                onAddComment={onAddComment}
                onDeleteComment={onDeleteComment}
                onReusePrompt={onReusePrompt}
                onEditAsset={onEditAsset}
                onUseReference={onUseReference}
                onDeleteAsset={onDeleteAsset}
              />
            ) : tab === "scenes" ? (
              <SceneLibraryPage
                scenes={props.scenes}
                initialSceneRequest={props.initialSceneRequest}
                activeBoardId={activeBoardId}
                favoriteSceneIds={props.favoriteSceneIds}
                boards={boards}
                currentPrompt={props.currentPrompt}
                mode={props.workflowMode}
                useCase={props.useCase}
                history={props.sceneHistory}
                canOptimize={props.canOptimizeScene}
                canCollaborate={props.canCollaborateScene}
                generationDefaults={props.sceneGenerationDefaults}
                onGenerateVerification={props.onGenerateTemplateVerification}
                onSelect={props.onApplyScene}
                onToggleFavorite={props.onToggleFavoriteScene}
                onSave={props.onSaveScene}
                onUpdate={props.onUpdateScene}
                onDelete={props.onDeleteScene}
                onExport={props.onExportScene}
                onSubmit={props.onSubmitScene}
                onGetSubmission={props.onGetSceneSubmission}
                onImport={props.onImportScene}
                onImportFiles={props.onImportSceneFiles}
                onOptimize={props.onOptimizeScene}
                onCollaborate={props.onCollaborateScene}
                onCopyText={onCopyText}
                onLocateHistory={props.onLocateSceneHistory}
                onReuseHistory={props.onReuseSceneHistory}
                onUseHistoryAsReference={props.onUseSceneHistoryAsReference}
                loadThumbnail={props.loadSceneThumbnail}
                onOpenSettings={props.onOpenSettings}
                onClose={onClose}
              />
            ) : tab === "inspiration" ? (
              <InspirationSources />
            ) : (
              <BoardTrash
                boards={trashedBoards}
                retentionDays={trashRetentionDays}
                loading={trashLoading}
                onRetentionDaysChange={changeTrashRetentionDays}
                onRestore={restoreBoard}
                onDelete={permanentlyDeleteBoard}
                onEmpty={emptyBoardTrash}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <Dialog
        open={sidebarDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingSidebarBoard) setSidebarDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-sm" onKeyDownCapture={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{uiText("删除画板")}</DialogTitle>
            <DialogDescription>
              「{sidebarDeleteTarget?.name}{uiText("」将移入回收站，并按回收站设置自动清理。清理前可随时恢复。")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isDeletingSidebarBoard} onClick={() => setSidebarDeleteTarget(null)}>
              {uiText("取消")}</Button>
            <Button
              variant="destructive"
              disabled={isDeletingSidebarBoard}
              onClick={() => void confirmSidebarDelete()}
            >
              {isDeletingSidebarBoard ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
              {isDeletingSidebarBoard ? uiText("正在移动") : uiText("移入回收站")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OnlineShareManagerDialog
        open={onlineShareManagerOpen}
        onOpenChange={setOnlineShareManagerOpen}
        onLocate={(origin) => {
          setOnlineShareManagerOpen(false);
          props.onLocateOnlineShare(origin.boardId, origin.nodeIds);
        }}
      />
      </motion.div>
    </TooltipProvider>
  );
}

function SidebarBoardThumbnail({
  board,
  isOpening
}: {
  board: BoardSummary;
  isOpening: boolean;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
      {isOpening ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" aria-label={uiText("正在打开画板")} />
      ) : board.thumbnailDataUrl ? (
        <img src={board.thumbnailDataUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <Images className="h-3.5 w-3.5 text-muted-foreground/60" />
      )}
    </span>
  );
}

function CompactRecentBoards({
  active,
  boards,
  activeBoardId,
  isSidebarResizing,
  openingBoardId,
  reduceMotion,
  onPrefetchBoard,
  onOpenBoard
}: {
  active: boolean;
  boards: BoardSummary[];
  activeBoardId?: string;
  isSidebarResizing: boolean;
  openingBoardId?: string | null;
  reduceMotion: boolean;
  onPrefetchBoard: (id: string) => void;
  onOpenBoard: (id: string, origin?: BoardEnterOrigin) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const suppressFocusOpenRef = useRef(false);
  const focusFirstOnOpenRef = useRef(false);

  function clearOpenTimer(): void {
    if (openTimerRef.current === null) return;
    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }

  function clearCloseTimer(): void {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  const closeMenu = useCallback((returnFocus = false): void => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setPinned(false);
    setOpen(false);
    if (returnFocus) {
      suppressFocusOpenRef.current = true;
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
        requestAnimationFrame(() => { suppressFocusOpenRef.current = false; });
      });
    }
  }, []);

  function scheduleOpen(): void {
    clearCloseTimer();
    if (open || openTimerRef.current !== null) return;
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setOpen(true);
    }, 110);
  }

  function scheduleClose(): void {
    clearOpenTimer();
    if (pinned) return;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    }, 360);
  }

  function openAndFocusFirst(): void {
    clearOpenTimer();
    clearCloseTimer();
    setPinned(true);
    if (open) {
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    } else {
      focusFirstOnOpenRef.current = true;
      setOpen(true);
    }
  }

  useEffect(() => () => {
    clearOpenTimer();
    clearCloseTimer();
  }, []);
  useEffect(() => {
    if (active && !isSidebarResizing) return;
    closeMenu();
  }, [active, closeMenu, isSidebarResizing]);
  useEffect(() => {
    if (!open) return;
    function handleOutsidePointerDown(event: PointerEvent): void {
      if (rootRef.current?.contains(event.target as Node)) return;
      closeMenu();
    }
    function handleWindowBlur(): void {
      closeMenu();
    }
    window.addEventListener("pointerdown", handleOutsidePointerDown, true);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [closeMenu, open]);
  useEffect(() => {
    if (!open || !focusFirstOnOpenRef.current) return;
    const frame = requestAnimationFrame(() => {
      focusFirstOnOpenRef.current = false;
      itemRefs.current[0]?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const currentIndex = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    let targetIndex: number | null = null;
    if (event.key === "ArrowDown") targetIndex = Math.min(boards.length - 1, Math.max(0, currentIndex + 1));
    if (event.key === "ArrowUp") targetIndex = currentIndex <= 0 ? boards.length - 1 : currentIndex - 1;
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") targetIndex = boards.length - 1;
    if (event.key === "Escape" || event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (targetIndex === null || targetIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    itemRefs.current[targetIndex]?.focus();
  }

  return (
    <div
      ref={rootRef}
      className="library-sidebar-recents-compact pointer-events-none relative min-h-0 flex-1 [-webkit-app-region:no-drag]"
      onPointerEnter={() => {
        clearCloseTimer();
        scheduleOpen();
      }}
      onPointerLeave={scheduleClose}
      onFocusCapture={() => {
        if (suppressFocusOpenRef.current) return;
        clearOpenTimer();
        clearCloseTimer();
        setOpen(true);
      }}
      onBlurCapture={() => {
        queueMicrotask(() => {
          if (!rootRef.current?.contains(document.activeElement)) closeMenu();
        });
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={uiText("最近画板")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="compact-recent-boards"
        className="pointer-events-auto mx-auto flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerEnter={scheduleOpen}
        onClick={() => {
          if (open && pinned) closeMenu();
          else {
            clearOpenTimer();
            clearCloseTimer();
            setOpen(true);
            setPinned(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            openAndFocusFirst();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
          }
        }}
      >
        <History className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="compact-recent-boards"
            role="menu"
            aria-label={uiText("最近画板")}
            className="pointer-events-auto absolute left-full top-0 z-[60] ml-2 max-h-[min(420px,calc(100vh-24px))] w-[min(280px,calc(100vw-88px))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-[0_12px_32px_hsl(220_14%_12%/0.16),0_2px_8px_hsl(220_14%_12%/0.08)]"
            initial={reduceMotion
              ? { opacity: 0 }
              : { clipPath: "inset(0 90% 90% 0 round 8px)" }}
            animate={reduceMotion
              ? { opacity: 1 }
              : { clipPath: "inset(0 0 0 0 round 8px)" }}
            exit={reduceMotion
              ? { opacity: 0 }
              : {
                  clipPath: "inset(0 90% 90% 0 round 8px)",
                  transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
                }}
            transition={{ duration: reduceMotion ? 0.08 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={handleMenuKeyDown}
          >
            <div className="flex h-9 items-center justify-between border-b border-border/70 px-3">
              <span className="text-xs font-semibold">{uiText("最近画板")}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{boards.length}</span>
            </div>
            <div className="max-h-[min(384px,calc(100vh-60px))] overflow-y-auto p-1.5">
              {boards.length === 0 ? (
                <p className="flex h-[72px] items-center justify-center text-xs text-muted-foreground">{uiText("暂无画板")}</p>
              ) : boards.map((board, index) => {
                const isOpening = openingBoardId === board.id;
                return (
                  <button
                    key={board.id}
                    ref={(element) => { itemRefs.current[index] = element; }}
                    type="button"
                    role="menuitem"
                    disabled={openingBoardId !== null && openingBoardId !== undefined}
                    aria-busy={isOpening}
                    className="group flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
                    onPointerEnter={() => onPrefetchBoard(board.id)}
                    onFocus={() => onPrefetchBoard(board.id)}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      closeMenu();
                      onOpenBoard(board.id, {
                        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                        thumbnailDataUrl: board.thumbnailDataUrl
                      });
                    }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[5px] border border-border bg-muted">
                      {isOpening ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" aria-label={uiText("正在打开画板")} />
                      ) : board.thumbnailDataUrl ? (
                        <img src={board.thumbnailDataUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <Images className="h-3.5 w-3.5 text-muted-foreground/60" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{board.name}</span>
                    {board.id === activeBoardId ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label={uiText("当前")} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SidebarUtilityEntries({
  compact,
  trashedBoardCount,
  trashActive,
  onOpenTrash,
  onOpenSettings
}: {
  compact: boolean;
  trashedBoardCount: number;
  trashActive: boolean;
  onOpenTrash: () => void;
  onOpenReferralInvite?: () => void;
  onOpenSettings: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  const updateCenter = useUpdateCenter();
  const phase = updateCenter.state?.phase;
  const isChecking = updateCenter.checking || phase === "checking";
  const isDownloading = phase === "downloading";
  const isReady = phase === "ready";
  const progress = updateCenter.state?.progress?.percent;
  const updateLabel = isChecking
    ? "正在检查更新"
    : isDownloading
      ? "正在下载更新"
      : isReady
        ? "安装更新"
        : updateCenter.hasUpdate
          ? "发现新版本"
          : "检查更新";
  const updateMeta = isDownloading && typeof progress === "number"
    ? `${Math.round(progress)}%`
    : updateCenter.state?.manifest?.version && updateCenter.hasUpdate
      ? `v${updateCenter.state.manifest.version}`
      : null;
  const utilityClass = (active = false): string => cn(
    SIDEBAR_UTILITY_ENTRY_CLASS,
    active ? "bg-accent text-foreground" : SIDEBAR_UTILITY_ENTRY_IDLE_CLASS
  );

  return <>
    <CompactSidebarTooltip compact={compact} label={uiText("回收站")}>
      <button type="button" data-sidebar-utility onClick={onOpenTrash} className={utilityClass(trashActive)}>
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="library-sidebar-label min-w-0 flex-1 truncate text-left">{uiText("回收站")}</span>
        {trashedBoardCount > 0 ? <span className="text-[11px] tabular-nums text-muted-foreground">{trashedBoardCount}</span> : null}
      </button>
    </CompactSidebarTooltip>
    <CompactSidebarTooltip compact={compact} label={updateLabel}>
      <button
        type="button"
        data-sidebar-utility
        aria-label={updateCenter.hasUpdate && updateMeta ? uiText("发现新版本，{{ui:0}}", [updateMeta]) : uiText("检查更新")}
        disabled={isChecking}
        onClick={updateCenter.openUpdateCenter}
        className={utilityClass()}
      >
        <RefreshCw className={cn("h-4 w-4 shrink-0", isChecking && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
        <span className="library-sidebar-label min-w-0 flex-1 truncate text-left">{updateLabel}</span>
        {updateMeta ? <span className="library-sidebar-label text-[11px] tabular-nums text-[hsl(var(--ai-accent))]">{updateMeta}</span> : null}
      </button>
    </CompactSidebarTooltip>
    <CompactSidebarTooltip compact={compact} label={uiText("设置")}>
      <button type="button" data-sidebar-utility onClick={onOpenSettings} className={utilityClass()}>
        <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="library-sidebar-label min-w-0 flex-1 truncate text-left">{uiText("设置")}</span>
      </button>
    </CompactSidebarTooltip>
  </>;
}

function formatSidebarRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "最近更新";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return "刚刚";
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} 小时前`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays} 天前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(timestamp);
}

function NavItem({
  kind,
  label,
  active,
  compact,
  reduceMotion,
  onClick
}: {
  kind: LibraryNavIconKind;
  label: string;
  active: boolean;
  compact: boolean;
  reduceMotion: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <CompactSidebarTooltip compact={compact} label={label}>
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        aria-label={label}
        onClick={onClick}
        className={cn(
          "library-sidebar-nav-item relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
          active
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        )}
      >
        {active ? (
          <motion.span
            layoutId="library-sidebar-nav-indicator"
            data-library-nav-indicator
            aria-hidden="true"
            className="library-sidebar-active absolute inset-0 rounded-md shadow-sm"
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : null}
        <span className="relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <LibraryNavCanvasIcon kind={kind} active={active} />
        </span>
        <span className="library-sidebar-label relative z-10 min-w-0 flex-1 truncate text-left">{label}</span>
      </button>
    </CompactSidebarTooltip>
  );
}

function CompactSidebarTooltip({
  compact,
  label,
  children
}: {
  compact: boolean;
  label: string;
  children: React.ReactElement;
}): React.ReactElement {
  if (!compact) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        data-compact-sidebar-tooltip
        side="right"
        align="center"
        sideOffset={10}
        className="border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
