import { desktopCapturer, screen, shell, systemPreferences } from "electron";
import type { ScreenAccessStatus, ScreenCaptureSnapshot } from "../shared/screen-access.js";
import { normalizeScreenAccessPolicy } from "../shared/screen-access.js";
import { ProviderError } from "./providers/errors.js";

export function getScreenAccessStatus(policy: unknown): ScreenAccessStatus {
  return { policy: normalizeScreenAccessPolicy(policy), platform: process.platform,
    systemPermission: process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : "unknown" };
}
export async function openScreenCaptureSettings(): Promise<void> {
  if (process.platform === "darwin") await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
}
export async function capturePrimaryScreen(): Promise<ScreenCaptureSnapshot> {
  const primary = screen.getPrimaryDisplay();
  const scale = Math.min(1920 / primary.size.width, 1200 / primary.size.height, primary.scaleFactor);
  const sources = await desktopCapturer.getSources({ types: ["screen"], fetchWindowIcons: false,
    thumbnailSize: { width: Math.round(primary.size.width * scale), height: Math.round(primary.size.height * scale) } });
  if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("screen") !== "granted") {
    throw new ProviderError("SCREEN_SYSTEM_PERMISSION_REQUIRED", "请在系统设置的屏幕录制权限中允许 Iterlay，然后重试查看屏幕。");
  }
  const source = sources.find((candidate) => candidate.display_id === String(primary.id)) ?? (sources.length === 1 ? sources[0] : undefined);
  if (!source || source.thumbnail.isEmpty()) throw new ProviderError("SCREEN_CAPTURE_UNAVAILABLE", "无法读取屏幕，请在系统设置中允许 Iterlay 录制屏幕后重试。");
  const size = source.thumbnail.getSize();
  return { mimeType: "image/png", dataBase64: source.thumbnail.toPNG().toString("base64"), ...size };
}
