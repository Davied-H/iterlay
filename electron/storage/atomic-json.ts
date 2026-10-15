import { mkdir, open, rename, rm } from "node:fs/promises";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const pendingMutations = new Set<Promise<unknown>>();
function trackMutation<T>(mutation: Promise<T>): Promise<T> {
  pendingMutations.add(mutation);
  void mutation.finally(() => pendingMutations.delete(mutation)).catch(() => undefined);
  return mutation;
}

/** Wait for local commits already accepted by application services before quitting. */
export async function waitForStorageMutations(): Promise<void> {
  while (pendingMutations.size) await Promise.allSettled([...pendingMutations]);
}

export function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  return trackMutation(writeDurableJson(filePath, value));
}

async function writeDurableJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    // JSON.stringify itself is synchronous. Compact output reduces both that CPU work
    // and the bytes rewritten by stores that use whole-file atomic persistence.
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value), "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

/** Compatibility writer for synchronous setters; IPC uses async transactions. */
export function writeJsonAtomicSync(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, JSON.stringify(value), "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
  }
}

export class MutationQueue {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly prepare?: () => Promise<void>) {}

  run<T>(mutation: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(async () => {
      await this.prepare?.();
      return mutation();
    });
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return trackMutation(result);
  }

  async idle(): Promise<void> {
    await this.tail;
    await this.prepare?.();
  }
}
