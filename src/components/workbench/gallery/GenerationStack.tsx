import { useUiText } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, ImageIcon, ImageOff, RotateCcw, X } from "lucide-react";
import { ReactBitsStack } from "@/components/workbench/gallery/ReactBitsStack";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getImageWorkbenchApi } from "@/lib/image-workbench-api";

interface GenerationStackProps {
  open: boolean;
  title: string;
  imagePaths: string[];
  imageUrls: Record<string, string | null | undefined>;
  onClose: () => void;
}

export function GenerationStack({
  open,
  title,
  imagePaths,
  imageUrls,
  onClose
}: GenerationStackProps): React.ReactElement {
  const uiText = useUiText();

  const reduceMotion = Boolean(useReducedMotion());
  const [topIndex, setTopIndex] = useState(0);
  const [originalUrlByPath, setOriginalUrlByPath] = useState<Record<string, string | null | undefined>>({});
  const [imageSizeByPath, setImageSizeByPath] = useState<Record<string, { width: number; height: number } | undefined>>({});
  const [failedByPath, setFailedByPath] = useState<Record<string, boolean | undefined>>({});
  const originalRequestRef = useRef(new Map<string, Promise<string | undefined>>());

  useEffect(() => {
    setTopIndex(0);
  }, [imagePaths]);

  const orderedPaths = useMemo(() => {
    if (imagePaths.length === 0) return [];
    const paths: string[] = [];
    for (let offset = imagePaths.length - 1; offset >= 0; offset -= 1) {
      paths.push(imagePaths[(topIndex + offset) % imagePaths.length]);
    }
    return paths;
  }, [imagePaths, topIndex]);

  const activePath = imagePaths[topIndex];

  useEffect(() => {
    if (!open || !activePath || originalUrlByPath[activePath] !== undefined) return;
    let cancelled = false;
    let request = originalRequestRef.current.get(activePath);
    if (!request) {
      let source: Promise<string | undefined>;
      try {
        source = getImageWorkbenchApi().readAssetDataUrl(activePath);
      } catch {
        source = Promise.resolve(undefined);
      }
      request = source.then((url) => {
        if (!url) originalRequestRef.current.delete(activePath);
        return url;
      }, () => {
        originalRequestRef.current.delete(activePath);
        return undefined;
      });
      originalRequestRef.current.set(activePath, request);
    }
    void request.then((url) => {
      if (cancelled) return;
      setOriginalUrlByPath((current) => ({ ...current, [activePath]: url ?? null }));
    });
    return () => { cancelled = true; };
  }, [activePath, open, originalUrlByPath]);

  const activePreviewUrl = activePath
    ? originalUrlByPath[activePath] || imageUrls[activePath]
    : undefined;

  useEffect(() => {
    if (!open || !activePath || !activePreviewUrl || imageSizeByPath[activePath]) return;
    let cancelled = false;
    const image = new Image();
    setFailedByPath((current) => current[activePath]
      ? { ...current, [activePath]: false }
      : current);
    image.onload = () => {
      if (cancelled || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      setImageSizeByPath((current) => ({
        ...current,
        [activePath]: { width: image.naturalWidth, height: image.naturalHeight }
      }));
    };
    image.onerror = () => {
      if (!cancelled) setFailedByPath((current) => ({ ...current, [activePath]: true }));
    };
    image.src = activePreviewUrl;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [activePath, activePreviewUrl, imageSizeByPath, open]);

  const retryPath = useCallback((path: string): void => {
    originalRequestRef.current.delete(path);
    setOriginalUrlByPath((current) => ({ ...current, [path]: undefined }));
    setImageSizeByPath((current) => ({ ...current, [path]: undefined }));
    setFailedByPath((current) => ({ ...current, [path]: false }));
  }, []);

  const cards = useMemo(() => orderedPaths.map((path) => {
    const originalIndex = imagePaths.indexOf(path);
    const url = originalUrlByPath[path] || imageUrls[path];
    const failed = failedByPath[path] || (
      originalUrlByPath[path] === null && imageUrls[path] === null
    );
    return (
      <div key={path} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-card ring-1 ring-border">
        {url && !failed ? (
          <img
            src={url}
            alt={uiText("{{ui:0}} 候选图 {{ui:1}}", [title, originalIndex + 1])}
            className="card-image object-contain"
            draggable={false}
            onError={() => setFailedByPath((current) => ({ ...current, [path]: true }))}
          />
        ) : failed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-white/[0.025] text-white/38">
            <ImageOff className="h-7 w-7" />
            <span className="text-xs">{uiText("图片无法读取")}</span>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/[0.025]">
            <ImageIcon className="h-7 w-7 text-white/28" />
          </div>
        )}
      </div>
    );
  }), [failedByPath, imagePaths, imageUrls, orderedPaths, originalUrlByPath, title, uiText]);

  const selectRelative = useCallback((offset: number): void => {
    if (imagePaths.length <= 1) return;
    setTopIndex((current) => (current + offset + imagePaths.length) % imagePaths.length);
  }, [imagePaths.length]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") selectRelative(-1);
      else if (event.key === "ArrowRight") selectRelative(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, selectRelative]);

  const handleTopCardChange = useCallback((orderedIndex: number): void => {
    const path = orderedPaths[orderedIndex];
    const originalIndex = imagePaths.indexOf(path);
    if (originalIndex >= 0) setTopIndex(originalIndex);
  }, [imagePaths, orderedPaths]);

  const singlePreviewUrl = imagePaths.length === 1
    ? originalUrlByPath[imagePaths[0]] || imageUrls[imagePaths[0]]
    : undefined;
  const singlePreviewSize = imagePaths.length === 1 ? imageSizeByPath[imagePaths[0]] : undefined;
  const singlePath = imagePaths.length === 1 ? imagePaths[0] : undefined;
  const singleFailed = Boolean(singlePath && (
    failedByPath[singlePath] || (
      originalUrlByPath[singlePath] === null && imageUrls[singlePath] === null
    )
  ));

  return (
    <AnimatePresence>
      {open && imagePaths.length === 1 && singlePreviewUrl && singlePreviewSize ? (
        <ImageZoomLightbox
          key={`${imagePaths[0]}:zoom`}
          src={singlePreviewUrl}
          alt={uiText("{{ui:0}} 放大预览", [title])}
          imageWidth={singlePreviewSize.width}
          imageHeight={singlePreviewSize.height}
          onClose={onClose}
        />
      ) : open && imagePaths.length === 1 ? (
        <motion.div
          key={`${imagePaths[0]}:loading`}
          role="dialog"
          aria-label={uiText("正在打开图片预览")}
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 dark:bg-black/80"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
        >
          {singleFailed && singlePath ? (
            <div className="flex flex-col items-center gap-3 text-white/60">
              <ImageOff className="h-7 w-7" />
              <p className="text-sm font-medium">{uiText("图片无法读取")}</p>
              <Button
                type="button"
                variant="outline"
                className="border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1] hover:text-white"
                onClick={() => retryPath(singlePath)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {uiText("重试")}</Button>
            </div>
          ) : (
            <ImageIcon className="h-6 w-6 text-white/28" />
          )}
          <button
            type="button"
            autoFocus
            aria-label={uiText("关闭放大预览")}
            onClick={onClose}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.07] text-white/55 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      ) : open ? (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col bg-black/70 dark:bg-black/80"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <TooltipProvider delayDuration={250}>
            <header className="relative z-20 flex h-12 shrink-0 items-center gap-3 px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-white/78">{title}</p>
                <p className="text-[10px] tabular-nums text-white/38">
                  {uiText("候选 ")}{Math.min(imagePaths.length, topIndex + 1)} / {imagePaths.length}
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white/55 hover:bg-white/[0.07] hover:text-white"
                    onClick={onClose}
                    aria-label={uiText("关闭候选图")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{uiText("关闭候选图")}</TooltipContent>
              </Tooltip>
            </header>

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div className="absolute inset-10 flex items-center justify-center pb-6 max-[640px]:inset-6">
                <div className="relative aspect-[4/3] h-auto max-h-full w-full max-w-[min(72vw,960px)]">
                  <ReactBitsStack
                    cards={cards}
                    sensitivity={110}
                    sendToBackOnClick
                    animationConfig={{ stiffness: 260, damping: 20 }}
                    mobileClickOnly
                    reduceMotion={reduceMotion}
                    onTopCardChange={handleTopCardChange}
                  />
                </div>
              </div>

              {imagePaths.length > 1 ? (
                <>
                  <GalleryArrow label={uiText("上一张候选图")} side="left" onClick={() => selectRelative(-1)} />
                  <GalleryArrow label={uiText("下一张候选图")} side="right" onClick={() => selectRelative(1)} />
                </>
              ) : null}
            </div>
          </TooltipProvider>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function GalleryArrow({
  label,
  side,
  onClick
}: {
  label: string;
  side: "left" | "right";
  onClick: () => void;
}): React.ReactElement {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`absolute ${side === "left" ? "left-5" : "right-5"} top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/70 text-white/58 ring-1 ring-white/10 hover:bg-white/10 hover:text-white`}
          onClick={onClick}
          aria-label={label}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
