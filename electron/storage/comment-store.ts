import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AssetComment } from "../../shared/types.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

/** 素材/图片评论的落盘存储：按图片文件 imagePath 归属，与画板/历史平级的一个 JSON 文件。 */
export class CommentStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();
  private cache: AssetComment[] | null = null;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, "comments.json");
  }

  async list(): Promise<AssetComment[]> {
    await this.mutations.idle();
    const comments = await this.read();
    return comments.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async add(imagePath: string, text: string, position?: AssetComment["position"]): Promise<AssetComment> {
    return this.mutations.run(async () => {
      const comments = await this.read();
      const comment: AssetComment = {
        id: crypto.randomUUID(),
        imagePath,
        text,
        createdAt: new Date().toISOString(),
        ...(isCommentPosition(position) ? { position: normalizeCommentPosition(position) } : {})
      };
      comments.push(comment);
      await this.write(comments);
      return comment;
    });
  }

  async remove(id: string): Promise<void> {
    await this.mutations.run(async () => {
      const comments = await this.read();
      const remaining = comments.filter((comment) => comment.id !== id);
      if (remaining.length !== comments.length) await this.write(remaining);
    });
  }

  async updatePosition(
    id: string,
    position: NonNullable<AssetComment["position"]>
  ): Promise<AssetComment | null> {
    return this.mutations.run(async () => {
      const comments = await this.read();
      const index = comments.findIndex((comment) => comment.id === id);
      if (index < 0) return null;
      const updated: AssetComment = {
        ...comments[index],
        position: normalizeCommentPosition(position)
      };
      comments[index] = updated;
      await this.write(comments);
      return updated;
    });
  }

  /** 导入画板包时批量落库评论：分配新 id 追加，保留原 imagePath/text/createdAt。 */
  async importMany(comments: AssetComment[]): Promise<void> {
    if (comments.length === 0) return;
    await this.mutations.run(async () => {
      const existing = await this.read();
      const incoming: AssetComment[] = comments.map((comment) => ({
        id: crypto.randomUUID(),
        imagePath: comment.imagePath,
        text: comment.text,
        createdAt: comment.createdAt || new Date().toISOString(),
        ...(isCommentPosition(comment.position)
          ? { position: normalizeCommentPosition(comment.position) }
          : {})
      }));
      await this.write([...existing, ...incoming]);
    });
  }

  private async read(): Promise<AssetComment[]> {
    if (this.cache) return structuredClone(this.cache);
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as AssetComment[];
      this.cache = Array.isArray(parsed) ? parsed : [];
      return structuredClone(this.cache);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async write(comments: AssetComment[]): Promise<void> {
    await writeJsonAtomic(this.filePath, comments);
    this.cache = structuredClone(comments);
  }
}

function isCommentPosition(position: AssetComment["position"]): position is NonNullable<AssetComment["position"]> {
  return Boolean(position && Number.isFinite(position.x) && Number.isFinite(position.y));
}

function normalizeCommentPosition(
  position: NonNullable<AssetComment["position"]>
): NonNullable<AssetComment["position"]> {
  return {
    x: Math.min(1, Math.max(0, position.x)),
    y: Math.min(1, Math.max(0, position.y))
  };
}
