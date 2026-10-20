import { ONLINE_SHARING_AVAILABLE } from "@shared/sharing-availability";
import { useUiText } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FolderOpen,
  GripVertical,
  Loader2,
  Package,
  Pause,
  Play,
  ScanQrCode,
  Smartphone
} from "lucide-react";
import QRCode from "qrcode";
import type { SaveWechatStickerPackageResult } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import {
  buildWechatPersonalPackage,
  buildWechatStickerPackage,
  formatWechatFileSize,
  processWechatStickerSequence,
  processWechatSticker,
  sanitizeWechatStickerName,
  validateWechatAlbumCount,
  WECHAT_ALBUM_MAX_COUNT,
  WECHAT_STICKER_MAX_BYTES,
  type WechatStickerBackground,
  type WechatStickerFit,
  type WechatStickerOutput
} from "@/lib/wechat-sticker";
import { cn } from "@/lib/utils";
import type { GeneratedImage } from "./ImageNode";

type ExportMode = "personal" | "album";
type PersonalExportStyle = "sequence" | "separate";

const DEFAULT_FRAME_DELAY_MS = 400;

interface WechatStickerExportDialogProps {
  open: boolean;
  images: GeneratedImage[];
  boardId?: string;
  initialMode?: ExportMode;
  onOpenChange: (open: boolean) => void;
  onExported?: (result: SaveWechatStickerPackageResult, count: number) => void;
}

interface PreparedExport {
  result?: SaveWechatStickerPackageResult;
  packageName: string;
  createZip: boolean;
  files: Array<{ relativePath: string; bytes: ArrayBuffer }>;
  outputs: WechatStickerOutput[];
  sourceImageCount: number;
  combined: boolean;
}

const checkerboardStyle = {
  backgroundColor: "#f6f6f3",
  backgroundImage:
    "linear-gradient(45deg, rgba(0,0,0,.055) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,.055) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,.055) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,.055) 75%)",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
  backgroundSize: "16px 16px"
} as const;

export function WechatStickerExportDialog({
  open,
  images,
  boardId,
  initialMode = "personal",
  onOpenChange,
  onExported
}: WechatStickerExportDialogProps): React.ReactElement {
  const uiText = useUiText();

  const [mode, setMode] = useState<ExportMode>(initialMode);
  const [personalExportStyle, setPersonalExportStyle] = useState<PersonalExportStyle>("sequence");
  const [fit, setFit] = useState<WechatStickerFit>("contain");
  const [paddingPercent, setPaddingPercent] = useState(12);
  const [background, setBackground] = useState<WechatStickerBackground>("transparent");
  const [createZip, setCreateZip] = useState(true);
  const [albumName, setAlbumName] = useState("我的微信表情");
  const [description, setDescription] = useState("由 Iterlay 创作");
  const [copyright, setCopyright] = useState("");
  const [bannerBackground, setBannerBackground] = useState("#dff7ef");
  const [meanings, setMeanings] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [frameOrder, setFrameOrder] = useState<string[]>([]);
  const [frameDurations, setFrameDurations] = useState<Record<string, number>>({});
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [draggedFrameId, setDraggedFrameId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<PreparedExport | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setPersonalExportStyle(images.length > 1 ? "sequence" : "separate");
    setActiveIndex(0);
    setMeanings(images.map(() => ""));
    setFrameOrder(images.filter((image) => !image.pending && Boolean(image.path)).slice(0, WECHAT_ALBUM_MAX_COUNT).map((image) => image.id));
    setFrameDurations(Object.fromEntries(images.map((image) => [image.id, DEFAULT_FRAME_DELAY_MS])));
    setPreviewPlaying(true);
    setError("");
    setPrepared(null);
    setShareUrl("");
    setQrDataUrl("");
  }, [images, initialMode, open]);

  const baseAvailableImages = useMemo(
    () => images.filter((image) => !image.pending && Boolean(image.path)).slice(0, WECHAT_ALBUM_MAX_COUNT),
    [images]
  );
  const sequenceImages = useMemo(() => {
    const byId = new Map(baseAvailableImages.map((image) => [image.id, image]));
    const ordered = frameOrder.flatMap((id) => {
      const image = byId.get(id);
      return image ? [image] : [];
    });
    const orderedIds = new Set(ordered.map((image) => image.id));
    return [...ordered, ...baseAvailableImages.filter((image) => !orderedIds.has(image.id))];
  }, [baseAvailableImages, frameOrder]);
  const sequenceEnabled = mode === "personal" && personalExportStyle === "sequence" && baseAvailableImages.length > 1;
  const availableImages = sequenceEnabled ? sequenceImages : baseAvailableImages;
  const activeImage = availableImages[Math.min(activeIndex, Math.max(0, availableImages.length - 1))];
  const albumCountError = mode === "album" ? validateWechatAlbumCount(baseAvailableImages.length) : null;
  const selectionError = images.length > WECHAT_ALBUM_MAX_COUNT
    ? `一次最多导出 ${WECHAT_ALBUM_MAX_COUNT} 张微信表情，请减少选择。`
    : availableImages.length === 0
      ? "所选图片暂不可导出。"
      : null;
  const blockingError = selectionError || albumCountError;

  useEffect(() => {
    if (!open || !sequenceEnabled || !previewPlaying || availableImages.length < 2 || !activeImage) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % availableImages.length);
    }, frameDurations[activeImage.id] ?? DEFAULT_FRAME_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeImage, availableImages.length, frameDurations, open, previewPlaying, sequenceEnabled]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, availableImages.length - 1)));
  }, [availableImages.length]);

  function moveActiveFrame(offset: -1 | 1): void {
    if (!activeImage) return;
    const currentIndex = sequenceImages.findIndex((image) => image.id === activeImage.id);
    const nextIndex = Math.max(0, Math.min(sequenceImages.length - 1, currentIndex + offset));
    if (currentIndex < 0 || currentIndex === nextIndex) return;
    setFrameOrder((current) => {
      const next = [...current];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
    setActiveIndex(nextIndex);
  }

  function dropFrame(targetId: string): void {
    if (!draggedFrameId || draggedFrameId === targetId) return;
    const next = sequenceImages.map((image) => image.id).filter((id) => id !== draggedFrameId);
    const targetIndex = next.indexOf(targetId);
    next.splice(targetIndex < 0 ? next.length : targetIndex, 0, draggedFrameId);
    setFrameOrder(next);
    setActiveIndex(next.indexOf(draggedFrameId));
    setDraggedFrameId(null);
  }

  function changeActiveFrameDuration(value: number): void {
    if (!activeImage) return;
    const duration = Math.max(100, Math.min(2_000, Math.round(value / 50) * 50));
    setFrameDurations((current) => ({ ...current, [activeImage.id]: duration }));
  }

  function applyActiveDurationToAll(): void {
    if (!activeImage) return;
    const duration = frameDurations[activeImage.id] ?? DEFAULT_FRAME_DELAY_MS;
    setFrameDurations(Object.fromEntries(baseAvailableImages.map((image) => [image.id, duration])));
  }

  async function prepareExport(): Promise<void> {
    if (processing || blockingError) return;
    setProcessing(true);
    setError("");
    setPrepared(null);
    setQrDataUrl("");
    setShareUrl("");
    try {
      const api = getImageWorkbenchApi();
      const outputs: WechatStickerOutput[] = [];
      setProgress({ current: 0, total: availableImages.length, label: "读取图片" });
      if (sequenceEnabled) {
        const frames = [];
        for (let index = 0; index < availableImages.length; index += 1) {
          const image = availableImages[index];
          setProgress({ current: index, total: availableImages.length, label: `读取第 ${index + 1} 帧` });
          const dataUrl = image.dataUrl.startsWith("data:")
            ? image.dataUrl
            : await api.readAssetDataUrl(image.path);
          frames.push({
            source: {
              id: image.id,
              name: image.path.split(/[\\/]/).at(-1) || `frame-${index + 1}`,
              dataUrl
            },
            delayMs: frameDurations[image.id] ?? DEFAULT_FRAME_DELAY_MS
          });
        }
        setProgress({ current: availableImages.length, total: availableImages.length, label: "编码动画 GIF" });
        outputs.push(await processWechatStickerSequence(frames, { fit, paddingPercent, background }));
      } else {
        for (let index = 0; index < availableImages.length; index += 1) {
          const image = availableImages[index];
          setProgress({ current: index, total: availableImages.length, label: `处理第 ${index + 1} 张表情` });
          const dataUrl = image.dataUrl.startsWith("data:")
            ? image.dataUrl
            : await api.readAssetDataUrl(image.path);
          outputs.push(await processWechatSticker({
            id: image.id,
            name: image.path.split(/[\\/]/).at(-1) || `image-${index + 1}`,
            dataUrl
          }, { fit, paddingPercent, background }, index + 1));
        }
      }
      const animatedCount = outputs.filter((output) => output.animated).length;
      if (mode === "album" && animatedCount > 0 && animatedCount !== outputs.length) {
        throw new Error("微信表情专辑不能混用静态图片和动态 GIF，请只选择同一类型的表情。");
      }
      setProgress({ current: availableImages.length, total: availableImages.length, label: "生成导出预览" });
      const metadata = {
        name: albumName.trim() || "我的微信表情",
        description: description.trim(),
        copyright: copyright.trim(),
        meanings: meanings.map((meaning) => Array.from(meaning.trim()).slice(0, 4).join("")),
        bannerBackground
      };
      const built = mode === "album"
        ? await buildWechatStickerPackage(outputs, metadata)
        : buildWechatPersonalPackage(outputs);
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        "-",
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0")
      ].join("");
      const packageName = `${sanitizeWechatStickerName(albumName)}-${mode === "album" ? "微信投稿包" : "微信表情"}-${stamp}`;
      setPrepared({
        packageName,
        createZip,
        files: built.files.map((file) => ({
          relativePath: file.relativePath,
          bytes: toArrayBuffer(file.bytes)
        })),
        outputs,
        sourceImageCount: availableImages.length,
        combined: sequenceEnabled
      });
    } catch (caught) {
      setError(getWorkbenchErrorMessage(caught, "无法生成导出预览。"));
    } finally {
      setProcessing(false);
    }
  }

  async function downloadPreparedExport(): Promise<void> {
    if (!prepared || prepared.result || processing) return;
    setProcessing(true);
    setError("");
    try {
      const result = await getImageWorkbenchApi().saveWechatStickerPackage({
        packageName: prepared.packageName,
        createZip: prepared.createZip,
        files: prepared.files
      });
      if (!result.ok) return;
      setPrepared((current) => current ? { ...current, result } : current);
      onExported?.(result, prepared.outputs.length);
    } catch (caught) {
      setError(getWorkbenchErrorMessage(caught, "微信表情下载失败。"));
    } finally {
      setProcessing(false);
    }
  }

  async function startPhoneShare(): Promise<void> {
    const folderPath = prepared?.result?.folderPath;
    if (!folderPath || sharing) return;
    setSharing(true);
    setError("");
    try {
      const result = await getImageWorkbenchApi().shareWechatStickerPackage(
        folderPath,
        prepared?.result?.zipPath,
        boardId ? { boardId, nodeIds: images.map((image) => image.id) } : undefined
      );
      const qr = await QRCode.toDataURL(result.url, {
        width: 220,
        margin: 1,
        color: { dark: "#11211b", light: "#ffffff" }
      });
      setShareUrl(result.url);
      setQrDataUrl(qr);
    } catch (caught) {
      void getImageWorkbenchApi().stopOnlineShare().catch(() => undefined);
      setError(getWorkbenchErrorMessage(caught, "无法启动手机微信导入页。"));
    } finally {
      setSharing(false);
    }
  }

  function changeOpen(nextOpen: boolean): void {
    if (!nextOpen && processing) return;
    if (!nextOpen && sharing) void getImageWorkbenchApi().stopOnlineShare().catch(() => undefined);
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className={cn(
          "max-w-[980px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0",
          prepared
            ? qrDataUrl
              ? "h-[min(620px,calc(100vh-32px))]"
              : "h-[min(560px,calc(100vh-32px))]"
            : "h-[min(760px,calc(100vh-32px))]"
        )}
        hideClose={processing}
      >
        <DialogHeader className="border-b border-border px-6 py-4 pr-14">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#07c160]/12 text-[#07964b]">
              <Package className="h-4.5 w-4.5" />
            </div>
            <div>
              <DialogTitle>{uiText("导出为微信表情")}</DialogTitle>
              <DialogDescription className="mt-1">
                {prepared
                  ? prepared.result
                    ? uiText("素材已下载，可打开本地文件夹。")
                    : uiText("检查导出结果，然后下载到本地。")
                  : uiText("调整表情效果和导出方式，下一步可预览结果。")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {prepared ? (
          <ExportPreviewView
            prepared={prepared}
            qrDataUrl={qrDataUrl}
            shareUrl={shareUrl}
            sharing={sharing}
            downloading={processing}
            error={error}
            onOpenPath={(path) => void getImageWorkbenchApi().openDownloadedPath(path)}
            onDownload={() => void downloadPreparedExport()}
            onStartPhoneShare={() => void startPhoneShare()}
            onBack={() => {
              setPrepared(null);
              setQrDataUrl("");
              setShareUrl("");
            }}
            onDone={() => changeOpen(false)}
          />
        ) : (
          <>
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.08fr)_minmax(320px,.92fr)]">
              <section className="flex min-h-0 flex-col border-r border-border bg-muted/20">
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <Tabs value={mode} onValueChange={(value) => setMode(value as ExportMode)}>
                    <TabsList className="h-8">
                      <TabsTrigger value="personal" className="h-6 px-3 text-xs">
                        {uiText("个人表情")}</TabsTrigger>
                      <TabsTrigger value="album" className="h-6 px-3 text-xs">
                        {uiText("投稿专辑")}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {availableImages.length} {sequenceEnabled ? uiText("帧") : uiText("张")}
                  </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
                  <div className="grid min-h-0 flex-1 place-items-center">
                    {activeImage ? (
                      <div className="flex items-center gap-8">
                        <div>
                          <p className="mb-2 text-center text-[11px] font-medium text-muted-foreground">
                            {sequenceEnabled ? uiText("动画预览") : uiText("聊天表情")} · 240 × 240
                          </p>
                          <div
                            className={cn(
                              "relative h-[260px] w-[260px] overflow-hidden rounded-xl border border-border shadow-sm",
                              background === "white" && "bg-white"
                            )}
                            style={background === "transparent" ? checkerboardStyle : undefined}
                          >
                            <div className="h-full w-full" style={{ padding: `${paddingPercent}%` }}>
                              <img
                                src={activeImage.dataUrl}
                                alt={uiText("微信表情预览")}
                                className={cn("h-full w-full", fit === "contain" ? "object-contain" : "object-cover")}
                              />
                            </div>
                            <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground backdrop-blur">
                              240 px
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-center text-[11px] font-medium text-muted-foreground">
                            {sequenceEnabled ? uiText("当前帧 · {{ui:0}}/{{ui:1}}", [activeIndex + 1, availableImages.length]) : uiText("面板预览 · 120 × 120")}
                          </p>
                          <div
                            className="h-[120px] w-[120px] overflow-hidden rounded-lg border border-border shadow-sm"
                            style={background === "transparent" ? checkerboardStyle : { background: "white" }}
                          >
                            <div className="h-full w-full" style={{ padding: `${paddingPercent}%` }}>
                              <img
                                src={activeImage.dataUrl}
                                alt={uiText("微信表情缩略预览")}
                                className={cn("h-full w-full", fit === "contain" ? "object-contain" : "object-cover")}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{uiText("没有可预览的图片")}</p>
                    )}
                  </div>

                  {sequenceEnabled ? (
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">{uiText("帧时间轴")}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{uiText("拖动缩略图调整播放顺序")}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          title={previewPlaying ? uiText("暂停预览") : uiText("播放预览")}
                          aria-label={previewPlaying ? uiText("暂停预览") : uiText("播放预览")}
                          onClick={() => setPreviewPlaying((current) => !current)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
                        >
                          {previewPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          title={uiText("当前帧左移")}
                          aria-label={uiText("当前帧左移")}
                          disabled={activeIndex === 0}
                          onClick={() => moveActiveFrame(-1)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={uiText("当前帧右移")}
                          aria-label={uiText("当前帧右移")}
                          disabled={activeIndex >= availableImages.length - 1}
                          onClick={() => moveActiveFrame(1)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className={cn("flex gap-2 overflow-x-auto pb-1", sequenceEnabled ? "mt-2" : "mt-4")}>
                    {availableImages.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        draggable={sequenceEnabled}
                        onDragStart={() => setDraggedFrameId(image.id)}
                        onDragEnd={() => setDraggedFrameId(null)}
                        onDragOver={(event) => sequenceEnabled && event.preventDefault()}
                        onDrop={() => dropFrame(image.id)}
                        onClick={() => {
                          setActiveIndex(index);
                          if (sequenceEnabled) setPreviewPlaying(false);
                        }}
                        className={cn(
                          "relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          index === activeIndex ? "border-foreground/55 ring-1 ring-foreground/20" : "border-border hover:border-foreground/30",
                          draggedFrameId === image.id && "opacity-45"
                        )}
                      >
                        <img src={image.dataUrl} alt={uiText("第 {{ui:0}} 张", [index + 1])} className="h-full w-full object-cover" />
                        {sequenceEnabled ? (
                          <span className="absolute left-0.5 top-0.5 grid h-4 w-4 place-items-center rounded bg-black/60 text-white">
                            <GripVertical className="h-2.5 w-2.5" />
                          </span>
                        ) : null}
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] text-white">
                          {sequenceEnabled ? `${frameDurations[image.id] ?? DEFAULT_FRAME_DELAY_MS}ms` : index + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="min-h-0 overflow-y-auto px-5 py-4">
                <SettingsPanel
                  mode={mode}
                  personalExportStyle={personalExportStyle}
                  imageCount={baseAvailableImages.length}
                  activeFrameDuration={activeImage ? frameDurations[activeImage.id] ?? DEFAULT_FRAME_DELAY_MS : DEFAULT_FRAME_DELAY_MS}
                  fit={fit}
                  paddingPercent={paddingPercent}
                  background={background}
                  createZip={createZip}
                  albumName={albumName}
                  description={description}
                  copyright={copyright}
                  bannerBackground={bannerBackground}
                  meanings={meanings}
                  activeIndex={activeIndex}
                  blockingError={blockingError}
                  onPersonalExportStyleChange={(value) => {
                    setPersonalExportStyle(value);
                    setActiveIndex(0);
                    setPreviewPlaying(value === "sequence");
                  }}
                  onActiveFrameDurationChange={changeActiveFrameDuration}
                  onApplyFrameDurationToAll={applyActiveDurationToAll}
                  onFitChange={setFit}
                  onPaddingChange={setPaddingPercent}
                  onBackgroundChange={setBackground}
                  onCreateZipChange={setCreateZip}
                  onAlbumNameChange={setAlbumName}
                  onDescriptionChange={setDescription}
                  onCopyrightChange={setCopyright}
                  onBannerBackgroundChange={setBannerBackground}
                  onMeaningChange={(value) => setMeanings((current) => current.map((item, index) => index === activeIndex ? value : item))}
                />
              </section>
            </div>

            <DialogFooter className="min-h-[72px] items-center border-t border-border bg-background px-6 py-4 sm:justify-between">
              <div className="min-w-0 text-xs text-muted-foreground">
                {processing ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    <span>{progress.label}</span>
                    <span className="tabular-nums">{progress.current}/{progress.total}</span>
                  </div>
                ) : error ? (
                  <span className="flex items-start gap-1.5 text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {error}
                  </span>
                ) : (
                  <span>
                    {sequenceEnabled
                      ? uiText("{{ui:0}} 帧合成 1 个循环 GIF，最高不超过 {{ui:1}}", [availableImages.length, formatWechatFileSize(WECHAT_STICKER_MAX_BYTES)])
                      : uiText("输出 240×240 GIF，最高不超过 {{ui:0}}", [formatWechatFileSize(WECHAT_STICKER_MAX_BYTES)])}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" disabled={processing} onClick={() => changeOpen(false)}>
                  {uiText("取消")}</Button>
                <Button disabled={processing || Boolean(blockingError)} onClick={() => void prepareExport()}>
                  {processing ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Eye className="h-4 w-4" />}
                  {uiText("预览导出结果")}</Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SettingsPanelProps {
  mode: ExportMode;
  personalExportStyle: PersonalExportStyle;
  imageCount: number;
  activeFrameDuration: number;
  fit: WechatStickerFit;
  paddingPercent: number;
  background: WechatStickerBackground;
  createZip: boolean;
  albumName: string;
  description: string;
  copyright: string;
  bannerBackground: string;
  meanings: string[];
  activeIndex: number;
  blockingError: string | null;
  onPersonalExportStyleChange: (value: PersonalExportStyle) => void;
  onActiveFrameDurationChange: (value: number) => void;
  onApplyFrameDurationToAll: () => void;
  onFitChange: (value: WechatStickerFit) => void;
  onPaddingChange: (value: number) => void;
  onBackgroundChange: (value: WechatStickerBackground) => void;
  onCreateZipChange: (value: boolean) => void;
  onAlbumNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCopyrightChange: (value: string) => void;
  onBannerBackgroundChange: (value: string) => void;
  onMeaningChange: (value: string) => void;
}

function SettingsPanel(props: SettingsPanelProps): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="space-y-5">
      {props.blockingError ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {props.blockingError}
        </div>
      ) : (
        <div className="flex gap-2 rounded-lg border border-[#07c160]/25 bg-[#07c160]/7 px-3 py-2.5 text-xs leading-5 text-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#07964b]" />
          {props.mode === "album"
            ? uiText("数量符合微信表情专辑要求。")
            : props.personalExportStyle === "sequence" && props.imageCount > 1
              ? uiText("{{ui:0}} 张图片将合成为 1 个动画 GIF。", [props.imageCount])
              : uiText("每张图片将分别导出为 GIF。")}
        </div>
      )}

      {props.mode === "personal" && props.imageCount > 1 ? (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground">{uiText("导出方式")}</h3>
          <div className="grid grid-cols-2 gap-2">
            <OptionButton
              active={props.personalExportStyle === "sequence"}
              onClick={() => props.onPersonalExportStyleChange("sequence")}
              title={uiText("合成 1 个动图")}
              detail={uiText("每张图作为一帧")}
            />
            <OptionButton
              active={props.personalExportStyle === "separate"}
              onClick={() => props.onPersonalExportStyleChange("separate")}
              title={uiText("逐张导出")}
              detail={uiText("生成 {{ui:0}} 个 GIF", [props.imageCount])}
            />
          </div>
        </section>
      ) : null}

      {props.mode === "personal" && props.personalExportStyle === "sequence" && props.imageCount > 1 ? (
        <section className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-foreground">{uiText("当前帧时长")}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">{uiText("第 ")}{props.activeIndex + 1} {uiText("帧的停留时间")}</p>
            </div>
            <Input
              type="number"
              min={100}
              max={2000}
              step={50}
              value={props.activeFrameDuration}
              onChange={(event) => props.onActiveFrameDurationChange(Number(event.target.value))}
              className="h-8 w-24 text-right text-xs tabular-nums"
              aria-label={uiText("当前帧时长（毫秒）")}
            />
          </div>
          <input
            type="range"
            min={100}
            max={2000}
            step={50}
            value={props.activeFrameDuration}
            onChange={(event) => props.onActiveFrameDurationChange(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer accent-[#07c160]"
            aria-label={uiText("调整当前帧时长")}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>100ms</span>
            <button
              type="button"
              onClick={props.onApplyFrameDurationToAll}
              className="font-medium text-foreground hover:underline"
            >
              {uiText("应用到全部帧")}</button>
            <span>2000ms</span>
          </div>
        </section>
      ) : null}

      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="text-xs font-semibold text-foreground">{uiText("画面适配")}</h3>
        <div className="grid grid-cols-2 gap-2">
          <OptionButton active={props.fit === "contain"} onClick={() => props.onFitChange("contain")} title={uiText("完整显示")} detail={uiText("保留全部主体")} />
          <OptionButton active={props.fit === "cover"} onClick={() => props.onFitChange("cover")} title={uiText("填满画布")} detail={uiText("居中裁成方形")} />
        </div>
        <div className="space-y-2 rounded-lg border border-border px-3 py-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="wechat-padding">{uiText("主体留白")}</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{props.paddingPercent}%</span>
          </div>
          <input
            id="wechat-padding"
            type="range"
            min={0}
            max={25}
            step={1}
            value={props.paddingPercent}
            onChange={(event) => props.onPaddingChange(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer accent-[#07c160]"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <OptionButton active={props.background === "transparent"} onClick={() => props.onBackgroundChange("transparent")} title={uiText("透明背景")} detail={uiText("推荐用于表情")} />
          <OptionButton active={props.background === "white"} onClick={() => props.onBackgroundChange("white")} title={uiText("白色背景")} detail={uiText("适合照片素材")} />
        </div>
      </section>

      {props.mode === "album" ? (
        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="text-xs font-semibold text-foreground">{uiText("专辑信息")}</h3>
          <Field label={uiText("专辑名称")} hint={`${Array.from(props.albumName).length}/8`}>
            <Input value={props.albumName} maxLength={8} onChange={(event) => props.onAlbumNameChange(event.target.value)} />
          </Field>
          <Field label={uiText("专辑介绍")} hint={`${Array.from(props.description).length}/80`}>
            <Input value={props.description} maxLength={80} onChange={(event) => props.onDescriptionChange(event.target.value)} />
          </Field>
          <Field label={uiText("版权信息")} hint={`${Array.from(props.copyright).length}/10`}>
            <Input value={props.copyright} maxLength={10} placeholder={uiText("选填")} onChange={(event) => props.onCopyrightChange(event.target.value)} />
          </Field>
          <Field label={uiText("第 {{ui:0}} 张含义词", [props.activeIndex + 1])} hint={uiText("最多 4 字")}>
            <Input
              value={props.meanings[props.activeIndex] || ""}
              maxLength={4}
              placeholder={uiText("例如：收到")}
              onChange={(event) => props.onMeaningChange(event.target.value)}
            />
          </Field>
          <Field label={uiText("横幅背景")} hint="750 × 400">
            <div className="flex gap-2">
              <input
                type="color"
                value={props.bannerBackground}
                onChange={(event) => props.onBannerBackgroundChange(event.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                aria-label={uiText("横幅背景颜色")}
              />
              <Input value={props.bannerBackground} onChange={(event) => props.onBannerBackgroundChange(event.target.value)} />
            </div>
          </Field>
        </section>
      ) : null}

      <section className="border-t border-border pt-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-foreground">{uiText("同时生成 ZIP")}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{uiText("用于电脑归档或投稿；手机添加表情不依赖 ZIP。")}</p>
          </div>
          <Switch checked={props.createZip} onCheckedChange={props.onCreateZipChange} />
        </div>
      </section>
    </div>
  );
}

function OptionButton({ active, onClick, title, detail }: { active: boolean; onClick: () => void; title: string; detail: string }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-[#07c160]/55 bg-[#07c160]/8" : "border-border hover:bg-accent/60"
      )}
    >
      <span className="block text-xs font-medium text-foreground">{title}</span>
      <span className="mt-0.5 block text-[10px] text-muted-foreground">{detail}</span>
      {active ? <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-[#07964b]" /> : null}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ExportPreviewView({
  prepared,
  qrDataUrl,
  shareUrl,
  sharing,
  downloading,
  error,
  onOpenPath,
  onDownload,
  onStartPhoneShare,
  onBack,
  onDone
}: {
  prepared: PreparedExport;
  qrDataUrl: string;
  shareUrl: string;
  sharing: boolean;
  downloading: boolean;
  error: string;
  onOpenPath: (path: string) => void;
  onDownload: () => void;
  onStartPhoneShare: () => void;
  onBack: () => void;
  onDone: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  const warnings = prepared.outputs.flatMap((output) => output.warnings);
  const result = prepared.result;
  const downloaded = Boolean(result?.folderPath);
  const totalBytes = prepared.outputs.reduce((sum, output) => sum + output.bytes.byteLength, 0);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = prepared.outputs.slice(0, 6).map((output) => URL.createObjectURL(
      new Blob([toArrayBuffer(output.previewPngBytes)], { type: "image/png" })
    ));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [prepared.outputs]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-h-0 overflow-y-auto px-8 py-6">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]">
              {downloaded ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-6 text-foreground">
                {downloaded ? uiText("微信表情已下载") : uiText("导出结果已准备好")}
              </h2>
              <p className="mt-1 max-w-lg text-sm leading-5 text-muted-foreground">
                {prepared.combined
                  ? uiText("{{ui:0}} 张图片将合成为 1 个循环 GIF。", [prepared.sourceImageCount])
                  : prepared.sourceImageCount === 1
                    ? uiText("将生成 1 个 GIF 表情。")
                    : uiText("将生成 {{ui:0}} 个 GIF 表情。", [prepared.outputs.length])}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-foreground">{uiText("表情预览")}</p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {prepared.outputs.length} {uiText("个 · ")}{formatWechatFileSize(totalBytes)}
              </p>
            </div>
            <div className="flex min-h-20 gap-2 overflow-x-auto rounded-lg bg-muted/45 p-2">
              {previewUrls.map((url, index) => (
                <div key={url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-background">
                  <img src={url} alt={uiText("导出结果第 {{ui:0}} 个表情", [index + 1])} className="h-full w-full object-contain" />
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] text-white">
                    {index + 1}
                  </span>
                </div>
              ))}
              {prepared.outputs.length > previewUrls.length ? (
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md bg-background text-xs font-medium text-muted-foreground">
                  +{prepared.outputs.length - previewUrls.length}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 border-y border-border">
            <div className="flex min-h-14 items-center gap-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <FolderOpen className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{downloaded ? uiText("下载文件夹") : uiText("下载内容")}</p>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {result?.folderPath?.split(/[\\/]/).at(-1) ?? prepared.packageName}
                </p>
              </div>
              {result?.folderPath ? (
                <Button variant="ghost" size="sm" onClick={() => onOpenPath(result.folderPath as string)}>
                  {uiText("打开")}</Button>
              ) : null}
            </div>
            {prepared.createZip ? (
              <div className="flex min-h-14 items-center gap-3 border-t border-border py-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Package className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{uiText("ZIP 素材包")}</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                    {result?.zipPath?.split(/[\\/]/).at(-1) ?? `${prepared.packageName}.zip`}
                  </p>
                </div>
                {result?.zipPath ? (
                  <Button variant="ghost" size="sm" onClick={() => onOpenPath(result.zipPath as string)}>
                    {uiText("打开")}</Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {warnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
              {warnings.join(" ")}
            </div>
          ) : null}
          {error ? <p className="mt-4 text-xs text-destructive">{error}</p> : null}
        </section>

        <aside className="flex min-h-0 flex-col items-center justify-center border-l border-border bg-[oklch(var(--workspace-surface))] px-7 py-6 text-center">
          {!downloaded ? (
            <div className="flex w-full max-w-[260px] flex-col items-center">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-background text-foreground shadow-sm">
                <Download className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{uiText("下载到本地")}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {uiText("保存到下载目录后，可打开文件夹。")}</p>
              <Button className="mt-5" onClick={onDownload} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" />}
                {downloading ? uiText("正在下载") : uiText("下载到本地")}
              </Button>
            </div>
          ) : !ONLINE_SHARING_AVAILABLE ? (
            <div className="flex w-full max-w-[272px] flex-col items-center">
              <CheckCircle2 className="h-6 w-6 text-foreground" />
              <h3 className="mt-4 text-base font-semibold text-foreground">{uiText("微信表情已下载")}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{uiText("打开本地文件夹，通过微信文件传输助手发送到手机。")}</p>
              {result?.folderPath ? <Button variant="outline" className="mt-5" onClick={() => onOpenPath(result.folderPath as string)}>{uiText("打开文件夹")}</Button> : null}
            </div>
          ) : qrDataUrl ? (
            <div className="flex w-full max-w-[296px] flex-col items-center">
              <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--ai-accent))]">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--ai-accent))] opacity-30 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--ai-accent))]" />
                </span>
                {uiText("分享已开启")}</div>
              <h3 className="mt-2 text-base font-semibold text-foreground">{uiText("用微信扫码")}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{uiText("手机无需与电脑连接同一网络")}</p>
              <div className="mt-4 rounded-xl bg-white p-3 shadow-sm">
                <img src={qrDataUrl} alt={uiText("公网微信导入页二维码")} className="h-[190px] w-[190px]" />
              </div>
              <ol className="mt-4 grid w-full grid-cols-3 gap-2 text-[11px] leading-4 text-muted-foreground">
                {[
                  ["1", "扫码打开"],
                  ["2", "长按图片"],
                  ["3", "保存或分享"]
                ].map(([step, label]) => (
                  <li key={step} className="flex flex-col items-center gap-1.5">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                      {step}
                    </span>
                    <span>{label}</span>
                  </li>
                ))}
              </ol>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => void navigator.clipboard.writeText(shareUrl)}
              >
                <Copy className="h-3.5 w-3.5" />
                {uiText("复制分享链接")}</Button>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {uiText("关闭弹窗后仍会保持在线，可在“更多 → 在线分享管理”中关闭。")}</p>
            </div>
          ) : (
            <div className="flex w-full max-w-[272px] flex-col items-center">
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-background text-foreground shadow-sm">
                <ScanQrCode className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-foreground">{uiText("发送到手机")}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {uiText("生成临时二维码，在手机上打开表情列表并长按保存。")}</p>
              <Button className="mt-6" onClick={onStartPhoneShare} disabled={sharing}>
                {sharing ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Smartphone className="h-4 w-4" />}
                {sharing ? uiText("正在生成") : uiText("生成二维码")}
              </Button>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{uiText("二维码会持续有效，直到手动关闭、到期或退出 APP")}</p>
            </div>
          )}
        </aside>
      </div>
      <DialogFooter className="min-h-[64px] items-center border-t border-border px-6 py-3 sm:justify-between">
        <Button variant="ghost" onClick={onBack} disabled={downloading}>{uiText("返回调整")}</Button>
        {downloaded ? <Button onClick={onDone}>{uiText("完成")}</Button> : <span />}
      </DialogFooter>
    </div>
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
