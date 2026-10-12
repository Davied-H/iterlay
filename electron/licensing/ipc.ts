import { ipcMain, shell } from "electron";
import type { LicenseService } from "./service.js";

export function registerLicenseIpc(license: LicenseService): void {
  ipcMain.handle("license:getStatus", () => license.getStatus());
  ipcMain.handle("license:startTrial", () => license.startTrial());
  ipcMain.handle("license:activate", (_event, email: string, licenseKey: string) => license.activate(email, licenseKey));
  ipcMain.handle("license:check", () => license.checkNow());
  ipcMain.handle("license:deactivate", () => license.deactivateCurrentDevice());
  ipcMain.handle("license:openPortal", async () => {
    const url = await license.createPortalDeviceLink();
    await shell.openExternal(url);
  });
}
