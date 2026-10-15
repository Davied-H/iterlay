import { useUiText } from "@/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import {
  ArrowRight,
  Check,
  Clipboard,
  FileImage,
  ImagePlus,
  Layers3,
  Library,
  LoaderCircle,
  Plus,
  Sparkles
} from "lucide-react";
import type { AssetLibraryItem } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { gsap, useGSAP } from "@/lib/gsap";
import { getImageWorkbenchApi, hasImageWorkbenchApi } from "@/lib/image-workbench-api";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import demoStartImageUrl from "@/assets/tour-demo-lamp.jpg";

export type EmptyCanvasMode = "compass" | "inspiration" | "preview" | "recent";

interface EmptyCanvasStartProps {
  suggestedMode: EmptyCanvasMode;
  promptFocused: boolean;
  pasteShortcut: string;
  onChooseFiles: (files: File[]) => void;
  onPaste: () => Promise<void>;
  onStartPrompt: (prompt?: string) => void;
  onAddRecentAssets: (assets: AssetLibraryItem[]) => void;
  onOpenAssetLibrary: () => void;
  showDemoStart: boolean;
  onOpenDemoStart: () => void;
}

interface DeckPosition {
  x: number;
  y: number;
  rotate: number;
  zIndex: number;
}

const MODE_STORAGE_KEY = "iterlay.emptyCanvasMode";
const DRAG_ADD_DISTANCE = 48;
const CARD_DEAL_DURATION = 0.26;
const CARD_DEAL_STAGGER = 0.025;
const RECENT_INLINE_LIMIT = 8;
const RECENT_PAGE_SIZE = 20;

const INSPIRATION_PROMPTS = [
  { title: "雨夜街头", prompt: "雨夜街头的电影镜头，湿润路面反射霓虹，人物背影，克制的电影光影" },
  { title: "产品主视觉", prompt: "克制的产品主视觉，单一主体，精确布光，大面积留白，高级商业摄影" },
  { title: "超现实构图", prompt: "大胆的超现实构图，现实物体以意外尺度并置，清晰焦点，平衡而有张力" }
];

const MODE_OPTIONS: Array<{
  id: EmptyCanvasMode;
  label: string;
  title: string;
  description: string;
}> = [
  { id: "compass", label: "开始", title: "选择第一步", description: "导入、粘贴，或从一句描述开始。" },
  { id: "inspiration", label: "灵感", title: "选择一个画面方向", description: "选中的描述会带入下方输入区。" },
  { id: "preview", label: "工作流", title: "从第一张图开始推进", description: "参考、生成和变体会留在同一个画板。" },
  { id: "recent", label: "最近", title: "继续最近创作", description: "点击或拖动一张素材添加到画板。" }
];

function readStoredMode(): EmptyCanvasMode | null {
  try {
    const value = localStorage.getItem(MODE_STORAGE_KEY);
    return MODE_OPTIONS.some((option) => option.id === value) ? value as EmptyCanvasMode : null;
  } catch {
    return null;
  }
}

function writeStoredMode(mode: EmptyCanvasMode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // 本地偏好不可写时仍允许当前会话切换。
  }
}

function sourceLabel(source: AssetLibraryItem["source"]): string {
  if (source === "upload") return "上传";
  if (source === "slice") return "切图";
  return "生成";
}

function assetKey(asset: AssetLibraryItem): string {
  return `${asset.boardId}:${asset.nodeId}`;
}

function deckPosition(index: number, count: number): DeckPosition {
  if (count <= 1) return { x: 0, y: -4, rotate: 0, zIndex: 3 };
  if (count === 2) {
    return index === 0
      ? { x: -96, y: 8, rotate: -4.5, zIndex: 1 }
      : { x: 96, y: 8, rotate: 4.5, zIndex: 2 };
  }
  if (count === 4) {
    return [
      { x: -224, y: 30, rotate: -8, zIndex: 1 },
      { x: -76, y: 0, rotate: -2.6, zIndex: 3 },
      { x: 78, y: -12, rotate: 2.2, zIndex: 4 },
      { x: 226, y: 29, rotate: 8, zIndex: 2 }
    ][index] ?? { x: 0, y: 0, rotate: 0, zIndex: 1 };
  }
  return [
    { x: -162, y: 17, rotate: -7.5, zIndex: 1 },
    { x: 0, y: -12, rotate: 0, zIndex: 3 },
    { x: 162, y: 17, rotate: 7.5, zIndex: 2 }
  ][index] ?? { x: 0, y: 0, rotate: 0, zIndex: 1 };
}

function deckTransition(index: number, reduceMotion: boolean): { duration: number; delay?: number; ease: typeof EASE_OUT } {
  return {
    duration: reduceMotion ? 0.08 : CARD_DEAL_DURATION,
    delay: reduceMotion ? 0 : index * CARD_DEAL_STAGGER,
    ease: EASE_OUT
  };
}

function queuePosition(index: number, count: number): DeckPosition {
  if (count <= 3) return deckPosition(index, count);
  const step = Math.min(150, 660 / Math.max(1, count - 1));
  const center = (count - 1) / 2;
  const normalized = center === 0 ? 0 : (index - center) / center;
  return {
    x: (index - center) * step,
    y: -12 + Math.pow(Math.abs(normalized), 1.55) * 34,
    rotate: normalized * 7,
    zIndex: index + 1
  };
}

interface DeckMotionOptions {
  keys: string[];
  positions: DeckPosition[];
  scales?: number[];
  reduceMotion: boolean;
  interactive?: boolean;
  hoverLift?: number;
  hoverScale?: number;
}

function deckSurface(node: HTMLElement): HTMLElement | null {
  return node.matches("[data-deck-surface]")
    ? node
    : node.querySelector<HTMLElement>("[data-deck-surface]");
}

function nearestDeckIndex(clientX: number, root: HTMLElement | null, positions: DeckPosition[]): number {
  if (!root || positions.length === 0) return -1;
  const bounds = root.getBoundingClientRect();
  const localX = clientX - (bounds.left + bounds.width / 2);
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  positions.forEach((position, index) => {
    const distance = Math.abs(localX - position.x);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function settleDeckCards(
  nodes: Array<HTMLElement | undefined>,
  positions: DeckPosition[],
  scales: number[],
  duration = 0.26
): void {
  nodes.forEach((node, index) => {
    if (!node) return;
    const position = positions[index];
    if (!position) return;
    gsap.to(node, {
      x: position.x,
      y: position.y,
      rotation: position.rotate,
      scale: scales[index] ?? 1,
      opacity: 1,
      zIndex: position.zIndex,
      duration,
      ease: "expo.out",
      overwrite: "auto"
    });
    const surface = deckSurface(node);
    if (surface) {
      gsap.to(surface, {
        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.12)",
        duration: Math.min(duration, 0.22),
        ease: "power2.out",
        overwrite: "auto"
      });
    }
  });
}

function liftDeckCard(
  nodes: Array<HTMLElement | undefined>,
  activeIndex: number,
  positions: DeckPosition[],
  scales: number[],
  hoverLift: number,
  hoverScale: number
): void {
  nodes.forEach((node, index) => {
    if (!node) return;
    const position = positions[index];
    if (!position) return;
    const surface = deckSurface(node);
    if (index === activeIndex) {
      gsap.set(node, { zIndex: 50 });
      gsap.to(node, {
        x: position.x,
        y: position.y - hoverLift,
        rotation: 0,
        scale: (scales[index] ?? 1) * hoverScale,
        opacity: 1,
        zIndex: 50,
        duration: 0.3,
        ease: "expo.out",
        overwrite: "auto"
      });
      if (surface) {
        gsap.to(surface, {
          boxShadow: "0 20px 34px rgba(0, 0, 0, 0.22)",
          duration: 0.28,
          ease: "power3.out",
          overwrite: "auto"
        });
      }
      return;
    }

    const direction = index < activeIndex ? -1 : 1;
    const distance = Math.abs(index - activeIndex);
    gsap.set(node, { zIndex: position.zIndex });
    gsap.to(node, {
      x: position.x + direction * Math.max(3, 11 - distance * 2.5),
      y: position.y + Math.min(5, distance * 1.5),
      rotation: position.rotate + direction * 0.45,
      scale: (scales[index] ?? 1) * 0.965,
      opacity: 0.84,
      zIndex: position.zIndex,
      duration: 0.24,
      ease: "expo.out",
      overwrite: "auto"
    });
    if (surface) {
      gsap.to(surface, {
        boxShadow: "0 2px 5px rgba(0, 0, 0, 0.09)",
        duration: 0.2,
        overwrite: "auto"
      });
    }
  });
}

function useGsapDeckMotion({
  keys,
  positions,
  scales = keys.map(() => 1),
  reduceMotion,
  interactive = true,
  hoverLift = 30,
  hoverScale = 1.08
}: DeckMotionOptions): {
  rootRef: React.RefObject<HTMLDivElement | null>;
  registerCard: (key: string) => (node: HTMLElement | null) => void;
  handlePointerMove: (clientX: number) => void;
  handleEnter: (index: number) => void;
  handleLeave: () => void;
} {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const animatingRef = useRef(false);
  const activeIndexRef = useRef<number | null>(null);
  const signature = keys.map((key, index) => {
    const position = positions[index];
    return `${key}:${position?.x}:${position?.y}:${position?.rotate}:${scales[index] ?? 1}`;
  }).join("|");

  useGSAP(() => {
    const nodes = keys.map((key) => cardRefs.current.get(key));
    if (nodes.every((node) => !node)) return;
    gsap.killTweensOf(nodes.filter(Boolean));
    if (reduceMotion) {
      nodes.forEach((node, index) => {
        const position = positions[index];
        if (!node || !position) return;
        gsap.set(node, {
          x: position.x,
          y: position.y,
          rotation: position.rotate,
          scale: scales[index] ?? 1,
          opacity: 1,
          zIndex: position.zIndex
        });
      });
      animatingRef.current = false;
      return;
    }

    animatingRef.current = true;
    const timeline = gsap.timeline({
      onComplete: () => {
        animatingRef.current = false;
      }
    });
    nodes.forEach((node, index) => {
      const position = positions[index];
      if (!node || !position) return;
      timeline.fromTo(node, {
        x: 0,
        y: 24,
        rotation: 0,
        scale: (scales[index] ?? 1) * 0.9,
        opacity: 0,
        filter: "blur(2px)",
        zIndex: position.zIndex,
        transformOrigin: "50% 78%"
      }, {
        x: position.x,
        y: position.y,
        rotation: position.rotate,
        scale: scales[index] ?? 1,
        opacity: 1,
        filter: "blur(0px)",
        duration: 0.42,
        ease: "expo.out"
      }, index * 0.055);
    });
    return () => timeline.kill();
  }, {
    scope: rootRef,
    dependencies: [signature, reduceMotion],
    revertOnUpdate: true
  });

  const nodes = (): Array<HTMLElement | undefined> => keys.map((key) => cardRefs.current.get(key));
  const activate = (index: number): void => {
    if (!interactive || reduceMotion || animatingRef.current || index < 0 || activeIndexRef.current === index) return;
    activeIndexRef.current = index;
    liftDeckCard(nodes(), index, positions, scales, hoverLift, hoverScale);
  };
  return {
    rootRef,
    registerCard: (key) => (node) => {
      if (node) cardRefs.current.set(key, node);
      else cardRefs.current.delete(key);
    },
    handlePointerMove: (clientX) => activate(nearestDeckIndex(clientX, rootRef.current, positions)),
    handleEnter: activate,
    handleLeave: () => {
      if (!interactive || reduceMotion || animatingRef.current) return;
      activeIndexRef.current = null;
      settleDeckCards(nodes(), positions, scales);
    }
  };
}

export function EmptyCanvasStart({
  suggestedMode,
  promptFocused,
  pasteShortcut,
  onChooseFiles,
  onPaste,
  onStartPrompt,
  onAddRecentAssets,
  onOpenAssetLibrary,
  showDemoStart,
  onOpenDemoStart
}: EmptyCanvasStartProps): React.ReactElement {
  const uiText = useUiText();

  const reduceMotion = Boolean(useReducedMotion());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialStoredMode = useRef(readStoredMode()).current;
  const [manualMode, setManualMode] = useState(showDemoStart ? false : initialStoredMode !== null);
  const [mode, setMode] = useState<EmptyCanvasMode>(showDemoStart ? "compass" : initialStoredMode ?? suggestedMode);
  const [recentAssets, setRecentAssets] = useState<AssetLibraryItem[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [recentNextCursor, setRecentNextCursor] = useState<string | undefined>();
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoadingMore, setPickerLoadingMore] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const tabsId = useId();

  useEffect(() => {
    if (showDemoStart) {
      setMode("compass");
      setManualMode(false);
    }
  }, [showDemoStart]);

  useEffect(() => {
    if (!showDemoStart && !manualMode) setMode(suggestedMode);
  }, [manualMode, showDemoStart, suggestedMode]);

  useEffect(() => {
    let cancelled = false;
    if (!hasImageWorkbenchApi()) {
      setRecentLoading(false);
      return undefined;
    }
    void getImageWorkbenchApi()
      .listAssets(undefined, RECENT_PAGE_SIZE)
      .then((page) => {
        if (cancelled) return;
        setRecentAssets(page.items);
        setRecentTotal(page.total);
        setRecentNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setPickerError("最近素材加载失败，请稍后重试。");
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!manualMode && mode === "recent" && !recentLoading && recentAssets.length === 0) {
      setMode("compass");
    }
  }, [manualMode, mode, recentAssets.length, recentLoading]);

  function selectMode(next: EmptyCanvasMode): void {
    setMode(next);
    setManualMode(true);
    writeStoredMode(next);
  }

  function browseRecentAssets(): void {
    if (!recentExpanded) {
      setRecentExpanded(true);
      return;
    }
    if (recentTotal > RECENT_INLINE_LIMIT) {
      setPickerOpen(true);
      return;
    }
    setRecentExpanded(false);
  }

  async function loadMoreRecentAssets(): Promise<void> {
    if (!recentNextCursor || pickerLoadingMore) return;
    setPickerLoadingMore(true);
    setPickerError(null);
    try {
      const page = await getImageWorkbenchApi().listAssets(recentNextCursor, RECENT_PAGE_SIZE);
      setRecentAssets((current) => {
        const known = new Set(current.map(assetKey));
        return [...current, ...page.items.filter((item) => !known.has(assetKey(item)))];
      });
      setRecentTotal(page.total);
      setRecentNextCursor(page.nextCursor);
    } catch {
      setPickerError("更多素材加载失败，请稍后重试。");
    } finally {
      setPickerLoadingMore(false);
    }
  }

  const activeOption = MODE_OPTIONS.find((option) => option.id === mode) ?? MODE_OPTIONS[0];

  return (
    <motion.section
      aria-label={uiText("新画板")}
      aria-hidden={promptFocused}
      className={cn(
        "empty-canvas-start pointer-events-auto flex w-full max-w-[880px] flex-col items-center text-center",
        promptFocused && "pointer-events-none"
      )}
      animate={{
        opacity: promptFocused ? 0.16 : 1,
        y: promptFocused && !reduceMotion ? -10 : 0,
        scale: promptFocused && !reduceMotion ? 0.985 : 1
      }}
      transition={{ duration: reduceMotion ? 0.08 : 0.2, ease: EASE_OUT }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          onChooseFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />

      <div className="h-[58px]">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={mode}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: EASE_OUT }}
          >
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-xl font-semibold leading-7 text-foreground">{activeOption.title}</h2>
              {mode === "recent" && recentAssets.length > 3 ? (
                <button
                  type="button"
                  onClick={browseRecentAssets}
                  aria-expanded={recentExpanded}
                  aria-haspopup={recentExpanded && recentTotal > RECENT_INLINE_LIMIT ? "dialog" : undefined}
                  className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Library className="h-3.5 w-3.5" />
                  {!recentExpanded
                    ? uiText("查看更多")
                    : recentTotal > RECENT_INLINE_LIMIT
                      ? uiText("查看全部")
                      : uiText("收起")}
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{activeOption.description}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative mt-4 h-[252px] w-full" aria-live="polite">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={mode}
            id={`${tabsId}-${mode}-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-${mode}-tab`}
            className="absolute inset-0"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: reduceMotion ? 0 : 1 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: EASE_OUT }}
          >
            {mode === "compass" ? (
              <StartDeck
                reduceMotion={reduceMotion}
                pasteShortcut={pasteShortcut}
                onChooseFiles={() => fileInputRef.current?.click()}
                onPaste={onPaste}
                onStartPrompt={() => onStartPrompt()}
                showDemoStart={showDemoStart}
                onOpenDemoStart={onOpenDemoStart}
              />
            ) : null}
            {mode === "inspiration" ? (
              <InspirationDeck reduceMotion={reduceMotion} onStartPrompt={onStartPrompt} />
            ) : null}
            {mode === "preview" ? <WorkflowDeck reduceMotion={reduceMotion} /> : null}
            {mode === "recent" ? (
              <RecentDeck
                assets={recentExpanded ? recentAssets.slice(0, RECENT_INLINE_LIMIT) : recentAssets.slice(0, 3)}
                loading={recentLoading}
                reduceMotion={reduceMotion}
                expanded={recentExpanded}
                onAddAssets={onAddRecentAssets}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <ModeRail
        id={tabsId}
        mode={mode}
        recentAvailable={recentLoading || recentAssets.length > 0}
        reduceMotion={reduceMotion}
        onSelect={selectMode}
      />

      <RecentAssetPicker
        open={pickerOpen}
        assets={recentAssets}
        total={recentTotal}
        loadingMore={pickerLoadingMore}
        hasMore={Boolean(recentNextCursor)}
        error={pickerError}
        reduceMotion={reduceMotion}
        onOpenChange={setPickerOpen}
        onLoadMore={() => void loadMoreRecentAssets()}
        onAddAssets={onAddRecentAssets}
        onOpenAssetLibrary={onOpenAssetLibrary}
      />
    </motion.section>
  );
}

function ModeRail({
  id,
  mode,
  recentAvailable,
  reduceMotion,
  onSelect
}: {
  id: string;
  mode: EmptyCanvasMode;
  recentAvailable: boolean;
  reduceMotion: boolean;
  onSelect: (mode: EmptyCanvasMode) => void;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <div role="tablist" aria-label={uiText("选择开始方式")} className="flex items-center border-b border-border/80">
      {MODE_OPTIONS.map((option) => {
        const active = option.id === mode;
        const unavailable = option.id === "recent" && !recentAvailable;
        return (
          <button
            key={option.id}
            id={`${id}-${option.id}-tab`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${id}-${option.id}-panel`}
            disabled={unavailable}
            title={unavailable ? uiText("暂无最近素材") : undefined}
            onClick={() => onSelect(option.id)}
            className={cn(
              "relative h-9 min-w-[64px] px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-30",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
            {active ? (
              <motion.span
                layoutId={`${id}-active-mode`}
                className="absolute inset-x-2 -bottom-px h-0.5 bg-foreground"
                transition={{ duration: reduceMotion ? 0.08 : 0.2, ease: EASE_OUT }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function StartDeck({
  reduceMotion,
  pasteShortcut,
  onChooseFiles,
  onPaste,
  onStartPrompt,
  showDemoStart,
  onOpenDemoStart
}: {
  reduceMotion: boolean;
  pasteShortcut: string;
  onChooseFiles: () => void;
  onPaste: () => Promise<void>;
  onStartPrompt: () => void;
  showDemoStart: boolean;
  onOpenDemoStart: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  const actions = [
    { id: "import", title: "导入图片", detail: "选择本地素材", meta: "PNG · JPG · WebP", icon: FileImage, action: onChooseFiles, demo: false },
    { id: "prompt", title: "从描述开始", detail: "生成第一张画面", meta: "打开输入区", icon: Sparkles, action: onStartPrompt, demo: false },
    ...(showDemoStart ? [{ id: "demo", title: "从示例开始", detail: "AURA 灯具完整工作流", meta: "首次推荐", icon: ImagePlus, action: onOpenDemoStart, demo: true }] : []),
    { id: "paste", title: "粘贴图片", detail: "使用剪贴板内容", meta: pasteShortcut, icon: Clipboard, action: () => void onPaste(), demo: false }
  ];
  const positions = actions.map((_, index) => deckPosition(index, actions.length));
  const scales = actions.map((_, index) => showDemoStart
    ? [0.97, 0.99, 1.025, 0.97][index] ?? 1
    : 1);
  const deckMotion = useGsapDeckMotion({
    keys: actions.map((item) => item.id),
    positions,
    scales,
    reduceMotion,
    hoverLift: 22,
    hoverScale: 1.07
  });

  return (
    <div
      ref={deckMotion.rootRef}
      className="relative h-full w-full"
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") deckMotion.handlePointerMove(event.clientX);
      }}
      onPointerLeave={deckMotion.handleLeave}
    >
      {actions.map((item, index) => {
        const Icon = item.icon;
        const primary = !showDemoStart && index === 1;
        const alignToOuterEdge = showDemoStart && index === actions.length - 1;
        return (
          <button
            key={item.id}
            ref={deckMotion.registerCard(item.id)}
            type="button"
            data-deck-surface
            onFocus={() => deckMotion.handleEnter(index)}
            onBlur={deckMotion.handleLeave}
            onClick={item.action}
            className={cn(
              "group absolute left-1/2 top-1/2 -ml-[116px] -mt-[92px] h-[184px] w-[232px] origin-bottom transform-gpu overflow-hidden rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              primary ? "bg-foreground text-background" : "bg-card text-foreground",
              item.demo
                ? "shadow-[0_10px_24px_hsl(var(--foreground)/0.14)]"
                : index === 0 || index === actions.length - 1 ? "shadow-sm" : "shadow-md"
            )}
          >
            {item.demo ? (
              <span className="flex h-full flex-col">
                <span className="relative h-[112px] overflow-hidden bg-muted">
                  <img src={demoStartImageUrl} alt="" className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.025] motion-reduce:transition-none" />
                  <span className="absolute left-2.5 top-2.5 rounded bg-foreground px-2 py-1 text-[10px] font-medium text-background">{uiText("首次推荐")}</span>
                </span>
                <span className="flex h-[72px] items-center justify-between gap-3 px-4">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.detail}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                </span>
              </span>
            ) : (
              <span className={cn(
                "flex h-full flex-col justify-between p-5",
                alignToOuterEdge ? "items-end text-right" : "items-start"
              )}>
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", primary ? "bg-background/15" : "bg-muted")}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="block">
                  <span className="block text-base font-semibold">{item.title}</span>
                  <span className={cn("mt-1 block text-xs", primary ? "text-background/70" : "text-muted-foreground")}>{item.detail}</span>
                </span>
                <span className={cn(
                  "flex items-center text-[11px]",
                  alignToOuterEdge ? "w-auto gap-2" : "w-full justify-between",
                  primary ? "text-background/65" : "text-muted-foreground"
                )}>
                  {item.meta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function InspirationDeck({
  reduceMotion,
  onStartPrompt
}: {
  reduceMotion: boolean;
  onStartPrompt: (prompt?: string) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const keys = INSPIRATION_PROMPTS.map((item) => item.title);
  const positions = INSPIRATION_PROMPTS.map((_, index) => deckPosition(index, INSPIRATION_PROMPTS.length));
  const deckMotion = useGsapDeckMotion({
    keys,
    positions,
    reduceMotion,
    hoverLift: 22,
    hoverScale: 1.07
  });
  return (
    <div
      ref={deckMotion.rootRef}
      className="relative h-full w-full"
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") deckMotion.handlePointerMove(event.clientX);
      }}
      onPointerLeave={deckMotion.handleLeave}
    >
      {INSPIRATION_PROMPTS.map((item, index) => {
        return (
          <button
            key={item.title}
            ref={deckMotion.registerCard(item.title)}
            type="button"
            data-deck-surface
            onFocus={() => deckMotion.handleEnter(index)}
            onBlur={deckMotion.handleLeave}
            onClick={() => onStartPrompt(item.prompt)}
            className="group absolute left-1/2 top-1/2 -ml-[116px] -mt-[92px] flex h-[184px] w-[232px] flex-col items-start justify-between rounded-lg bg-card p-5 text-left text-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Sparkles className="h-[18px] w-[18px] text-muted-foreground" />
            <span className="block">
              <span className="block text-base font-semibold">{item.title}</span>
              <span className="mt-2 line-clamp-3 block text-xs leading-5 text-muted-foreground">{item.prompt}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              {uiText("带入描述")}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WorkflowDeck({ reduceMotion }: { reduceMotion: boolean }): React.ReactElement {
  const steps = [
    { title: "参考", detail: "构图、风格或主体", icon: FileImage },
    { title: "生成", detail: "建立主画面", icon: ImagePlus },
    { title: "变体", detail: "比较并保留版本", icon: Layers3 }
  ];
  const deckMotion = useGsapDeckMotion({
    keys: steps.map((step) => step.title),
    positions: steps.map((_, index) => deckPosition(index, steps.length)),
    reduceMotion,
    interactive: false
  });
  return (
    <div ref={deckMotion.rootRef} className="relative h-full w-full">
      <motion.span
        aria-hidden
        className="absolute left-1/2 top-1/2 h-px w-[340px] -translate-x-1/2 bg-border"
        initial={{ opacity: 0, scaleX: reduceMotion ? 1 : 0.5 }}
        animate={{ opacity: 1, scaleX: 1 }}
        exit={{ opacity: 0, scaleX: reduceMotion ? 1 : 0.7 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.22, ease: EASE_OUT }}
      />
      {steps.map((step, index) => {
        const Icon = step.icon;
        const primary = index === 1;
        return (
          <div
            key={step.title}
            ref={deckMotion.registerCard(step.title)}
            data-deck-surface
            className={cn(
              "absolute left-1/2 top-1/2 -ml-[98px] -mt-[72px] flex h-36 w-[196px] flex-col items-center justify-center rounded-lg text-center shadow-md",
              primary ? "bg-foreground text-background" : "bg-card text-foreground"
            )}
          >
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-md", primary ? "bg-background/15" : "bg-muted")}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
            <p className={cn("mt-1 text-xs", primary ? "text-background/65" : "text-muted-foreground")}>{step.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

function RecentAssetPicker({
  open,
  assets,
  total,
  loadingMore,
  hasMore,
  error,
  reduceMotion,
  onOpenChange,
  onLoadMore,
  onAddAssets,
  onOpenAssetLibrary
}: {
  open: boolean;
  assets: AssetLibraryItem[];
  total: number;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  reduceMotion: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadMore: () => void;
  onAddAssets: (assets: AssetLibraryItem[]) => void;
  onOpenAssetLibrary: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) setSelectedKeys(new Set());
  }, [open]);

  function toggleAsset(asset: AssetLibraryItem): void {
    const key = assetKey(asset);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllLoaded(): void {
    if (selectedKeys.size === assets.length) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(assets.map(assetKey)));
  }

  function addSelectedAssets(): void {
    const selected = assets.filter((asset) => selectedKeys.has(assetKey(asset)));
    if (selected.length === 0) return;
    onOpenChange(false);
    onAddAssets(selected);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] max-w-[880px] gap-0 overflow-hidden p-0 text-left">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-5 pr-14">
          <div className="flex items-center gap-3">
            <DialogTitle>{uiText("添加最近素材")}</DialogTitle>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {total} {uiText("项")}</span>
          </div>
          <DialogDescription>
            {selectedKeys.size > 0 ? uiText("已选择 {{ui:0}} 项", [selectedKeys.size]) : uiText("从最近创作中选择要放入当前画板的素材。")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-6">
            <button
              type="button"
              onClick={toggleAllLoaded}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {selectedKeys.size === assets.length ? uiText("取消全选") : uiText("全选已加载 {{ui:0}} 项", [assets.length])}
            </button>
            {selectedKeys.size > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedKeys(new Set())}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {uiText("清除选择")}</button>
            ) : null}
          </div>

          <ScrollArea className="h-[min(54vh,520px)]">
            <div className="grid grid-cols-4 gap-3 p-6 sm:grid-cols-5">
              {assets.map((asset, index) => {
                const key = assetKey(asset);
                const selected = selectedKeys.has(key);
                return (
                  <motion.button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    aria-label={uiText("{{ui:0}}素材「{{ui:1}}」", [selected ? "取消选择" : "选择", asset.boardName])}
                    onClick={() => toggleAsset(asset)}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: reduceMotion ? 0.08 : 0.22,
                      delay: reduceMotion ? 0 : Math.min(index, 10) * 0.018,
                      ease: EASE_OUT
                    }}
                    className={cn(
                      "group relative overflow-hidden rounded-lg bg-card text-left shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                    )}
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden bg-muted">
                      <img
                        src={asset.thumbnailUrl || asset.dataUrl}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.025] motion-reduce:transition-none"
                      />
                      <span
                        className={cn(
                          "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-background/90 transition-[opacity,transform]",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span className="block px-2.5 py-2">
                      <span className="block truncate text-xs font-medium text-foreground">{asset.boardName}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{sourceLabel(asset.source)}</span>
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {hasMore ? (
              <div className="flex justify-center px-6 pb-6">
                <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={onLoadMore}>
                  {loadingMore ? <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Plus className="h-3.5 w-3.5" />}
                  {uiText("加载更多")}</Button>
              </div>
            ) : null}
            {error ? <p className="px-6 pb-6 text-center text-xs text-destructive">{error}</p> : null}
          </ScrollArea>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onOpenAssetLibrary();
            }}
          >
            <Library className="h-3.5 w-3.5" />
            {uiText("素材库")}</Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {uiText("取消")}</Button>
            <Button type="button" size="sm" disabled={selectedKeys.size === 0} onClick={addSelectedAssets}>
              <Plus className="h-3.5 w-3.5" />
              {uiText("添加")}{selectedKeys.size > 0 ? uiText(" {{ui:0}} 张", [selectedKeys.size]) : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecentDeck({
  assets,
  loading,
  reduceMotion,
  expanded,
  onAddAssets
}: {
  assets: AssetLibraryItem[];
  loading: boolean;
  reduceMotion: boolean;
  expanded: boolean;
  onAddAssets: (assets: AssetLibraryItem[]) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const draggedKeyRef = useRef<string | null>(null);
  const addTimerRef = useRef<number | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const deckAnimatingRef = useRef(false);
  const hoveredIndexRef = useRef<number | null>(null);
  const assetSignature = assets.map(assetKey).join("|");

  useEffect(() => () => {
    if (addTimerRef.current !== null) window.clearTimeout(addTimerRef.current);
    gsap.killTweensOf(Array.from(cardRefs.current.values()));
  }, []);

  useGSAP(() => {
    if (loading) return;
    const nodes = assets
      .map((asset) => cardRefs.current.get(assetKey(asset)))
      .filter((node): node is HTMLDivElement => Boolean(node));
    if (nodes.length === 0) return;

    gsap.killTweensOf(nodes);
    if (reduceMotion) {
      nodes.forEach((node, index) => {
        const position = expanded ? queuePosition(index, nodes.length) : deckPosition(index, nodes.length);
        gsap.set(node, {
          x: position.x,
          y: position.y,
          rotation: position.rotate,
          scale: expanded ? 0.82 : 1,
          opacity: 1,
          filter: "blur(0px)",
          zIndex: position.zIndex
        });
      });
      deckAnimatingRef.current = false;
      return;
    }

    deckAnimatingRef.current = true;
    const timeline = gsap.timeline({
      defaults: { overwrite: "auto" },
      onComplete: () => {
        deckAnimatingRef.current = false;
      }
    });
    if (expanded && nodes.length > 3) {
      const firstRow = nodes.slice(0, 3);
      const entering = nodes.slice(3);
      const flightStartX = Math.max(560, (deckRef.current?.clientWidth ?? 880) / 2 + 150);

      firstRow.forEach((node, index) => {
        const start = deckPosition(index, 3);
        const target = queuePosition(index, nodes.length);
        gsap.set(node, {
          x: start.x,
          y: start.y,
          rotation: start.rotate,
          scale: 1,
          opacity: 1,
          filter: "blur(0px)",
          zIndex: target.zIndex,
          transformOrigin: "50% 70%"
        });
        timeline.to(node, {
          x: target.x,
          y: target.y,
          rotation: target.rotate,
          scale: 0.82,
          duration: 0.38,
          ease: "expo.out"
        }, 0);
      });

      entering.forEach((node, entryIndex) => {
        const index = entryIndex + 3;
        const target = queuePosition(index, nodes.length);
        const startAt = 0.16 + entryIndex * 0.17;
        timeline.fromTo(node, {
          x: flightStartX,
          y: target.y - 3,
          rotation: 3.2,
          scale: 0.76,
          opacity: 0.18,
          filter: "blur(3px)",
          zIndex: target.zIndex,
          transformOrigin: "50% 70%"
        }, {
          x: target.x - 6,
          y: target.y,
          rotation: target.rotate - 0.35,
          scale: 0.82,
          opacity: 1,
          filter: "blur(0px)",
          duration: 0.46,
          ease: "expo.out"
        }, startAt);
        timeline.to(node, {
          x: target.x,
          rotation: target.rotate,
          duration: 0.12,
          ease: "power2.out"
        }, startAt + 0.46);
      });

      const magnetAt = 0.5;
      [2, 1, 0].forEach((index) => {
        const node = firstRow[index];
        if (!node) return;
        const target = queuePosition(index, nodes.length);
        const pull = 2.3 + index * 1.6;
        timeline.to(node, {
          x: target.x + pull,
          rotation: target.rotate + 0.18 + index * 0.08,
          duration: 0.09,
          ease: "power2.in"
        }, magnetAt);
      });

      const impactAt = 0.62;
      [2, 1, 0].forEach((index, propagationIndex) => {
        const node = firstRow[index];
        if (!node) return;
        const target = queuePosition(index, nodes.length);
        const hitAt = impactAt + propagationIndex * 0.028;
        const force = 4.8 + index * 1.1;
        timeline
          .to(node, {
            x: target.x - force,
            rotation: target.rotate - 0.55,
            duration: 0.065,
            ease: "power2.out"
          }, hitAt)
          .to(node, {
            x: target.x + 2.5,
            rotation: target.rotate + 0.18,
            duration: 0.085,
            ease: "power2.out"
          }, hitAt + 0.065)
          .to(node, {
            x: target.x,
            rotation: target.rotate,
            duration: 0.12,
            ease: "power3.out"
          }, hitAt + 0.15);
      });
    } else {
      nodes.forEach((node, index) => {
        const target = deckPosition(index, nodes.length);
        timeline.fromTo(node, {
          x: 0,
          y: 18,
          rotation: 0,
          scale: 0.92,
          opacity: 0,
          filter: "blur(2px)",
          zIndex: target.zIndex
        }, {
          x: target.x,
          y: target.y,
          rotation: target.rotate,
          scale: 1,
          opacity: 1,
          filter: "blur(0px)",
          duration: 0.32,
          ease: "expo.out"
        }, index * 0.035);
      });
    }

    return () => {
      deckAnimatingRef.current = false;
      timeline.kill();
    };
  }, {
    scope: deckRef,
    dependencies: [assetSignature, expanded, loading, reduceMotion],
    revertOnUpdate: true
  });

  function playSelectionFeedback(key: string): void {
    if (reduceMotion) return;
    const nodes = Array.from(cardRefs.current.entries());
    gsap.killTweensOf(nodes.map(([, node]) => node));
    nodes.forEach(([nodeKey, node]) => {
      if (nodeKey === key) {
        gsap.to(node, {
          x: 0,
          y: -18,
          rotation: 0,
          scale: expanded ? 0.86 : 1.035,
          opacity: 1,
          zIndex: 20,
          duration: 0.18,
          ease: "expo.out",
          overwrite: true
        });
        return;
      }
      gsap.to(node, {
        y: "+=8",
        scale: expanded ? 0.77 : 0.94,
        opacity: 0,
        duration: 0.16,
        ease: "power2.out",
        overwrite: true
      });
    });
  }

  function handleRecentHover(index: number): void {
    if (
      reduceMotion ||
      pendingKeyRef.current !== null ||
      deckAnimatingRef.current ||
      index < 0 ||
      hoveredIndexRef.current === index
    ) return;
    hoveredIndexRef.current = index;
    const nodes = assets.map((asset) => cardRefs.current.get(assetKey(asset)));
    const positions = assets.map((_, itemIndex) => expanded
      ? queuePosition(itemIndex, assets.length)
      : deckPosition(itemIndex, assets.length));
    const scales = assets.map(() => expanded ? 0.82 : 1);
    liftDeckCard(nodes, index, positions, scales, expanded ? 38 : 22, expanded ? 1.14 : 1.08);
  }

  function handleRecentLeave(): void {
    if (reduceMotion || pendingKeyRef.current !== null || deckAnimatingRef.current) return;
    hoveredIndexRef.current = null;
    const nodes = assets.map((asset) => cardRefs.current.get(assetKey(asset)));
    const positions = assets.map((_, itemIndex) => expanded
      ? queuePosition(itemIndex, assets.length)
      : deckPosition(itemIndex, assets.length));
    settleDeckCards(nodes, positions, assets.map(() => expanded ? 0.82 : 1));
  }

  function addAsset(asset: AssetLibraryItem): void {
    if (pendingKeyRef.current !== null) return;
    const key = assetKey(asset);
    pendingKeyRef.current = key;
    setPendingKey(key);
    playSelectionFeedback(key);
    if (reduceMotion) {
      onAddAssets([asset]);
      return;
    }
    addTimerRef.current = window.setTimeout(() => onAddAssets([asset]), 190);
  }

  function handleDragEnd(asset: AssetLibraryItem, info: PanInfo): void {
    if (Math.hypot(info.offset.x, info.offset.y) >= DRAG_ADD_DISTANCE) addAsset(asset);
    window.setTimeout(() => {
      draggedKeyRef.current = null;
    }, 0);
  }

  return (
    <div
      ref={deckRef}
      className="relative h-full w-full"
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        const positions = assets.map((_, itemIndex) => expanded
          ? queuePosition(itemIndex, assets.length)
          : deckPosition(itemIndex, assets.length));
        handleRecentHover(nearestDeckIndex(event.clientX, deckRef.current, positions));
      }}
      onPointerLeave={handleRecentLeave}
    >
      {loading ? Array.from({ length: 3 }, (_, index) => {
        const position = deckPosition(index, 3);
        return (
          <motion.div
            key={index}
            initial={reduceMotion ? { opacity: 0 } : { x: 0, y: 16, rotate: 0, scale: 0.94, opacity: 0 }}
            animate={{ ...position, scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={deckTransition(index, reduceMotion)}
            className="absolute left-1/2 top-1/2 -ml-[120px] -mt-[102px] h-[204px] w-60 overflow-hidden rounded-lg bg-card shadow-md"
          >
            <Skeleton className="h-full w-full rounded-lg" />
          </motion.div>
        );
      }) : null}

      {!loading ? assets.map((asset, index) => {
        const key = assetKey(asset);
        return (
          <div
            key={key}
            ref={(node) => {
              if (node) cardRefs.current.set(key, node);
              else cardRefs.current.delete(key);
            }}
            className="absolute left-1/2 top-1/2 -ml-[120px] -mt-[102px] h-[204px] w-60 will-change-transform"
          >
            <motion.button
              type="button"
              data-deck-surface
              drag={!reduceMotion && pendingKey === null}
              dragSnapToOrigin
              dragElastic={0.12}
              dragMomentum={false}
              initial={false}
              whileTap={reduceMotion || pendingKey !== null ? undefined : { scale: 0.975 }}
              whileDrag={{ scale: 1.045, rotate: 0, zIndex: 9, cursor: "grabbing" }}
              transition={{ duration: reduceMotion ? 0.08 : 0.18, ease: EASE_OUT }}
              onFocus={() => handleRecentHover(index)}
              onBlur={handleRecentLeave}
              onDragStart={() => {
                draggedKeyRef.current = key;
              }}
              onDragEnd={(_, info) => handleDragEnd(asset, info)}
              onClick={() => {
                if (draggedKeyRef.current !== key) addAsset(asset);
              }}
              aria-label={uiText("将{{ui:0}}素材「{{ui:1}}」添加到画板", [sourceLabel(asset.source), asset.boardName])}
              className="group h-full w-full touch-none cursor-grab overflow-hidden rounded-lg bg-card text-left shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <img
                src={asset.thumbnailUrl || asset.dataUrl}
                alt=""
                draggable={false}
                className="h-[156px] w-full select-none object-cover transition-transform duration-200 ease-out group-hover:scale-[1.015] motion-reduce:transition-none"
              />
              <span className="flex h-12 items-center justify-between gap-3 bg-card px-3.5">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-foreground">{asset.boardName}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">{sourceLabel(asset.source)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Plus className="h-3.5 w-3.5" />
                  {uiText("添加")}</span>
              </span>
            </motion.button>
          </div>
        );
      }) : null}

      {!loading && assets.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-md">
            <Library className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">{uiText("还没有最近素材")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{uiText("导入或生成图片后会出现在这里。")}</p>
        </div>
      ) : null}
    </div>
  );
}
