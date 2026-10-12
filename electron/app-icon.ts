import { app, BrowserWindow, nativeImage, type NativeImage } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AppIconPreference,
  BuiltinAppIconPreference,
  CustomAppIcon,
  UploadAppIconRequest
} from "../shared/types.js";

const APP_ICON_FILES: Record<BuiltinAppIconPreference, string> = {
  default: "iterlay-default.png",
  mascot: "iterlay-mascot.png"
};

export function normalizeAppIcon(value: unknown, customIcons: CustomAppIcon[] = []): AppIconPreference {
  if (value === "mascot") return "mascot";
  if (typeof value === "string" && value.startsWith("custom:")) {
    const id = value.slice("custom:".length);
    if (customIcons.some((icon) => icon.id === id)) return `custom:${id}`;
  }
  return "default";
}

export function getAppIconPath(preference: BuiltinAppIconPreference): string {
  const directory = app.isPackaged
    ? path.join(process.resourcesPath, "app-icons")
    : path.join(app.getAppPath(), "resources", "app-icons");
  return path.join(directory, APP_ICON_FILES[preference]);
}

export function loadAppIcon(preference: AppIconPreference, customIcons: CustomAppIcon[] = []): NativeImage {
  const normalized = normalizeAppIcon(preference, customIcons);
  const customId = normalized.startsWith("custom:") ? normalized.slice("custom:".length) : "";
  const customIcon = customId ? customIcons.find((icon) => icon.id === customId) : undefined;
  const icon = customIcon
    ? nativeImage.createFromDataURL(customIcon.dataUrl)
    : nativeImage.createFromPath(getAppIconPath(normalized === "mascot" ? "mascot" : "default"));
  if (icon.isEmpty()) throw new Error("无法读取应用图标。");
  return icon;
}

export function applyAppIcon(preference: AppIconPreference, customIcons: CustomAppIcon[] = []): void {
  const icon = loadAppIcon(preference, customIcons);
  if (process.platform === "darwin") {
    app.dock?.setIcon(icon);
    return;
  }
  for (const win of BrowserWindow.getAllWindows()) win.setIcon(icon);
}

export function createCustomAppIcon(request: UploadAppIconRequest): CustomAppIcon {
  const name = typeof request?.name === "string" ? request.name.trim().slice(0, 80) : "";
  const dataUrl = typeof request?.dataUrl === "string" ? request.dataUrl : "";
  if (!/^data:image\/(?:png|jpeg|webp);base64,/u.test(dataUrl)) {
    throw new Error("请选择 PNG、JPEG 或 WebP 图片。");
  }
  if (dataUrl.length > 14_000_000) throw new Error("头像文件不能超过 10 MB。");
  const source = nativeImage.createFromDataURL(dataUrl);
  if (source.isEmpty()) throw new Error("无法读取这张头像图片。");
  const size = source.getSize();
  const edge = Math.min(size.width, size.height);
  if (edge < 64) throw new Error("头像尺寸不能小于 64 x 64 像素。");
  const square = source.crop({
    x: Math.floor((size.width - edge) / 2),
    y: Math.floor((size.height - edge) / 2),
    width: edge,
    height: edge
  }).resize({ width: 512, height: 512, quality: "best" });
  return {
    id: randomUUID(),
    name: name || "自定义头像",
    dataUrl: `data:image/png;base64,${square.toPNG().toString("base64")}`,
    createdAt: new Date().toISOString()
  };
}
