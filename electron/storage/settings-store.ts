import { safeStorage } from "electron";
import { SettingsStore as CoreSettingsStore } from "./settings-store-core.js";

/** Desktop adapter; the shared store has no Electron runtime dependency. */
export class SettingsStore extends CoreSettingsStore {
  constructor(dataDir: string) { super(dataDir, safeStorage); }
}

export { normalizeProvider, normalizeVideoProvider, normalizeTextProvider } from "./settings-store-core.js";
