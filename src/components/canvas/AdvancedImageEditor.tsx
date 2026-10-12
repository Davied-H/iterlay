import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Brush,
  Check,
  Clock3,
  Eraser,
  ImageIcon,
  ImagePlus,
  Loader2,
  MousePointer2,
  RotateCcw,
  ScanSearch,
  Trash2,
  UserRound,
  WandSparkles,
  X
} from "lucide-react";
import type { ImageCropRect } from "@shared/types";
import { Button } from "@/components/ui/button";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { extractCanvasClipboardItems } from "./canvas-clipboard";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";
import { getGenerationTiming } from "@/lib/generation-timing";
import { MAX_CONCURRENT_GENERATIONS } from "@/lib/generation-queue";
import { isSendEnter } from "@/lib/send-on-enter";
import { cn } from "@/lib/utils";
import {
  RelaxFlowBoard,
  type RelaxFlowInterpretation,
  type RelaxFlowRequest
} from "./RelaxFlowBoard";
import { getPendingEditCount, type GeneratedImage, type ImageVersion } from "./ImageNode";

type RegionTool = "rect" | "brush" | "eraser";
type EditMethod = "replace" | "remove" | "adjust";

interface AdvancedReferenceImage {
  id: string;
  name: string;
  dataUrl: string;
}

export interface AdvancedEditRequest {
  prompt: string;
  maskDataUrl: string;
  referenceImages: Array<{ name: string; dataUrl: string }>;
}

interface AdvancedImageEditorProps {
  image: GeneratedImage;
  initialPrompt: string;
  providerName: string;
  providerLimitation?: string;
  canDetectSubject: boolean;
  canInterpretBoard: boolean;
  onDetectSubject: () => Promise<ImageCropRect>;
  onSwitchVersion: (imageId: string, index: number) => void;
  onPasteCanvasReferences: (images: GeneratedImage[]) => Promise<Array<{ name: string; dataUrl: string }>>;
  onPasteReferences: (files: File[]) => Promise<Array<{ name: string; dataUrl: string }>>;
  onApply: (request: AdvancedEditRequest) => Promise<void> | void;
  onInterpretRelaxFlow: (
    request: RelaxFlowRequest,
    onDelta: (delta: string) => void
  ) => Promise<RelaxFlowInterpretation>;
  onRefineRelaxFlow: (
    request: RelaxFlowRequest,
    interpretation: RelaxFlowInterpretation,
    instruction: string,
    onDelta: (delta: string) => void
  ) => Promise<RelaxFlowInterpretation>;
  onGenerateRelaxFlow: (prompt: string) => Promise<GeneratedImage[]>;
  onBack: () => void;
  onClose: () => void;
}

const TOOL_LABELS: Record<RegionTool, string> = {
  rect: "框选区域",
  brush: "画笔遮罩",
  eraser: "擦除遮罩"
};

const METHOD_LABELS: Record<EditMethod, string> = {
  replace: "替换",
  remove: "移除",
  adjust: "调整"
};

const MAX_MASK_EDGE = 1024;
const MAX_REFERENCES = 2;
const MASK_COLOR = "rgba(16, 185, 129, 0.58)";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取图片。"));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取图片。"));
    reader.readAsDataURL(file);
  });
}

function getVersions(image: GeneratedImage): ImageVersion[] {
  return image.versions ?? [{
    path: image.path,
    dataUrl: image.dataUrl,
    jobId: image.jobId,
    width: image.width,
    height: image.height
  }];
}

function useEditingTiming(active: boolean, startedAt?: number): ReturnType<typeof getGenerationTiming> {
  const fallbackStartedAtRef = useRef(Date.now());
  const resolvedStartedAt = startedAt ?? fallbackStartedAtRef.current;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return;
    const update = (): void => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active, resolvedStartedAt]);

  return getGenerationTiming(resolvedStartedAt, now);
}

function buildAdvancedPrompt(
  method: EditMethod,
  instruction: string,
  keep: { outside: boolean; structure: boolean; composition: boolean }
): string {
  const request = instruction.trim() || (method === "remove" ? "移除白色蒙版覆盖的内容，并自然补全背景。" : "按要求调整白色蒙版覆盖的区域。");
  const constraints = [
    keep.outside ? "黑色区域必须保持不变" : null,
    keep.structure ? "保持主体结构与比例" : null,
    keep.composition ? "保持原有构图与光线" : null
  ].filter(Boolean);

  return [
    "这是一次基于区域蒙版的局部图片编辑。",
    "第一张参考图是编辑目标；第二张参考图是黑白蒙版，白色区域允许修改，黑色区域不应修改。",
    `编辑方式：${METHOD_LABELS[method]}。`,
    `修改要求：${request}`,
    constraints.length > 0 ? `保持要求：${constraints.join("；")}。` : null,
    "输出完整图片，不要输出蒙版本身，也不要改变画布尺寸。"
  ].filter(Boolean).join("\n");
}

export function AdvancedImageEditor({
  image,
  initialPrompt,
  providerName,
  providerLimitation,
  canDetectSubject,
  canInterpretBoard,
  onDetectSubject,
  onSwitchVersion,
  onPasteCanvasReferences,
  onPasteReferences,
  onApply,
  onInterpretRelaxFlow,
  onRefineRelaxFlow,
  onGenerateRelaxFlow,
  onBack,
  onClose
}: AdvancedImageEditorProps): React.ReactElement {
  const segmentedLayoutId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const [tool, setTool] = useState<RegionTool>("rect");
  const [relaxFlowOpen, setRelaxFlowOpen] = useState(false);
  const [method, setMethod] = useState<EditMethod>("replace");
  const [instruction, setInstruction] = useState(initialPrompt);
  const [brushSize, setBrushSize] = useState(28);
  const [hasMask, setHasMask] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionStartedAt, setSubmissionStartedAt] = useState<number | undefined>();
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<AdvancedReferenceImage[]>([]);
  const [addingReferences, setAddingReferences] = useState(false);
  const [keep, setKeep] = useState({ outside: true, structure: true, composition: true });
  const [naturalSize, setNaturalSize] = useState({ width: image.width ?? 1, height: image.height ?? 1 });
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });

  const versions = useMemo(() => getVersions(image), [image]);
  const activeVersion = Math.min(image.activeVersion ?? versions.length - 1, versions.length - 1);
  const activeSource = versions[activeVersion]?.dataUrl || image.dataUrl;
  const originalSource = versions[0]?.dataUrl || image.dataUrl;
  const displaySource = compareOriginal ? originalSource : activeSource;
  const sourceWidth = image.width ?? versions[activeVersion]?.width ?? naturalSize.width;
  const sourceHeight = image.height ?? versions[activeVersion]?.height ?? naturalSize.height;
  const ratio = Math.max(0.01, sourceWidth / Math.max(1, sourceHeight));
  const isApplying = submitting || Boolean(image.editing);
  const pendingEditCount = getPendingEditCount(image) || (submitting ? 1 : 0);
  const queuedEditCount = Math.min(pendingEditCount, image.queuedEditCount ?? 0);
  const allEditsQueued = queuedEditCount > 0 && queuedEditCount === pendingEditCount;
  const editingTiming = useEditingTiming(isApplying && !allEditsQueued, image.editingStartedAt ?? submissionStartedAt);

  const clearMask = useCallback((): void => {
    const canvas = maskRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
    setError(null);
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = (): void => {
      const bounds = stage.getBoundingClientRect();
      const maxWidth = Math.max(220, bounds.width - 72);
      const maxHeight = Math.max(180, bounds.height - 112);
      let width = maxWidth;
      let height = width / ratio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
      setStageSize({ width: Math.round(width), height: Math.round(height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [ratio]);

  useEffect(() => {
    const canvas = maskRef.current;
    if (!canvas) return;
    const scale = Math.min(1, MAX_MASK_EDGE / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    clearMask();
  }, [activeVersion, clearMask, sourceHeight, sourceWidth]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onBack();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && isSendEnter(event)) {
        event.preventDefault();
        void submit();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height
    };
  }

  function drawStroke(event: ReactPointerEvent<HTMLCanvasElement>, start = false): void {
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const point = pointerPosition(event);
    const scale = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = MASK_COLOR;
    context.fillStyle = MASK_COLOR;
    context.lineWidth = Math.max(2, brushSize * scale);
    context.lineCap = "round";
    context.lineJoin = "round";
    if (start) {
      context.beginPath();
      context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    setHasMask(true);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (compareOriginal) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    drawingRef.current = { pointerId: event.pointerId, startX: point.x, startY: point.y };
    setError(null);
    if (tool === "rect") {
      clearMask();
    } else {
      drawStroke(event, true);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const drawing = drawingRef.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    if (tool !== "rect") {
      drawStroke(event);
      return;
    }
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const point = pointerPosition(event);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = MASK_COLOR;
    context.fillRect(drawing.startX, drawing.startY, point.x - drawing.startX, point.y - drawing.startY);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const drawing = drawingRef.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    if (tool === "rect") {
      const point = pointerPosition(event);
      setHasMask(Math.abs(point.x - drawing.startX) > 2 && Math.abs(point.y - drawing.startY) > 2);
    }
    drawingRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function applyBounds(bounds: ImageCropRect, background: boolean): void {
    const canvas = maskRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const scaleX = canvas.width / Math.max(1, sourceWidth);
    const scaleY = canvas.height / Math.max(1, sourceHeight);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = MASK_COLOR;
    if (background) context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = background ? "destination-out" : "source-over";
    context.fillRect(bounds.x * scaleX, bounds.y * scaleY, bounds.width * scaleX, bounds.height * scaleY);
    context.globalCompositeOperation = "source-over";
    setHasMask(true);
    setError(null);
  }

  async function detectRegion(background: boolean): Promise<void> {
    if (!canDetectSubject || detecting) return;
    setDetecting(true);
    setError(null);
    try {
      const bounds = await onDetectSubject();
      applyBounds(bounds, background);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "区域识别失败，请重试。 ");
    } finally {
      setDetecting(false);
    }
  }

  async function addReferences(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_REFERENCES - references.length);
    event.target.value = "";
    if (files.length === 0) return;
    try {
      const next = await Promise.all(files.map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: await readFileAsDataUrl(file)
      })));
      setReferences((current) => [...current, ...next].slice(0, MAX_REFERENCES));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "参考图片读取失败。 ");
    }
  }

  async function addPastedReferences(files: File[]): Promise<void> {
    if (addingReferences) return;
    const selected = files.slice(0, Math.max(0, MAX_REFERENCES - references.length));
    if (selected.length === 0) {
      setError(`最多添加 ${MAX_REFERENCES} 张参考图片。`);
      return;
    }
    setAddingReferences(true);
    setError(null);
    try {
      const uploaded = await onPasteReferences(selected);
      const next = uploaded.map((reference) => ({
        id: crypto.randomUUID(),
        name: reference.name,
        dataUrl: reference.dataUrl
      }));
      setReferences((current) => [...current, ...next].slice(0, MAX_REFERENCES));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "参考图片上传失败。");
    } finally {
      setAddingReferences(false);
    }
  }

  async function addPastedCanvasReferences(images: GeneratedImage[]): Promise<void> {
    if (addingReferences) return;
    const selected = images.slice(0, Math.max(0, MAX_REFERENCES - references.length));
    if (selected.length === 0) {
      setError(`最多添加 ${MAX_REFERENCES} 张参考图片。`);
      return;
    }
    setAddingReferences(true);
    setError(null);
    try {
      const resolved = await onPasteCanvasReferences(selected);
      const next = resolved.map((reference) => ({
        id: crypto.randomUUID(),
        name: reference.name,
        dataUrl: reference.dataUrl
      }));
      setReferences((current) => [...current, ...next].slice(0, MAX_REFERENCES));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "画板参考图片读取失败。");
    } finally {
      setAddingReferences(false);
    }
  }

  function createMaskDataUrl(): string | null {
    const source = maskRef.current;
    if (!source) return null;
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const outputContext = output.getContext("2d", { willReadFrequently: true });
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!outputContext || !sourceContext) return null;
    const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
    const pixels = outputContext.createImageData(source.width, source.height);
    let selectedPixels = 0;
    for (let index = 0; index < sourcePixels.data.length; index += 4) {
      const selected = sourcePixels.data[index + 3] > 12;
      if (selected) selectedPixels += 1;
      const value = selected ? 255 : 0;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
    if (selectedPixels === 0) return null;
    outputContext.putImageData(pixels, 0, 0);
    return output.toDataURL("image/png");
  }

  async function submit(): Promise<void> {
    if (submitting || image.editing) return;
    if (providerLimitation) {
      setError(providerLimitation);
      return;
    }
    if (!hasMask) {
      setError("请先框选或绘制需要修改的区域。 ");
      return;
    }
    if (method !== "remove" && !instruction.trim()) {
      setError("请描述选中区域要如何修改。 ");
      return;
    }
    const maskDataUrl = createMaskDataUrl();
    if (!maskDataUrl) {
      setError("蒙版生成失败，请重新选择区域。 ");
      return;
    }
    setSubmissionStartedAt(Date.now());
    setSubmitting(true);
    setError(null);
    try {
      await onApply({
        prompt: buildAdvancedPrompt(method, instruction, keep),
        maskDataUrl,
        referenceImages: references.map(({ name, dataUrl }) => ({ name, dataUrl }))
      });
    } finally {
      setSubmitting(false);
      setSubmissionStartedAt(undefined);
    }
  }

  const toolButton = (target: RegionTool, icon: ReactNode): React.ReactElement => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={TOOL_LABELS[target]}
          aria-pressed={tool === target}
          disabled={isApplying}
          onClick={() => setTool(target)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
            tool === target && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{TOOL_LABELS[target]}</TooltipContent>
    </Tooltip>
  );

  if (relaxFlowOpen) {
    return (
      <RelaxFlowBoard
        sessionKey={image.id}
        versions={versions}
        activeVersion={activeVersion}
        aspectRatio={ratio}
        providerName={providerName}
        providerLimitation={providerLimitation}
        interpretationLimitation={canInterpretBoard ? undefined : "请先配置可识图的文本 Provider，再使用 Relax Flow。"}
        onInterpret={onInterpretRelaxFlow}
        onRefine={onRefineRelaxFlow}
        onGenerate={onGenerateRelaxFlow}
        onSwitchVersion={(index) => onSwitchVersion(image.id, index)}
        onBack={() => setRelaxFlowOpen(false)}
        onClose={onClose}
      />
    );
  }

  return createPortal((
    <TooltipProvider delayDuration={180}>
      <div className="fixed inset-0 z-[60] grid grid-cols-[48px_minmax(0,1fr)_320px] grid-rows-[48px_minmax(0,1fr)] bg-background max-[1000px]:grid-cols-[44px_minmax(0,1fr)_280px]">
        <header className="col-span-3 flex min-w-0 items-center gap-2 border-b border-border bg-background py-0 pl-[84px] pr-3 text-foreground [-webkit-app-region:drag]">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group h-8 gap-1.5 text-foreground [-webkit-app-region:no-drag]"
            onClick={onBack}
          >
            <ArrowLeft
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none"
            />
            返回普通编辑
          </Button>
          <strong className="text-sm font-semibold">高级编辑</strong>
          <span className="min-w-0 truncate text-xs text-muted-foreground">v{activeVersion + 1} / {versions.length}</span>
          <div className="flex-1" />
          <Button
            type="button"
            variant={compareOriginal ? "secondary" : "ghost"}
            size="sm"
            className="h-8 [-webkit-app-region:no-drag]"
            aria-pressed={compareOriginal}
            disabled={isApplying}
            onClick={() => setCompareOriginal((current) => !current)}
          >
            {compareOriginal ? "返回当前版本" : "原图对比"}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 [-webkit-app-region:no-drag]" aria-label="关闭编辑" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <nav className="row-start-2 flex flex-col items-center gap-1 border-r border-border bg-muted/30 py-3" aria-label="区域工具">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Relax Flow 画笔"
                disabled={isApplying}
                onClick={() => setRelaxFlowOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-[hsl(var(--ai-accent))] transition-colors hover:bg-[hsl(var(--ai-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <WandSparkles className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Relax Flow 画笔</TooltipContent>
          </Tooltip>
          <div className="my-1 h-px w-6 bg-border" />
          {toolButton("rect", <MousePointer2 className="h-4 w-4" />)}
          {toolButton("brush", <Brush className="h-4 w-4" />)}
          {toolButton("eraser", <Eraser className="h-4 w-4" />)}
          <div className="my-1 h-px w-6 bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="识别主体区域"
                disabled={!canDetectSubject || detecting || isApplying}
                onClick={() => void detectRegion(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                {detecting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <UserRound className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{canDetectSubject ? "识别主体区域" : "配置文本 Provider 后可用"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="选择背景区域"
                disabled={!canDetectSubject || detecting || isApplying}
                onClick={() => void detectRegion(true)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <ImageIcon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{canDetectSubject ? "选择主体外的背景区域" : "配置文本 Provider 后可用"}</TooltipContent>
          </Tooltip>
          <div className="my-1 h-px w-6 bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="清除蒙版"
                disabled={!hasMask || isApplying}
                onClick={clearMask}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">清除蒙版</TooltipContent>
          </Tooltip>
        </nav>

        <main ref={stageRef} className="relative row-start-2 min-h-0 min-w-0 overflow-hidden bg-muted/45" aria-label="高级编辑画布">
          <div
            className="absolute left-1/2 top-1/2 overflow-hidden rounded-lg bg-black/5 shadow-md [transform:translate(-50%,-54%)]"
            style={{ width: stageSize.width, height: stageSize.height }}
          >
            <img
              src={displaySource}
              alt={compareOriginal ? "原始版本" : "高级编辑目标图"}
              draggable={false}
              className="absolute inset-0 h-full w-full select-none object-fill"
              onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            />
            <canvas
              ref={maskRef}
              aria-label="编辑区域蒙版"
              className={cn(
                "absolute inset-0 h-full w-full touch-none",
                (compareOriginal || isApplying) && "pointer-events-none",
                compareOriginal && "opacity-0",
                tool === "rect" ? "cursor-crosshair" : tool === "eraser" ? "cursor-cell" : "cursor-crosshair"
              )}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            {compareOriginal ? (
              <span className="absolute left-2 top-2 rounded-md bg-background/90 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm">原图</span>
            ) : null}
            {isApplying && !compareOriginal ? (
              <div
                data-editing-status
                aria-live="polite"
                aria-busy="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 bg-background/85 px-3 py-2.5 text-muted-foreground backdrop-blur"
              >
                {allEditsQueued
                  ? <Clock3 aria-hidden className="h-4 w-4 shrink-0" />
                  : <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />}
                <div className="min-w-0 text-center">
                  <p className="text-sm font-medium leading-5">
                    {allEditsQueued ? "高级编辑排队中" : `正在应用编辑${queuedEditCount ? ` · ${queuedEditCount} 个版本排队中` : ""}`}
                  </p>
                  {allEditsQueued ? (
                    <p className="text-pretty text-xs leading-4">已有 {MAX_CONCURRENT_GENERATIONS} 个任务正在处理，稍后自动开始</p>
                  ) : editingTiming.overdue ? (
                    <p className="text-pretty text-xs leading-4">
                      已用 <time className="tabular-nums">{editingTiming.elapsedLabel}</time> · 比预计久一点，任务仍在处理中
                    </p>
                  ) : (
                    <p className="text-xs leading-4">
                      已用 <time className="tabular-nums">{editingTiming.elapsedLabel}</time> · 预计剩余{" "}
                      <time className="tabular-nums">{editingTiming.remainingLabel}</time>
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-lg border border-border bg-background p-1.5 shadow-sm">
            {versions.map((version, index) => (
              <button
                key={`${version.path}-${index}`}
                type="button"
                aria-label={`切换到版本 ${index + 1}`}
                aria-pressed={index === activeVersion}
                disabled={isApplying}
                onClick={() => onSwitchVersion(image.id, index)}
                className={cn(
                  "relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  index === activeVersion && "border-primary ring-2 ring-primary"
                )}
              >
                <img src={version.dataUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                <span className="absolute bottom-0.5 left-0.5 rounded bg-background/90 px-1 text-[9px] font-medium">v{index + 1}</span>
              </button>
            ))}
            {Array.from({ length: pendingEditCount }, (_, index) => (
              <div
                key={`pending-edit-${index}`}
                aria-label={index >= pendingEditCount - queuedEditCount
                  ? (pendingEditCount > 1 ? `新版本 ${index + 1} 排队中` : "新版本排队中")
                  : (pendingEditCount > 1 ? `新版本 ${index + 1} 正在生成` : "新版本正在生成")}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40"
              >
                {index >= pendingEditCount - queuedEditCount
                  ? <Clock3 className="h-4 w-4 text-muted-foreground" />
                  : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" />}
              </div>
            ))}
          </div>
        </main>

        <aside className="row-start-2 flex min-h-0 flex-col border-l border-border bg-background" aria-label="编辑设置">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3.5">
            <strong className="text-sm font-semibold">编辑设置</strong>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ScanSearch className="h-3.5 w-3.5" />
              {hasMask ? "已选择区域" : "未选择区域"}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <section className="border-b border-border p-3.5">
              <span className="mb-2 block text-xs font-medium text-muted-foreground">编辑方式</span>
              <div className="flex rounded-md bg-muted p-0.5" role="group" aria-label="编辑方式">
                {(Object.keys(METHOD_LABELS) as EditMethod[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={method === value}
                    onClick={() => setMethod(value)}
                    className={cn(
                      "relative isolate h-7 flex-1 rounded-[5px] text-xs font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      method === value && "text-foreground"
                    )}
                  >
                    {method === value ? (
                      <SegmentedControlIndicator
                        layoutId={`${segmentedLayoutId}-advanced-edit-method`}
                        className="rounded-[5px] bg-background shadow-sm"
                      />
                    ) : null}
                    <span className="relative z-10">{METHOD_LABELS[value]}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="border-b border-border p-3.5">
              <label htmlFor="advanced-edit-instruction" className="mb-2 block text-xs font-medium text-muted-foreground">修改要求</label>
              <Textarea
                id="advanced-edit-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (!isSendEnter(event)) return;
                  event.preventDefault();
                  void submit();
                }}
                onPaste={(event) => {
                  const canvasItems = extractCanvasClipboardItems(event.clipboardData);
                  if (canvasItems) {
                    event.preventDefault();
                    void addPastedCanvasReferences(canvasItems.map((item) => item.image));
                    return;
                  }
                  const files = extractClipboardImageFiles(event.clipboardData);
                  if (files.length === 0) return;
                  event.preventDefault();
                  void addPastedReferences(files);
                }}
                placeholder={method === "remove" ? "可补充移除后的背景要求…" : "描述选中区域要如何修改…"}
                className="min-h-28 resize-y text-sm leading-5"
              />
            </section>

            {(tool === "brush" || tool === "eraser") ? (
              <section className="border-b border-border p-3.5">
                <label htmlFor="advanced-brush-size" className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{tool === "eraser" ? "擦除大小" : "画笔大小"}</span>
                  <span className="tabular-nums">{brushSize}px</span>
                </label>
                <input
                  id="advanced-brush-size"
                  type="range"
                  min="8"
                  max="96"
                  step="2"
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </section>
            ) : null}

            <section className="border-b border-border p-3.5">
              <span className="mb-2 block text-xs font-medium text-muted-foreground">保持不变</span>
              <div className="space-y-2.5">
                {([
                  ["outside", "未选中的区域"],
                  ["structure", "主体结构与比例"],
                  ["composition", "构图与光线"]
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={keep[key]}
                      onChange={(event) => setKeep((current) => ({ ...current, [key]: event.target.checked }))}
                      className="h-4 w-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </section>

            <section className="p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">参考图片</span>
                <span className="text-[11px] text-muted-foreground">最多 {MAX_REFERENCES} 张</span>
              </div>
              <input ref={referenceInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addReferences(event)} />
              <div className="flex flex-wrap gap-2">
                {references.map((reference) => (
                  <div key={reference.id} className="group relative h-12 w-12 overflow-hidden rounded-md border border-border bg-muted">
                    <img src={reference.dataUrl} alt={reference.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label={`移除参考图 ${reference.name}`}
                      onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))}
                      className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {references.length < MAX_REFERENCES ? (
                  <button
                    type="button"
                    aria-label="添加参考图片"
                    disabled={addingReferences}
                    onClick={() => referenceInputRef.current?.click()}
                    className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  >
                    {addingReferences ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <ImagePlus className="h-4 w-4" />}
                  </button>
                ) : null}
              </div>
            </section>
          </div>

          <footer className="shrink-0 border-t border-border p-3.5">
            {providerLimitation ? (
              <p role="alert" className="mb-2 rounded-md bg-destructive/10 px-2.5 py-2 text-xs leading-4 text-destructive">{providerLimitation}</p>
            ) : error ? (
              <p role="alert" className="mb-2 text-xs leading-4 text-destructive">{error}</p>
            ) : (
              <p className="mb-2 truncate text-[11px] text-muted-foreground">由 {providerName} 生成，新结果会加入版本链</p>
            )}
            <Button
              type="button"
              className="w-full gap-1.5"
              disabled={Boolean(providerLimitation) || !hasMask || isApplying}
              onClick={() => void submit()}
            >
              {allEditsQueued
                ? <Clock3 className="h-4 w-4" />
                : isApplying ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Check className="h-4 w-4" />}
              {allEditsQueued ? "排队中" : isApplying ? "正在应用" : "应用高级编辑"}
            </Button>
          </footer>
        </aside>
      </div>
    </TooltipProvider>
  ), document.body);
}
