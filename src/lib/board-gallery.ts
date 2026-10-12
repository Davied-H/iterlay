import type { AssetLibraryItem, GenerationJob, ImageSource } from "@shared/types";

export type GallerySourceFilter = "all" | ImageSource;

export interface BoardGalleryItem {
  id: string;
  boardId: string;
  nodeId: string;
  jobId: string;
  imagePath: string;
  source: ImageSource;
  createdAt: string;
  prompt: string;
  job?: GenerationJob;
}

export type GallerySourceCounts = Record<GallerySourceFilter, number>;

export function buildBoardGalleryItems(
  boardId: string,
  history: GenerationJob[],
  assets: AssetLibraryItem[]
): BoardGalleryItem[] {
  const historyById = new Map(history.map((job) => [job.id, job]));

  return assets
    .filter((asset) => asset.boardId === boardId)
    .map((asset) => {
      const job = historyById.get(asset.jobId);
      return {
        id: `${asset.nodeId}:${asset.imagePath}`,
        boardId: asset.boardId,
        nodeId: asset.nodeId,
        jobId: asset.jobId,
        imagePath: asset.imagePath,
        source: asset.source,
        createdAt: job?.createdAt ?? asset.createdAt,
        prompt: job?.prompt || asset.prompt || "",
        job
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function filterBoardGalleryItems(
  items: BoardGalleryItem[],
  source: GallerySourceFilter
): BoardGalleryItem[] {
  return source === "all" ? items : items.filter((item) => item.source === source);
}

export function countBoardGallerySources(items: BoardGalleryItem[]): GallerySourceCounts {
  const counts: GallerySourceCounts = { all: items.length, generated: 0, upload: 0, slice: 0 };
  for (const item of items) counts[item.source] += 1;
  return counts;
}

export function gallerySourceLabel(source: ImageSource): string {
  if (source === "upload") return "本地上传";
  if (source === "slice") return "切图";
  return "AI 生成";
}
