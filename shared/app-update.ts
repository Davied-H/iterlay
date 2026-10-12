export type UpdatePlatform = "darwin" | "win32";
export type UpdateArch = "arm64" | "x64";
export type UpdateChannel = "stable" | "beta";

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;
export const UPDATE_FIRST_CHECK_DELAY_MS = 15 * 1_000;
/** 主进程 → 渲染层的更新状态推送通道。 */
export const UPDATE_STATE_CHANNEL = "update:state";

/** 后台版本接口返回的单个平台安装包描述。 */
export interface UpdateManifest {
  version: string;
  platform: UpdatePlatform;
  arch?: UpdateArch;
  /** 发布渠道，后台返回；Beta 版本在 UI 上会有标识。 */
  channel?: UpdateChannel;
  downloadUrl: string;
  /** 安装包 sha256（hex）。缺省时跳过完整性校验。 */
  sha256?: string;
  fileSize?: number;
  releaseNotes?: string;
  /** 低于该版本的客户端必须升级后才能继续使用。 */
  minSupportedVersion?: string;
  /** 后台直接标记本次发布为强制更新。 */
  forced?: boolean;
  publishedAt?: string;
}

export type UpdateAvailability = "up-to-date" | "available" | "forced";

export interface UpdateEvaluation {
  availability: UpdateAvailability;
  manifest?: UpdateManifest;
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface UpdateProgress {
  transferredBytes: number;
  totalBytes?: number;
  /** 0-100，总大小未知时缺省。 */
  percent?: number;
}

/** 已完成安装、等待在新版本首次启动时展示的发布信息。 */
export interface InstalledUpdateRelease {
  version: string;
  previousVersion: string;
  releaseNotes?: string;
  channel?: UpdateChannel;
}

export interface UpdateStateSnapshot {
  phase: UpdatePhase;
  currentVersion: string;
  /** 当前订阅的更新渠道；beta 即「参与开发者计划」。 */
  channel: UpdateChannel;
  /** 当前是否处于强制更新（低于最低支持版本）状态。 */
  forced: boolean;
  manifest?: UpdateManifest;
  progress?: UpdateProgress;
  /** 下载完成并通过校验的安装包路径。 */
  installerPath?: string;
  error?: string;
  checkedAt?: string;
  /** 用户选择忽略的版本号，仅对非强制的自动提示生效。 */
  skippedVersion?: string;
  /** 新版本启动后展示一次；用户关闭弹窗后由渲染层确认消费。 */
  installedRelease?: InstalledUpdateRelease;
}

export function isUpdateManifest(value: unknown): value is UpdateManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const validForced = record.forced === undefined || typeof record.forced === "boolean";
  const validMinimum = record.minSupportedVersion === undefined ||
    (typeof record.minSupportedVersion === "string" && parseVersion(record.minSupportedVersion) !== null);
  const validChannel = record.channel === undefined || record.channel === "stable" || record.channel === "beta";
  return (
    typeof record.version === "string" &&
    parseVersion(record.version) !== null &&
    (record.platform === "darwin" || record.platform === "win32") &&
    typeof record.downloadUrl === "string" &&
    /^https?:\/\//i.test(record.downloadUrl) &&
    validChannel &&
    validForced &&
    validMinimum
  );
}

interface ParsedVersion {
  parts: number[];
  prerelease: string[];
}

/** 解析 `1.2.3` 或 `1.2.3-beta.1` 形式的版本号，无法解析返回 null。 */
export function parseVersion(input: string): ParsedVersion | null {
  const trimmed = input.trim().replace(/^v/i, "");
  const match = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(trimmed);
  if (!match) return null;
  return {
    parts: match[1].split(".").map(Number),
    prerelease: match[2] ? match[2].split(".") : []
  };
}

/** 语义化比较版本号：a>b 返回 1，a<b 返回 -1，相等返回 0。无法解析的一侧视为最低版本。 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;

  const length = Math.max(left.parts.length, right.parts.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  // 数字部分相同：正式版高于预发布版；两个预发布版逐段比较。
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const segments = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < segments; i += 1) {
    const l = left.prerelease[i];
    const r = right.prerelease[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNum = /^\d+$/.test(l) ? Number(l) : null;
    const rNum = /^\d+$/.test(r) ? Number(r) : null;
    if (lNum !== null && rNum !== null) {
      if (lNum !== rNum) return lNum > rNum ? 1 : -1;
    } else if (lNum !== null) {
      return -1;
    } else if (rNum !== null) {
      return 1;
    } else if (l !== r) {
      return l > r ? 1 : -1;
    }
  }
  return 0;
}

/** 根据后台返回的 manifest 判定当前客户端的更新状态（纯函数，便于测试）。 */
export function evaluateUpdateManifest(currentVersion: string, manifest: UpdateManifest | null): UpdateEvaluation {
  if (!manifest || compareVersions(manifest.version, currentVersion) <= 0) {
    return { availability: "up-to-date" };
  }
  // Beta 始终是用户主动订阅的可选更新，不继承稳定版的强更与最低支持策略。
  if (manifest.channel === "beta") {
    return { availability: "available", manifest };
  }
  const belowMinimum =
    typeof manifest.minSupportedVersion === "string" &&
    parseVersion(manifest.minSupportedVersion) !== null &&
    compareVersions(currentVersion, manifest.minSupportedVersion) < 0;
  if (manifest.forced === true || belowMinimum) {
    return { availability: "forced", manifest };
  }
  return { availability: "available", manifest };
}
