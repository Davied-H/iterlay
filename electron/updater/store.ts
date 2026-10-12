import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InstalledUpdateRelease, UpdateChannel } from "../../shared/app-update.js";

export interface UpdatePreferences {
  /** 用户点击「跳过此版本」后记录的版本号。 */
  skippedVersion?: string;
  /** 更新渠道；beta 即「参与开发者计划」。缺省为 stable。 */
  channel?: UpdateChannel;
  /** 启动安装前写入；新版本启动且用户看过发布说明后清除。 */
  pendingUpdate?: InstalledUpdateRelease;
}

export interface UpdatePreferenceAccess {
  read(): Promise<UpdatePreferences>;
  setSkippedVersion(version: string | undefined): Promise<void>;
  setChannel(channel: UpdateChannel): Promise<void>;
  setPendingUpdate(update: InstalledUpdateRelease | undefined): Promise<void>;
}

export class UpdatePreferenceStore implements UpdatePreferenceAccess {
  private readonly filePath: string;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, "app-update.json");
  }

  async read(): Promise<UpdatePreferences> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
      const record = parsed as Record<string, unknown>;
      const pendingUpdate = parseInstalledRelease(record.pendingUpdate);
      return {
        skippedVersion: typeof record.skippedVersion === "string" ? record.skippedVersion : undefined,
        channel: record.channel === "beta" || record.channel === "stable" ? record.channel : undefined,
        ...(pendingUpdate ? { pendingUpdate } : {})
      };
    } catch {
      return {};
    }
  }

  async setSkippedVersion(version: string | undefined): Promise<void> {
    await this.write({ skippedVersion: version });
  }

  async setChannel(channel: UpdateChannel): Promise<void> {
    await this.write({ channel });
  }

  async setPendingUpdate(update: InstalledUpdateRelease | undefined): Promise<void> {
    await this.write({ pendingUpdate: update });
  }

  private async write(patch: Partial<UpdatePreferences>): Promise<void> {
    const next: UpdatePreferences = { ...(await this.read()), ...patch };
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8");
  }
}

function parseInstalledRelease(value: unknown): InstalledUpdateRelease | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== "string" || typeof record.previousVersion !== "string") return undefined;
  return {
    version: record.version,
    previousVersion: record.previousVersion,
    releaseNotes: typeof record.releaseNotes === "string" ? record.releaseNotes : undefined,
    channel: record.channel === "stable" || record.channel === "beta" ? record.channel : undefined
  };
}
