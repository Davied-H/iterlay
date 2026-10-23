import { useUiText } from "@/i18n";
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Code2,
  ChevronsLeft,
  ChevronsRight,
  CopyPlus,
  Focus,
  Image as ImageIcon,
  Map,
  Maximize2,
  Plus,
  Puzzle,
  Trash2,
  UserRound,
  Type,
  Video,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { canvasNodeTypes } from "./NodeRegistry";

export interface CanvasOverlayAnchor {
  x: number;
  y: number;
}

export interface CanvasCreateNodeItem {
  type: string;
  label: string;
  description?: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const BUILTIN_CREATE_ITEMS: Readonly<Record<string, Omit<CanvasCreateNodeItem, "type">>> = {
  imageNode: { label: "图片", description: "导入或承载画布图片", icon: ImageIcon },
  codeCanvasNode: { label: "Canvas", description: "运行 HTML、React 或 Vue 代码", icon: Code2 },
  textNode: { label: "文本", description: "编写提示词、说明或备注", icon: Type },
  generationNode: { label: "图片生成", description: "组合上游输入并运行生成", icon: ImageIcon },
  videoNode: { label: "视频", description: "播放或承载画布视频", icon: Video },
  videoGenerationNode: { label: "视频生成", description: "连接画面并生成短视频", icon: Video },
  comicSettingNode: { label: "漫剧设定", description: "剧名、叙事与视觉约束", icon: BookOpen },
  comicCharacterNode: { label: "角色卡", description: "角色身份、外观锚点与视觉提示", icon: UserRound },
  comicSegmentNode: { label: "片段脚本", description: "动作、对白、镜头与时长", icon: BookOpen }
};

/** Enumerates the active renderer registry so newly registered node types remain discoverable. */
export function registeredCanvasCreateItems(types?: readonly string[]): CanvasCreateNodeItem[] {
  const registeredTypes = types ?? Object.keys(BUILTIN_CREATE_ITEMS);
  return registeredTypes
    .filter((type) => type in canvasNodeTypes)
    .map((type) => {
      const builtin = BUILTIN_CREATE_ITEMS[type];
      return builtin
        ? { type, ...builtin }
        : { type, label: readableNodeType(type), description: "创建扩展节点", icon: Puzzle };
    });
}

export interface CanvasNodeCreateMenuProps {
  anchor: CanvasOverlayAnchor;
  onCreate: (type: string) => void;
  onClose: () => void;
  types?: readonly string[];
  items?: readonly CanvasCreateNodeItem[];
  title?: string;
  className?: string;
}

export function CanvasNodeCreateMenu({
  anchor,
  onCreate,
  onClose,
  types,
  items,
  title = "创建节点",
  className
}: CanvasNodeCreateMenuProps): React.ReactElement {
  const uiText = useUiText();

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const menuItems = useMemo(() => items ? [...items] : registeredCanvasCreateItems(types), [items, types]);

  useDismissableOverlay(rootRef, onClose);
  useMenuFocus(buttonsRef);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const currentIndex = buttonsRef.current.findIndex((button) => button === document.activeElement);
    const nextIndex = menuNavigationIndex(event.key, currentIndex, menuItems.length);
    if (nextIndex === null) return;
    event.preventDefault();
    buttonsRef.current[nextIndex]?.focus();
  }

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label={title}
      data-canvas-node-create-menu=""
      className={cn(
        "canvas-overlay-menu nodrag nopan nowheel absolute w-64 max-w-[calc(100%-16px)] select-none overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md",
        className
      )}
      style={{ left: anchor.x, top: anchor.y }}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">{title}</div>
      {menuItems.length ? menuItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.type}
            ref={(button) => { buttonsRef.current[index] = button; }}
            type="button"
            role="menuitem"
            className="flex min-h-12 w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => {
              onCreate(item.type);
              onClose();
            }}
          >
            <span className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
              item.type === "generationNode" && "bg-[hsl(var(--canvas-ai-muted))] text-[hsl(var(--canvas-ai-accent))]"
            )}>
              <Icon aria-hidden className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-foreground">{uiText(item.label)}</span>
              {item.description ? <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{uiText(item.description)}</span> : null}
            </span>
            <Plus aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        );
      }) : (
        <p className="px-2 py-3 text-xs text-muted-foreground">{uiText("暂无可创建的节点")}</p>
      )}
    </div>
  );
}

export interface CanvasZoomToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number, immediate?: boolean) => void;
  onFitAll: () => void;
  onFitSelection: () => void;
  onToggleMiniMap: () => void;
  hasSelection?: boolean;
  miniMapOpen?: boolean;
  minZoom?: number;
  maxZoom?: number;
  step?: number;
  className?: string;
}

export function CanvasZoomToolbar({
  zoom,
  onZoomChange,
  onFitAll,
  onFitSelection,
  onToggleMiniMap,
  hasSelection = false,
  miniMapOpen = false,
  minZoom = 0.05,
  maxZoom = 4,
  step = 0.05,
  className
}: CanvasZoomToolbarProps): React.ReactElement {
  const uiText = useUiText();

  const [collapsed, setCollapsed] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());
  const boundedZoom = clamp(zoom, minZoom, maxZoom);
  const percentage = Math.round(boundedZoom * 100);
  return (
    <TooltipProvider delayDuration={350}>
      <motion.div
        layout
        role="toolbar"
        aria-label={uiText("画布缩放和导航")}
        data-tour="zoom"
        data-canvas-zoom-toolbar=""
        data-collapsed={collapsed || undefined}
        className={cn(
          "nodrag nopan nowheel absolute bottom-2.5 left-2.5 z-40 flex h-8 max-w-[calc(100%-20px)] select-none items-center gap-px overflow-hidden rounded-md border border-border bg-popover px-0.5 text-popover-foreground shadow-sm",
          className
        )}
        transition={{ layout: { duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] } }}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <AnimatePresence initial={false}>
          {!collapsed ? (
            <motion.div
              key="canvas-zoom-controls"
              className="flex min-w-0 items-center gap-px overflow-hidden"
              initial={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <OverlayIconButton label={uiText("缩小")} onClick={() => onZoomChange(clamp(boundedZoom - step, minZoom, maxZoom))}><ZoomOut /></OverlayIconButton>
              <input
                type="range"
                aria-label={uiText("画布缩放")}
                aria-valuetext={`${percentage}%`}
                min={minZoom}
                max={maxZoom}
                step={step}
                value={boundedZoom}
                className="mx-1 h-1 w-[72px] shrink-0 cursor-pointer accent-foreground"
                onChange={(event) => onZoomChange(clamp(event.currentTarget.valueAsNumber, minZoom, maxZoom), true)}
              />
              <OverlayIconButton label={uiText("放大")} onClick={() => onZoomChange(clamp(boundedZoom + step, minZoom, maxZoom))}><ZoomIn /></OverlayIconButton>
              <button
                type="button"
                aria-label={uiText("当前缩放 {{ui:0}}%", [percentage])}
                className="h-7 w-10 shrink-0 rounded text-center text-[10px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onZoomChange(clamp(1, minZoom, maxZoom))}
                title={uiText("重置为 100%")}
              >
                {percentage}%
              </button>
              <span aria-hidden className="mx-px h-4 w-px shrink-0 bg-border" />
              <OverlayIconButton label={uiText("适配全部")} onClick={onFitAll}><Maximize2 /></OverlayIconButton>
              <OverlayIconButton label={uiText("适配所选")} disabled={!hasSelection} onClick={onFitSelection}><Focus /></OverlayIconButton>
              <OverlayIconButton label={miniMapOpen ? uiText("关闭小地图") : uiText("打开小地图")} pressed={miniMapOpen} onClick={onToggleMiniMap}><Map /></OverlayIconButton>
              <span aria-hidden className="mx-px h-4 w-px shrink-0 bg-border" />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <OverlayIconButton
          label={collapsed ? uiText("展开缩放工具栏") : uiText("收起缩放工具栏")}
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
        </OverlayIconButton>
      </motion.div>
    </TooltipProvider>
  );
}

export interface CanvasContextMenuProps {
  anchor: CanvasOverlayAnchor;
  target: "node" | "connection";
  onDelete: () => void;
  onClose: () => void;
  onCopy?: () => void;
  className?: string;
}

export function CanvasContextMenu({ anchor, target, onDelete, onClose, onCopy, className }: CanvasContextMenuProps): React.ReactElement {
  const uiText = useUiText();

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const boundedAnchor = clampViewportAnchor(anchor, 168, onCopy ? 80 : 48);
  useDismissableOverlay(rootRef, onClose);
  useMenuFocus(buttonsRef);

  function run(action: () => void): void {
    action();
    onClose();
  }

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label={uiText("{{ui:0}}操作", [target === "node" ? "节点" : "连线"])}
      data-canvas-context-menu={target}
      className={cn(
        "canvas-overlay-menu nodrag nopan nowheel fixed min-w-40 select-none rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
        className
      )}
      style={{ left: boundedAnchor.x, top: boundedAnchor.y }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        const buttons = buttonsRef.current.filter((button): button is HTMLButtonElement => Boolean(button));
        const currentIndex = buttons.findIndex((button) => button === document.activeElement);
        const nextIndex = menuNavigationIndex(event.key, currentIndex, buttons.length);
        if (nextIndex === null) return;
        event.preventDefault();
        buttons[nextIndex]?.focus();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onCopy ? (
        <ContextMenuButton ref={(button) => { buttonsRef.current[0] = button; }} icon={<CopyPlus />} onClick={() => run(onCopy)}>
          {uiText("复制")}</ContextMenuButton>
      ) : null}
      <ContextMenuButton ref={(button) => { buttonsRef.current[onCopy ? 1 : 0] = button; }} icon={<Trash2 />} danger onClick={() => run(onDelete)}>
        {uiText("删除")}</ContextMenuButton>
    </div>
  );
}

function OverlayIconButton({ label, disabled, pressed, onClick, children }: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-accent))] disabled:pointer-events-none disabled:opacity-35 [&>svg]:h-3.5 [&>svg]:w-3.5",
            pressed && "bg-accent text-foreground"
          )}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

const ContextMenuButton = forwardRef<HTMLButtonElement, {
  icon: ReactNode;
  danger?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>>(function ContextMenuButton({ icon, danger = false, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>svg]:h-3.5 [&>svg]:w-3.5",
        danger ? "text-[hsl(var(--destructive-readable))]" : "text-foreground"
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});
ContextMenuButton.displayName = "ContextMenuButton";

function useMenuFocus(buttonsRef: React.RefObject<Array<HTMLButtonElement | null>>): void {
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
    buttonsRef.current[0]?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [buttonsRef]);
}

function useDismissableOverlay(rootRef: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      onClose();
    }
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (!event.defaultPrevented && event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, rootRef]);
}

function menuNavigationIndex(key: string, currentIndex: number, count: number): number | null {
  if (!count) return null;
  if (key === "ArrowDown") return (Math.max(currentIndex, -1) + 1) % count;
  if (key === "ArrowUp") return currentIndex <= 0 ? count - 1 : currentIndex - 1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

function readableNodeType(type: string): string {
  const value = type.replace(/Node$/, "").replace(/[-_]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return value || "扩展节点";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampViewportAnchor(
  anchor: CanvasOverlayAnchor,
  width: number,
  height: number,
  margin = 8
): CanvasOverlayAnchor {
  if (typeof window === "undefined") return anchor;
  return {
    x: clamp(anchor.x, margin, Math.max(margin, window.innerWidth - width - margin)),
    y: clamp(anchor.y, margin, Math.max(margin, window.innerHeight - height - margin))
  };
}
