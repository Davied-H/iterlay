import { useEffect, useMemo, useRef, useState } from "react";

export function boardLibraryRange(count: number, columns: number, rowHeight: number, gap: number, scrollTop: number, viewport: number, pinnedIndex = -1) {
  const stride = Math.max(1, rowHeight + gap);
  const rows = Math.ceil(count / columns);
  let first = Math.min(Math.max(0, rows - 1), Math.max(0, Math.floor(scrollTop / stride) - 3));
  let last = Math.max(first + 1, Math.min(rows, Math.ceil((scrollTop + viewport) / stride) + 3));
  if (pinnedIndex >= 0) { first = Math.min(first, Math.floor(pinnedIndex / columns)); last = Math.max(last, Math.floor(pinnedIndex / columns) + 1); }
  return { start: first * columns, end: Math.min(count, last * columns), top: first * stride, bottom: Math.max(0, (rows - last) * stride) };
}

/** Measure the existing CSS grid rather than duplicating its responsive rules. */
export function useBoardLibraryWindow(count: number, mode: "grid" | "list", filterKey: string, pinnedIndex = -1) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [measurements, setMeasurements] = useState({ columns: 1, rowHeight: 120, gap: 0, scrollTop: 0, viewport: 600 });
  useEffect(() => {
    const scroll = scrollRef.current, content = contentRef.current;
    if (!scroll || !content || count <= 80) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const row = content.querySelector<HTMLElement>("[data-board-row]");
      const style = getComputedStyle(content);
      const columns = mode === "grid" ? Math.max(1, style.gridTemplateColumns.split(/\s+/u).filter(Boolean).length) : 1;
      const rowHeight = row?.getBoundingClientRect().height || (mode === "grid" ? 220 : 64);
      const gap = mode === "grid" ? Number.parseFloat(style.rowGap) || 0 : 0;
      const stride = Math.max(1, rowHeight + gap);
      const next = { columns, rowHeight, gap, scrollTop: Math.floor(scroll.scrollTop / stride) * stride, viewport: scroll.clientHeight || 600 };
      setMeasurements((previous) => Object.keys(next).every((key) => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    observer?.observe(scroll);
    observer?.observe(content);
    scroll.addEventListener("scroll", schedule, { passive: true });
    measure();
    return () => { observer?.disconnect(); scroll.removeEventListener("scroll", schedule); if (frame) cancelAnimationFrame(frame); };
  }, [count, mode]);
  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = 0;
    setMeasurements((previous) => previous.scrollTop ? { ...previous, scrollTop: 0 } : previous);
  }, [filterKey, mode]);
  const range = useMemo(() => count <= 80 ? { start: 0, end: count, top: 0, bottom: 0 } :
    boardLibraryRange(count, measurements.columns, measurements.rowHeight, measurements.gap, measurements.scrollTop, measurements.viewport, pinnedIndex),
  [count, measurements, pinnedIndex]);
  return { scrollRef, contentRef, ...range };
}
