import AdmZip from "adm-zip";
import { zipSync, type Zippable } from "fflate";
import { parentPort } from "node:worker_threads";

const maxEntries = 1_000;
const maxEntryBytes = 100 * 1024 * 1024;
const maxTotalBytes = 512 * 1024 * 1024;
const maxJsonBytes = 10 * 1024 * 1024;

type WorkerRequest =
  | { operation: "build"; entries: Array<[string, Uint8Array]> }
  | { operation: "parse"; archive: Uint8Array };

interface WorkerResponse {
  ok: boolean;
  value?: Uint8Array | Array<[string, Uint8Array]>;
  error?: string;
}

parentPort?.on("message", (request: WorkerRequest) => {
  try {
    const value =
      request.operation === "build" ? buildArchiveEntries(request.entries) : parseArchiveEntries(request.archive);
    const transferList = value instanceof Uint8Array
      ? [value.buffer as ArrayBuffer]
      : value.map(([, bytes]) => bytes.buffer as ArrayBuffer);
    parentPort?.postMessage({ ok: true, value } satisfies WorkerResponse, transferList);
  } catch (error) {
    parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
  }
});

export function buildArchiveEntries(entries: Array<[string, Uint8Array]>): Uint8Array {
  validateEntries(entries);
  const files: Zippable = Object.create(null) as Zippable;
  for (const [name, bytes] of entries) files[name] = bytes;
  return zipSync(files, { level: 6 });
}

export function parseArchiveEntries(archive: Uint8Array): Array<[string, Uint8Array]> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(Buffer.from(archive.buffer as ArrayBuffer, archive.byteOffset, archive.byteLength));
  } catch {
    throw new Error("文件不是有效的画板包（无法按 zip 解压）。");
  }

  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (entries.length > maxEntries) throw new Error(`画板包文件数量超过限制（最多 ${maxEntries} 个）。`);
  let totalBytes = 0;
  const result: Array<[string, Uint8Array]> = [];
  for (const entry of entries) {
    validateName(entry.entryName);
    const declaredSize = Number(entry.header.size);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > maxEntryBytes) {
      throw new Error(`画板包内文件过大：${entry.entryName}`);
    }
    totalBytes += declaredSize;
    if (totalBytes > maxTotalBytes) throw new Error("画板包解压后总大小超过限制（最多 512 MB）。");
    if (entry.entryName.endsWith(".json") && declaredSize > maxJsonBytes) {
      throw new Error(`画板包元数据文件过大：${entry.entryName}`);
    }
    // Give every entry an independently transferable backing buffer.
    result.push([entry.entryName, Uint8Array.from(entry.getData())]);
  }
  return result;
}

function validateEntries(entries: Array<[string, Uint8Array]>): void {
  if (entries.length > maxEntries) throw new Error(`画板包文件数量超过限制（最多 ${maxEntries} 个）。`);
  const names = new Set<string>();
  let totalBytes = 0;
  for (const [name, bytes] of entries) {
    validateName(name);
    if (names.has(name)) throw new Error(`画板包包含重复文件路径：${name}`);
    names.add(name);
    if (bytes.byteLength > maxEntryBytes) throw new Error(`画板包内文件过大：${name}`);
    totalBytes += bytes.byteLength;
    if (totalBytes > maxTotalBytes) throw new Error("画板包总大小超过限制（最多 512 MB）。");
  }
}

function validateName(name: string): void {
  if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
    throw new Error(`画板包包含不安全的文件路径：${name || "<empty>"}`);
  }
}
