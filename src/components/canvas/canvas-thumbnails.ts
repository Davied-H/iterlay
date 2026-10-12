import {
  CanvasThumbnailScheduler,
  type CanvasThumbnailPriority,
  type CanvasThumbnailRequest,
  type CanvasThumbnailSize
} from "./canvas-thumbnail-scheduler";

const thumbnailScheduler = new CanvasThumbnailScheduler((path, size) => {
  const request = window.imageWorkbench?.getAssetThumbnail?.(path, size);
  return request ?? Promise.resolve(undefined);
});

export function peekCanvasThumbnail(path: string, size: CanvasThumbnailSize): string | undefined {
  return thumbnailScheduler.peek(path, size);
}

export function requestCanvasThumbnail(
  path: string,
  size: CanvasThumbnailSize,
  priority: CanvasThumbnailPriority = "normal"
): CanvasThumbnailRequest {
  return thumbnailScheduler.request(path, size, priority);
}
