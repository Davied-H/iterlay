import { dialog, ipcMain, nativeImage } from "electron";
import type { BoardStore } from "./storage/board-store.js";
import type { AssetStore } from "./storage/asset-store.js";
import type { ImageTaskQueue } from "./image-worker-client.js";
import type { ImageDeliveryRecipe, ImageVersionIdentity } from "../shared/image-delivery.js";
import { decodeDeliveryToPng, encodeDeliveryWebp } from "./image-delivery-webp.js";
import { buildImageDelivery, encodeDeliveryImage, writeImageDeliveryArchive } from "./image-delivery.js";

export interface ImageDeliveryIpcDependencies {
  boards: Pick<BoardStore, "getBoard" | "setImageFinalVersion" | "saveImageDeliveryRecipe" | "removeImageDeliveryRecipe">;
  assets: Pick<AssetStore, "readManagedBytes">;
  imageTasks: Pick<ImageTaskQueue, "run">;
}
function requireBoardId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{1,200}$/u.test(value)) throw new Error("画板 ID 无效。");
}
export function registerImageDeliveryIpc({ boards, assets, imageTasks }: ImageDeliveryIpcDependencies): void {
  ipcMain.handle("imageDelivery:setFinalVersion", async (_event, input: { boardId: string; nodeId: string; version: ImageVersionIdentity | null }) => {
    requireBoardId(input?.boardId);
    return boards.setImageFinalVersion(input.boardId, input.nodeId, input.version);
  });
  ipcMain.handle("imageDelivery:saveRecipe", async (_event, input: { boardId: string; recipe: ImageDeliveryRecipe }) => {
    requireBoardId(input?.boardId);
    return boards.saveImageDeliveryRecipe(input.boardId, input.recipe);
  });
  ipcMain.handle("imageDelivery:removeRecipe", async (_event, input: { boardId: string; recipeId: string }) => {
    requireBoardId(input?.boardId);
    return boards.removeImageDeliveryRecipe(input.boardId, input.recipeId);
  });
  ipcMain.handle("imageDelivery:export", async (_event, input: { boardId: string; recipeId: string }) => {
    requireBoardId(input?.boardId);
    const board = await boards.getBoard(input.boardId);
    if (!board) throw new Error("画板不存在。");
    const recipe = board.deliveryRecipes?.find((item) => item.id === input.recipeId);
    if (!recipe) throw new Error("交付配方不存在，请先保存配方。");
    const result = await dialog.showSaveDialog({
      defaultPath: `${recipe.name.replace(/[<>:"/\\|?*]/gu, "-")}.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };
    const { archive, manifest } = await buildImageDelivery(board, recipe, (imagePath) => assets.readManagedBytes(imagePath), (bytes, item) => imageTasks.run(() => encodeDeliveryImage(bytes, item, {
      createImage: (value) => nativeImage.createFromBuffer(value),
      createBitmap: (value, size) => nativeImage.createFromBitmap(value, size),
      decodeToPng: decodeDeliveryToPng,
      webp: encodeDeliveryWebp
    })));
    await writeImageDeliveryArchive(result.filePath, archive);
    return { ok: true, path: result.filePath, manifest };
  });
}
