import type { GenerateImageInput } from "./contracts/generation.js";
import type { BoardSavePayload } from "./contracts/board.js";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }

export function assertGenerateImageInput(value: unknown): asserts value is GenerateImageInput {
  if (!record(value) || !["generate", "edit"].includes(String(value.workflowMode))
    || !text(value.prompt, 100_000) || !value.prompt.trim()
    || !text(value.model, 1000) || !text(value.size, 100)
    || !Number.isInteger(value.n) || Number(value.n) < 1 || Number(value.n) > 99
    || !Array.isArray(value.referenceImages) || value.referenceImages.length > 4) throw new Error("图片生成参数无效。");
  if (value.idempotencyKey !== undefined && !text(value.idempotencyKey, 1024)) throw new Error("请求标识无效。");
  if (value.boardId !== undefined && !text(value.boardId, 200)) throw new Error("画板标识无效。");
  if (value.background !== undefined && !["auto", "opaque", "transparent"].includes(String(value.background))) throw new Error("图片背景选项无效。");
  if (value.quality !== undefined && !["auto", "low", "medium", "high"].includes(String(value.quality))) throw new Error("图片质量选项无效。");
  for (const image of value.referenceImages) {
    if (!record(image) || !text(image.id, 200) || !/^[a-zA-Z0-9_-]+$/u.test(image.id)
      || !text(image.name, 1000) || !text(image.mimeType, 100) || !image.mimeType.startsWith("image/")
      || !text(image.dataBase64, 35 * 1024 * 1024)) throw new Error("参考图片参数无效。");
  }
}

export function assertBoardSavePayload(value: unknown): asserts value is BoardSavePayload {
  if (!record(value) || !text(value.id, 200) || !/^[a-zA-Z0-9-]+$/u.test(value.id)) throw new Error("画板 ID 无效。");
  if (value.nodes !== undefined && (!Array.isArray(value.nodes) || value.nodes.length > 50_000)) throw new Error("画板节点参数无效。");
  if (value.connections !== undefined && (!Array.isArray(value.connections) || value.connections.length > 200_000)) throw new Error("画板连线参数无效。");
  if (value.expectedRevision !== undefined && (!Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < -1)) throw new Error("画板版本参数无效。");
  if (value.name !== undefined && !text(value.name, 10_000)) throw new Error("画板名称无效。");
}
