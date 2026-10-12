import { BrowserWindow, Notification, shell } from "electron";
import type { SystemNotificationDeliveryResult } from "../shared/types.js";
import {
  GENERATION_NOTIFICATION_OPEN_CHANNEL,
  type GenerationNotificationTarget
} from "../shared/system-notification.js";

interface GenerationCompletedNotificationInput {
  count: number;
  workflowMode: "generate" | "edit";
  sceneOnly?: boolean;
  boardId?: string;
  imagePaths?: string[];
}

interface VideoGenerationNotificationInput {
  succeeded: boolean;
  error?: string;
}

interface SystemNotificationInput {
  title: string;
  body: string;
  onClick?: () => void;
}

const DELIVERY_OBSERVATION_TIMEOUT_MS = 2_000;
const activeNotifications = new Set<Notification>();

function focusApplicationWindow(): BrowserWindow | undefined {
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
  if (!window) return undefined;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  return window;
}

function focusAndOpenGenerationResult(target: GenerationNotificationTarget): void {
  const window = focusApplicationWindow();
  if (!window || window.webContents.isDestroyed()) return;
  window.webContents.send(GENERATION_NOTIFICATION_OPEN_CHANNEL, target);
}

function deliverSystemNotification({
  title,
  body,
  onClick = focusApplicationWindow
}: SystemNotificationInput): Promise<SystemNotificationDeliveryResult> {
  if (typeof Notification?.isSupported !== "function" || !Notification.isSupported()) {
    console.warn("[system-notification] 当前系统不支持桌面通知。");
    return Promise.resolve({ status: "unsupported", message: "当前系统不支持桌面通知。" });
  }

  return new Promise((resolve) => {
    let settled = false;
    let observationTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (result: SystemNotificationDeliveryResult): void => {
      if (settled) return;
      settled = true;
      if (observationTimer) clearTimeout(observationTimer);
      resolve(result);
    };

    try {
      const notification = new Notification({
        title,
        body,
        timeoutType: "default"
      });
      const release = (): void => {
        activeNotifications.delete(notification);
      };

      notification.on("show", () => {
        console.info(`[system-notification] 系统已接收通知：${title}`);
        settle({ status: "delivered" });
      });
      notification.on("failed", (_event, error) => {
        const message = error || "系统拒绝了通知投递。";
        console.warn(`[system-notification] 通知投递失败：${title}`, message);
        release();
        settle({ status: "failed", message });
      });
      notification.on("click", () => {
        release();
        onClick();
      });
      notification.on("close", release);

      activeNotifications.add(notification);
      observationTimer = setTimeout(() => {
        console.info(`[system-notification] 通知请求已提交，系统未返回投递状态：${title}`);
        settle({ status: "requested" });
      }, DELIVERY_OBSERVATION_TIMEOUT_MS);
      observationTimer.unref?.();
      notification.show();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[system-notification] 创建通知失败：${title}`, error);
      settle({ status: "failed", message });
    }
  });
}

export function showGenerationCompletedNotification({
  count,
  workflowMode,
  sceneOnly,
  boardId,
  imagePaths
}: GenerationCompletedNotificationInput): void {
  const resultCount = Math.max(0, Math.floor(count));
  const title = sceneOnly
    ? "效果图生成完成"
    : workflowMode === "edit"
      ? "图片编辑完成"
      : "图片生成完成";
  const resultLabel = sceneOnly
    ? `${resultCount} 张效果图`
    : workflowMode === "edit"
      ? `${resultCount} 个新版本`
      : `${resultCount} 张图片`;

  // 通知失败不能反过来把已经完成的生成标记为失败。
  void deliverSystemNotification({
    title,
    body: `${resultLabel}已准备好，点击返回 Iterlay 查看。`,
    onClick: boardId && imagePaths?.length
      ? () => focusAndOpenGenerationResult({ boardId, imagePaths })
      : focusApplicationWindow
  });
}

export function showVideoGenerationNotification({
  succeeded,
  error
}: VideoGenerationNotificationInput): void {
  void deliverSystemNotification({
    title: succeeded ? "视频生成完成" : "视频生成失败",
    body: succeeded
      ? "视频已保存到画板，点击返回 Iterlay 查看。"
      : error || "视频任务未能完成，点击返回 Iterlay 查看详情。"
  });
}

export function showTestSystemNotification(): Promise<SystemNotificationDeliveryResult> {
  return deliverSystemNotification({
    title: "Iterlay 通知测试",
    body: "系统通知已连接。图片生成或编辑完成后会在这里提醒你。"
  });
}

export async function openSystemNotificationSettings(): Promise<{ ok: boolean }> {
  const target = process.platform === "darwin"
    ? "x-apple.systempreferences:com.apple.Notifications-Settings.extension"
    : process.platform === "win32"
      ? "ms-settings:notifications"
      : "";
  if (!target) return { ok: false };

  try {
    await shell.openExternal(target);
    return { ok: true };
  } catch (error) {
    console.warn("[system-notification] 无法打开系统通知设置。", error);
    return { ok: false };
  }
}
