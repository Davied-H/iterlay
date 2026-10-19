import { isBoardImageNode, type BoardData, type BoardNodeSnapshot, type BoardNodeVersion } from "./contracts/board.js";
export { hasDeliveryReferencesToMovedVersions } from "./image-delivery-references.js";

export interface ImageVersionIdentity { imagePath: string; jobId: string }
export type ImageDeliveryFormat = "png" | "jpeg" | "webp";
export interface ImageDeliveryItem {
  id: string;
  nodeId: string;
  sourceVersion: ImageVersionIdentity;
  purpose: string;
  /** 相对项目目录的文件名，包含扩展名；不允许覆盖或路径穿越。 */
  relativePath: string;
  format: ImageDeliveryFormat;
  width?: number;
  height?: number;
  quality?: number;
}
export interface ImageDeliveryRecipe {
  id: string;
  name: string;
  items: ImageDeliveryItem[];
  updatedAt: string;
}
export interface ImageDeliveryManifest {
  format: "iterlay-image-delivery";
  version: 1;
  boardId: string;
  recipeId: string;
  recipeName: string;
  exportedAt: string;
  files: Array<{
    path: string;
    purpose: string;
    sourceNodeId: string;
    sourceVersion: { jobId: string; fileName: string; sha256: string };
    mimeType: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
  }>;
}
export interface ImageDeliveryExportResult { ok: boolean; path?: string; manifest?: ImageDeliveryManifest }

export function imageNodeVersions(node: BoardNodeSnapshot): BoardNodeVersion[] {
  return node.versions?.length ? node.versions : [{ imagePath: node.imagePath, jobId: node.jobId, width: node.width, height: node.height }];
}

export function resolveImageVersion(node: BoardNodeSnapshot, identity: ImageVersionIdentity): BoardNodeVersion {
  const matches = imageNodeVersions(node).filter((version) => version.imagePath === identity.imagePath && version.jobId === identity.jobId);
  if (matches.length !== 1) throw new Error("固定源版本已移除或无法唯一解析，请重新选择；不会自动改用当前版本。");
  return matches[0];
}

export function resolveDeliverySource(board: BoardData, item: ImageDeliveryItem): BoardNodeVersion {
  const node = board.nodes.find((candidate) => candidate.id === item.nodeId);
  if (!node || !isBoardImageNode(node)) throw new Error("交付源图片节点已移除，请重新选择。");
  return resolveImageVersion(node, item.sourceVersion);
}

/** 移动分离不能破坏现有固定交付源；复制分离不改变原节点，无需此限制。 */
export function validateDeliveryPath(value: string, format: ImageDeliveryFormat): string {
  if (!value || value !== value.trim() || value.length > 240 || value.startsWith("/") || /^[A-Za-z]:/u.test(value)
    || value.includes("\\") || [...value].some((character) => character.charCodeAt(0) < 32) || /[<>:"|?*]/u.test(value) || value.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/u.test(part)
      || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(part))) {
    throw new Error("请使用安全的相对文件路径，例如 assets/hero.png；不能包含路径穿越或系统保留名称。");
  }
  const validExtension = format === "jpeg" ? /\.jpe?g$/iu.test(value) : value.toLowerCase().endsWith(`.${format}`);
  if (!validExtension) throw new Error("文件扩展名必须与导出格式一致。");
  return value;
}

export function validateImageDeliveryRecipe(value: unknown): ImageDeliveryRecipe {
  if (!value || typeof value !== "object") throw new Error("交付配方无效。");
  const recipe = value as ImageDeliveryRecipe;
  if (typeof recipe.id !== "string" || !recipe.id || recipe.id.length > 100 || typeof recipe.name !== "string" || !recipe.name.trim() || recipe.name.length > 100
    || !Array.isArray(recipe.items) || recipe.items.length < 1 || recipe.items.length > 100) throw new Error("请填写配方名称，并添加 1–100 个交付文件。");
  const used = new Set<string>();
  const ids = new Set<string>();
  for (const item of recipe.items) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.nodeId !== "string" || !item.nodeId
      || !item.sourceVersion || typeof item.sourceVersion.imagePath !== "string" || !item.sourceVersion.imagePath || typeof item.sourceVersion.jobId !== "string" || !item.sourceVersion.jobId
      || typeof item.purpose !== "string" || !item.purpose.trim() || item.purpose.length > 200 || !["png", "jpeg", "webp"].includes(item.format)
      || typeof item.relativePath !== "string") throw new Error("交付文件需要用途、固定源版本、唯一条目和有效格式。");
    ids.add(item.id);
    const relative = validateDeliveryPath(item.relativePath, item.format).normalize("NFC").toLocaleLowerCase("en-US");
    if (used.has(relative) || relative === "manifest.json" || relative.startsWith("manifest.json/")) throw new Error("交付文件名重复，请为每个文件指定不同路径。");
    if ([...used].some((other) => relative.startsWith(`${other}/`) || other.startsWith(`${relative}/`))) throw new Error("交付路径中的文件和目录相互冲突。");
    used.add(relative);
    for (const size of [item.width, item.height]) if (size !== undefined && (!Number.isInteger(size) || size < 1 || size > 16384)) throw new Error("导出宽高须为 1–16384 的整数。");
    if ((item.width ?? 1) * (item.height ?? 1) > 32_000_000) throw new Error("单张导出图片不能超过 3200 万像素。");
    if (item.quality !== undefined && (!Number.isInteger(item.quality) || item.quality < 1 || item.quality > 100)) throw new Error("导出质量须为 1–100 的整数。");
  }
  return structuredClone(recipe);
}

/** 画板归档与导入统一重映射；缺失源保留不可解析的标记，不暗中换图。 */
export function remapImageDeliveryMetadata(
  recipes: ImageDeliveryRecipe[] | undefined,
  remapPath: (path: string) => string,
  remapNodeId: (id: string) => string = (id) => id,
  remapJobId: (id: string) => string = (id) => id
): ImageDeliveryRecipe[] | undefined {
  return recipes?.map((recipe) => ({ ...recipe, items: recipe.items.map((item) => ({
    ...item, nodeId: remapNodeId(item.nodeId), sourceVersion: {
      imagePath: remapPath(item.sourceVersion.imagePath), jobId: remapJobId(item.sourceVersion.jobId)
    }
  })) }));
}

export function remapFinalVersion(
  version: ImageVersionIdentity | undefined,
  remapPath: (path: string) => string,
  remapJobId: (id: string) => string = (id) => id
): ImageVersionIdentity | undefined {
  return version ? { imagePath: remapPath(version.imagePath), jobId: remapJobId(version.jobId) } : undefined;
}
