import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    // JSON.stringify itself is synchronous. Compact output reduces both that CPU work
    // and the bytes rewritten by stores that use whole-file atomic persistence.
    await writeFile(temporaryPath, JSON.stringify(value), "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export class MutationQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(mutation: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(mutation);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async idle(): Promise<void> {
    await this.tail;
  }
}
