import { describe, expect, it, vi } from "vitest";
import { buildApplicationMenuTemplate } from "../electron/application-menu";

describe("application menu", () => {
  it.each(["darwin", "win32", "linux"] as const)("exports logs from the file menu on %s", (platform) => {
    const exportLogs = vi.fn();
    const template = buildApplicationMenuTemplate(vi.fn(), platform, "zh-CN", exportLogs);
    const submenu = template.find((item) => item.label === "文件")?.submenu;
    const item = Array.isArray(submenu) ? submenu.find((entry) => entry.label === "导出运行日志…") : undefined;
    expect(item?.click).toBe(exportLogs);
  });

  it("binds Command/Ctrl+N to creating a new window", () => {
    const createNewWindow = vi.fn();
    const template = buildApplicationMenuTemplate(createNewWindow, "darwin");
    const fileMenu = template.find((item) => item.label === "文件");
    const newWindow = Array.isArray(fileMenu?.submenu)
      ? fileMenu.submenu.find((item) => "label" in item && item.label === "新建窗口")
      : undefined;

    expect(newWindow).toMatchObject({ accelerator: "CommandOrControl+N" });
    expect(newWindow && "click" in newWindow ? newWindow.click : undefined).toBe(createNewWindow);
  });

  it("localizes custom menu labels", () => {
    const template = buildApplicationMenuTemplate(() => undefined, "win32", "en-US");
    const fileMenu = template.find((item) => item.label === "File");
    expect(fileMenu?.submenu).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "New Window" })
    ]));
  });
});
