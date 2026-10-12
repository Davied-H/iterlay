import type { MenuItemConstructorOptions } from "electron";
import type { ResolvedAppLocale } from "../shared/i18n.js";

const APP_NAME = "Iterlay";

export function buildApplicationMenuTemplate(
  createNewWindow: () => void,
  platform: NodeJS.Platform = process.platform,
  locale: ResolvedAppLocale = "zh-CN",
  exportLogs?: () => void
): MenuItemConstructorOptions[] {
  const labels = locale === "zh-CN"
    ? { file: "文件", newWindow: "新建窗口" }
    : { file: "File", newWindow: "New Window" };
  return [
    ...(platform === "darwin"
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const }
            ]
          }
        ]
      : []),
    {
      label: labels.file,
      submenu: [
        {
          label: labels.newWindow,
          accelerator: "CommandOrControl+N",
          click: createNewWindow
        },
        ...(exportLogs ? [{
          label: locale === "zh-CN" ? "导出运行日志…" : "Export Runtime Logs…",
          click: exportLogs
        }] : []),
        { type: "separator" },
        platform === "darwin" ? { role: "close" as const } : { role: "quit" as const }
      ]
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    { role: "help" }
  ];
}
