import type { LicenseStatusSnapshot } from './licensing.js';
/** Compatibility snapshot for existing IPC consumers. No activation or expiry. */
export function freeAccessStatus(): LicenseStatusSnapshot {
  return { state: 'LICENSED', reason: 'free_open_source', capabilities: { mode: 'full', canView: true, canExport: true, canGenerate: true, canEdit: true, canImport: true, canStartTrial: false, canActivate: false } };
}
