import { ipcMain } from 'electron';
import type { LicenseService } from './service.js';
/** Retain status IPC for older integrations; every status is permanently full access. */
export function registerLicenseIpc(license: LicenseService): void {
  for (const channel of ['license:getStatus', 'license:startTrial', 'license:activate', 'license:check', 'license:deactivate']) {
    ipcMain.handle(channel, () => license.getStatus());
  }
  ipcMain.handle('license:openPortal', () => { throw new Error('开源版无需客户中心。'); });
}
