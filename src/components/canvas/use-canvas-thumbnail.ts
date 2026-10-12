import { useEffect, useState } from "react";
import type { CanvasThumbnailSize } from "./canvas-thumbnail-scheduler";
import { peekCanvasThumbnail, requestCanvasThumbnail } from "./canvas-thumbnails";

export function useCanvasThumbnail(
  sourcePath: string | undefined,
  fallbackDataUrl: string | undefined,
  size: CanvasThumbnailSize = 192,
  fallbackOnError = false
): string | undefined {
  const key = sourcePath ? `${sourcePath}:${size}` : `fallback:${fallbackDataUrl ?? ""}`;
  const [loaded, setLoaded] = useState<{ key: string; url: string | undefined }>(() => ({
    key,
    url: sourcePath ? peekCanvasThumbnail(sourcePath, size) : fallbackDataUrl
  }));
  const cached = sourcePath ? peekCanvasThumbnail(sourcePath, size) : fallbackDataUrl;
  const url = cached ?? (loaded.key === key ? loaded.url : undefined);

  useEffect(() => {
    if (!sourcePath) {
      setLoaded({ key, url: fallbackDataUrl });
      return;
    }
    const cached = peekCanvasThumbnail(sourcePath, size);
    setLoaded({ key, url: cached });
    if (cached) return;

    const request = requestCanvasThumbnail(sourcePath, size);
    let active = true;
    void request.promise.then((thumbnailUrl) => {
      if (active) {
        setLoaded({
          key,
          url: thumbnailUrl ?? (fallbackOnError ? fallbackDataUrl : undefined)
        });
      }
    });
    return () => {
      active = false;
      request.cancel();
    };
  }, [fallbackDataUrl, fallbackOnError, key, size, sourcePath]);

  return url;
}
