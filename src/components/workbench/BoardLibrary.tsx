import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { useBoardLibraryWindow } from "@/features/boards/use-board-library-window";
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  Grid2X2,
  ImageOff,
  Images,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { LiaEdit } from "react-icons/lia";
import { toast } from "sonner";
import type { BoardEnterOrigin, BoardSummary } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { partitionBoardImportFiles } from "@/components/workbench/board-import";
import { LibraryFilterTabs } from "@/components/workbench/LibraryFilterTabs";
import "./board-library.css";
import { cn } from "@/lib/utils";
import { groupActiveBoardGenerations, type ActiveBoardGeneration } from "@/lib/active-board-generation";

interface BoardLibraryProps {
  boards: BoardSummary[];
  activeBoardGenerations?: ActiveBoardGeneration[];
  activeBoardId?: string;
  openingBoardId?: string | null;
  onOpenBoard: (id: string, origin?: BoardEnterOrigin) => void;
  onPrefetchBoard: (id: string) => void;
  onCreateBoard: () => void;
  onRenameBoard: (id: string, name: string) => void;
  onDuplicateBoard: (id: string) => void;
  onDeleteBoard: (id: string) => Promise<void>;
  onExportBoard: (id: string) => void;
  onImportBoard: () => Promise<void>;
  onImportBoardFiles: (files: File[]) => Promise<void>;
  onInteractionLockChange?: (locked: boolean) => void;
  onClose: () => void;
}

type BoardFilter = "all" | "empty";
type BoardSort = "updated" | "created" | "name";
type BoardView = "grid" | "list";
const SEARCH_SHORTCUT_LABEL = /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘K" : "Ctrl K";

export function BoardLibrary({
  boards,
  activeBoardGenerations = [],
  activeBoardId,
  openingBoardId,
  onOpenBoard,
  onPrefetchBoard,
  onCreateBoard,
  onRenameBoard,
  onDuplicateBoard,
  onDeleteBoard,
  onExportBoard,
  onImportBoard,
  onImportBoardFiles,
  onInteractionLockChange,
  onClose
}: BoardLibraryProps): React.ReactElement {
  const uiText = useUiText();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameInitialValue, setRenameInitialValue] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [sort, setSort] = useState<BoardSort>("updated");
  const [view, setView] = useState<BoardView>("grid");
  const [deleteTarget, setDeleteTarget] = useState<BoardSummary | null>(null);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [importingCount, setImportingCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const dragDepthRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const boardRowRefs = useRef(new Map<string, HTMLButtonElement>());
  const isImporting = importingCount > 0;
  const taskLocked = isImporting
    || isDeleting
    || deleteTarget !== null
    || renamingId !== null
    || (openingBoardId !== null && openingBoardId !== undefined);
  const interactionLocked = isFileDragActive || taskLocked;
  const sortedBoards = useMemo(
    () => [...boards].sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name, document.documentElement.lang || "zh-CN");
      const leftTime = Date.parse(sort === "created" ? left.createdAt : left.updatedAt);
      const rightTime = Date.parse(sort === "created" ? right.createdAt : right.updatedAt);
      return rightTime - leftTime;
    }),
    [boards, sort]
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredBoards = useMemo(
    () => sortedBoards.filter((board) => {
      if (normalizedQuery && !board.name.toLocaleLowerCase().includes(normalizedQuery)) return false;
      if (filter === "empty") return board.imageCount === 0;
      return true;
    }),
    [filter, normalizedQuery, sortedBoards]
  );
  const boardWindow = useBoardLibraryWindow(
    filteredBoards.length, view, `${normalizedQuery}|${filter}|${sort}`,
    filteredBoards.findIndex((board) => board.id === renamingId)
  );
  const visibleBoards = filteredBoards.slice(boardWindow.start, boardWindow.end);
  const boardCounts = useMemo(() => ({
    all: boards.length,
    empty: boards.filter((board) => board.imageCount === 0).length
  }), [boards]);
  const hasCustomizedView = query.length > 0 || filter !== "all" || sort !== "updated";
  const sortLabel = sort === "updated" ? "最近更新" : sort === "created" ? "创建时间" : "名称";
  const activeGenerationsByBoard = useMemo(
    () => groupActiveBoardGenerations(activeBoardGenerations),
    [activeBoardGenerations]
  );

  useEffect(() => {
    onInteractionLockChange?.(interactionLocked);
  }, [interactionLocked, onInteractionLockChange]);

  useEffect(() => () => {
    onInteractionLockChange?.(false);
  }, [onInteractionLockChange]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (
        (event.metaKey || event.ctrlKey)
        && event.key.toLocaleLowerCase() === "k"
        && !interactionLocked
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key !== "Escape" || interactionLocked) return;
      if (query) {
        setQuery("");
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, interactionLocked, query]);

  function commitRename(): void {
    const nextName = renameValue.trim();
    if (!nextName) {
      toast.error(translateSourceText("画板名称不能为空，已保留原名称"));
      cancelRename();
      return;
    }
    if (renamingId && nextName && nextName !== renameInitialValue) {
      onRenameBoard(renamingId, nextName);
    }
    setRenamingId(null);
  }

  function cancelRename(): void {
    setRenamingId(null);
  }

  function startRename(board: BoardSummary): void {
    setRenameValue(board.name);
    setRenameInitialValue(board.name);
    setRenamingId(board.id);
  }

  function openBoardFromElement(board: BoardSummary, event: { currentTarget: HTMLElement }): void {
    const rowPreview = event.currentTarget
      .closest("[data-board-row]")
      ?.querySelector<HTMLElement>("[data-board-card]");
    const rect = rowPreview?.getBoundingClientRect()
      ?? event.currentTarget.closest("[data-board-card]")?.getBoundingClientRect()
      ?? event.currentTarget.getBoundingClientRect();
    onOpenBoard(board.id, {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      thumbnailDataUrl: board.thumbnailDataUrl
    });
  }

  function hasDraggedFiles(event: ReactDragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (taskLocked) return;
    dragDepthRef.current += 1;
    setIsFileDragActive(true);
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = taskLocked ? "none" : "copy";
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>): void {
    if (dragDepthRef.current === 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsFileDragActive(false);
  }

  async function handleDrop(event: ReactDragEvent<HTMLDivElement>): Promise<void> {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsFileDragActive(false);
    if (taskLocked) return;

    const { accepted, rejected } = partitionBoardImportFiles(Array.from(event.dataTransfer.files));
    if (accepted.length === 0) {
      if (rejected.length > 0) toast.error(translateSourceText("只支持 .itb 画板文件"));
      return;
    }
    if (rejected.length > 0) toast.warning(translateSourceText("已忽略 {{ui:0}} 个非 .itb 文件", [rejected.length]));

    setImportingCount(accepted.length);
    try {
      await onImportBoardFiles(accepted);
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败。";
      toast.error(message);
    } finally {
      setImportingCount(0);
      releaseStaleBodyPointerLock();
    }
  }

  async function handleImportFromDialog(): Promise<void> {
    if (isImporting) return;
    setImportingCount(1);
    try {
      await onImportBoard();
    } finally {
      setImportingCount(0);
      releaseStaleBodyPointerLock();
    }
  }

  async function confirmDeleteBoard(): Promise<void> {
    if (!deleteTarget || isDeleting) return;
    const deletedIndex = filteredBoards.findIndex((board) => board.id === deleteTarget.id);
    const focusTarget = filteredBoards[deletedIndex + 1] ?? filteredBoards[deletedIndex - 1] ?? null;
    setIsDeleting(true);
    try {
      await onDeleteBoard(deleteTarget.id);
      setDeleteTarget(null);
      requestAnimationFrame(() => {
        if (focusTarget) boardRowRefs.current.get(focusTarget.id)?.focus();
        else searchInputRef.current?.focus();
      });
    } catch {
      // App 已展示具体错误；保留确认框，方便用户重试或取消。
    } finally {
      setIsDeleting(false);
      releaseStaleBodyPointerLock();
    }
  }

  function renderBoardMenu(board: BoardSummary): React.ReactElement {
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={uiText("画板 {{ui:0}} 操作", [board.name])}
            disabled={interactionLocked}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => startRename(board)}>
            <Pencil className="h-4 w-4" />
            {uiText("重命名")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicateBoard(board.id)}>
            <Copy className="h-4 w-4" />
            {uiText("创建副本")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExportBoard(board.id)}>
            <Download className="h-4 w-4" />
            {uiText("导出 .itb")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteTarget(board)}
          >
            <Trash2 className="h-4 w-4" />
            {uiText("移入回收站")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderBoardCard(board: BoardSummary): React.ReactElement {
    const isActive = board.id === activeBoardId;
    const isOpening = openingBoardId === board.id;
    const isRenaming = renamingId === board.id;
    const boardGenerations = activeGenerationsByBoard.get(board.id) ?? [];

    return (
      <article
        key={board.id}
        data-board-row
        data-board-card-item
        data-tour={isActive ? "library-current-board" : undefined}
        className="group min-w-0"
      >
        <button
          ref={(element) => {
            if (element) boardRowRefs.current.set(board.id, element);
            else boardRowRefs.current.delete(board.id);
          }}
          type="button"
          aria-label={uiText("打开画板 {{ui:0}}", [board.name])}
          aria-busy={isOpening}
          title={uiText("打开画板 {{ui:0}}", [board.name])}
          disabled={interactionLocked || isRenaming}
          onPointerEnter={() => onPrefetchBoard(board.id)}
          onFocus={() => onPrefetchBoard(board.id)}
          onClick={(event) => openBoardFromElement(board, event)}
          className={cn(
            "relative block aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-foreground/10 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait motion-reduce:transform-none motion-reduce:transition-none",
            isActive && "ring-2 ring-blue-600 ring-offset-2 ring-offset-background dark:ring-blue-400"
          )}
        >
          <BoardThumbnail board={board} isOpening={isOpening} variant="card" />
          {isActive ? (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-foreground/90 px-1.5 py-1 text-[10px] font-medium leading-none text-background shadow-sm">
              <Check className="h-3 w-3" />
              {uiText("当前画板")}</span>
          ) : null}
          {!isActive && boardGenerations.length > 0 ? (
            <span data-board-generation-badge className="absolute left-2 top-2 rounded-md bg-background/90 px-1.5 py-1 text-[10px] font-medium leading-none text-[hsl(var(--helper-line))] shadow-sm">
              {uiText("生成中")}</span>
          ) : null}
        </button>

        <div className="mt-2 flex min-w-0 items-start gap-1 px-0.5">
          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <Input
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") cancelRename();
                }}
                aria-label={uiText("重命名画板 {{ui:0}}", [board.name])}
                className="h-7 px-2 text-xs"
              />
            ) : (
              <>
                <span className="flex min-w-0 items-center gap-1">
                  <strong className="truncate text-xs font-medium text-foreground">{board.name}</strong>
                  <button
                    type="button"
                    aria-label={uiText("重命名画板 {{ui:0}}", [board.name])}
                    title={uiText("编辑画板名称")}
                    disabled={interactionLocked}
                    onClick={() => startRename(board)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground/70 opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                  >
                    <LiaEdit aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </span>
                <span className="mt-0.5 block truncate text-[10px] tabular-nums text-muted-foreground">
                  {board.imageCount} {uiText("张图片 · ")}{formatRelativeTime(board.updatedAt)}
                </span>
              </>
            )}
          </div>
          {renderBoardMenu(board)}
        </div>
      </article>
    );
  }

  return (
    <div
      data-board-library-dropzone
      aria-busy={isImporting}
      className="board-library library-content relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => void handleDrop(event)}
    >
      {/* 顶栏保持窗口拖拽能力；搜索与操作区必须显式退出拖拽区域。 */}
      <header
        inert={isFileDragActive || isImporting ? true : undefined}
        className="window-titlebar-overlay-safe flex h-11 shrink-0 items-center gap-2 border-b border-border/80 px-4 [-webkit-app-region:drag]"
      >
        <span className="text-sm font-semibold">{uiText("画板库")}</span>
        <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {normalizedQuery || filter !== "all" ? uiText("{{ui:0}} 个结果", [filteredBoards.length]) : uiText("{{ui:0}} 个画板", [boards.length])}
        </span>

        <div data-tour="library-actions" className="ml-auto flex items-center gap-2 [-webkit-app-region:no-drag]">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={interactionLocked}
            onClick={() => void handleImportFromDialog()}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {isImporting ? uiText("导入中") : uiText("导入")}
          </Button>
            <Button size="sm" className="gap-1.5" disabled={interactionLocked} onClick={onCreateBoard}>
              <Plus className="h-4 w-4" />
              {uiText("新建画板")}</Button>
        </div>
      </header>

      <div inert={isFileDragActive || isImporting ? true : undefined} className="min-h-0 flex flex-1 overflow-hidden">
          <section className="flex min-w-0 flex-1 flex-col bg-muted/20" aria-labelledby="all-boards-heading">
            <h2 id="all-boards-heading" className="sr-only">{normalizedQuery ? uiText("搜索结果") : uiText("所有画板")}</h2>
              <div data-board-controls className="flex shrink-0 items-center justify-between gap-4">
                <LibraryFilterTabs
                  value={filter}
                  options={[
                    { value: "all", label: "全部", count: boardCounts.all },
                    { value: "empty", label: "空画板", count: boardCounts.empty }
                  ]}
                  ariaLabel="画板筛选"
                  disabled={interactionLocked}
                  onValueChange={setFilter}
                />
                <div className="board-library-tools flex items-center gap-3">
                {hasCustomizedView ? <Button
                  variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                  aria-label={uiText("重置筛选与排序")} title={uiText("重置筛选与排序")} disabled={interactionLocked}
                  onClick={() => { setQuery(""); setFilter("all"); setSort("updated"); }}
                ><RotateCcw className="h-3.5 w-3.5" /></Button> : null}
                <div className="board-library-search flex h-8 min-w-0 items-center gap-2 rounded-md border border-input px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
                  <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    value={query}
                    disabled={interactionLocked}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label={uiText("搜索画板")}
                    placeholder={uiText("搜索画板")}
                    className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  {query ? (
                    <button
                      type="button"
                      aria-label={uiText("清除搜索")}
                      title={uiText("清除搜索")}
                      disabled={interactionLocked}
                      onClick={() => setQuery("")}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <kbd className="hidden rounded border border-border bg-background px-1 py-0.5 text-[10px] leading-none text-muted-foreground shadow-sm min-[900px]:inline">{SEARCH_SHORTCUT_LABEL}</kbd>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-[11px] font-medium text-muted-foreground"
                        aria-label={uiText("画板排序：{{ui:0}}", [sortLabel])}
                        title={uiText("画板排序：{{ui:0}}", [sortLabel])}
                        disabled={interactionLocked}
                      >
                        <ArrowDownUp className="h-3.5 w-3.5" />
                        <span>{sortLabel}</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {([
                        ["updated", "最近更新"],
                        ["created", "创建时间"],
                        ["name", "名称"]
                      ] as const).map(([value, label]) => (
                        <DropdownMenuItem key={value} onSelect={() => setSort(value)}>
                          <Check className={cn("h-4 w-4", sort !== value && "opacity-0")} />
                          {label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                <div className="flex rounded-md border border-border bg-background p-0.5" role="group" aria-label={uiText("画板视图")}>
                  <button
                    type="button"
                    aria-label={uiText("列表模式")}
                    aria-pressed={view === "list"}
                    title={uiText("列表模式")}
                    disabled={interactionLocked}
                    onClick={() => setView("list")}
                    className={cn(
                      "grid h-6 w-7 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      view === "list" && "bg-accent text-foreground"
                    )}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={uiText("卡片模式")}
                    aria-pressed={view === "grid"}
                    title={uiText("卡片模式")}
                    disabled={interactionLocked}
                    onClick={() => setView("grid")}
                    className={cn(
                      "grid h-6 w-7 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      view === "grid" && "bg-accent text-foreground"
                    )}
                  >
                    <Grid2X2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                </div>
                </div>
              </div>

            {boards.length > 0 && view === "list" ? (
              <div data-board-list-header className="grid h-8 shrink-0 grid-cols-[minmax(14rem,1fr)_4.5rem] items-center border-b border-border bg-background/40 px-3 text-[11px] font-medium text-muted-foreground min-[900px]:grid-cols-[minmax(14rem,1fr)_4rem_7rem_6rem_4.5rem] min-[900px]:px-4">
                <span className="px-2">{uiText("画板")}</span>
                <span className="hidden min-[900px]:block">{uiText("图片")}</span>
                <span className="hidden min-[900px]:block">{uiText("最近更新")}</span>
                <span className="hidden min-[900px]:block">{uiText("空间")}</span>
                <span className="hidden justify-self-end pr-2 min-[900px]:block">{uiText("操作")}</span>
              </div>
            ) : null}

            <div ref={boardWindow.scrollRef} data-board-scroll className="min-h-0 flex-1 overflow-y-auto px-3 py-3 min-[900px]:px-4 min-[900px]:py-4">
              {view === "grid" && filteredBoards.length > 0 ? (
                <div ref={boardWindow.contentRef} data-board-card-grid className="grid" style={{ paddingTop: boardWindow.top, paddingBottom: boardWindow.bottom }}>
                  {visibleBoards.map(renderBoardCard)}
                </div>
              ) : null}

              {view === "list" ? <div ref={boardWindow.contentRef} style={{ paddingTop: boardWindow.top, paddingBottom: boardWindow.bottom }}>{visibleBoards.map((board) => {
                const isActive = board.id === activeBoardId;
                const isOpening = openingBoardId === board.id;
                const isRenaming = renamingId === board.id;
                const boardGenerations = activeGenerationsByBoard.get(board.id) ?? [];
                const rowContent = (
                  <>
                    <span className="flex min-w-0 items-center gap-3">
                      <BoardThumbnail board={board} isOpening={isOpening} />
                      <span className="min-w-0">
                        {isRenaming ? (
                          <Input
                            autoFocus
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === "Enter") commitRename();
                              if (event.key === "Escape") cancelRename();
                            }}
                            aria-label={uiText("重命名画板 {{ui:0}}", [board.name])}
                            className="h-8 max-w-72 px-2 text-xs"
                          />
                        ) : (
                          <>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <strong className="truncate text-xs font-medium text-foreground">{board.name}</strong>
                              <button
                                type="button"
                                aria-label={uiText("重命名画板 {{ui:0}}", [board.name])}
                                title={uiText("编辑画板名称")}
                                disabled={interactionLocked}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startRename(board);
                                }}
                                className="pointer-events-auto relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                              >
                                <LiaEdit aria-hidden className="h-3.5 w-3.5" />
                              </button>
                              {isActive ? (
                                <span className="shrink-0 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-blue-700 dark:text-blue-300">{uiText("当前")}</span>
                              ) : null}
                              {!isActive && boardGenerations.length > 0 ? (
                                <span className="shrink-0 rounded-md bg-[hsl(var(--helper-line)/0.1)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[hsl(var(--helper-line))]">{uiText("生成中")}</span>
                              ) : null}
                            </span>
                            <span className="mt-1 block truncate text-[10px] tabular-nums text-muted-foreground min-[900px]:hidden">
                              {board.imageCount} {uiText("张图片 · ")}{formatRelativeTime(board.updatedAt)}{uiText("更新")}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="hidden text-[11px] tabular-nums text-muted-foreground min-[900px]:block">{board.imageCount}</span>
                    <span className="hidden text-[11px] tabular-nums text-muted-foreground min-[900px]:block">{formatRelativeTime(board.updatedAt)}</span>
                    <span className="hidden text-[11px] tabular-nums text-muted-foreground min-[900px]:block">{formatStorageSize(board.storageBytes)}</span>
                  </>
                );

                return (
                  <article
                    key={board.id}
                    data-board-row
                    data-tour={isActive ? "library-current-board" : undefined}
                    className={cn(
                      "group relative mb-1 grid min-h-[58px] min-w-0 grid-cols-[minmax(0,1fr)_4.5rem] items-center rounded-lg transition-colors duration-150 motion-reduce:transition-none",
                      isActive
                        ? "bg-blue-500/[0.08] dark:bg-blue-400/[0.10]"
                        : "hover:bg-accent/70 focus-within:bg-accent/70"
                    )}
                  >
                    {isRenaming ? (
                      <div className="grid h-full min-w-0 grid-cols-1 items-center px-2 min-[900px]:grid-cols-[minmax(14rem,1fr)_4rem_7rem_6rem]">
                        {rowContent}
                      </div>
                    ) : (
                      <>
                        <button
                          ref={(element) => {
                            if (element) boardRowRefs.current.set(board.id, element);
                            else boardRowRefs.current.delete(board.id);
                          }}
                          type="button"
                          aria-label={uiText("打开画板 {{ui:0}}", [board.name])}
                          aria-busy={isOpening}
                          title={uiText("打开画板 {{ui:0}}", [board.name])}
                          disabled={interactionLocked}
                          onPointerEnter={() => onPrefetchBoard(board.id)}
                          onFocus={() => onPrefetchBoard(board.id)}
                          onClick={(event) => openBoardFromElement(board, event)}
                          className="absolute inset-y-0 left-0 right-[4.5rem] cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-wait"
                        />
                        <div className="pointer-events-none grid h-full min-w-0 grid-cols-1 items-center px-2 text-left min-[900px]:grid-cols-[minmax(14rem,1fr)_4rem_7rem_6rem]">
                          {rowContent}
                        </div>
                      </>
                    )}
                    <div className="relative z-10 flex justify-end gap-0.5">
                      {renderBoardMenu(board)}
                    </div>
                  </article>
                );
              })}</div> : null}

              {boards.length === 0 ? (
                <div className="board-library-empty flex min-h-52 flex-col items-center justify-center px-5 py-8 text-center">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Images className="h-5 w-5" />
                  </span>
                  <p className="text-base font-semibold">{uiText("你的下一次创作，从这里开始")}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{uiText("创建一个画板，把灵感、参考和作品放在一起。")}</p>
                  <div className="mt-6 flex gap-2">
                  <Button size="sm" className="gap-1.5" disabled={interactionLocked} onClick={onCreateBoard}>
                    <Plus className="h-4 w-4" /> {uiText("新建画板")}</Button>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={interactionLocked} onClick={() => void handleImportFromDialog()}>
                    <Upload className="h-4 w-4" /> {uiText("导入画板")}</Button>
                  </div>
                </div>
              ) : filteredBoards.length === 0 ? (
                <div className="board-library-empty flex min-h-40 flex-col items-center justify-center gap-4 px-5 py-6 text-center">
                  <Search className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-base font-semibold">{uiText("没有找到符合条件的画板")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{uiText("清除筛选或换一个名称继续搜索。")}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={interactionLocked}
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    {uiText("清除筛选")}</Button>
                </div>
              ) : null}
            </div>
          </section>

      </div>

      {isFileDragActive || isImporting ? (
        <div
          data-board-drop-overlay
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
            <p className="text-sm font-semibold">{isImporting ? uiText("正在导入画板") : uiText("松手导入画板")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isImporting ? uiText("正在解析并还原 {{ui:0}} 个文件", [importingCount]) : uiText("仅支持 .itb 文件")}
            </p>
          </div>
        </div>
      ) : null}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{uiText("删除画板")}</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.name}{uiText("」将移入回收站，并按回收站设置自动清理。清理前可随时恢复。")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isDeleting} onClick={() => setDeleteTarget(null)}>
              {uiText("取消")}</Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void confirmDeleteBoard()}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
              {isDeleting ? uiText("正在移动") : uiText("移入回收站")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function releaseStaleBodyPointerLock(): void {
  const release = (): void => {
    const hasOpenModal = document.querySelector('[role="dialog"], [role="menu"][data-state="open"]');
    if (!hasOpenModal && document.body.style.pointerEvents === "none") {
      document.body.style.removeProperty("pointer-events");
    }
  };

  requestAnimationFrame(release);
  window.setTimeout(release, 250);
}

function BoardThumbnail({
  board,
  isOpening,
  variant = "row"
}: {
  board: BoardSummary;
  isOpening: boolean;
  variant?: "row" | "card";
}): React.ReactElement {
  const uiText = useUiText();

  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const thumbnailUrl = board.thumbnailDataUrl;
  const showThumbnail = Boolean(thumbnailUrl && failedUrl !== thumbnailUrl);

  return (
    <span
      data-board-card
      className={cn(
        "relative shrink-0 overflow-hidden bg-muted",
        variant === "card"
          ? "block h-full w-full"
          : "h-11 w-[60px] rounded-md ring-1 ring-foreground/10"
      )}
    >
      {showThumbnail ? (
        <img
          src={thumbnailUrl ?? ""}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setFailedUrl(thumbnailUrl ?? null)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1.5">
          {board.imageCount > 0
            ? <ImageOff className={cn("text-muted-foreground", variant === "card" ? "h-6 w-6" : "h-4 w-4")} />
            : <Images className={cn("text-muted-foreground", variant === "card" ? "h-6 w-6" : "h-4 w-4")} />}
          {variant === "card" ? <>
            <span className="text-xs text-muted-foreground">{board.imageCount > 0 ? uiText("封面暂不可用") : uiText("空画板")}</span>
            <small className="text-[11px] text-muted-foreground">{board.imageCount > 0 ? uiText("画板内容不受影响") : uiText("从一个想法开始")}</small>
          </> : null}
        </span>
      )}
      {isOpening ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-label={uiText("正在打开画板")} />
          {variant === "card" ? <span className="text-xs">{uiText("正在打开")}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

function formatRelativeTime(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(time).toLocaleDateString();
}

export function formatStorageSize(bytes: number | undefined): string {
  const safeBytes = Number.isFinite(bytes) && (bytes ?? 0) > 0 ? bytes ?? 0 : 0;
  const gibibyte = 1024 ** 3;
  const mebibyte = 1024 ** 2;
  if (safeBytes >= gibibyte) return `${formatStorageValue(safeBytes / gibibyte)} GB`;
  if (safeBytes === 0) return "0 MB";
  return `${formatStorageValue(Math.max(0.1, safeBytes / mebibyte))} MB`;
}

function formatStorageValue(value: number): string {
  if (value >= 10) return Math.round(value).toLocaleString();
  return value.toFixed(1).replace(/\.0$/u, "");
}
