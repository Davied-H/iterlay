import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsStore } from "../electron/storage/settings-store";
describe("settings atomic transactions", () => {
  it("serializes incremental updates and writes a versioned file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-atomic-"));
    try {
      const store = new SettingsStore(directory);
      await Promise.all([
        store.transaction(() => store.updateSettings({ theme: "dark" })),
        store.transaction(() => store.updateSettings({ language: "en-US" }))
      ]);
      expect(new SettingsStore(directory).getSettings()).toMatchObject({ theme: "dark", language: "en-US" });
      expect(JSON.parse(await readFile(path.join(directory, "settings.json"), "utf8")).schemaVersion).toBe(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("restores cached settings when commit fails", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-atomic-"));
    try {
      const store = new SettingsStore(directory);
      store.updateSettings({ theme: "light" });
      await rm(path.join(directory, "settings.json"));
      await mkdir(path.join(directory, "settings.json"));
      await expect(store.transaction(() => store.updateSettings({ theme: "dark" }))).rejects.toThrow();
      expect(store.getSettings().theme).toBe("light");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("reports corrupt settings without replacing the original data", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-atomic-"));
    try {
      const file = path.join(directory, "settings.json");
      await writeFile(file, "{broken");
      expect(() => new SettingsStore(directory).getSettings()).toThrow("原文件已保留");
      expect(await readFile(file, "utf8")).toBe("{broken");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
