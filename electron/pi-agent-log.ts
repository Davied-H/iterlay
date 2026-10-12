import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  PiAgentLogEntry,
  PiAgentLogInput,
  PiAgentLogSnapshot
} from "../shared/pi-agent-log.js";

const MAX_MEMORY_ENTRIES = 1_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_STRING_LENGTH = 2_000;
const MAX_COLLECTION_ITEMS = 30;
const SENSITIVE_KEY = /(?:api[-_]?key|token|authorization|secret|password|credential|cookie)/iu;
const LARGE_CONTENT_KEY = /^(?:html|code|base64|data|image|imageData|sourceImage)$/iu;

type LogListener = (entry: PiAgentLogEntry) => void;

export class PiAgentLogStore {
  readonly logPath: string;
  private readonly entries: PiAgentLogEntry[] = [];
  private readonly listeners = new Set<LogListener>();
  private writeQueue: Promise<void> = Promise.resolve();
  private approximateFileBytes = 0;

  constructor(logDirectory: string) {
    this.logPath = path.join(logDirectory, "pi-agent.jsonl");
  }

  async start(): Promise<void> {
    await mkdir(path.dirname(this.logPath), { recursive: true });
    const existing = await this.readRecentEntries();
    this.entries.push(...existing.slice(-MAX_MEMORY_ENTRIES));
    await writeFile(this.logPath, "", { flag: "a" });
    this.approximateFileBytes = (await stat(this.logPath)).size;
    if (this.approximateFileBytes > MAX_FILE_BYTES) {
      await this.compact();
    }
  }

  record(input: PiAgentLogInput): PiAgentLogEntry {
    const entry: PiAgentLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...(input.taskId ? { taskId: sanitizeString(input.taskId, "taskId") } : {}),
      level: input.level ?? "info",
      event: input.event,
      summary: sanitizeString(input.summary, "summary"),
      ...(input.toolName ? { toolName: sanitizeString(input.toolName, "toolName") } : {}),
      ...(typeof input.durationMs === "number"
        ? { durationMs: Math.max(0, Math.round(input.durationMs)) }
        : {}),
      ...(input.details ? { details: sanitizeRecord(input.details) } : {})
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_MEMORY_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_MEMORY_ENTRIES);
    }
    for (const listener of this.listeners) listener(entry);
    this.enqueueEntry(entry);
    return structuredClone(entry);
  }

  getSnapshot(): PiAgentLogSnapshot {
    return {
      entries: structuredClone(this.entries),
      logPath: this.logPath
    };
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async clear(): Promise<void> {
    this.entries.length = 0;
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await writeFile(this.logPath, "", "utf8");
        this.approximateFileBytes = 0;
      });
    await this.writeQueue;
  }

  async flush(): Promise<void> {
    await this.writeQueue.catch(() => undefined);
  }

  private enqueueEntry(entry: PiAgentLogEntry): void {
    const line = `${JSON.stringify(entry)}\n`;
    const bytes = Buffer.byteLength(line);
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        if (this.approximateFileBytes + bytes > MAX_FILE_BYTES) {
          await this.compact();
        }
        await appendFile(this.logPath, line, "utf8");
        this.approximateFileBytes += bytes;
      })
      .catch((error) => {
        console.error("[pi-agent-log] 写入失败", error);
      });
  }

  private async compact(): Promise<void> {
    const content = this.entries.map((entry) => JSON.stringify(entry)).join("\n");
    const output = content ? `${content}\n` : "";
    await writeFile(this.logPath, output, "utf8");
    this.approximateFileBytes = Buffer.byteLength(output);
  }

  private async readRecentEntries(): Promise<PiAgentLogEntry[]> {
    let file;
    try {
      file = await open(this.logPath, "r");
      const info = await file.stat();
      const bytesToRead = Math.min(info.size, MAX_READ_BYTES);
      if (bytesToRead === 0) return [];
      const buffer = Buffer.alloc(bytesToRead);
      await file.read(buffer, 0, bytesToRead, info.size - bytesToRead);
      let content = buffer.toString("utf8");
      if (bytesToRead < info.size) {
        const firstNewline = content.indexOf("\n");
        content = firstNewline >= 0 ? content.slice(firstNewline + 1) : "";
      }
      return content
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as PiAgentLogEntry];
          } catch {
            return [];
          }
        });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    } finally {
      await file?.close();
    }
  }
}

export function sanitizePiAgentLogDetails(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord(value);
}

function sanitizeRecord(value: Record<string, unknown>, depth = 0): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_COLLECTION_ITEMS)
      .map(([key, item]) => {
        if (SENSITIVE_KEY.test(key)) return [key, "[已脱敏]"];
        if (LARGE_CONTENT_KEY.test(key) && typeof item === "string") {
          return [key, `[内容已省略，长度 ${item.length}]`];
        }
        return [key, sanitizeValue(item, key, depth + 1)];
      })
  );
}

function sanitizeValue(value: unknown, key: string, depth: number): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeString(value, key);
  if (depth >= 5) return "[嵌套内容已省略]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_COLLECTION_ITEMS).map((item) => sanitizeValue(item, key, depth + 1));
  }
  if (typeof value === "object") return sanitizeRecord(value as Record<string, unknown>, depth);
  return String(value);
}

function sanitizeString(value: string, key: string): string {
  if (SENSITIVE_KEY.test(key)) return "[已脱敏]";
  if (LARGE_CONTENT_KEY.test(key)) return `[内容已省略，长度 ${value.length}]`;

  let safe = value
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/giu, "[图片数据已省略]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu, "Bearer [已脱敏]")
    .replace(
      /(["']?(?:api[-_]?key|token|authorization|secret|password|credential|cookie)["']?\s*[:=]\s*["'])[^"']+(["'])/giu,
      "$1[已脱敏]$2"
    )
    .replace(
      /\b(api[-_]?key|token|authorization|secret|password|credential|cookie)\b(\s*[:=]\s*)(?!\[已脱敏\])[^,\s;}]+/giu,
      "$1$2[已脱敏]"
    )
    .replace(/\b[A-Za-z0-9+/]{300,}={0,2}\b/gu, "[长编码内容已省略]");

  const looksLikeHtml = /<(?:html|body|div|section|main|header|button|span)\b/iu.test(safe);
  if (looksLikeHtml && safe.length > 500) {
    return `[HTML 内容已省略，长度 ${value.length}]`;
  }
  if (safe.length > MAX_STRING_LENGTH) {
    safe = `${safe.slice(0, MAX_STRING_LENGTH)}…[已截断，共 ${safe.length} 字符]`;
  }
  return safe;
}
