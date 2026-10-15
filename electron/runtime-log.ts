import { mkdirSync, statSync } from "node:fs";
import { appendFile, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "node:util";
import AdmZip from "adm-zip";

export function redactLog(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(["']?(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|authorization|secret|password|credential|cookie)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^,\s;}]+)/gi, "$1[REDACTED]")
    .replace(/data:(?:image|audio|video)\/[^;]+;base64,[a-z0-9+/=]+/gi, "[MEDIA OMITTED]");
}

export class RuntimeLog {
  private bytes = 0;
  private failed = false;
  readonly filePath: string;

  constructor(directory: string, private readonly maxBytes = 5 * 1024 * 1024) {
    mkdirSync(directory, { recursive: true });
    this.filePath = path.join(directory, "runtime.log");
    try {
      this.bytes = statSync(this.filePath).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private readonly queued: string[] = [];
  private queuedBytes = 0;
  private scheduled: ReturnType<typeof setImmediate> | null = null;
  private writing: Promise<void> | null = null;
  private dropped = 0;

  record(source: string, level: string, ...args: unknown[]): void {
    if (this.failed) return;
    const message = redactLog(format(...args)).slice(0, 64 * 1024);
    const line = `${new Date().toISOString()} [${source}] [${level}] ${message}\n`;
    const bytes = Buffer.byteLength(line);
    if (this.queuedBytes + bytes > 1024 * 1024) { this.dropped++; return; }
    this.queued.push(line);
    this.queuedBytes += bytes;
    if (!this.scheduled) this.scheduled = setImmediate(() => {
      this.scheduled = null;
      void this.flush();
    });
  }

  flush(): Promise<void> {
    if (this.scheduled) clearImmediate(this.scheduled);
    this.scheduled = null;
    if (this.writing) return this.writing;
    const task = this.drain().catch((error) => {
      if (!this.failed) process.stderr.write(`Runtime log write failed: ${String(error)}\n`);
      this.failed = true;
      this.queued.length = 0;
      this.queuedBytes = 0;
    });
    this.writing = task;
    void task.finally(() => { if (this.writing === task) this.writing = null; });
    return task;
  }

  private async drain(): Promise<void> {
    while (this.queued.length) {
      const lines = this.queued.splice(0);
      this.queuedBytes = 0;
      if (this.dropped) {
        lines.push(`${new Date().toISOString()} [main] [warn] ${this.dropped} log messages omitted during a burst\n`);
        this.dropped = 0;
      }
      let batch = "";
      const append = async (): Promise<void> => {
        if (!batch) return;
        await appendFile(this.filePath, batch, { mode: 0o600 });
        batch = "";
      };
      for (const line of lines) {
        const size = Buffer.byteLength(line);
        if (this.bytes + size > this.maxBytes) {
          await append();
          await rm(`${this.filePath}.5`, { force: true });
          for (let index = 4; index >= 0; index--) {
            const from = index === 0 ? this.filePath : `${this.filePath}.${index}`;
            try { await rename(from, `${this.filePath}.${index + 1}`); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
          }
          this.bytes = 0;
        }
        batch += line;
        this.bytes += size;
      }
      await append();
    }
  }

  captureConsole(): void {
    for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        this.record("main", level, ...args);
        original(...args);
      };
    }
    // Monitor rather than handle: preserve Node's fatal exception behavior.
    process.on("uncaughtExceptionMonitor", (error) => this.record("main", "fatal", error));
  }
}

export async function exportLogArchive(
  directory: string,
  destination: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const zip = new AdmZip();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^(?:runtime\.log(?:\.[1-5])?|pi-agent\.jsonl)$/.test(entry.name)) continue;
    zip.addFile(entry.name, Buffer.from(redactLog(await readFile(path.join(directory, entry.name), "utf8"))));
  }
  zip.addFile("manifest.json", Buffer.from(JSON.stringify({
    ...metadata,
    exportedAt: new Date().toISOString(),
    scope: "Retained main/renderer console and Pi agent logs. Older rotated logs and events before logging was installed are unavailable.",
    privacy: "Common credentials are redacted. Logs may still contain prompts, paths and personal information. Review before sharing."
  }, null, 2)));
  const bytes = await new Promise<Buffer>((resolve, reject) => zip.toBuffer(resolve, reject));
  await writeFile(destination, bytes, { mode: 0o600 });
}
