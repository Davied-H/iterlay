import { useEffect, useRef, useState } from "react";
import { useStore } from "@xyflow/react";
import { peekCanvasThumbnail, requestCanvasThumbnail } from "../canvas-thumbnails";
import type { CanvasThumbnailSize } from "../canvas-thumbnail-scheduler";

const LOW_DETAIL_ZOOM = 0.5;
const FULL_RESOLUTION_ZOOM = 1;
const LOW_DETAIL_ENTER_ZOOM = 0.45;
const LOW_DETAIL_EXIT_ZOOM = 0.55;
const FULL_RESOLUTION_ENTER_ZOOM = 1.05;
const FULL_RESOLUTION_EXIT_ZOOM = 0.92;

export type CanvasZoomTier = "low" | "medium" | "full";

export function resolveCanvasZoomTier(zoom: number, previous?: CanvasZoomTier): CanvasZoomTier {
  if (!previous) {
    return zoom >= FULL_RESOLUTION_ZOOM ? "full" : zoom >= LOW_DETAIL_ZOOM ? "medium" : "low";
  }
  if (previous === "low") {
    if (zoom >= FULL_RESOLUTION_ENTER_ZOOM) return "full";
    return zoom >= LOW_DETAIL_EXIT_ZOOM ? "medium" : "low";
  }
  if (previous === "full") {
    if (zoom < LOW_DETAIL_ENTER_ZOOM) return "low";
    return zoom < FULL_RESOLUTION_EXIT_ZOOM ? "medium" : "full";
  }
  if (zoom < LOW_DETAIL_ENTER_ZOOM) return "low";
  if (zoom >= FULL_RESOLUTION_ENTER_ZOOM) return "full";
  return "medium";
}

function useCanvasZoomTier(): CanvasZoomTier {
  const tierRef = useRef<CanvasZoomTier | undefined>(undefined);
  return useStore<CanvasZoomTier>((state) => {
    const tier = resolveCanvasZoomTier(state.transform[2], tierRef.current);
    tierRef.current = tier;
    return tier;
  });
}

function useCanvasThumbnail(
  path: string,
  size: CanvasThumbnailSize,
  enabled: boolean
): string | null | undefined {
  const key = `${path}:${size}`;
  const [loaded, setLoaded] = useState<{ key: string; url: string | undefined } | null>(() => {
    const cached = peekCanvasThumbnail(path, size);
    return cached ? { key, url: cached } : null;
  });
  const cached = peekCanvasThumbnail(path, size);
  const thumbnail = loaded?.key === key ? loaded.url : cached ?? null;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const request = requestCanvasThumbnail(path, size, size === 480 ? "high" : "normal");
    void request.promise.then((url) => {
      if (active) setLoaded({ key, url });
    });
    return () => {
      active = false;
      request.cancel();
    };
  }, [enabled, key, path, size]);

  return thumbnail;
}

function useDecodedImageSource(
  preferredUrl: string | null | undefined,
  fallbackUrl: string
): { displayUrl: string; failed: boolean } {
  const nextUrl = preferredUrl || fallbackUrl;
  const sourceKey = `${preferredUrl ?? ""}\u0000${fallbackUrl}`;
  const [resolved, setResolved] = useState({ key: "", displayUrl: "", failed: false });

  useEffect(() => {
    let active = true;
    let probe: HTMLImageElement | null = null;
    setResolved({ key: sourceKey, displayUrl: "", failed: false });

    if (!nextUrl) {
      setResolved({ key: sourceKey, displayUrl: "", failed: true });
      return;
    }

    const load = (url: string, mayFallback: boolean): void => {
      probe = new Image();
      const currentProbe = probe;
      const commit = (): void => {
        if (!active || probe !== currentProbe) return;
        setResolved({ key: sourceKey, displayUrl: url, failed: false });
      };
      currentProbe.onload = () => {
        if (typeof currentProbe.decode === "function") {
          void currentProbe.decode().catch(() => undefined).then(commit);
        } else {
          commit();
        }
      };
      currentProbe.onerror = () => {
        if (!active || probe !== currentProbe) return;
        if (mayFallback && fallbackUrl && fallbackUrl !== url) {
          load(fallbackUrl, false);
          return;
        }
        setResolved({ key: sourceKey, displayUrl: "", failed: true });
      };
      currentProbe.src = url;
    };
    load(nextUrl, Boolean(preferredUrl));

    return () => {
      active = false;
      if (probe) {
        probe.onload = null;
        probe.onerror = null;
      }
    };
  }, [fallbackUrl, nextUrl, preferredUrl, sourceKey]);

  return resolved.key === sourceKey
    ? { displayUrl: resolved.displayUrl, failed: resolved.failed }
    : { displayUrl: "", failed: false };
}

export function useImageNodeSource(
  path: string,
  dataUrl: string,
  useThumbnailPreview: boolean
): { displayUrl: string; imageLoadFailed: boolean; zoomTier: CanvasZoomTier } {
  const zoomTier = useCanvasZoomTier();
  const thumbnailSize: CanvasThumbnailSize = zoomTier === "low" ? 192 : 480;
  const thumbnailUrl = useCanvasThumbnail(
    path,
    thumbnailSize,
    useThumbnailPreview && zoomTier !== "full"
  );
  const previewUrl = useThumbnailPreview && zoomTier !== "full" ? thumbnailUrl : null;
  const { displayUrl, failed: imageLoadFailed } = useDecodedImageSource(previewUrl, dataUrl);
  return { displayUrl, imageLoadFailed, zoomTier };
}
