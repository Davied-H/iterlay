import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  computeMasonryLayout,
  computeVisibleKeys,
  type MasonryItemInput,
  type MasonryLayout,
  type MasonryLayoutOptions
} from "@/lib/masonry";

/** 滚动位置量化步长：跨过该阈值才触发窗口重算，滚动时不逐帧 setState。 */
const SCROLL_QUANTUM = 300;
/** 视口上下各多渲染的距离；须大于量化误差（±SCROLL_QUANTUM/2）。 */
const OVERSCAN = 1600;
export interface MasonryGridState {
  layout: MasonryLayout;
  visibleKeys: Set<string>;
  totalHeight: number;
  viewportHeight: number;
}

/**
 * 瀑布流布局 + 视口窗口化：观测滚动容器的尺寸与滚动位置，
 * 输出绝对定位 rect 与应渲染的 key 集合。布局本身是纯函数（src/lib/masonry.ts）。
 */
export function useMasonryGrid(params: {
  items: MasonryItemInput[];
  scrollRef: RefObject<HTMLDivElement | null>;
  /** 滚动容器左右 padding 合计（p-6 → 48）。 */
  horizontalPadding?: number;
  layoutOptions?: MasonryLayoutOptions;
}): MasonryGridState {
  const { items, scrollRef, horizontalPadding = 48, layoutOptions } = params;
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollBucket, setScrollBucket] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => {
      const width = Math.max(0, element.clientWidth - horizontalPadding);
      setViewportHeight(element.clientHeight);
      setContainerWidth(width);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRef, horizontalPadding]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const bucket = Math.round(element.scrollTop / SCROLL_QUANTUM);
        setScrollBucket((previous) => (previous === bucket ? previous : bucket));
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef]);

  const layout = useMemo(
    () => computeMasonryLayout(items, containerWidth, layoutOptions),
    [containerWidth, items, layoutOptions]
  );

  const visibleKeys = useMemo(
    () => computeVisibleKeys(layout, scrollBucket * SCROLL_QUANTUM, viewportHeight, OVERSCAN),
    [layout, scrollBucket, viewportHeight]
  );

  return { layout, visibleKeys, totalHeight: layout.totalHeight, viewportHeight };
}
