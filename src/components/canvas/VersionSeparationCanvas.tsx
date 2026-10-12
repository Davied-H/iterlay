import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageVersion } from "./ImageNode";

const PREVIEW_SIZE = 42;
const PREVIEW_GAP = 10;
const HORIZONTAL_PADDING = 8;
const PREVIEW_TOP = 30;
const ALL_BUTTON_WIDTH = 60;
const ALL_BUTTON_HEIGHT = 20;
const ALL_BUTTON_TOP = 82;
const FULL_PREVIEW_TOP = 112;
const OPEN_ANIMATION_MS = 380;
const COMMIT_ANIMATION_MS = 460;

export type VersionSeparationTarget = number | "all";

export function shouldAnimateVersionPreview(
  now: number,
  mountedAt: number,
  commitStartedAt: number | null,
  hovered: boolean
): boolean {
  return (
    now - mountedAt < OPEN_ANIMATION_MS ||
    (commitStartedAt !== null && now - commitStartedAt < COMMIT_ANIMATION_MS) ||
    hovered
  );
}

export interface VersionSeparationPreviewAnchor {
  clientX: number;
  clientY: number;
  previewIndex: number;
}

interface VersionSeparationCanvasProps {
  versions: ImageVersion[];
  activeVersion: number;
  previewWidth: number;
  previewHeight: number;
  commitTarget: VersionSeparationTarget | null;
  onRequestSeparation: (
    target: VersionSeparationTarget,
    previewAnchor: VersionSeparationPreviewAnchor
  ) => void;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutBack(value: number): number {
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function themeColor(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `hsl(${value})` : fallback;
}

export function VersionSeparationCanvas({
  versions,
  activeVersion,
  previewWidth,
  previewHeight,
  commitTarget,
  onRequestSeparation
}: VersionSeparationCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountedAtRef = useRef(performance.now());
  const commitStartedAtRef = useRef<number | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<VersionSeparationTarget | null>(null);
  const [previewIndex, setPreviewIndex] = useState(activeVersion);
  const images = useMemo(() => versions.map((version) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = version.dataUrl;
    return image;
  }), [versions]);
  const controlsWidth = versions.length * PREVIEW_SIZE + Math.max(0, versions.length - 1) * PREVIEW_GAP + HORIZONTAL_PADDING * 2;
  const width = Math.max(controlsWidth, previewWidth);
  const controlsLeft = (width - controlsWidth) / 2;
  const centerX = width / 2;
  const height = FULL_PREVIEW_TOP + previewHeight;

  function requestSeparation(target: VersionSeparationTarget): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const selectedPreviewIndex = target === "all" ? previewIndex : target;
    onRequestSeparation(target, {
      clientX: bounds.left + ((width - previewWidth) / 2 / width) * bounds.width,
      clientY: bounds.top + (FULL_PREVIEW_TOP / height) * bounds.height,
      previewIndex: selectedPreviewIndex
    });
  }

  useEffect(() => {
    setPreviewIndex(activeVersion);
  }, [activeVersion]);

  useEffect(() => {
    if (commitTarget !== null && commitStartedAtRef.current === null) {
      commitStartedAtRef.current = performance.now();
    }
    if (commitTarget === null) commitStartedAtRef.current = null;
  }, [commitTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const foreground = themeColor("--foreground", "#171717");
    const mutedForeground = themeColor("--muted-foreground", "#737373");
    const background = themeColor("--background", "#ffffff");
    const muted = themeColor("--muted", "#f1f1f1");
    const border = themeColor("--border", "#d4d4d4");
    let animationFrame = 0;
    let disposed = false;

    function scheduleDraw(): void {
      if (disposed || animationFrame !== 0) return;
      animationFrame = requestAnimationFrame(draw);
    }

    function draw(now: number): void {
      if (!context) return;
      animationFrame = 0;
      context.clearRect(0, 0, width, height);
      const openProgress = easeOutBack(clamp((now - mountedAtRef.current) / 300));
      const arrowProgress = easeOutCubic(clamp((now - mountedAtRef.current) / 240));
      const commitProgress = commitStartedAtRef.current === null
        ? 0
        : easeOutCubic(clamp((now - commitStartedAtRef.current) / 420));

      versions.forEach((_, index) => {
        const finalCenterX = controlsLeft + HORIZONTAL_PADDING + index * (PREVIEW_SIZE + PREVIEW_GAP) + PREVIEW_SIZE / 2;
        const previewCenterX = centerX + (finalCenterX - centerX) * openProgress;
        const previewCenterY = 8 + (PREVIEW_TOP + PREVIEW_SIZE / 2 - 8) * openProgress;
        const isHovered = hoveredTarget === index;
        const isCommitting = commitTarget === "all" || commitTarget === index;
        const isDimmed = commitTarget !== null && !isCommitting;
        const scale = 0.62 + openProgress * 0.38 + (isHovered ? 0.06 : 0) + Math.sin(commitProgress * Math.PI) * (isCommitting ? 0.06 : 0);
        const size = PREVIEW_SIZE * scale;
        const x = previewCenterX - size / 2;
        const y = previewCenterY - size / 2;

        const arrowEndX = centerX + (finalCenterX - centerX) * arrowProgress;
        const arrowEndY = 5 + (PREVIEW_TOP - 4 - 5) * arrowProgress;
        const controlX = centerX + (finalCenterX - centerX) * 0.5 * arrowProgress;
        const controlY = 14;
        context.save();
        context.globalAlpha = isDimmed ? 0.28 : arrowProgress;
        context.strokeStyle = isHovered ? foreground : mutedForeground;
        context.fillStyle = context.strokeStyle;
        context.lineWidth = isHovered ? 1.5 : 1;
        context.beginPath();
        context.moveTo(centerX, 4);
        context.quadraticCurveTo(controlX, controlY, arrowEndX, arrowEndY);
        context.stroke();
        if (arrowProgress > 0.65) {
          const angle = Math.atan2(arrowEndY - controlY, arrowEndX - controlX);
          context.beginPath();
          context.moveTo(arrowEndX, arrowEndY);
          context.lineTo(arrowEndX - 4 * Math.cos(angle - Math.PI / 6), arrowEndY - 4 * Math.sin(angle - Math.PI / 6));
          context.lineTo(arrowEndX - 4 * Math.cos(angle + Math.PI / 6), arrowEndY - 4 * Math.sin(angle + Math.PI / 6));
          context.closePath();
          context.fill();
        }
        context.restore();

        context.save();
        context.globalAlpha = (isDimmed ? 0.38 : 0.78 + (isHovered ? 0.12 : 0) + (isCommitting ? commitProgress * 0.22 : 0)) * clamp(openProgress);
        context.beginPath();
        context.roundRect(x, y, size, size, 5);
        context.clip();
        context.fillStyle = background;
        context.fillRect(x, y, size, size);
        const image = images[index];
        if (image?.complete && image.naturalWidth > 0) {
          const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
          context.drawImage(
            image,
            (image.naturalWidth - sourceSize) / 2,
            (image.naturalHeight - sourceSize) / 2,
            sourceSize,
            sourceSize,
            x,
            y,
            size,
            size
          );
        }
        context.restore();

        context.save();
        context.globalAlpha = (isDimmed ? 0.35 : 1) * clamp(openProgress);
        context.lineWidth = isHovered ? 1.75 : 1.25;
        context.beginPath();
        context.roundRect(x + 0.625, y + 0.625, size - 1.25, size - 1.25, 5);
        if (!isCommitting || commitProgress < 1) {
          context.setLineDash([4, 3]);
          context.lineDashOffset = -now / 45;
          context.strokeStyle = isHovered ? foreground : mutedForeground;
          context.globalAlpha *= isCommitting ? 1 - commitProgress : 1;
          context.stroke();
        }
        if (isCommitting && commitProgress > 0) {
          context.setLineDash([]);
          context.strokeStyle = foreground;
          context.globalAlpha = commitProgress;
          context.stroke();
        }
        context.restore();

        if (openProgress > 0.8) {
          context.save();
          context.globalAlpha = isDimmed ? 0.35 : clamp((openProgress - 0.8) * 5);
          context.fillStyle = "rgba(0, 0, 0, 0.62)";
          context.beginPath();
          context.roundRect(previewCenterX - 9, previewCenterY + size / 2 - 13, 18, 11, 3);
          context.fill();
          context.fillStyle = "#ffffff";
          context.font = "500 8px Inter, ui-sans-serif, system-ui, sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(`v${index + 1}`, previewCenterX, previewCenterY + size / 2 - 7.5);
          context.restore();
        }
      });

      const allHovered = hoveredTarget === "all";
      const allCommitting = commitTarget === "all";
      context.save();
      context.globalAlpha = clamp((openProgress - 0.45) / 0.55) * (commitTarget !== null && !allCommitting ? 0.35 : 1);
      context.fillStyle = allHovered || allCommitting ? muted : background;
      context.strokeStyle = allHovered || allCommitting ? foreground : border;
      context.lineWidth = allHovered ? 1.5 : 1;
      context.beginPath();
      context.roundRect(centerX - ALL_BUTTON_WIDTH / 2, ALL_BUTTON_TOP, ALL_BUTTON_WIDTH, ALL_BUTTON_HEIGHT, 5);
      context.fill();
      context.stroke();
      context.fillStyle = foreground;
      context.font = "500 9px Inter, ui-sans-serif, system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(allCommitting ? "分离中" : "全部分离", centerX, ALL_BUTTON_TOP + ALL_BUTTON_HEIGHT / 2 + 0.5);
      context.restore();

      const selectedImage = images[previewIndex] ?? images[activeVersion] ?? images[0];
      const fullPreviewX = (width - previewWidth) / 2;
      const fullPreviewProgress = easeOutCubic(clamp((now - mountedAtRef.current - 90) / 260));
      const fullPreviewCommitting = commitTarget === "all" || commitTarget === previewIndex;
      context.save();
      context.globalAlpha = fullPreviewProgress * (0.76 + (fullPreviewCommitting ? commitProgress * 0.24 : 0));
      context.beginPath();
      context.roundRect(fullPreviewX, FULL_PREVIEW_TOP, previewWidth, previewHeight, 8);
      context.clip();
      context.fillStyle = background;
      context.fillRect(fullPreviewX, FULL_PREVIEW_TOP, previewWidth, previewHeight);
      if (selectedImage?.complete && selectedImage.naturalWidth > 0) {
        const sourceAspect = selectedImage.naturalWidth / selectedImage.naturalHeight;
        const destinationAspect = previewWidth / previewHeight;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = selectedImage.naturalWidth;
        let sourceHeight = selectedImage.naturalHeight;
        if (sourceAspect > destinationAspect) {
          sourceWidth = selectedImage.naturalHeight * destinationAspect;
          sourceX = (selectedImage.naturalWidth - sourceWidth) / 2;
        } else if (sourceAspect < destinationAspect) {
          sourceHeight = selectedImage.naturalWidth / destinationAspect;
          sourceY = (selectedImage.naturalHeight - sourceHeight) / 2;
        }
        context.drawImage(
          selectedImage,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          fullPreviewX,
          FULL_PREVIEW_TOP,
          previewWidth,
          previewHeight
        );
      }
      context.restore();

      context.save();
      context.globalAlpha = fullPreviewProgress;
      context.lineWidth = 1.5;
      context.beginPath();
      context.roundRect(
        fullPreviewX + 0.75,
        FULL_PREVIEW_TOP + 0.75,
        previewWidth - 1.5,
        previewHeight - 1.5,
        8
      );
      if (!fullPreviewCommitting || commitProgress < 1) {
        context.setLineDash([6, 4]);
        context.lineDashOffset = -now / 45;
        context.strokeStyle = hoveredTarget === previewIndex ? foreground : mutedForeground;
        context.globalAlpha *= fullPreviewCommitting ? 1 - commitProgress : 1;
        context.stroke();
      }
      if (fullPreviewCommitting && commitProgress > 0) {
        context.setLineDash([]);
        context.strokeStyle = foreground;
        context.globalAlpha = fullPreviewProgress * commitProgress;
        context.stroke();
      }
      context.restore();

      context.save();
      context.globalAlpha = fullPreviewProgress;
      context.fillStyle = "rgba(0, 0, 0, 0.62)";
      context.beginPath();
      context.roundRect(fullPreviewX + 8, FULL_PREVIEW_TOP + 8, 22, 15, 4);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "500 9px Inter, ui-sans-serif, system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(`v${previewIndex + 1}`, fullPreviewX + 19, FULL_PREVIEW_TOP + 15.5);
      context.restore();

      if (shouldAnimateVersionPreview(
        now,
        mountedAtRef.current,
        commitStartedAtRef.current,
        hoveredTarget !== null
      )) {
        scheduleDraw();
      }
    }

    for (const image of images) image.addEventListener("load", scheduleDraw);
    scheduleDraw();
    return () => {
      disposed = true;
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame);
      for (const image of images) image.removeEventListener("load", scheduleDraw);
    };
  }, [
    activeVersion,
    centerX,
    commitTarget,
    controlsLeft,
    height,
    hoveredTarget,
    images,
    previewHeight,
    previewIndex,
    previewWidth,
    versions,
    width
  ]);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" />
      {versions.map((_, index) => (
        <button
          key={index}
          type="button"
          disabled={commitTarget !== null}
          aria-label={`分离版本 ${index + 1}`}
          className="absolute rounded-md opacity-0 focus-visible:opacity-0 focus-visible:outline-none"
          style={{
            left: controlsLeft + HORIZONTAL_PADDING + index * (PREVIEW_SIZE + PREVIEW_GAP),
            top: PREVIEW_TOP,
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE
          }}
          onPointerEnter={() => {
            setHoveredTarget(index);
            setPreviewIndex(index);
          }}
          onPointerLeave={() => setHoveredTarget(null)}
          onFocus={() => {
            setHoveredTarget(index);
            setPreviewIndex(index);
          }}
          onBlur={() => setHoveredTarget(null)}
          onClick={(event) => {
            event.stopPropagation();
            requestSeparation(index);
          }}
        />
      ))}
      <button
        type="button"
        disabled={commitTarget !== null}
        aria-label="全部分离"
        className="absolute rounded-md opacity-0 focus-visible:opacity-0 focus-visible:outline-none"
        style={{
          left: centerX - ALL_BUTTON_WIDTH / 2,
          top: ALL_BUTTON_TOP,
          width: ALL_BUTTON_WIDTH,
          height: ALL_BUTTON_HEIGHT
        }}
        onPointerEnter={() => setHoveredTarget("all")}
        onPointerLeave={() => setHoveredTarget(null)}
        onFocus={() => setHoveredTarget("all")}
        onBlur={() => setHoveredTarget(null)}
        onClick={(event) => {
          event.stopPropagation();
          requestSeparation("all");
        }}
      />
    </div>
  );
}
