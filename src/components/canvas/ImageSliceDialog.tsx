import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCheck,
  Grid2X2,
  GripHorizontal,
  GripVertical,
  LayoutGrid,
  Loader2,
  Move,
  Minus,
  Plus,
  RotateCcw,
  ScanSearch,
  Scissors,
  Shuffle,
  Sparkles,
  SquareDashed,
  X,
  ZoomIn
} from "lucide-react";
import type { ImageCropRect, SliceSubjectDetection } from "@shared/types";
import {
  calculateSliceGridDividers,
  calculateSliceGridFromDividers,
  MAX_SLICE_GRID_SIZE
} from "@shared/image-slicing";
import {
  calculateCenteredSubjectCrops,
  detectSliceSubjects,
  type SubjectCropAdjustment
} from "@shared/subject-detection";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  createFreeCropFromPoints,
  createInitialFreeCrop,
  moveFreeCrop,
  resizeFreeCrop,
  type FreeCropHandle
} from "./free-crop";
import type { GeneratedImage } from "./ImageNode";

export interface SliceSelection {
  rows: number;
  columns: number;
  resultLayout: SliceResultLayout;
  items: Array<{ index: number; crop: ImageCropRect }>;
}

interface ImageSliceDialogProps {
  open: boolean;
  image: GeneratedImage | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: SliceSelection) => Promise<void>;
  onAnalyzeSubjects?: (crops: ImageCropRect[]) => Promise<SliceSubjectDetection[]>;
  aiAvailable?: boolean;
  aiProviderName?: string;
}

export type SliceResultLayout = "source-grid" | "compact";
type CropMode = "free" | "grid";
type SubjectMode = "original" | "local" | "ai";
type AnalysisStatus = "idle" | "analyzing" | "ready" | "error";

const MIN_PREVIEW_ZOOM = 1;
const MAX_PREVIEW_ZOOM = 8;

const PRESETS = [
  { rows: 1, columns: 2 },
  { rows: 2, columns: 1 },
  { rows: 2, columns: 2 },
  { rows: 3, columns: 3 },
  { rows: 4, columns: 4 }
] as const;
type DividerAxis = "x" | "y";

function numericValue(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scaleCrop(crop: ImageCropRect, scale: number, width: number, height: number): ImageCropRect {
  const x = clamp(Math.floor(crop.x * scale), 0, width - 1);
  const y = clamp(Math.floor(crop.y * scale), 0, height - 1);
  const right = clamp(Math.ceil((crop.x + crop.width) * scale), x + 1, width);
  const bottom = clamp(Math.ceil((crop.y + crop.height) * scale), y + 1, height);
  return { x, y, width: right - x, height: bottom - y };
}

function expandCrop(crop: ImageCropRect, imageWidth: number, imageHeight: number, ratio = 0.22): ImageCropRect {
  const horizontal = Math.round(crop.width * ratio);
  const vertical = Math.round(crop.height * ratio);
  const x = Math.max(0, crop.x - horizontal);
  const y = Math.max(0, crop.y - vertical);
  const right = Math.min(imageWidth, crop.x + crop.width + horizontal);
  const bottom = Math.min(imageHeight, crop.y + crop.height + vertical);
  return { x, y, width: right - x, height: bottom - y };
}

export function ImageSliceDialog({
  open,
  image,
  onOpenChange,
  onConfirm,
  onAnalyzeSubjects,
  aiAvailable = false,
  aiProviderName = "当前 Provider"
}: ImageSliceDialogProps): React.ReactElement {
  const segmentedLayoutId = useId();
  const [rows, setRows] = useState(4);
  const [columns, setColumns] = useState(4);
  const [margin, setMargin] = useState(0);
  const [gap, setGap] = useState(0);
  const [xDividers, setXDividers] = useState<number[]>([]);
  const [yDividers, setYDividers] = useState<number[]>([]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(Array.from({ length: 16 }, (_, index) => index)));
  const [resultLayout, setResultLayout] = useState<SliceResultLayout>("compact");
  const [cropMode, setCropMode] = useState<CropMode>("free");
  const [freeCrop, setFreeCrop] = useState<ImageCropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [subjectMode, setSubjectMode] = useState<SubjectMode>("local");
  const [paddingPercent, setPaddingPercent] = useState(12);
  const [normalizeScale, setNormalizeScale] = useState(true);
  const [constrainToGrid, setConstrainToGrid] = useState(true);
  const [localDetections, setLocalDetections] = useState<SliceSubjectDetection[]>([]);
  const [aiDetections, setAiDetections] = useState<SliceSubjectDetection[]>([]);
  const [localStatus, setLocalStatus] = useState<AnalysisStatus>("idle");
  const [aiStatus, setAiStatus] = useState<AnalysisStatus>("idle");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState({ completed: 0, total: 0 });
  const [adjustments, setAdjustments] = useState<Record<number, SubjectCropAdjustment>>({});
  const [activeSubjectIndex, setActiveSubjectIndex] = useState(0);
  const [imageLoadRevision, setImageLoadRevision] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(MIN_PREVIEW_ZOOM);
  const [basePreviewSize, setBasePreviewSize] = useState({ width: 1, height: 1 });
  const [previewViewportElement, setPreviewViewportElement] = useState<HTMLDivElement | null>(null);
  const previewZoomRef = useRef(MIN_PREVIEW_ZOOM);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const analysisRevisionRef = useRef(0);
  const subjectDragRef = useRef<{
    index: number;
    clientX: number;
    clientY: number;
    adjustment: SubjectCropAdjustment;
  } | null>(null);
  const freeCropDragRef = useRef<{
    kind: "create" | "move" | "resize";
    clientX: number;
    clientY: number;
    sourcePoint: { x: number; y: number };
    crop: ImageCropRect;
    handle?: FreeCropHandle;
  } | null>(null);
  const imageId = image?.id;
  const reducedMotion = useReducedMotion();

  const connectPreviewViewport = useCallback((node: HTMLDivElement | null): void => {
    previewViewportRef.current = node;
    setPreviewViewportElement(node);
  }, []);

  const updatePreviewZoom = useCallback((
    getNextZoom: (current: number) => number,
    clientX?: number,
    clientY?: number
  ): void => {
    const current = previewZoomRef.current;
    const next = clamp(getNextZoom(current), MIN_PREVIEW_ZOOM, MAX_PREVIEW_ZOOM);
    if (Math.abs(next - current) < 0.001) return;

    previewZoomRef.current = next;
    const viewport = previewViewportRef.current;
    const preview = previewRef.current;
    if (!viewport || !preview) {
      setPreviewZoom(next);
      return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const anchorX = clientX ?? viewportRect.left + viewportRect.width / 2;
    const anchorY = clientY ?? viewportRect.top + viewportRect.height / 2;
    const ratioX = clamp((anchorX - previewRect.left) / previewRect.width, 0, 1);
    const ratioY = clamp((anchorY - previewRect.top) / previewRect.height, 0, 1);

    setPreviewZoom(next);
    window.requestAnimationFrame(() => {
      const nextViewport = previewViewportRef.current;
      const nextPreview = previewRef.current;
      if (!nextViewport || !nextPreview) return;
      const nextRect = nextPreview.getBoundingClientRect();
      nextViewport.scrollLeft += nextRect.left + ratioX * nextRect.width - anchorX;
      nextViewport.scrollTop += nextRect.top + ratioY * nextRect.height - anchorY;
    });
  }, []);

  useEffect(() => {
    if (!open || !imageId) return;
    setRows(4);
    setColumns(4);
    setMargin(0);
    setGap(0);
    setSelected(new Set(Array.from({ length: 16 }, (_, index) => index)));
    setResultLayout("compact");
    setCropMode("free");
    setFreeCrop(createInitialFreeCrop(image?.width ?? 1, image?.height ?? 1));
    setSubjectMode("local");
    setPaddingPercent(12);
    setNormalizeScale(true);
    setConstrainToGrid(true);
    setLocalDetections([]);
    setAiDetections([]);
    setLocalStatus("idle");
    setAiStatus("idle");
    setAnalysisError("");
    setAnalysisProgress({ completed: 0, total: 0 });
    setAdjustments({});
    setActiveSubjectIndex(0);
    setSubmitting(false);
    previewZoomRef.current = MIN_PREVIEW_ZOOM;
    setPreviewZoom(MIN_PREVIEW_ZOOM);
  }, [image?.height, image?.width, imageId, open]);

  useLayoutEffect(() => {
    const viewport = previewViewportElement;
    if (!open || !viewport || !image?.width || !image.height) return;
    const imageWidth = image.width;
    const imageHeight = image.height;

    const updatePreviewSize = (): void => {
      const styles = window.getComputedStyle(viewport);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
      const availableWidth = Math.max(1, viewport.clientWidth - horizontalPadding);
      const availableHeight = Math.max(1, viewport.clientHeight - verticalPadding);
      const fitScale = Math.min(1, availableWidth / imageWidth, availableHeight / imageHeight);
      setBasePreviewSize({
        width: Math.max(1, imageWidth * fitScale),
        height: Math.max(1, imageHeight * fitScale)
      });
    };

    updatePreviewSize();
    const observer = new ResizeObserver(updatePreviewSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [image?.height, image?.width, open, previewViewportElement]);

  useEffect(() => {
    const viewport = previewViewportElement;
    if (!open || !viewport) return;

    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const deltaMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? viewport.clientHeight
          : 1;
      const delta = event.deltaY * deltaMultiplier;
      const factor = Math.exp(clamp(-delta * 0.0015, -0.35, 0.35));
      updatePreviewZoom((current) => current * factor, event.clientX, event.clientY);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [imageId, open, previewViewportElement, updatePreviewZoom]);

  useEffect(() => {
    setSelected(new Set(Array.from({ length: rows * columns }, (_, index) => index)));
    setActiveSubjectIndex((current) => Math.min(current, rows * columns - 1));
  }, [columns, rows]);

  useEffect(() => {
    if (!image?.width || !image.height) return;
    try {
      const dividers = calculateSliceGridDividers({
        width: image.width,
        height: image.height,
        rows,
        columns,
        margin,
        gap
      });
      setXDividers(dividers.x);
      setYDividers(dividers.y);
    } catch {
      setXDividers([]);
      setYDividers([]);
    }
  }, [columns, gap, image?.height, image?.width, margin, rows]);

  const grid = useMemo(() => {
    if (!image?.width || !image.height) return { crops: [] as ImageCropRect[], error: "无法读取图片尺寸。" };
    try {
      return {
        crops: calculateSliceGridFromDividers(
          { width: image.width, height: image.height, rows, columns, margin, gap },
          { x: xDividers, y: yDividers }
        ),
        error: ""
      };
    } catch (error) {
      return { crops: [] as ImageCropRect[], error: error instanceof Error ? error.message : "切图参数无效。" };
    }
  }, [columns, gap, image?.height, image?.width, margin, rows, xDividers, yDividers]);

  const gridKey = useMemo(
    () => grid.crops.map((crop) => `${crop.x},${crop.y},${crop.width},${crop.height}`).join(";"),
    [grid.crops]
  );

  const subjectAnalysisCrops = useMemo(() => {
    if (constrainToGrid || !image?.width || !image.height) return grid.crops;
    return grid.crops.map((crop) => expandCrop(crop, image.width as number, image.height as number));
  }, [constrainToGrid, grid.crops, image?.height, image?.width]);

  useEffect(() => {
    setAiDetections([]);
    setAiStatus("idle");
    setAnalysisError("");
    setAdjustments({});
    const revision = ++analysisRevisionRef.current;
    if (cropMode !== "grid" || !open || grid.error || grid.crops.length === 0 || !image?.width || !image.height) {
      setLocalDetections([]);
      setLocalStatus("idle");
      setAnalysisProgress({ completed: 0, total: 0 });
      return;
    }
    const imageElement = imageRef.current;
    if (!imageElement?.complete || imageElement.naturalWidth === 0) {
      setLocalStatus("idle");
      return;
    }
    const sourceWidth = image.width;
    const sourceHeight = image.height;

    setLocalDetections([]);
    setLocalStatus("analyzing");
    setAnalysisProgress({ completed: 0, total: grid.crops.length });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const scale = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight));
          const analysisWidth = Math.max(1, Math.round(sourceWidth * scale));
          const analysisHeight = Math.max(1, Math.round(sourceHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = analysisWidth;
          canvas.height = analysisHeight;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("当前环境不支持像素分析。");
          context.drawImage(imageElement, 0, 0, analysisWidth, analysisHeight);
          const pixels = context.getImageData(0, 0, analysisWidth, analysisHeight);
          const scaledCrops = subjectAnalysisCrops.map((crop) => scaleCrop(crop, scale, analysisWidth, analysisHeight));
          const scaledFocusCrops = grid.crops.map((crop) => scaleCrop(crop, scale, analysisWidth, analysisHeight));
          const detections: SliceSubjectDetection[] = [];

          for (let index = 0; index < scaledCrops.length; index += 1) {
            if (analysisRevisionRef.current !== revision) return;
            const detected = detectSliceSubjects(pixels, [scaledCrops[index]], [scaledFocusCrops[index]])[0];
            if (detected) {
              const cell = grid.crops[index];
              const detectionLimit = constrainToGrid ? cell : subjectAnalysisCrops[index];
              const x = clamp(
                Math.round(detected.bounds.x / scale),
                detectionLimit.x,
                detectionLimit.x + detectionLimit.width - 1
              );
              const y = clamp(
                Math.round(detected.bounds.y / scale),
                detectionLimit.y,
                detectionLimit.y + detectionLimit.height - 1
              );
              const right = clamp(
                Math.round((detected.bounds.x + detected.bounds.width) / scale),
                x + 1,
                detectionLimit.x + detectionLimit.width
              );
              const bottom = clamp(
                Math.round((detected.bounds.y + detected.bounds.height) / scale),
                y + 1,
                detectionLimit.y + detectionLimit.height
              );
              detections.push({
                ...detected,
                index,
                bounds: { x, y, width: right - x, height: bottom - y }
              });
              setLocalDetections([...detections]);
            }
            setAnalysisProgress({ completed: index + 1, total: scaledCrops.length });
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
          }
          if (analysisRevisionRef.current !== revision) return;
          setLocalStatus("ready");
        } catch (error) {
          if (analysisRevisionRef.current !== revision) return;
          setLocalDetections([]);
          setLocalStatus("error");
          setAnalysisError(error instanceof Error ? error.message : "本地主体识别失败。");
        }
      })();
    }, 160);
    return () => {
      window.clearTimeout(timer);
      if (analysisRevisionRef.current === revision) analysisRevisionRef.current += 1;
    };
  }, [constrainToGrid, cropMode, grid.crops, grid.error, gridKey, image?.height, image?.width, imageId, imageLoadRevision, open, subjectAnalysisCrops]);

  const effectiveDetections = useMemo(() => {
    if (subjectMode === "original") return [];
    if (subjectMode === "local") return localDetections;
    const aiByIndex = new Map(aiDetections.map((detection) => [detection.index, detection]));
    return localDetections.map((detection) => aiByIndex.get(detection.index) ?? detection).concat(
      aiDetections.filter((detection) => !localDetections.some((local) => local.index === detection.index))
    ).sort((a, b) => a.index - b.index);
  }, [aiDetections, localDetections, subjectMode]);

  const outputCrops = useMemo(() => {
    if (subjectMode === "original") return grid.crops;
    return calculateCenteredSubjectCrops(grid.crops, effectiveDetections, {
      paddingRatio: paddingPercent / 100,
      normalizeScale,
      adjustments,
      constrainToCell: constrainToGrid,
      imageWidth: image?.width,
      imageHeight: image?.height
    });
  }, [adjustments, constrainToGrid, effectiveDetections, grid.crops, image?.height, image?.width, normalizeScale, paddingPercent, subjectMode]);

  const selectedCount = selected.size;
  const sliceSizeSummary = useMemo(() => {
    const selectedCrops = outputCrops.filter((_, index) => selected.has(index));
    if (selectedCrops.length === 0) return "-";
    const widths = selectedCrops.map((crop) => crop.width);
    const heights = selectedCrops.map((crop) => crop.height);
    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);
    if (minWidth === maxWidth && minHeight === maxHeight) return `${minWidth} × ${minHeight}`;
    return `${minWidth}-${maxWidth} × ${minHeight}-${maxHeight}`;
  }, [outputCrops, selected]);

  const defaultDividers = useMemo(() => {
    if (!image?.width || !image.height) return null;
    try {
      return calculateSliceGridDividers({ width: image.width, height: image.height, rows, columns, margin, gap });
    } catch {
      return null;
    }
  }, [columns, gap, image?.height, image?.width, margin, rows]);

  const hasCustomDividers = Boolean(defaultDividers) && (
    defaultDividers?.x.some((value, index) => value !== xDividers[index]) ||
    defaultDividers?.y.some((value, index) => value !== yDividers[index])
  );
  const activeDetection = effectiveDetections.find((detection) => detection.index === activeSubjectIndex);
  const activeAdjustment = adjustments[activeSubjectIndex] ?? { offsetX: 0, offsetY: 0, zoom: 1 };
  const lowConfidenceCount = effectiveDetections.filter((detection) => detection.confidence < 0.55).length;
  const hasActiveAdjustment = Boolean(adjustments[activeSubjectIndex]);
  const boundaryLimitedCount = outputCrops.filter((crop, index) => {
    const cell = grid.crops[index];
    return constrainToGrid && effectiveDetections.some((detection) => detection.index === index) &&
      Boolean(cell) && (crop.width >= cell.width || crop.height >= cell.height);
  }).length;

  function applyPreset(nextRows: number, nextColumns: number): void {
    setRows(nextRows);
    setColumns(nextColumns);
    if (!image?.width || !image.height) return;
    try {
      const dividers = calculateSliceGridDividers({
        width: image.width,
        height: image.height,
        rows: nextRows,
        columns: nextColumns,
        margin,
        gap
      });
      setXDividers(dividers.x);
      setYDividers(dividers.y);
    } catch {
      // 参数输入区域会展示校验错误。
    }
  }

  function resetDividers(): void {
    if (!defaultDividers) return;
    setXDividers(defaultDividers.x);
    setYDividers(defaultDividers.y);
  }

  function selectAll(): void {
    setSelected(new Set(Array.from({ length: rows * columns }, (_, index) => index)));
  }

  function clearSelection(): void {
    setSelected(new Set());
  }

  function invertSelection(): void {
    setSelected((current) => new Set(
      Array.from({ length: rows * columns }, (_, index) => index).filter((index) => !current.has(index))
    ));
  }

  function toggleCell(index: number): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function analyzeWithAi(): Promise<void> {
    if (!onAnalyzeSubjects || !aiAvailable || grid.error || grid.crops.length === 0 || aiStatus === "analyzing") return;
    const revision = ++analysisRevisionRef.current;
    setSubjectMode("ai");
    setAiStatus("analyzing");
    setAnalysisError("");
    setAnalysisProgress({ completed: 0, total: grid.crops.length });
    try {
      const detections = await onAnalyzeSubjects(subjectAnalysisCrops);
      if (analysisRevisionRef.current !== revision) return;
      setAiDetections(detections);
      setAiStatus("ready");
      setAnalysisProgress({ completed: grid.crops.length, total: grid.crops.length });
      setAdjustments({});
    } catch (error) {
      if (analysisRevisionRef.current !== revision) return;
      setAiStatus("error");
      setAnalysisError(error instanceof Error ? error.message : "AI 主体识别失败。");
    }
  }

  function updateSubjectAdjustment(index: number, next: Partial<SubjectCropAdjustment>): void {
    setAdjustments((current) => ({
      ...current,
      [index]: {
        offsetX: current[index]?.offsetX ?? 0,
        offsetY: current[index]?.offsetY ?? 0,
        zoom: current[index]?.zoom ?? 1,
        ...next
      }
    }));
  }

  function beginSubjectDrag(event: PointerEvent<HTMLButtonElement>, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    setActiveSubjectIndex(index);
    event.currentTarget.setPointerCapture(event.pointerId);
    subjectDragRef.current = {
      index,
      clientX: event.clientX,
      clientY: event.clientY,
      adjustment: adjustments[index] ?? { offsetX: 0, offsetY: 0, zoom: 1 }
    };
    setDragging(`subject-${index}`);
  }

  function moveSubjectCrop(event: PointerEvent<HTMLButtonElement>): void {
    const drag = subjectDragRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId) || !image?.width || !image.height) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    updateSubjectAdjustment(drag.index, {
      offsetX: drag.adjustment.offsetX + ((event.clientX - drag.clientX) / rect.width) * image.width,
      offsetY: drag.adjustment.offsetY + ((event.clientY - drag.clientY) / rect.height) * image.height
    });
  }

  function endSubjectDrag(): void {
    subjectDragRef.current = null;
    setDragging(null);
  }

  function nudgeSubjectCrop(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!horizontal && !vertical) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const adjustment = adjustments[index] ?? { offsetX: 0, offsetY: 0, zoom: 1 };
    updateSubjectAdjustment(index, {
      offsetX: adjustment.offsetX + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
      offsetY: adjustment.offsetY + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)
    });
  }

  function sourcePoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect || !image?.width || !image.height) return null;
    return {
      x: clamp(((clientX - rect.left) / rect.width) * image.width, 0, image.width),
      y: clamp(((clientY - rect.top) / rect.height) * image.height, 0, image.height)
    };
  }

  function beginFreeCropCreate(event: PointerEvent<HTMLDivElement>): void {
    const point = sourcePoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    freeCropDragRef.current = {
      kind: "create",
      clientX: event.clientX,
      clientY: event.clientY,
      sourcePoint: point,
      crop: freeCrop
    };
    setFreeCrop(createFreeCropFromPoints(point, point, image?.width ?? 1, image?.height ?? 1));
    setDragging("free-create");
  }

  function beginFreeCropDrag(
    event: PointerEvent<HTMLElement>,
    kind: "move" | "resize",
    handle?: FreeCropHandle
  ): void {
    const point = sourcePoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    freeCropDragRef.current = {
      kind,
      handle,
      clientX: event.clientX,
      clientY: event.clientY,
      sourcePoint: point,
      crop: freeCrop
    };
    setDragging(`free-${kind}`);
  }

  function moveFreeCropPointer(event: PointerEvent<HTMLElement>): void {
    const drag = freeCropDragRef.current;
    if (!drag || !image?.width || !image.height) return;
    const point = sourcePoint(event.clientX, event.clientY);
    if (!point) return;
    const deltaX = point.x - drag.sourcePoint.x;
    const deltaY = point.y - drag.sourcePoint.y;
    if (drag.kind === "create") {
      setFreeCrop(createFreeCropFromPoints(drag.sourcePoint, point, image.width, image.height));
    } else if (drag.kind === "move") {
      setFreeCrop(moveFreeCrop(drag.crop, deltaX, deltaY, image.width, image.height));
    } else if (drag.handle) {
      setFreeCrop(resizeFreeCrop(drag.crop, drag.handle, deltaX, deltaY, image.width, image.height));
    }
  }

  function endFreeCropDrag(): void {
    freeCropDragRef.current = null;
    setDragging(null);
  }

  function nudgeFreeCrop(event: KeyboardEvent<HTMLElement>): void {
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!horizontal && !vertical || !image?.width || !image.height) return;
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    setFreeCrop((current) => moveFreeCrop(
      current,
      event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
      event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
      sourceWidth,
      sourceHeight
    ));
  }

  function updateFreeCropField(field: keyof ImageCropRect, value: number): void {
    if (!image?.width || !image.height) return;
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    setFreeCrop((current) => {
      const next = { ...current, [field]: Math.round(value) };
      next.width = clamp(next.width, 1, sourceWidth);
      next.height = clamp(next.height, 1, sourceHeight);
      next.x = clamp(next.x, 0, sourceWidth - next.width);
      next.y = clamp(next.y, 0, sourceHeight - next.height);
      return next;
    });
  }

  function dividerBounds(axis: DividerAxis, index: number): { min: number; max: number } {
    const dividers = axis === "x" ? xDividers : yDividers;
    const size = axis === "x" ? image?.width ?? 1 : image?.height ?? 1;
    const previousStart = index === 0 ? margin : dividers[index - 1] + gap;
    const nextEnd = index === dividers.length - 1 ? size - margin : dividers[index + 1];
    return { min: previousStart + 1, max: nextEnd - gap - 1 };
  }

  function updateDivider(axis: DividerAxis, index: number, value: number): void {
    const update = axis === "x" ? setXDividers : setYDividers;
    update((current) => {
      const size = axis === "x" ? image?.width ?? 1 : image?.height ?? 1;
      const previousStart = index === 0 ? margin : current[index - 1] + gap;
      const nextEnd = index === current.length - 1 ? size - margin : current[index + 1];
      const min = previousStart + 1;
      const max = nextEnd - gap - 1;
      const next = [...current];
      next[index] = Math.min(max, Math.max(min, Math.round(value)));
      return next;
    });
  }

  function moveDivider(event: PointerEvent<HTMLButtonElement>, axis: DividerAxis, index: number): void {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !image?.width || !image.height) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position =
      axis === "x"
        ? ((event.clientX - rect.left) / rect.width) * image.width
        : ((event.clientY - rect.top) / rect.height) * image.height;
    updateDivider(axis, index, position - gap / 2);
  }

  function nudgeDivider(event: KeyboardEvent<HTMLButtonElement>, axis: DividerAxis, index: number): void {
    const negative = axis === "x" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const positive = axis === "x" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (!negative && !positive) return;
    event.preventDefault();
    const current = (axis === "x" ? xDividers : yDividers)[index];
    updateDivider(axis, index, current + (positive ? 1 : -1) * (event.shiftKey ? 10 : 1));
  }

  async function confirm(): Promise<void> {
    if (!image || (cropMode === "grid" && (grid.error || selectedCount === 0)) || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({
        rows: cropMode === "free" ? 1 : rows,
        columns: cropMode === "free" ? 1 : columns,
        resultLayout,
        items: cropMode === "free"
          ? [{ index: 0, crop: freeCrop }]
          : outputCrops.flatMap((crop, index) => selected.has(index) ? [{ index, crop }] : [])
      });
      onOpenChange(false);
    } catch {
      // 上层已经展示具体错误；保留弹窗让用户修正或重试。
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[calc(100vh-48px)] max-w-[min(1180px,calc(100vw-48px))] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">切图</DialogTitle>
        <div className="grid h-[min(760px,calc(100vh-48px))] min-h-0 grid-cols-[minmax(0,1fr)_340px]">
          <section className="relative flex min-h-0 min-w-0 flex-col bg-muted/35">
            <div
              ref={connectPreviewViewport}
              className="flex min-h-0 flex-1 items-start overflow-auto p-5"
            >
              {image ? (
                <div
                  ref={previewRef}
                  className="relative m-auto shrink-0 overflow-hidden rounded-lg border border-border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] shadow-sm"
                  style={{
                    width: basePreviewSize.width * previewZoom,
                    height: basePreviewSize.height * previewZoom
                  }}
                >
                  <img
                    ref={imageRef}
                    src={image.dataUrl}
                    alt="待切图片"
                    crossOrigin="anonymous"
                    className="block h-full w-full select-none"
                    draggable={false}
                    onLoad={() => setImageLoadRevision((current) => current + 1)}
                  />
                  <AnimatePresence initial={false} mode="wait">
                  {cropMode === "free" ? (
                    <motion.div
                      key="free-crop"
                      className="absolute inset-0"
                      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 6 }}
                      transition={{ duration: reducedMotion ? 0.01 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div
                        role="presentation"
                        className="absolute inset-0 z-10 cursor-crosshair touch-none"
                        onPointerDown={beginFreeCropCreate}
                        onPointerMove={moveFreeCropPointer}
                        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onLostPointerCapture={endFreeCropDrag}
                      />
                      <div
                        role="group"
                        tabIndex={0}
                        aria-label="自由裁切区域"
                        onKeyDown={nudgeFreeCrop}
                        onPointerDown={(event) => beginFreeCropDrag(event, "move")}
                        onPointerMove={moveFreeCropPointer}
                        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onLostPointerCapture={endFreeCropDrag}
                        className="group/free-crop absolute z-20 cursor-move touch-none border-2 border-white outline-none shadow-[0_0_0_1px_rgba(0,0,0,0.8),0_0_0_9999px_rgba(0,0,0,0.52)] focus-visible:ring-2 focus-visible:ring-white"
                        style={{
                          left: `${(freeCrop.x / (image.width || 1)) * 100}%`,
                          top: `${(freeCrop.y / (image.height || 1)) * 100}%`,
                          width: `${(freeCrop.width / (image.width || 1)) * 100}%`,
                          height: `${(freeCrop.height / (image.height || 1)) * 100}%`
                        }}
                      >
                        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white shadow-sm">
                          {freeCrop.width} × {freeCrop.height}
                        </span>
                        {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                          <button
                            key={handle}
                            type="button"
                            aria-label={`调整裁切区域${handle}角`}
                            onPointerDown={(event) => beginFreeCropDrag(event, "resize", handle)}
                            onPointerMove={moveFreeCropPointer}
                            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                            onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                            onLostPointerCapture={endFreeCropDrag}
                            className={cn(
                              "absolute h-3.5 w-3.5 rounded-sm border border-black/60 bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-white",
                              handle.includes("n") ? "-top-2" : "-bottom-2",
                              handle.includes("w") ? "-left-2" : "-right-2",
                              handle === "nw" || handle === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"
                            )}
                          />
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="grid-crop"
                      className="absolute inset-0"
                      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -6 }}
                      transition={{ duration: reducedMotion ? 0.01 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                    >
                  {grid.crops.map((crop, index) => {
                    const active = selected.has(index);
                    return (
                      <button
                        key={`${crop.x}-${crop.y}-${index}`}
                        type="button"
                        aria-pressed={active}
                        aria-label={`${active ? "取消" : "选择"}第 ${index + 1} 格`}
                        onClick={() => toggleCell(index)}
                        className={cn(
                          "group/cell absolute transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-white",
                          subjectMode === "original"
                            ? "border border-white/80 outline outline-1 outline-black/30"
                            : "border border-transparent outline-none",
                          active ? "bg-white/0 hover:bg-white/10" : "bg-black/65 hover:bg-black/55"
                        )}
                        style={{
                          left: `${(crop.x / (image.width || 1)) * 100}%`,
                          top: `${(crop.y / (image.height || 1)) * 100}%`,
                          width: `${(crop.width / (image.width || 1)) * 100}%`,
                          height: `${(crop.height / (image.height || 1)) * 100}%`
                        }}
                      >
                        <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded bg-black/70 px-1 text-[10px] font-semibold tabular-nums text-white shadow-sm">
                          {active ? index + 1 : <X className="h-3 w-3 opacity-70" />}
                        </span>
                        {active ? (
                          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white opacity-0 shadow-sm transition-opacity group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100">
                            {outputCrops[index]?.width ?? crop.width} × {outputCrops[index]?.height ?? crop.height}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  <AnimatePresence initial={false}>
                  {subjectMode !== "original" ? effectiveDetections.map((detection) => {
                    if (detection.index !== activeSubjectIndex) return null;
                    const bounds = detection.bounds;
                    return (
                      <div
                        key={`subject-bounds-${detection.index}`}
                        aria-hidden
                        className="pointer-events-none absolute z-10 border border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                        style={{
                          left: `${(bounds.x / (image.width || 1)) * 100}%`,
                          top: `${(bounds.y / (image.height || 1)) * 100}%`,
                          width: `${(bounds.width / (image.width || 1)) * 100}%`,
                          height: `${(bounds.height / (image.height || 1)) * 100}%`
                        }}
                      />
                    );
                  }) : null}
                  {subjectMode !== "original" ? effectiveDetections.map((detection) => {
                    const crop = outputCrops[detection.index];
                    if (!crop) return null;
                    const active = activeSubjectIndex === detection.index;
                    const draggingSubject = dragging === `subject-${detection.index}`;
                    return (
                      <motion.button
                        key={`subject-crop-${detection.index}`}
                        type="button"
                        aria-label={`校正第 ${detection.index + 1} 格主体`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveSubjectIndex(detection.index);
                        }}
                        onKeyDown={(event) => nudgeSubjectCrop(event, detection.index)}
                        onPointerDown={(event) => beginSubjectDrag(event, detection.index)}
                        onPointerMove={moveSubjectCrop}
                        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onLostPointerCapture={endSubjectDrag}
                        className={cn(
                          "group/crop absolute z-10 cursor-move touch-none border-2 bg-transparent outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-white",
                          active || draggingSubject
                            ? "border-white shadow-[0_0_0_1px_rgba(0,0,0,0.85),0_0_0_4px_rgba(255,255,255,0.22)]"
                            : "border-white shadow-[0_0_0_1px_rgba(0,0,0,0.75)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.9),0_0_0_3px_rgba(255,255,255,0.16)]",
                          detection.confidence < 0.55 && "border-dashed"
                        )}
                        style={{
                          left: `${(crop.x / (image.width || 1)) * 100}%`,
                          top: `${(crop.y / (image.height || 1)) * 100}%`,
                          width: `${(crop.width / (image.width || 1)) * 100}%`,
                          height: `${(crop.height / (image.height || 1)) * 100}%`
                        }}
                        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reducedMotion ? 0.01 : 0.16, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <span className={cn(
                          "absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-black/70 text-white opacity-0 shadow-sm transition-opacity group-hover/crop:opacity-100 group-focus-visible/crop:opacity-100",
                          active && "opacity-100"
                        )}>
                          <Move className="h-3.5 w-3.5" />
                        </span>
                        {detection.confidence < 0.55 ? (
                          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-destructive text-destructive-foreground shadow-sm">
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        ) : null}
                      </motion.button>
                    );
                  }) : null}
                  </AnimatePresence>
                  {subjectMode === "original" ? xDividers.map((divider, index) => {
                    const key = `x-${index}`;
                    const bounds = dividerBounds("x", index);
                    return (
                      <button
                        key={key}
                        type="button"
                        role="slider"
                        aria-label={`第 ${index + 1} 条竖向切分线`}
                        aria-valuemin={bounds.min}
                        aria-valuemax={bounds.max}
                        aria-valuenow={divider}
                        onKeyDown={(event) => nudgeDivider(event, "x", index)}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDragging(key);
                        }}
                        onPointerMove={(event) => moveDivider(event, "x", index)}
                        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onLostPointerCapture={() => setDragging(null)}
                        className="group absolute inset-y-0 z-20 w-4 -translate-x-1/2 cursor-col-resize touch-none focus-visible:outline-none"
                        style={{ left: `${((divider + gap / 2) / (image.width || 1)) * 100}%` }}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)] transition-[width,background-color] group-hover:w-0.5 group-focus-visible:w-0.5",
                            dragging === key && "w-0.5 bg-primary"
                          )}
                        />
                        <span
                          aria-hidden
                          className={cn(
                            "absolute left-1/2 top-1/2 flex h-8 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-primary text-primary-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                            dragging === key && "opacity-100"
                          )}
                        >
                          <GripVertical className="h-3 w-3" />
                        </span>
                      </button>
                    );
                  }) : null}
                  {subjectMode === "original" ? yDividers.map((divider, index) => {
                    const key = `y-${index}`;
                    const bounds = dividerBounds("y", index);
                    return (
                      <button
                        key={key}
                        type="button"
                        role="slider"
                        aria-label={`第 ${index + 1} 条横向切分线`}
                        aria-valuemin={bounds.min}
                        aria-valuemax={bounds.max}
                        aria-valuenow={divider}
                        onKeyDown={(event) => nudgeDivider(event, "y", index)}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDragging(key);
                        }}
                        onPointerMove={(event) => moveDivider(event, "y", index)}
                        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onLostPointerCapture={() => setDragging(null)}
                        className="group absolute inset-x-0 z-20 h-4 -translate-y-1/2 cursor-row-resize touch-none focus-visible:outline-none"
                        style={{ top: `${((divider + gap / 2) / (image.height || 1)) * 100}%` }}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)] transition-[height,background-color] group-hover:h-0.5 group-focus-visible:h-0.5",
                            dragging === key && "h-0.5 bg-primary"
                          )}
                        />
                        <span
                          aria-hidden
                          className={cn(
                            "absolute left-1/2 top-1/2 flex h-4 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-primary text-primary-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                            dragging === key && "opacity-100"
                          )}
                        >
                          <GripHorizontal className="h-3 w-3" />
                        </span>
                      </button>
                    );
                  }) : null}
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              ) : null}
            </div>
            {image ? (
              <div className="absolute bottom-4 right-4 z-30 flex h-9 items-center overflow-hidden rounded-md border border-border bg-background/90 shadow-sm backdrop-blur">
                <button
                  type="button"
                  aria-label="缩小预览"
                  title="缩小预览"
                  disabled={previewZoom <= MIN_PREVIEW_ZOOM}
                  onClick={() => updatePreviewZoom((current) => current / 1.25)}
                  className="flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-12 text-center text-xs font-medium tabular-nums text-foreground">
                  {Math.round(previewZoom * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="放大预览"
                  title="放大预览"
                  disabled={previewZoom >= MAX_PREVIEW_ZOOM}
                  onClick={() => updatePreviewZoom((current) => current * 1.25)}
                  className="flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <div className="h-4 w-px bg-border" />
                <button
                  type="button"
                  aria-label="恢复适应窗口"
                  title="恢复适应窗口"
                  disabled={previewZoom <= MIN_PREVIEW_ZOOM}
                  onClick={() => updatePreviewZoom(() => MIN_PREVIEW_ZOOM)}
                  className="flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </section>

          <aside className="flex min-h-0 flex-col overflow-hidden border-l border-border bg-popover">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div>
                <div className="flex items-center justify-between gap-3 pr-7">
                  <Label className="text-xs text-muted-foreground">切图方式</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {image?.width ?? 0} × {image?.height ?? 0}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    aria-pressed={cropMode === "free"}
                    onClick={() => setCropMode("free")}
                    className={cn(
                      "relative isolate flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      cropMode === "free" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cropMode === "free" ? (
                      <SegmentedControlIndicator
                        layoutId={`${segmentedLayoutId}-slice-crop-mode`}
                        className="rounded-md bg-background shadow-sm"
                      />
                    ) : null}
                    <SquareDashed className="relative z-10 h-3.5 w-3.5" />
                    <span className="relative z-10">自由裁切</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={cropMode === "grid"}
                    onClick={() => setCropMode("grid")}
                    className={cn(
                      "relative isolate flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      cropMode === "grid" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cropMode === "grid" ? (
                      <SegmentedControlIndicator
                        layoutId={`${segmentedLayoutId}-slice-crop-mode`}
                        className="rounded-md bg-background shadow-sm"
                      />
                    ) : null}
                    <Grid2X2 className="relative z-10 h-3.5 w-3.5" />
                    <span className="relative z-10">宫格切图</span>
                  </button>
                </div>
              </div>

              <div className="my-5 h-px bg-border" />

              <AnimatePresence initial={false} mode="wait">
              {cropMode === "grid" ? (
                <motion.div
                  key="grid-settings"
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -6 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
              <div>
                <Label className="text-xs text-muted-foreground">常用宫格</Label>
                <div className="mt-2 grid grid-cols-5 gap-1 rounded-lg border border-border bg-muted/40 p-1">
                  {PRESETS.map((preset) => {
                    const active = rows === preset.rows && columns === preset.columns;
                    return (
                      <button
                        key={`${preset.rows}-${preset.columns}`}
                        type="button"
                        aria-pressed={active}
                        onClick={() => applyPreset(preset.rows, preset.columns)}
                        className={cn(
                          "relative isolate h-8 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {active ? (
                          <SegmentedControlIndicator
                            layoutId={`${segmentedLayoutId}-slice-grid-preset`}
                            className="rounded-md bg-background shadow-sm"
                          />
                        ) : null}
                        <span className="relative z-10">{preset.rows} × {preset.columns}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="slice-rows" className="text-xs text-muted-foreground">行数</Label>
                  <Input
                    id="slice-rows"
                    type="number"
                    min={1}
                    max={MAX_SLICE_GRID_SIZE}
                    value={rows}
                    onChange={(event) => setRows(Math.min(MAX_SLICE_GRID_SIZE, Math.max(1, numericValue(event.target.value))))}
                    className="h-9 tabular-nums"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slice-columns" className="text-xs text-muted-foreground">列数</Label>
                  <Input
                    id="slice-columns"
                    type="number"
                    min={1}
                    max={MAX_SLICE_GRID_SIZE}
                    value={columns}
                    onChange={(event) => setColumns(Math.min(MAX_SLICE_GRID_SIZE, Math.max(1, numericValue(event.target.value))))}
                    className="h-9 tabular-nums"
                  />
                </div>
              </div>

              <div className="my-5 h-px bg-border" />

              <div>
                <Label className="text-xs text-muted-foreground">主体处理</Label>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    aria-pressed={subjectMode === "original"}
                    onClick={() => setSubjectMode("original")}
                    className={cn(
                      "relative isolate flex h-8 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      subjectMode === "original" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {subjectMode === "original" ? (
                      <SegmentedControlIndicator
                        layoutId={`${segmentedLayoutId}-slice-subject-mode`}
                        className="rounded-md bg-background shadow-sm"
                      />
                    ) : null}
                    <Grid2X2 className="relative z-10 h-3.5 w-3.5" />
                    <span className="relative z-10">原宫格</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={subjectMode === "local"}
                    onClick={() => setSubjectMode("local")}
                    className={cn(
                      "relative isolate flex h-8 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      subjectMode === "local" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {subjectMode === "local" ? (
                      <SegmentedControlIndicator
                        layoutId={`${segmentedLayoutId}-slice-subject-mode`}
                        className="rounded-md bg-background shadow-sm"
                      />
                    ) : null}
                    <ScanSearch className="relative z-10 h-3.5 w-3.5" />
                    <span className="relative z-10">本地</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={subjectMode === "ai"}
                    onClick={() => setSubjectMode("ai")}
                    className={cn(
                      "relative isolate flex h-8 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      subjectMode === "ai" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {subjectMode === "ai" ? (
                      <SegmentedControlIndicator
                        layoutId={`${segmentedLayoutId}-slice-subject-mode`}
                        className="rounded-md bg-background shadow-sm"
                      />
                    ) : null}
                    <Sparkles className="relative z-10 h-3.5 w-3.5" />
                    <span className="relative z-10">AI</span>
                  </button>
                </div>
              </div>

              <AnimatePresence initial={false} mode="wait">
              {subjectMode !== "original" ? (
                <motion.div
                  key={subjectMode}
                  className="mt-4 space-y-4"
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex min-h-8 items-center justify-between gap-3 text-xs">
                    <span className={cn(
                      "min-w-0 truncate text-muted-foreground",
                      (subjectMode === "local" ? localStatus : aiStatus) === "error" && "text-destructive"
                    )}>
                      {subjectMode === "local"
                        ? localStatus === "analyzing"
                          ? `正在本地识别 ${analysisProgress.completed} / ${analysisProgress.total || grid.crops.length}`
                          : localStatus === "ready"
                            ? `已识别 ${localDetections.length} / ${grid.crops.length}`
                            : localStatus === "error"
                              ? analysisError || "本地识别失败"
                              : "等待图片"
                        : aiStatus === "analyzing"
                          ? "正在 AI 识别"
                          : aiStatus === "ready"
                            ? `AI ${aiDetections.length} / ${grid.crops.length}`
                            : aiStatus === "error"
                              ? analysisError || "AI 识别失败"
                              : aiAvailable
                                ? aiProviderName
                                : "Provider 未就绪"}
                    </span>
                    {subjectMode === "local" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2"
                        disabled={localStatus === "analyzing"}
                        onClick={() => setImageLoadRevision((current) => current + 1)}
                      >
                        {localStatus === "analyzing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        重识别
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2"
                        disabled={!aiAvailable || aiStatus === "analyzing"}
                        onClick={() => void analyzeWithAi()}
                      >
                        {aiStatus === "analyzing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {aiStatus === "ready" ? "重新识别" : "AI 识别"}
                      </Button>
                    )}
                  </div>

                  {(subjectMode === "local" ? localStatus : aiStatus) === "analyzing" ? (
                    <div
                      role="progressbar"
                      aria-label={subjectMode === "local" ? "本地主体识别进度" : "AI 主体识别进度"}
                      aria-valuemin={0}
                      aria-valuemax={analysisProgress.total || grid.crops.length}
                      aria-valuenow={subjectMode === "local" ? analysisProgress.completed : undefined}
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                    >
                      {subjectMode === "local" ? (
                        <motion.div
                          className="h-full rounded-full bg-foreground"
                          initial={false}
                          animate={{
                            width: `${analysisProgress.total > 0
                              ? (analysisProgress.completed / analysisProgress.total) * 100
                              : 0}%`
                          }}
                          transition={{ duration: reducedMotion ? 0.01 : 0.16, ease: [0.25, 1, 0.5, 1] }}
                        />
                      ) : (
                        <motion.div
                          className="h-full w-1/3 rounded-full bg-foreground"
                          animate={reducedMotion ? { opacity: 0.7 } : { x: ["-100%", "300%"] }}
                          transition={reducedMotion
                            ? { duration: 0.01 }
                            : { duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                        />
                      )}
                    </div>
                  ) : null}

                  {lowConfidenceCount > 0 ? (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {lowConfidenceCount} 格需要校正
                    </div>
                  ) : null}

                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="slice-subject-padding">主体留白</Label>
                      <span className="text-xs font-medium tabular-nums">
                        {paddingPercent}%{boundaryLimitedCount > 0 ? ` · ${boundaryLimitedCount} 格触边` : ""}
                      </span>
                    </div>
                    <input
                      id="slice-subject-padding"
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={paddingPercent}
                      onChange={(event) => setPaddingPercent(Number(event.target.value))}
                      className="mt-2 h-5 w-full cursor-pointer accent-foreground"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="slice-normalize-scale" className="text-foreground">统一主体大小</Label>
                    <Switch
                      id="slice-normalize-scale"
                      checked={normalizeScale}
                      onCheckedChange={setNormalizeScale}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="slice-constrain-grid" className="text-foreground">限制在宫格内</Label>
                    <Switch
                      id="slice-constrain-grid"
                      checked={constrainToGrid}
                      onCheckedChange={setConstrainToGrid}
                    />
                  </div>

                  {activeDetection ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Move className="h-3.5 w-3.5" />
                          单格校正 · {activeSubjectIndex + 1}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          disabled={!hasActiveAdjustment}
                          onClick={() => setAdjustments((current) => {
                            const next = { ...current };
                            delete next[activeSubjectIndex];
                            return next;
                          })}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          重置
                        </Button>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          aria-label={`第 ${activeSubjectIndex + 1} 格缩放`}
                          type="range"
                          min={75}
                          max={175}
                          step={5}
                          value={Math.round(activeAdjustment.zoom * 100)}
                          onChange={(event) => updateSubjectAdjustment(activeSubjectIndex, {
                            zoom: Number(event.target.value) / 100
                          })}
                          className="h-5 min-w-0 flex-1 cursor-pointer accent-foreground"
                        />
                        <span className="w-10 text-right text-xs font-medium tabular-nums">
                          {Math.round(activeAdjustment.zoom * 100)}%
                        </span>
                      </div>
                    </div>
                  ) : null}
                </motion.div>
              ) : null}
              </AnimatePresence>

              <div className="my-5 h-px bg-border" />

              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">切分线</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!hasCustomDividers}
                  onClick={resetDividers}
                  className="h-7 gap-1.5 px-2"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复等分
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="slice-margin" className="text-xs text-muted-foreground">外边距</Label>
                  <Input
                    id="slice-margin"
                    type="number"
                    min={0}
                    value={margin}
                    onChange={(event) => setMargin(Math.max(0, numericValue(event.target.value)))}
                    className="h-9 tabular-nums"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slice-gap" className="text-xs text-muted-foreground">图片间距</Label>
                  <Input
                    id="slice-gap"
                    type="number"
                    min={0}
                    value={gap}
                    onChange={(event) => setGap(Math.max(0, numericValue(event.target.value)))}
                    className="h-9 tabular-nums"
                  />
                </div>
              </div>

              <div className="my-5 h-px bg-border" />

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">选区</Label>
                  <span className="text-xs font-medium tabular-nums">{selectedCount} / {rows * columns}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={selectAll} disabled={selectedCount === rows * columns}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    全选
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={invertSelection}>
                    <Shuffle className="h-3.5 w-3.5" />
                    反选
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={clearSelection} disabled={selectedCount === 0}>
                    <SquareDashed className="h-3.5 w-3.5" />
                    清空
                  </Button>
                </div>
              </div>

              <div className="mt-5">
                <Label className="text-xs text-muted-foreground">结果排列</Label>
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    aria-pressed={resultLayout === "compact"}
                    onClick={() => setResultLayout("compact")}
                    className={cn(
                      "relative isolate flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      resultLayout === "compact" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {resultLayout === "compact" ? (
                      <SegmentedControlIndicator
                        layoutId={`${segmentedLayoutId}-slice-result-layout`}
                        className="rounded-md bg-background shadow-sm"
                      />
                    ) : null}
                    <LayoutGrid className="relative z-10 h-3.5 w-3.5" />
                    <span className="relative z-10">紧凑排列</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={resultLayout === "source-grid"}
                    onClick={() => setResultLayout("source-grid")}
                    className={cn(
                      "relative isolate flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      resultLayout === "source-grid" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {resultLayout === "source-grid" ? (
                      <SegmentedControlIndicator
                        layoutId={`${segmentedLayoutId}-slice-result-layout`}
                        className="rounded-md bg-background shadow-sm"
                      />
                    ) : null}
                    <SquareDashed className="relative z-10 h-3.5 w-3.5" />
                    <span className="relative z-10">保留宫格</span>
                  </button>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs">
                <span className="text-muted-foreground">切片尺寸</span>
                <span className="font-medium tabular-nums">{sliceSizeSummary}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">输出格式</span>
                <span className="font-medium">PNG</span>
              </div>
              {grid.error ? <p className="mt-4 text-xs leading-5 text-destructive">{grid.error}</p> : null}
                </motion.div>
              ) : (
                <motion.div
                  key="free-settings"
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 6 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-xs text-muted-foreground">裁切区域</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setFreeCrop(createInitialFreeCrop(image?.width ?? 1, image?.height ?? 1))}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      恢复默认
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(["x", "y", "width", "height"] as const).map((field) => (
                      <div key={field} className="space-y-2">
                        <Label htmlFor={`free-crop-${field}`}>
                          {field === "x" ? "X" : field === "y" ? "Y" : field === "width" ? "宽度" : "高度"}
                        </Label>
                        <Input
                          id={`free-crop-${field}`}
                          type="number"
                          min={field === "x" || field === "y" ? 0 : 1}
                          value={freeCrop[field]}
                          onChange={(event) => updateFreeCropField(field, numericValue(event.target.value))}
                          className="h-9 tabular-nums"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs">
                    <span className="text-muted-foreground">输出尺寸</span>
                    <span className="font-medium tabular-nums">{freeCrop.width} × {freeCrop.height}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">输出格式</span>
                    <span className="font-medium">PNG</span>
                  </div>
                </motion.div>
              )}
              </AnimatePresence>
            </div>

            <DialogFooter className="relative z-30 shrink-0 border-t border-border bg-popover/95 p-4 shadow-[0_-4px_8px_rgba(0,0,0,0.05)] backdrop-blur-sm">
              <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button
                disabled={cropMode === "grid" ? Boolean(grid.error) || selectedCount === 0 || submitting : submitting}
                onClick={() => void confirm()}
                className="gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                切出 {cropMode === "free" ? 1 : selectedCount} 张
              </Button>
            </DialogFooter>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
