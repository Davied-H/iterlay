import { safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ClockObservation, GrantResponseState, RequiredAppUpdate } from "../../shared/licensing.js";

export interface StoredLicenseState {
  version: 1;
  deviceId: string;
  devicePublicKey: string;
  devicePrivateKey: string;
  grant?: string;
  licenseEmail?: string;
  activatedAt?: string;
  lastServerState?: GrantResponseState;
  update?: RequiredAppUpdate;
  lastServerTime?: string;
  clockObservation?: ClockObservation;
}

export class SecureLicenseStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "license.dat");
  }

  read(): StoredLicenseState | null {
    if (!existsSync(this.filePath)) return null;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("当前系统无法安全读取授权信息。");
    }
    try {
      const encrypted = Buffer.from(readFileSync(this.filePath, "utf8").trim(), "base64");
      const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as Partial<StoredLicenseState>;
      if (
        parsed.version !== 1 ||
        typeof parsed.deviceId !== "string" ||
        typeof parsed.devicePublicKey !== "string" ||
        typeof parsed.devicePrivateKey !== "string"
      ) {
        throw new Error("授权存储格式无效");
      }
      return parsed as StoredLicenseState;
    } catch (error) {
      throw new Error("本机授权信息已损坏，请重新激活。", { cause: error });
    }
  }

  write(value: StoredLicenseState): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("当前系统不支持安全存储，无法保存授权。");
    }
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(value)).toString("base64");
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    try {
      writeFileSync(temporaryPath, encrypted, { encoding: "utf8", mode: 0o600 });
      renameSync(temporaryPath, this.filePath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
}
