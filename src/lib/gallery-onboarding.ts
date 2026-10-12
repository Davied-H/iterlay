import type { GenerationJob } from "@shared/types";

const MIN_GALLERY_IMAGE_COUNT = 6;
const MIN_GALLERY_DAY_COUNT = 2;

function localDayKey(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 画廊首次引导仅在内容足以形成跨日回顾时出现。 */
interface GalleryTourImage {
  path: string;
  jobId: string;
  pending?: boolean;
}

export function hasGalleryTourContent(
  history: GenerationJob[],
  boardId: string,
  images: GalleryTourImage[]
): boolean {
  const jobsById = new Map(history.map((job) => [job.id, job]));
  const imagePaths = new Set<string>();
  const dayKeys = new Set<string>();

  for (const image of images) {
    if (!image.path || image.pending || imagePaths.has(image.path)) continue;
    const job = jobsById.get(image.jobId);
    if (!job || job.boardId !== boardId || job.status !== "succeeded") continue;
    const dayKey = localDayKey(job.createdAt);
    if (!dayKey) continue;
    imagePaths.add(image.path);
    dayKeys.add(dayKey);
  }

  return imagePaths.size >= MIN_GALLERY_IMAGE_COUNT && dayKeys.size >= MIN_GALLERY_DAY_COUNT;
}
