import { execFile } from "node:child_process";
import os from "node:os";
import type { SupportedLicensePlatform } from "../../shared/licensing.js";
import type { DeviceFingerprintSource } from "./device.js";

export class SystemDeviceFingerprintSource implements DeviceFingerprintSource {
  async getStableComponents(): Promise<Readonly<Record<string, string>>> {
    if (process.platform === "darwin") {
      return { platform: "darwin", machineId: await readMacPlatformUuid() };
    }
    if (process.platform === "win32") {
      return { platform: "win32", machineId: await readWindowsMachineGuid() };
    }
    throw new Error("Iterlay 授权目前仅支持 macOS 和 Windows。");
  }
}

export function currentLicensePlatform(): SupportedLicensePlatform {
  if (process.platform === "darwin" || process.platform === "win32") return process.platform;
  throw new Error("Iterlay 授权目前仅支持 macOS 和 Windows。");
}

export function currentDeviceName(): string {
  return os.hostname().trim().slice(0, 100) || (process.platform === "darwin" ? "Mac" : "Windows PC");
}

async function readMacPlatformUuid(): Promise<string> {
  const output = await run("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
  const match = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(output);
  if (!match?.[1]) throw new Error("无法读取 macOS 设备标识。");
  return match[1].toLowerCase();
}

async function readWindowsMachineGuid(): Promise<string> {
  const output = await run("reg.exe", [
    "query",
    "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
    "/v",
    "MachineGuid"
  ]);
  const match = /MachineGuid\s+REG_SZ\s+([^\r\n]+)/i.exec(output);
  if (!match?.[1]) throw new Error("无法读取 Windows 设备标识。");
  return match[1].trim().toLowerCase();
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", windowsHide: true, timeout: 5_000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}
