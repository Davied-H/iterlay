import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { validatePluginManifest, type InstalledPlugin, type PluginPackage } from "../../shared/plugins.js";
import { MutationQueue, writeJsonAtomic } from "../storage/atomic-json.js";

const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
export class PluginStore {
  private mutations = new MutationQueue();
  constructor(private root: string, private catalogRoot: string) {}
  private pluginPath(id: string) {
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(id) || id.length > 100) throw new Error("插件 ID 无效。");
    return path.join(this.root, "installed", `${id}.json`);
  }
  async list(): Promise<InstalledPlugin[]> {
    const folder = path.join(this.root, "installed");
    await mkdir(folder, { recursive: true });
    return Promise.all((await readdir(folder)).filter(f => f.endsWith(".json")).map(async file => {
      const record = JSON.parse(await readFile(path.join(folder, file), "utf8"));
      return { manifest: validatePluginManifest(record.manifest), enabled: record.enabled === true, installedAt: record.installedAt };
    }));
  }
  async get(id: string): Promise<PluginPackage & InstalledPlugin> {
    const record = JSON.parse(await readFile(this.pluginPath(id), "utf8"));
    return { ...record, manifest: validatePluginManifest(record.manifest) };
  }
  async catalog(): Promise<PluginPackage[]> {
    const files = await readdir(this.catalogRoot).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
    return Promise.all(files.filter(f => f.endsWith(".iterlay-plugin")).map(async file => this.inspect(await readFile(path.join(this.catalogRoot, file)))));
  }
  inspect(bytes: Uint8Array): PluginPackage {
    if (!bytes.length || bytes.length > MAX_PACKAGE_BYTES) throw new Error("插件包必须小于 8MB。");
    const zip = new AdmZip(Buffer.from(bytes));
    const entries = zip.getEntries();
    if (entries.length !== 2 || entries.some(e => !["manifest.json", "index.html"].includes(e.entryName))) throw new Error("插件包只能包含 manifest.json 和自包含的 index.html。");
    if (entries.reduce((sum, e) => sum + e.header.size, 0) > MAX_PACKAGE_BYTES) throw new Error("插件解压后超过 8MB。");
    const manifest = validatePluginManifest(JSON.parse(zip.readAsText("manifest.json")));
    const html = zip.readAsText("index.html");
    if (!html.trim() || Buffer.byteLength(html) > MAX_PACKAGE_BYTES) throw new Error("插件界面为空或过大。");
    return { manifest, html };
  }
  install(bytes: Uint8Array): Promise<InstalledPlugin> {
    return this.mutations.run(async () => {
      const pkg = this.inspect(bytes);
      const record = { ...pkg, enabled: true, installedAt: new Date().toISOString() };
      await writeJsonAtomic(this.pluginPath(pkg.manifest.id), record);
      return { manifest: record.manifest, enabled: true, installedAt: record.installedAt };
    });
  }
  async installCatalog(id: string): Promise<InstalledPlugin> {
    this.pluginPath(id);
    return this.install(await readFile(path.join(this.catalogRoot, `${id}.iterlay-plugin`)));
  }
  setEnabled(id: string, enabled: boolean): Promise<void> {
    return this.mutations.run(async () => {
      const record = await this.get(id);
      await writeJsonAtomic(this.pluginPath(id), { ...record, enabled });
    });
  }
  uninstall(id: string): Promise<void> {
    // Workspace data intentionally survives uninstall and is reused on reinstall.
    return this.mutations.run(() => rm(this.pluginPath(id), { force: true }));
  }
  private statePath(id: string, scope: string) {
    this.pluginPath(id);
    if (typeof scope !== "string" || !scope || scope.length > 200) throw new Error("插件存储范围无效。");
    return path.join(this.root, "data", id, `${createHash("sha256").update(scope).digest("hex")}.json`);
  }
  async readState(id: string, scope: string): Promise<unknown> {
    await this.authorize(id, "storage");
    try { return JSON.parse(await readFile(this.statePath(id, scope), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  writeState(id: string, scope: string, value: unknown): Promise<void> {
    return this.mutations.run(async () => {
      await this.authorize(id, "storage");
      if (Buffer.byteLength(JSON.stringify(value) ?? "") > 1024 * 1024) throw new Error("插件数据超过 1MB。");
      await writeJsonAtomic(this.statePath(id, scope), value);
    });
  }
  async authorize(id: string, permission?: string): Promise<void> {
    const record = await this.get(id);
    if (!record.enabled) throw new Error("插件已停用。");
    if (permission && !record.manifest.permissions.includes(permission as never)) throw new Error(`插件没有 ${permission} 权限。`);
  }
}
