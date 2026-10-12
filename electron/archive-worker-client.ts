import { Worker } from "node:worker_threads";

type ArchiveWorkerRequest =
  | { operation: "build"; entries: Array<[string, Uint8Array]> }
  | { operation: "parse"; archive: Uint8Array };

type ArchiveWorkerResult = Uint8Array | Array<[string, Uint8Array]>;

function runArchiveWorker(request: ArchiveWorkerRequest): Promise<ArchiveWorkerResult> {
  if (process.env.VITEST) {
    return import("./board-archive-worker.js").then((module) =>
      request.operation === "build"
        ? module.buildArchiveEntries(request.entries)
        : module.parseArchiveEntries(request.archive)
    );
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./board-archive-worker.js", import.meta.url));
    worker.once(
      "message",
      (message: { ok: boolean; value?: ArchiveWorkerResult; error?: string }) => {
        void worker.terminate();
        if (message.ok && message.value) resolve(message.value);
        else reject(new Error(message.error || "压缩包处理失败。"));
      }
    );
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`压缩包处理线程异常退出（${code}）。`));
    });
    const transferList = request.operation === "build"
      ? request.entries.map(([, bytes]) => bytes.buffer as ArrayBuffer)
      : [request.archive.buffer as ArrayBuffer];
    worker.postMessage(request, transferList);
  });
}

export async function buildArchiveInWorker(entries: Array<[string, Uint8Array]>): Promise<Buffer> {
  const transferableEntries = entries.map(([name, bytes]) => [name, ownedBytes(bytes)] as [string, Uint8Array]);
  const archive = await runArchiveWorker({ operation: "build", entries: transferableEntries }) as Uint8Array;
  return Buffer.from(archive.buffer as ArrayBuffer, archive.byteOffset, archive.byteLength);
}

export async function parseArchiveInWorker(archive: Uint8Array): Promise<Array<[string, Uint8Array]>> {
  return (await runArchiveWorker({ operation: "parse", archive: ownedBytes(archive) })) as Array<[string, Uint8Array]>;
}

function ownedBytes(bytes: Uint8Array): Uint8Array {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer
    ? bytes
    : Uint8Array.from(bytes);
}
