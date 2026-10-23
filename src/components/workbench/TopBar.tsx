import { useUiText } from "@/i18n";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Download,
  FileDown,
  GalleryHorizontalEnd,
  History,
  Images,
  Keyboard,
  LayoutGrid,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2
} from "lucide-react";
import { LiaEdit } from "react-icons/lia";
import type { BoardSummary } from "@shared/types";
import { canvasSelectionSnapshot, type CanvasSelectionSnapshot } from "@/components/canvas/canvas-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_BOARD_SHORTCUTS } from "@/lib/board-shortcuts";
import { sortBoardsByRecentUse } from "@shared/board-order";
import appIconDefault from "@/assets/app-icon-default.png";

const IS_MAC_PLATFORM = /Mac|iPhone|iPad|iPod/u.test(navigator.platform);
const SHORTCUT_HELP_LABEL = IS_MAC_PLATFORM ? "⌘ /" : "Ctrl /";
const SHORTCUT_HELP_ARIA = IS_MAC_PLATFORM ? "Meta+/" : "Control+/";

interface TopBarProps {
  historyOpen: boolean;
  commentOpen: boolean;
  commentsEnabled?: boolean;
  boardName: string | null;
  activeBoardId?: string;
  boards: BoardSummary[];
  openingBoardId?: string | null;
  onOpenLibrary: () => void;
  onOpenBoard: (id: string) => void;
  onPrefetchBoard: (id: string) => void;
  onCreateBoard: () => void;
  onRenameBoard: (name: string) => void;
  canBatchDownload: boolean;
  onBatchDownload: () => void;
  onExportBoard: () => void;
  onOpenModificationRequests?: () => void;
  onOpenImageDelivery?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** 撤销/重做回调携带画布节点的实时快照，供上层把当前状态压入对向历史栈。 */
  onUndo: (current: CanvasSelectionSnapshot) => void;
  onRedo: (current: CanvasSelectionSnapshot) => void;
  onToggleHistory: () => void;
  galleryAvailable: boolean;
  galleryShortcutEnabled: boolean;
  onOpenGallery: (origin: { x: number; y: number }) => void;
  onToggleComment: () => void;
  onOpenImageTrash: () => void;
  onOpenShortcutHelp: () => void;
  onReplayTour: () => void;
  /** 新手引导的画板菜单步骤：强制展开菜单（非模态、不抢焦点、忽略外部点击关闭）。 */
  tourMenuOpen?: boolean;
}

export function TopBar({
  historyOpen,
  commentOpen,
  commentsEnabled = false,
  boardName,
  activeBoardId,
  boards,
  openingBoardId,
  onOpenLibrary,
  onOpenBoard,
  onPrefetchBoard,
  onCreateBoard,
  onRenameBoard,
  canBatchDownload,
  onBatchDownload,
  onExportBoard,
  onOpenModificationRequests,
  onOpenImageDelivery,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onToggleHistory,
  galleryAvailable,
  galleryShortcutEnabled,
  onOpenGallery,
  onToggleComment,
  onOpenImageTrash,
  onOpenShortcutHelp,
  onReplayTour,
  tourMenuOpen
}: TopBarProps): React.ReactElement {
  const uiText = useUiText();
  void onOpenModificationRequests;
  void onOpenImageDelivery;

  const { getNodes, getEdges } = useReactFlow();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [libraryTooltipOpen, setLibraryTooltipOpen] = useState(false);
  const galleryButtonRef = useRef<HTMLButtonElement>(null);
  const recentBoards = useMemo(
    () => sortBoardsByRecentUse(boards).slice(0, MAX_BOARD_SHORTCUTS),
    [boards]
  );
  function beginRename(): void {
    setNameDraft(boardName ?? "");
    setEditingName(true);
  }

  function commitRename(): void {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== boardName) onRenameBoard(trimmed);
    setEditingName(false);
  }

  function handleOpenLibrary(event: MouseEvent<HTMLButtonElement>): void {
    setLibraryTooltipOpen(false);
    event.currentTarget.blur();
    onOpenLibrary();
  }

  useEffect(() => {
    if (!galleryAvailable || !galleryShortcutEnabled) return;
    function handleGalleryShortcut(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      );
      if (typing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== "g") return;
      const rect = galleryButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      onOpenGallery({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
    window.addEventListener("keydown", handleGalleryShortcut);
    return () => window.removeEventListener("keydown", handleGalleryShortcut);
  }, [galleryAvailable, galleryShortcutEnabled, onOpenGallery]);

  return (
    <TooltipProvider delayDuration={200}>
      {/* 仅中间空白区负责拖窗，避免首次导航后 Electron 的拖拽命中表吞掉操作按钮。 */}
      <header
        data-workspace-topbar=""
        className="workbench-page-header window-titlebar-overlay-safe window-titlebar-overlay-safe--compact sticky inset-x-0 top-0 z-20 flex h-12 items-center gap-3 bg-background/95 px-4 max-[600px]:gap-1"
        data-window-platform={IS_MAC_PLATFORM ? "macos" : "windows"}
      >
        <div className="flex min-w-0 items-center gap-1 overflow-hidden [-webkit-app-region:no-drag]">
          {!IS_MAC_PLATFORM ? (
            <img
              src={appIconDefault}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="mr-1 h-5 w-5 shrink-0 rounded"
            />
          ) : null}
          <Tooltip open={libraryTooltipOpen} onOpenChange={setLibraryTooltipOpen}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={uiText("打开画板库")}
                data-tour="board-library"
                onClick={handleOpenLibrary}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-app-region:no-drag] max-[600px]:px-1.5"
              >
                <LayoutGrid aria-hidden className="h-3.5 w-3.5" />
                <span className="max-[980px]:hidden">{uiText("画板库")}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{uiText("打开画板库")}</TooltipContent>
          </Tooltip>
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/55 max-[600px]:hidden" />
          {editingName ? (
            <Input
              autoFocus
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") setEditingName(false);
              }}
              aria-label={uiText("画板名称")}
              className="h-7 w-[188px] border-border/80 px-2 text-sm font-medium focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/45 [-webkit-app-region:no-drag]"
            />
          ) : (
            // 引导的菜单步骤强制保持展开：忽略 Radix 的外部点击关闭请求，改用非模态避免锁住引导气泡。
            <DropdownMenu
              open={boardMenuOpen || Boolean(tourMenuOpen)}
              onOpenChange={setBoardMenuOpen}
              modal={!tourMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={uiText("切换画板，当前为{{ui:0}}", [boardName ?? "画板"])}
                  data-tour="board-switcher"
                  aria-busy={Boolean(openingBoardId)}
                  disabled={Boolean(openingBoardId)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    beginRename();
                  }}
                  className="flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/45 data-[state=open]:bg-accent disabled:pointer-events-none disabled:opacity-60 [-webkit-app-region:no-drag]"
                >
                  <span className="block max-w-[180px] truncate max-[720px]:max-w-[100px] max-[600px]:max-w-[72px] max-[480px]:max-w-[48px]">{boardName ?? uiText("画板")}</span>
                  {openingBoardId ? (
                    <Loader2 aria-hidden className="h-3 w-3 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
                  ) : (
                    <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="w-64 border-border/80 shadow-md"
                onCloseAutoFocus={(event) => {
                  if (tourMenuOpen) event.preventDefault();
                }}
              >
                <DropdownMenuItem
                  data-tour="menu-all-boards"
                  className="h-8 gap-2 px-2 py-0 text-[13px] font-medium focus:bg-muted/70"
                  onSelect={onOpenLibrary}
                >
                  <LayoutGrid aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  {uiText("查看全部画板")}</DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 bg-border/70" />
                <DropdownMenuLabel className="px-2 pb-1 pt-1 text-[11px] leading-4">{uiText("最近画板")}</DropdownMenuLabel>
                {recentBoards.length > 0 ? (
                  <DropdownMenuRadioGroup data-tour="menu-recent-list" value={activeBoardId ?? ""}>
                    {recentBoards.map((board, index) => {
                      const isOpening = openingBoardId === board.id;
                      return (
                        <DropdownMenuRadioItem
                          key={board.id}
                          value={board.id}
                          disabled={Boolean(openingBoardId)}
                          onPointerEnter={() => onPrefetchBoard(board.id)}
                          onFocus={() => onPrefetchBoard(board.id)}
                          onSelect={() => onOpenBoard(board.id)}
                          className="h-8 gap-2 py-0 pl-7 pr-2 text-[13px] focus:bg-muted/70 data-[state=checked]:font-medium"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/70">
                            {isOpening ? (
                              <Loader2 aria-label={uiText("正在打开画板")} className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                            ) : board.thumbnailDataUrl ? (
                              <img
                                src={board.thumbnailDataUrl}
                                alt=""
                                draggable={false}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Images aria-hidden className="h-3.5 w-3.5 text-muted-foreground/60" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate leading-5" title={uiText("{{ui:0}} · {{ui:1}} 张图片", [board.name, board.imageCount])}>
                              {board.name}
                            </span>
                          </span>
                          <kbd className="shrink-0 font-sans text-[10px] font-medium text-muted-foreground/70">
                            {IS_MAC_PLATFORM ? "⌘" : "Ctrl+"}{index + 1}
                          </kbd>
                        </DropdownMenuRadioItem>
                      );
                    })}
                  </DropdownMenuRadioGroup>
                ) : (
                  <p data-tour="menu-recent-list" className="px-2 py-2 text-xs text-muted-foreground">
                    {uiText("暂无画板")}</p>
                )}
                <DropdownMenuSeparator className="my-1 bg-border/70" />
                <DropdownMenuItem
                  data-tour="menu-rename"
                  className="h-8 gap-2 px-2 py-0 text-[13px] focus:bg-muted/70"
                  onSelect={beginRename}
                >
                  <Pencil aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  {uiText("重命名当前画板")}</DropdownMenuItem>
                <DropdownMenuItem
                  data-tour="menu-create"
                  className="h-8 gap-2 px-2 py-0 text-[13px] focus:bg-muted/70"
                  onSelect={onCreateBoard}
                >
                  <Plus aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  {uiText("新建画板")}</DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 bg-border/70" />
                <DropdownMenuItem
                  data-tour="menu-replay"
                  className="h-8 gap-2 px-2 py-0 text-[13px] text-muted-foreground focus:bg-muted/70 focus:text-foreground"
                  onSelect={onReplayTour}
                >
                  <Compass aria-hidden className="h-3.5 w-3.5" />
                  {uiText("重播新手引导")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!editingName ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  aria-label={uiText("重命名当前画板")}
                  disabled={Boolean(openingBoardId)}
                  onClick={beginRename}
                >
                  <LiaEdit aria-hidden className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{uiText("编辑画板名称")}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <div
          data-window-drag-region=""
          aria-hidden
          className="min-w-6 flex-1 self-stretch [-webkit-app-region:drag]"
        />

        <div className="flex shrink-0 items-center gap-1.5 [-webkit-app-region:no-drag] max-[600px]:gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* disabled 按钮不触发指针事件，包一层 span 让 Tooltip 仍可用。 */}
              <span className="inline-flex max-[480px]:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={uiText("撤销")}
                  disabled={!canUndo}
                  onClick={() => onUndo(canvasSelectionSnapshot(getNodes(), getEdges()))}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{uiText("撤销 (")}{IS_MAC_PLATFORM ? "⌘Z" : "Ctrl+Z"})</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex max-[480px]:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={uiText("重做")}
                  disabled={!canRedo}
                  onClick={() => onRedo(canvasSelectionSnapshot(getNodes(), getEdges()))}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{uiText("重做 (")}{IS_MAC_PLATFORM ? "⇧⌘Z" : "Ctrl+Shift+Z"})</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-0.5 h-5 max-[480px]:hidden" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={historyOpen ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                aria-label={uiText("历史")}
                data-tour="history"
                onClick={onToggleHistory}
              >
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{uiText("历史记录")}</TooltipContent>
          </Tooltip>

          {galleryAvailable ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={galleryButtonRef}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={uiText("打开画廊")}
                  data-tour="gallery-entry"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    onOpenGallery({
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2
                    });
                  }}
                >
                  <GalleryHorizontalEnd className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{uiText("打开画廊 (G)")}</TooltipContent>
            </Tooltip>
          ) : null}

          {commentsEnabled ? <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={commentOpen ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                aria-label={uiText("评论")}
                data-tour="comment"
                onClick={onToggleComment}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{uiText("评论 (C)")}</TooltipContent>
          </Tooltip> : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={uiText("图片回收站")}
                onClick={onOpenImageTrash}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{uiText("图片回收站")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 max-[720px]:hidden"
                aria-label={uiText("画板快捷键")}
                aria-keyshortcuts={SHORTCUT_HELP_ARIA}
                onClick={onOpenShortcutHelp}
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{uiText("画板快捷键 (")}{SHORTCUT_HELP_LABEL})</TooltipContent>
          </Tooltip>

          <div className="group/download-menu relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={uiText("下载与导出")}
              aria-haspopup="menu"
            >
              <Download className="h-4 w-4" />
            </Button>
            {/* 浮层超出顶栏按钮行后，也要脱离 Electron 的窗口拖拽命中区域。 */}
            <div className="pointer-events-none absolute right-0 top-full z-30 w-36 pt-1 opacity-0 transition-opacity duration-150 [-webkit-app-region:no-drag] group-focus-within/download-menu:pointer-events-auto group-focus-within/download-menu:opacity-100 group-hover/download-menu:pointer-events-auto group-hover/download-menu:opacity-100">
              <div
                role="menu"
                aria-label={uiText("下载与导出选项")}
                className="overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canBatchDownload}
                  onClick={onBatchDownload}
                  className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45"
                >
                  <Images aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  {uiText("批量下载")}</button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={onExportBoard}
                  className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <FileDown aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  {uiText("导出画板")}</button>
              </div>
            </div>
          </div>

        </div>
      </header>
    </TooltipProvider>
  );
}
