import { isBoardImageNode, type BoardData, type BoardNodeSnapshot, type GenerationJob } from "./types.js";

export type FieldChapterId = "source" | "color" | "scene" | "poster" | "delivery";
export interface FieldChapterTarget {
  nodeId: string;
  versionIndex: number;
  imagePath: string;
  jobId: string;
}
export interface FieldChapter {
  id: FieldChapterId;
  title: string;
  description: string;
  targets: FieldChapterTarget[];
}

// Match retained task contents, never the original archive's remapped node/job IDs.
const FIELD_TASK_PREFIXES = {
  source: "Premium studio product photograph for fictional outdoor audio brand FIELD.",
  color: "Change only the orange speaker body, orange grille and orange top buttons to a muted sage green color.",
  scene: "Create a premium outdoor campaign photograph featuring exactly the same burnt orange FIELD speaker in the reference,",
  poster: "Design an exceptional minimal Swiss editorial square advertising poster for fictional portable audio brand FIELD"
} as const;

function versions(node: BoardNodeSnapshot): Array<{ imagePath: string; jobId: string }> {
  return node.versions?.length ? node.versions : [{ imagePath: node.imagePath, jobId: node.jobId }];
}

/** Resolves the imported example's real images and fixed versions without changing the board. */
export function resolveFieldChapters(
  board: Pick<BoardData, "name" | "nodes">,
  jobs: ReadonlyArray<Pick<GenerationJob, "id" | "prompt">>
): FieldChapter[] {
  const nodes = board.nodes.filter(isBoardImageNode);
  const nodeJobIds = new Set(nodes.flatMap((node) => versions(node).map((version) => version.jobId)));
  const jobIds = Object.fromEntries(Object.entries(FIELD_TASK_PREFIXES).map(([role, prefix]) => [
    role, new Set(jobs.filter((job) => nodeJobIds.has(job.id) && job.prompt.startsWith(prefix)).map((job) => job.id))
  ])) as Record<keyof typeof FIELD_TASK_PREFIXES, Set<string>>;
  const matches = Object.values(jobIds).filter((ids) => ids.size > 0).length;
  if (matches < 2 || (matches < 4 && !/\bFIELD\b/iu.test(board.name))) return [];

  const locate = (role: keyof typeof FIELD_TASK_PREFIXES): FieldChapterTarget[] => {
    // Teach v1 → v2 on the same edited node when that real chain is available.
    const preferred = role === "source" || role === "color"
      ? nodes.find((node) => versions(node).some((version) => jobIds.source.has(version.jobId))
        && versions(node).some((version) => jobIds.color.has(version.jobId)))
      : undefined;
    const node = preferred ?? nodes.find((candidate) => versions(candidate).some((version) => jobIds[role].has(version.jobId)));
    if (!node) return [];
    const versionIndex = versions(node).findIndex((version) => jobIds[role].has(version.jobId));
    if (versionIndex < 0) return [];
    return [{ nodeId: node.id, versionIndex, ...versions(node)[versionIndex] }];
  };
  const source = locate("source");
  const color = locate("color");
  const scene = locate("scene");
  const poster = locate("poster");
  return [
    { id: "source", title: "源图", description: "定位橙色原图，查看后续修改的起点。", targets: source },
    { id: "color", title: "改色", description: "定位绿色改色版本，与保留的橙色原图对比。", targets: color },
    { id: "scene", title: "场景", description: "定位户外场景，观察原始产品如何作为参考。", targets: scene },
    { id: "poster", title: "海报", description: "定位品牌海报，检查产品与排版结果。", targets: poster },
    { id: "delivery", title: "导出", description: "交付橙色主图、户外场景和海报；使用已有结果，不重新生成。", targets: source.length && scene.length && poster.length ? [...source, ...scene, ...poster] : [] }
  ];
}
