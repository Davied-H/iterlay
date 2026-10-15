import { useUiText } from "@/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { VersionSeparationCanvas, type VersionSeparationPreviewAnchor, type VersionSeparationTarget } from "../VersionSeparationCanvas";
import { IMAGE_NODE_WIDTH, imageNodeHeight, type GeneratedImage, type VersionSeparationPlacement } from "../image-node-model";

const VERSION_SEPARATION_DELAY_MS = 460;

type SeparateVersionsCallback = (
  imageId: string,
  versionIndex: number | undefined,
  placement: VersionSeparationPlacement
) => void;

export type VersionSeparationSettlement = "committed" | "cancelled";
type VersionSeparationSettledCallback = (settlement: VersionSeparationSettlement) => void;

interface PendingVersionSeparation {
  timer: number;
  settle: VersionSeparationSettledCallback;
}

export function useDelayedVersionSeparation(
  image: GeneratedImage,
  onSeparateVersions: SeparateVersionsCallback | undefined
): (
  target: VersionSeparationTarget,
  placement: VersionSeparationPlacement,
  onSettled: VersionSeparationSettledCallback
) => void {
  const pendingRef = useRef<PendingVersionSeparation | null>(null);

  const cancel = useCallback((): void => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    window.clearTimeout(pending.timer);
    pending.settle("cancelled");
  }, []);

  useEffect(() => cancel, [cancel, image, onSeparateVersions]);

  return useCallback((target, placement, onSettled) => {
    cancel();
    if (!onSeparateVersions) {
      onSettled("cancelled");
      return;
    }
    const pending: PendingVersionSeparation = {
      timer: 0,
      settle: onSettled
    };
    pending.timer = window.setTimeout(() => {
      if (pendingRef.current !== pending) return;
      pendingRef.current = null;
      try {
        onSeparateVersions(image.id, target === "all" ? undefined : target, placement);
      } finally {
        pending.settle("committed");
      }
    }, VERSION_SEPARATION_DELAY_MS);
    pendingRef.current = pending;
  }, [cancel, image, onSeparateVersions]);
}

interface ImageNodeVersionsProps {
  image: GeneratedImage;
  visible: boolean;
  onSwitchVersion?: (imageId: string, index: number) => void;
  onSeparateVersions?: SeparateVersionsCallback;
}

export function ImageNodeVersions({
  image,
  visible,
  onSwitchVersion,
  onSeparateVersions
}: ImageNodeVersionsProps): React.ReactElement | null {
  const uiText = useUiText();

  const [versionPreviewOpen, setVersionPreviewOpen] = useState(false);
  const [versionSeparationTarget, setVersionSeparationTarget] = useState<VersionSeparationTarget | null>(null);
  const mountedRef = useRef(true);
  const { screenToFlowPosition } = useReactFlow();
  const versionCount = image.versions?.length ?? 0;
  const activeVersion = image.activeVersion ?? Math.max(0, versionCount - 1);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const scheduleSeparation = useDelayedVersionSeparation(image, onSeparateVersions);

  if (!visible || versionCount <= 1) return null;

  return (
    <div
      className="nodrag absolute bottom-2 left-1/2 z-20 -translate-x-1/2"
      onPointerEnter={() => setVersionPreviewOpen(true)}
      onPointerLeave={() => {
        if (versionSeparationTarget === null) setVersionPreviewOpen(false);
      }}
      onFocus={() => setVersionPreviewOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && versionSeparationTarget === null) {
          setVersionPreviewOpen(false);
        }
      }}
    >
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/95 px-1 py-0.5 shadow-sm transition-colors group-hover/version:bg-background">
        <button
          type="button"
          aria-label={uiText("上一个版本")}
          disabled={activeVersion <= 0}
          onClick={() => onSwitchVersion?.(image.id, activeVersion - 1)}
          className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          v{activeVersion + 1}/{versionCount}
        </span>
        <button
          type="button"
          aria-label={uiText("下一个版本")}
          disabled={activeVersion >= versionCount - 1}
          onClick={() => onSwitchVersion?.(image.id, activeVersion + 1)}
          className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      {onSeparateVersions && (versionPreviewOpen || versionSeparationTarget !== null) ? (
        <div className="absolute left-1/2 top-full -translate-x-1/2 pt-1">
          <VersionSeparationCanvas
            versions={image.versions ?? []}
            activeVersion={activeVersion}
            previewWidth={IMAGE_NODE_WIDTH}
            previewHeight={imageNodeHeight(image)}
            commitTarget={versionSeparationTarget}
            onRequestSeparation={(target, previewAnchor: VersionSeparationPreviewAnchor) => {
              if (versionSeparationTarget !== null) return;
              const placement: VersionSeparationPlacement = {
                position: screenToFlowPosition({ x: previewAnchor.clientX, y: previewAnchor.clientY }),
                previewIndex: previewAnchor.previewIndex
              };
              setVersionSeparationTarget(target);
              scheduleSeparation(target, placement, () => {
                if (!mountedRef.current) return;
                setVersionSeparationTarget(null);
                setVersionPreviewOpen(false);
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
