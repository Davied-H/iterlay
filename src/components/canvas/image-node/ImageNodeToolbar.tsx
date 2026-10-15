import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { useEffect, useState, type PointerEventHandler, type ReactNode } from "react";
import { NodeToolbar, Position, useStore } from "@xyflow/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  BookmarkPlus,
  Check,
  Copy,
  CopyPlus,
  Download,
  Ellipsis,
  Eraser,
  ImagePlus,
  Info,
  LayoutTemplate,
  Loader2,
  PanelTop,
  Pencil,
  Scissors,
  Share2,
  Sticker,
  Trash2,
  TriangleAlert
} from "lucide-react";
import type { CopyImageFormat } from "@shared/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { iterlayToast } from "@/components/ui/iterlay-toast";
import { copyImageDataUrlToClipboard } from "@/lib/clipboard-images";
import { EASE_OUT } from "@/lib/motion";
import { resolveImageToolbarSide } from "../image-toolbar-position";
import { canExtractImageTemplate } from "../image-toolbar-visibility";
import type { GeneratedImage } from "../image-node-model";

const actionButtonClass =
  "pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/95 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primaryEditButtonClass =
  "pointer-events-auto flex h-7 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const menuButtonClass =
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";
const DUPLICATE_SHORTCUT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? "⌘D" : "Ctrl+D";
const COPY_ORIGINAL_SHORTCUT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
    ? "⇧⌘C"
    : "Ctrl+Shift+C";

interface ImageNodeToolbarProps {
  nodeId: string;
  image: GeneratedImage;
  canEdit?: boolean;
  copyImageFormat: CopyImageFormat;
  canAddReference: boolean;
  isReference: boolean;
  hoverEnabled: boolean;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  onInteractionOpenChange: (open: boolean) => void;
  onCopy: () => void;
  onDuplicate?: (image: GeneratedImage) => void;
  onSave: (path: string) => Promise<void> | void;
  onQuickShare?: (images: GeneratedImage[]) => void;
  onExportWechat?: (images: GeneratedImage[]) => void;
  onReconstructInMasterGo?: (image: GeneratedImage) => void;
  onRemoveBackground?: (image: GeneratedImage) => Promise<void> | void;
  onUseReference: (image: GeneratedImage) => void;
  onEdit?: (image: GeneratedImage) => void;
  onSlice?: (image: GeneratedImage) => void;
  onSaveAsTemplate?: (image: GeneratedImage) => void;
  onOpenSourceTemplate?: (image: GeneratedImage) => void;
  onViewDetails?: (image: GeneratedImage) => void;
  onDelete?: (image: GeneratedImage) => void;
}

function PositionedNodeToolbar({ nodeId, children }: { nodeId: string; children: ReactNode }): React.ReactElement {
  const position = useStore<Position>((state) => {
    const node = state.nodeLookup.get(nodeId);
    if (!node) return Position.Top;
    const screenTop = node.internals.positionAbsolute.y * state.transform[2] + state.transform[1];
    return resolveImageToolbarSide(screenTop) === "bottom" ? Position.Bottom : Position.Top;
  });

  return (
    <NodeToolbar isVisible position={position} offset={10} align="center" className="nodrag nopan nowheel">
      {children}
    </NodeToolbar>
  );
}

function Shortcut({ children }: { children: ReactNode }): React.ReactElement {
  return <span className="ml-auto text-[10px] text-muted-foreground">{children}</span>;
}

export function ImageNodeToolbar({
  nodeId,
  image,
  canEdit,
  copyImageFormat,
  canAddReference,
  isReference,
  hoverEnabled,
  onPointerEnter,
  onPointerLeave,
  onInteractionOpenChange,
  onCopy,
  onDuplicate,
  onSave,
  onQuickShare,
  onExportWechat,
  onReconstructInMasterGo,
  onRemoveBackground,
  onUseReference,
  onEdit,
  onSlice,
  onSaveAsTemplate,
  onOpenSourceTemplate,
  onViewDetails,
  onDelete
}: ImageNodeToolbarProps): React.ReactElement {
  const uiText = useUiText();

  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [isCopyingToClipboard, setIsCopyingToClipboard] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [removeBackgroundNoticeOpen, setRemoveBackgroundNoticeOpen] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());

  useEffect(() => {
    onInteractionOpenChange(downloadMenuOpen || removeBackgroundNoticeOpen);
  }, [downloadMenuOpen, onInteractionOpenChange, removeBackgroundNoticeOpen]);

  async function copyImageToSystemClipboard(): Promise<void> {
    if (isCopyingToClipboard || !image.dataUrl) return;
    setIsCopyingToClipboard(true);
    try {
      await copyImageDataUrlToClipboard(image.dataUrl, copyImageFormat);
      iterlayToast.copied({ title: translateSourceText("已复制图片"), detail: translateSourceText("可粘贴到其他应用") });
    } catch {
      toast.error(translateSourceText("无法复制图片到剪贴板"));
    } finally {
      setIsCopyingToClipboard(false);
    }
  }

  function closeMenu(): void {
    setDownloadMenuOpen(false);
  }

  return (
    <PositionedNodeToolbar nodeId={nodeId}>
      <div
        role="toolbar"
        aria-label={uiText("图片操作")}
        className="flex select-none items-center gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerEnter={hoverEnabled ? onPointerEnter : undefined}
        onPointerLeave={hoverEnabled ? onPointerLeave : undefined}
      >
        {onEdit && canEdit ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(image); }} aria-label={uiText("编辑图片")} className={primaryEditButtonClass}>
                <Pencil className="h-3.5 w-3.5" />{uiText("编辑")}</button>
            </TooltipTrigger>
            <TooltipContent>{uiText("编辑图片 · E")}</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                disabled={!isReference && !canAddReference}
                onClick={(event) => { event.stopPropagation(); onUseReference(image); }}
                aria-label={isReference ? uiText("取消参考图") : uiText("加入参考图")}
                aria-pressed={isReference}
                className="pointer-events-auto flex h-7 items-center justify-center gap-1.5 rounded-md border border-border bg-background/95 px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-55"
              >
                {isReference ? <Check className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {isReference ? uiText("已参考") : uiText("参考")}
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{isReference ? uiText("取消参考") : canAddReference ? uiText("加入参考图 · R") : uiText("参考图已达 4 张上限")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={(event) => { event.stopPropagation(); onCopy(); }} aria-label={uiText("复制画板节点")} className={actionButtonClass}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{uiText("复制画板节点 · ⌘/Ctrl C")}</TooltipContent>
        </Tooltip>
        <div
          className="pointer-events-auto relative"
          onPointerEnter={() => setDownloadMenuOpen(true)}
          onPointerLeave={() => { if (!removeBackgroundNoticeOpen) closeMenu(); }}
          onFocus={() => setDownloadMenuOpen(true)}
          onBlur={(event) => { if (!removeBackgroundNoticeOpen && !event.currentTarget.contains(event.relatedTarget)) closeMenu(); }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={uiText("更多图片操作")}
                aria-haspopup="menu"
                aria-expanded={downloadMenuOpen}
                onClick={(event) => { event.stopPropagation(); setDownloadMenuOpen(true); }}
                className={actionButtonClass}
              >
                {isRemovingBackground ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Ellipsis className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{uiText("更多操作")}</TooltipContent>
          </Tooltip>
          <AnimatePresence initial={false}>
            {downloadMenuOpen ? (
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -2, scale: 0.985 }}
                transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: EASE_OUT }}
                className="absolute right-0 top-full z-30 pt-1.5"
              >
                <div role="menu" aria-label={uiText("更多图片操作")} className="w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
                  {onViewDetails ? (
                    <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); onViewDetails(image); }} className={menuButtonClass}>
                      <Info aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />{uiText("查看详情")}<Shortcut>I</Shortcut>
                    </button>
                  ) : null}
                  {onViewDetails ? <div className="my-1 h-px bg-border" /> : null}
                  {onOpenSourceTemplate ? (
                    <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); onOpenSourceTemplate(image); }} className={menuButtonClass}>
                      <LayoutTemplate aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />{uiText("查看来源模板")}</button>
                  ) : null}
                  {onSlice && image.path && image.width && image.height ? (
                    <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); onSlice(image); }} className={menuButtonClass}>
                      <Scissors aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />{uiText("切图")}<Shortcut>S</Shortcut>
                    </button>
                  ) : null}
                  {onDuplicate ? (
                    <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); onDuplicate(image); }} className={menuButtonClass}>
                      <CopyPlus aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />{uiText("创建副本")}<Shortcut>{DUPLICATE_SHORTCUT}</Shortcut>
                    </button>
                  ) : null}
                  {onSaveAsTemplate && canExtractImageTemplate(image) ? (
                    <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); onSaveAsTemplate(image); }} className={menuButtonClass}>
                      <BookmarkPlus aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />{uiText("沉淀为模板")}<Shortcut>T</Shortcut>
                    </button>
                  ) : null}
                  {image.path && !image.pending && !image.editing && onReconstructInMasterGo ? (
                    <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); onReconstructInMasterGo(image); }} className={menuButtonClass}>
                      <PanelTop aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />{uiText("还原为可编辑设计稿")}</button>
                  ) : null}
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isCopyingToClipboard}
                    onClick={(event) => { event.stopPropagation(); closeMenu(); void copyImageToSystemClipboard(); }}
                    className={`${menuButtonClass} disabled:opacity-50`}
                  >
                    {isCopyingToClipboard ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" /> : <Copy aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />}
                    {uiText("复制原图")}<Shortcut>{COPY_ORIGINAL_SHORTCUT}</Shortcut>
                  </button>
                  {image.path && onExportWechat ? (
                    <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); onExportWechat([image]); }} className={menuButtonClass}>
                      <Sticker aria-hidden className="h-3.5 w-3.5 text-[#07964b]" />{uiText("导出为微信表情")}<Shortcut>W</Shortcut>
                    </button>
                  ) : null}
                  {image.path && onQuickShare ? (
                    <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); onQuickShare([image]); }} className={menuButtonClass}>
                      <Share2 aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />{uiText("快速分享图片")}<Shortcut>H</Shortcut>
                    </button>
                  ) : null}
                  {image.path ? (
                    <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); void onSave(image.path!); }} className={menuButtonClass}>
                      <Download aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />{uiText("下载原图")}<Shortcut>D</Shortcut>
                    </button>
                  ) : null}
                  {onRemoveBackground && image.path ? (
                    <Popover
                      open={removeBackgroundNoticeOpen}
                      onOpenChange={(open) => {
                        if (isRemovingBackground) return;
                        setRemoveBackgroundNoticeOpen(open);
                        if (!open) closeMenu();
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button type="button" role="menuitem" disabled={isRemovingBackground} onClick={(event) => event.stopPropagation()} className={`${menuButtonClass} disabled:opacity-50`}>
                          <Eraser aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />{uiText("去除背景下载")}<Shortcut>B</Shortcut>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="right"
                        align="end"
                        sideOffset={8}
                        aria-label={uiText("去除背景注意事项")}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="nodrag nowheel w-64 p-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{uiText("去除背景前请注意")}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{uiText("系统会自动识别背景，边缘或细节可能处理不准确，请下载后检查。")}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button type="button" onClick={() => { setRemoveBackgroundNoticeOpen(false); closeMenu(); }} className="h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{uiText("取消")}</button>
                          <button
                            type="button"
                            disabled={isRemovingBackground}
                            onClick={async () => {
                              if (isRemovingBackground) return;
                              setRemoveBackgroundNoticeOpen(false);
                              closeMenu();
                              setIsRemovingBackground(true);
                              try { await onRemoveBackground(image); } finally { setIsRemovingBackground(false); }
                            }}
                            className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                          >{uiText("继续下载")}</button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                  {onDelete ? (
                    <>
                      <div className="my-1 h-px bg-border" />
                      <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); closeMenu(); onDelete(image); }} className={`${menuButtonClass} text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10`}>
                        <Trash2 aria-hidden className="h-3.5 w-3.5" />{uiText("删除图片")}<span className="ml-auto text-[10px]">⌫</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </PositionedNodeToolbar>
  );
}
