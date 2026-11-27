import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import type { CredentialCipher } from "../../electron/storage/settings-store-core.js";

/** Standalone credentials use a workspace-local key; desktop safeStorage is never read. */
export async function workspaceCipher(userDataPath: string): Promise<CredentialCipher> {
  const file = path.join(userDataPath, "credential-key");
  let key: Buffer;
  try { key = await readFile(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const saved = JSON.parse(await readFile(path.join(userDataPath, "workspace/settings.json"), "utf8").catch((failure: NodeJS.ErrnoException) => {
      if (failure.code === "ENOENT") return "{}";
      throw failure;
    })) as { encryptedApiKeys?: Record<string, string> };
    if (Object.keys(saved.encryptedApiKeys ?? {}).length) throw new Error("工作区凭据密钥缺失，请从备份恢复 credential-key，不能生成新密钥覆盖。");
    key = randomBytes(32);
    await writeFile(file, key, { flag: "wx", mode: 0o600 });
  }
  if (key.length !== 32) throw new Error("独立工作区凭据密钥损坏，请从备份恢复 credential-key。");
  await chmod(file, 0o600);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([Buffer.from("ITN1"), iv, cipher.getAuthTag(), encrypted]);
    },
    decryptString(value) {
      if (value.length < 32 || value.toString("ascii", 0, 4) !== "ITN1") throw new Error("不能解密桌面端凭据，请在独立工作区重新配置。");
      const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(4, 16));
      decipher.setAuthTag(value.subarray(16, 32));
      return Buffer.concat([decipher.update(value.subarray(32)), decipher.final()]).toString("utf8");
    }
  };
}
