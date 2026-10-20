import { useUiText } from "@/i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gsap, useGSAP } from "@/lib/gsap";
import { WelcomeTourStep } from "./WelcomeTourStep";
import type { LicenseState } from "@shared/licensing";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** 高亮目标的 CSS 选择器；多个选择器时取矩形并集。缺省 = 无聚光灯的居中卡片。 */
  selectors?: string[];
  /** 气泡相对聚光灯的方位；空间不足时自动翻转。缺省按洞在屏幕上下半区自动挑选。 */
  placement?: "top" | "bottom" | "right" | "left";
  spotlightPadding?: number;
  /** "下一步"按钮的自定义文案（如欢迎步的"开始了解"）。 */
  nextLabel?: string;
  /** 锚点由步骤副作用在运行时才创建（如演示占位卡），跳过挂载时的存在性过滤。 */
  lazy?: boolean;
  /** 演示步骤：n 毫秒后自动推进，期间隐藏上一步/下一步（仍可 Esc / × 跳过）。 */
  autoAdvanceMs?: number;
  /** 无聚光灯的沉浸式首次欢迎场景。 */
  variant?: "welcome";
}

export interface TourDefinition {
  id: "board" | "edit" | "library" | "gallery";
  version: number;
  steps: TourStep[];
}

type Placement = NonNullable<TourStep["placement"]>;

interface HoleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SPOTLIGHT_RADIUS = 8;
const DEFAULT_SPOTLIGHT_PADDING = 6;
const BUBBLE_GAP = 14;
const EDGE_MARGIN = 12;

function measureUnionRect(selectors: string[], padding: number): HoleRect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let found = false;
  for (const selector of selectors) {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) continue;
      found = true;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
  }
  if (!found) return null;
  return {
    x: left - padding,
    y: top - padding,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2
  };
}

function sameRect(a: HoleRect | null, b: HoleRect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/**
 * evenodd 打洞路径：外框矩形 + 圆角矩形洞。
 * 无洞的步骤用屏幕中心的零尺寸洞占位，保证前后两步的 path 命令结构一致，
 * CSS `d` 过渡（Chromium/Electron 支持）才能在步骤间平滑滑动。
 */
function spotlightPath(viewportWidth: number, viewportHeight: number, hole: HoleRect | null): string {
  const f = (value: number): number => Math.round(value * 10) / 10;
  const { x, y, width, height } = hole ?? {
    x: viewportWidth / 2,
    y: viewportHeight / 2,
    width: 0,
    height: 0
  };
  const r = f(Math.max(0, Math.min(SPOTLIGHT_RADIUS, width / 2, height / 2)));
  const w = f(Math.max(0, width - 2 * r));
  const h = f(Math.max(0, height - 2 * r));
  return (
    `M0 0H${f(viewportWidth)}V${f(viewportHeight)}H0Z` +
    `M${f(x + r)} ${f(y)}h${w}a${r} ${r} 0 0 1 ${r} ${r}v${h}a${r} ${r} 0 0 1 ${-r} ${r}h${-w}a${r} ${r} 0 0 1 ${-r} ${-r}v${-h}a${r} ${r} 0 0 1 ${r} ${-r}Z`
  );
}

function oppositePlacement(placement: Placement): Placement {
  switch (placement) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

function resolvePlacement(
  hole: HoleRect,
  preferred: Placement | undefined,
  bubbleWidth: number,
  bubbleHeight: number,
  viewportWidth: number,
  viewportHeight: number
): Placement {
  const fits: Record<Placement, boolean> = {
    top: hole.y - BUBBLE_GAP - bubbleHeight >= EDGE_MARGIN,
    bottom: hole.y + hole.height + BUBBLE_GAP + bubbleHeight <= viewportHeight - EDGE_MARGIN,
    left: hole.x - BUBBLE_GAP - bubbleWidth >= EDGE_MARGIN,
    right: hole.x + hole.width + BUBBLE_GAP + bubbleWidth <= viewportWidth - EDGE_MARGIN
  };
  const order: Placement[] = preferred
    ? [preferred, oppositePlacement(preferred), "bottom", "top", "right", "left"]
    : hole.y + hole.height / 2 < viewportHeight / 2
      ? ["bottom", "top", "right", "left"]
      : ["top", "bottom", "right", "left"];
  return order.find((placement) => fits[placement]) ?? preferred ?? "bottom";
}

function bubblePosition(
  hole: HoleRect,
  placement: Placement,
  bubbleWidth: number,
  bubbleHeight: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  let x: number;
  let y: number;
  switch (placement) {
    case "top":
      x = hole.x + hole.width / 2 - bubbleWidth / 2;
      y = hole.y - BUBBLE_GAP - bubbleHeight;
      break;
    case "bottom":
      x = hole.x + hole.width / 2 - bubbleWidth / 2;
      y = hole.y + hole.height + BUBBLE_GAP;
      break;
    case "left":
      x = hole.x - BUBBLE_GAP - bubbleWidth;
      y = hole.y + hole.height / 2 - bubbleHeight / 2;
      break;
    case "right":
      x = hole.x + hole.width + BUBBLE_GAP;
      y = hole.y + hole.height / 2 - bubbleHeight / 2;
      break;
  }
  return {
    x: Math.min(Math.max(x, EDGE_MARGIN), Math.max(EDGE_MARGIN, viewportWidth - bubbleWidth - EDGE_MARGIN)),
    y: Math.min(Math.max(y, EDGE_MARGIN), Math.max(EDGE_MARGIN, viewportHeight - bubbleHeight - EDGE_MARGIN))
  };
}

interface FeatureTourProps {
  tour: TourDefinition;
  onFinish: (status: "completed" | "skipped") => void;
  /** 进入某步时回调（含首步），宿主用它执行演示副作用（自动输入、插入演示图等）。 */
  onStepEnter?: (stepId: string) => void;
  welcomeCreditBalance?: number;
  welcomeLicenseState?: LicenseState | null;
  onWelcomeUseOfficial?: () => void;
  onWelcomeConnectProvider?: () => void;
  onWelcomeOpenLicense?: () => void;
}

/**
 * 交互式引导运行时：SVG evenodd 打洞聚光灯 + 锚点定位气泡。
 * 引导期间为模态（遮罩拦截指针、capture 阶段拦截应用快捷键），
 * ← → 前后步、Esc 跳过；遵循 prefers-reduced-motion。
 */
export function FeatureTour({
  tour,
  onFinish,
  onStepEnter,
  welcomeCreditBalance,
  welcomeLicenseState,
  onWelcomeUseOfficial,
  onWelcomeConnectProvider,
  onWelcomeOpenLicense
}: FeatureTourProps): React.ReactElement | null {
  const uiText = useUiText();

  const reduceMotion = useReducedMotion();
  // 挂载时解析一次可用步骤：锚点缺失的步骤剔除（无锚点的欢迎步与 lazy 步骤恒保留），避免指向不存在的元素。
  const [steps] = useState<TourStep[]>(() =>
    tour.steps.filter((step) => !step.selectors || step.lazy || measureUnionRect(step.selectors, 0) !== null)
  );
  const [index, setIndex] = useState(0);
  const step: TourStep | null = steps[index] ?? null;
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [hole, setHole] = useState<HoleRect | null>(null);
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  // 首次定位瞬时落位（此前气泡不可见），之后的移动才做位移过渡。
  const [entered, setEntered] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<SVGPathElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const finishedRef = useRef(false);

  const finish = useCallback(
    (status: "completed" | "skipped"): void => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish(status);
    },
    [onFinish]
  );

  const goNext = useCallback((): void => {
    if (index >= steps.length - 1) finish("completed");
    else setIndex(index + 1);
  }, [index, steps.length, finish]);

  const goPrev = useCallback((): void => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  // 所有步骤都不可用（异常情况）时直接结束，不留全屏遮罩。
  useEffect(() => {
    if (steps.length === 0) finish("skipped");
  }, [steps.length, finish]);

  // 进入步骤时通知宿主执行演示副作用（自动输入、插入演示图等）。用 ref 避免回调引用变化重复触发。
  const onStepEnterRef = useRef(onStepEnter);
  onStepEnterRef.current = onStepEnter;
  useEffect(() => {
    if (step) onStepEnterRef.current?.(step.id);
  }, [step]);

  // 演示步骤自动推进。
  useEffect(() => {
    if (!step?.autoAdvanceMs) return;
    const timer = window.setTimeout(goNext, step.autoAdvanceMs);
    return () => window.clearTimeout(timer);
  }, [step, goNext]);

  // 步骤切换、目标尺寸变化与滚动时重测洞的位置。
  useLayoutEffect(() => {
    if (!step) return;
    const update = (): void => {
      setViewport((prev) =>
        prev.width === window.innerWidth && prev.height === window.innerHeight
          ? prev
          : { width: window.innerWidth, height: window.innerHeight }
      );
      const next = step.selectors
        ? measureUnionRect(step.selectors, step.spotlightPadding ?? DEFAULT_SPOTLIGHT_PADDING)
        : null;
      setHole((prev) => {
        // 锚点短暂消失（如列表重渲染）时保留上一帧，避免洞跳回中心。
        if (step.selectors && next === null) return prev;
        return sameRect(prev, next) ? prev : next;
      });
    };
    update();
    const resizeObserver = new ResizeObserver(update);
    const observeTargets = (): number => {
      if (!step.selectors) return 0;
      const targets = step.selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector))
      );
      targets.forEach((target) => resizeObserver.observe(target));
      return targets.length;
    };
    const targetCount = observeTargets();
    let mutationObserver: MutationObserver | null = null;
    if (targetCount === 0 && step.selectors) {
      mutationObserver = new MutationObserver(() => {
        if (observeTargets() > 0) mutationObserver?.disconnect();
        update();
      });
    }
    mutationObserver?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  // 气泡先隐形渲染测尺寸，再定位；洞或视口变化时随之重排。
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble || !step) return;
    const bubbleWidth = bubble.offsetWidth;
    const bubbleHeight = bubble.offsetHeight;
    const next = hole
      ? bubblePosition(
          hole,
          resolvePlacement(hole, step.placement, bubbleWidth, bubbleHeight, viewport.width, viewport.height),
          bubbleWidth,
          bubbleHeight,
          viewport.width,
          viewport.height
        )
      : { x: (viewport.width - bubbleWidth) / 2, y: (viewport.height - bubbleHeight) / 2 };
    setBubblePos((prev) =>
      prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next
    );
  }, [step, hole, viewport]);

  const bubbleReady = bubblePos !== null;
  useEffect(() => {
    if (!bubbleReady || entered) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [bubbleReady, entered]);

  // 打开时记录焦点，结束后归还；每步聚焦主按钮，Enter 即推进。
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    // 自动推进的演示步骤没有主按钮，焦点落到气泡容器上保证 Esc / 读屏可达。
    if (bubbleReady) (primaryButtonRef.current ?? bubbleRef.current)?.focus();
  }, [index, bubbleReady]);

  // 引导是模态的：capture 阶段拦截应用层快捷键（Tab / Enter 的浏览器默认行为不受影响）。
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish("skipped");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
      event.stopPropagation();
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [finish, goNext, goPrev]);

  const animatedPath = spotlightPath(viewport.width, viewport.height, hole);
  const initialPathRef = useRef(animatedPath);

  useGSAP(() => {
    if (!step || step.variant === "welcome") return;
    const path = spotlightRef.current;
    const bubble = bubbleRef.current;
    if (!path || !bubble || !bubblePos) return;

    const duration = entered && !reduceMotion ? 0.32 : 0;
    const timeline = gsap.timeline({ defaults: { overwrite: "auto" } });
    timeline
      .to(path, { attr: { d: animatedPath }, duration, ease: "power3.out" }, 0)
      .to(bubble, { x: bubblePos.x, y: bubblePos.y, duration, ease: "power3.out" }, 0);
  }, {
    dependencies: [animatedPath, bubblePos?.x, bubblePos?.y, entered, reduceMotion, step?.id],
    revertOnUpdate: false
  });

  useGSAP(() => {
    if (!step || step.variant === "welcome" || !contentRef.current) return;
    if (reduceMotion) {
      gsap.set(contentRef.current, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(contentRef.current, { opacity: 0, y: 5 }, {
      opacity: 1,
      y: 0,
      duration: 0.2,
      delay: 0.06,
      ease: "power3.out"
    });
  }, { dependencies: [reduceMotion, step?.id], revertOnUpdate: true });

  if (!step) return null;

  const titleId = `feature-tour-${tour.id}-title`;
  const bodyId = `feature-tour-${tour.id}-body`;

  if (step.variant === "welcome") {
    return createPortal(
      <WelcomeTourStep
        titleId={titleId}
        descriptionId={bodyId}
        title={uiText(step.title)}
        description={uiText(step.body)}
        reduceMotion={Boolean(reduceMotion)}
        creditBalance={welcomeCreditBalance}
        licenseState={welcomeLicenseState}
        onContinue={() => {
          onWelcomeUseOfficial?.();
          goNext();
        }}
        onConnectProvider={() => {
          finish("skipped");
          onWelcomeConnectProvider?.();
        }}
        onOpenLicense={() => {
          finish("skipped");
          onWelcomeOpenLicense?.();
        }}
      />,
      document.body
    );
  }

  const isLast = index === steps.length - 1;
  const progressOffset = steps[0]?.variant === "welcome" ? 1 : 0;
  const progressCurrent = index + 1 - progressOffset;
  const progressTotal = steps.length - progressOffset;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[90]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE_OUT }}
      onMouseDown={(event) => {
        if (!bubbleRef.current?.contains(event.target as Node)) event.preventDefault();
      }}
    >
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <path
          ref={spotlightRef}
          d={initialPathRef.current}
          fillRule="evenodd"
          className="fill-zinc-950/40 dark:fill-zinc-950/60"
        />
      </svg>

      <div
        ref={bubbleRef}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="absolute left-0 top-0 w-80 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none"
        style={{
          visibility: bubbleReady ? "visible" : "hidden"
        }}
      >
        <button
          type="button"
          aria-label={uiText("跳过引导")}
          onClick={() => finish("skipped")}
          className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div
          ref={contentRef}
          key={step.id}
        >
          <p id={titleId} className="pr-6 text-sm font-semibold leading-5">
            {uiText(step.title)}
          </p>
          <p id={bodyId} className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
            {uiText(step.body)}
          </p>
          <div className="mt-3.5 flex items-center justify-between gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              {progressCurrent} / {progressTotal}
            </span>
            {step.autoAdvanceMs ? null : (
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => finish("skipped")}>
                  {uiText("跳过")}</Button>
                {index > 0 ? (
                  <Button variant="ghost" size="sm" onClick={goPrev}>
                    {uiText("上一步")}</Button>
                ) : null}
                <Button ref={primaryButtonRef} size="sm" onClick={goNext}>
                  {isLast ? uiText("完成") : uiText(step.nextLabel ?? "下一步")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>,
    document.body
  );
}
