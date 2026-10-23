import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { PluginStore } from "../electron/plugins/plugin-store";
import { validatePluginManifest } from "../shared/plugins";
import manifest from "../plugins/short-drama/manifest.json";
const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "iterlay-plugins-")); folders.push(root);
  const catalog = path.join(root, "catalog"); await mkdir(catalog);
  return { store: new PluginStore(path.join(root, "plugins"), catalog), catalog };
}
function pack(m: unknown = manifest, html = '<div id="root">test</div>') {
  const zip = new AdmZip(); zip.addFile("manifest.json", Buffer.from(JSON.stringify(m))); zip.addFile("index.html", Buffer.from(html)); return zip.toBuffer();
}
describe("plugin packages and lifecycle", () => {
  it("installs the real bundled React plugin, disables access, and preserves state across reinstall", async () => {
    const { store } = await fixture();
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(new URL("../resources/plugins/dev.iterlay.short-drama.iterlay-plugin", import.meta.url));
    expect(store.inspect(bytes).html).toContain('id="root"');
    expect(store.inspect(bytes).manifest.version).toBe(manifest.version);
    await store.install(bytes);
    await store.writeState(manifest.id, "board:one", { draft: "未完成剧本" });
    await store.setEnabled(manifest.id, false);
    await expect(store.authorize(manifest.id, "board:read")).rejects.toThrow("停用");
    await expect(store.readState(manifest.id, "board:one")).rejects.toThrow("停用");
    await store.uninstall(manifest.id);
    expect(await store.list()).toHaveLength(0);
    await store.install(bytes);
    expect(await store.readState(manifest.id, "board:one")).toEqual({ draft: "未完成剧本" });
    expect(await store.readState(manifest.id, "board:two")).toBeNull();
  });
  it("uses the same package validation for catalog and imported packages", async () => {
    const { store, catalog } = await fixture();
    await writeFile(path.join(catalog, `${manifest.id}.iterlay-plugin`), pack());
    expect((await store.catalog())[0].manifest.id).toBe(manifest.id);
    await store.installCatalog(manifest.id);
    expect((await store.list())[0].enabled).toBe(true);
    await expect(store.installCatalog("../../outside")).rejects.toThrow("ID");
  });
  it("rejects unsupported permissions, incompatible APIs, malformed packages and paths", async () => {
    const { store } = await fixture();
    expect(() => store.inspect(pack({ ...manifest, permissions: ["fs:all"] }))).toThrow("权限");
    expect(() => validatePluginManifest({ ...manifest, apiVersion: 99 })).toThrow("不兼容");
    expect(() => validatePluginManifest({ ...manifest, creationArtifacts: [{ kind: "other.plugin:poster", label: "海报", mediaType: "image" }] })).toThrow("产物类型");
    expect(validatePluginManifest({ ...manifest, permissions: ["creation:present"], creationArtifacts: [{ kind: `${manifest.id}:poster`, label: "海报", mediaType: "image" }] }).creationArtifacts?.[0].kind).toBe(`${manifest.id}:poster`);
    expect(() => store.inspect(pack({ ...manifest, id: "../escape" }))).toThrow("ID");
    const zip = new AdmZip(pack()); zip.addFile("extra.js", Buffer.from("code"));
    expect(() => store.inspect(zip.toBuffer())).toThrow("只能包含");
    expect(() => store.inspect(pack(manifest, ""))).toThrow("为空");
  });
  it("enforces granted storage permissions and serializes concurrent lifecycle writes", async () => {
    const { store } = await fixture();
    await store.install(pack({ ...manifest, permissions: ["board:read"] }));
    await expect(store.writeState(manifest.id, "settings", { x: 1 })).rejects.toThrow("权限");
    await store.install(pack());
    await Promise.all(Array.from({ length: 5 }, (_, i) => store.writeState(manifest.id, "settings", { value: i })));
    expect(await store.readState(manifest.id, "settings")).toEqual({ value: 4 });
    await expect(store.writeState(manifest.id, "settings", "x".repeat(1024 * 1024))).rejects.toThrow("1MB");
  });
});

describe("isolated plugin document server", () => {
  it("serves only enabled packages under an unguessable URL with an independent restrictive CSP", async () => {
    const { startPluginServer, PLUGIN_DOCUMENT_CSP } = await import("../electron/plugins/plugin-server");
    const { store } = await fixture();
    await store.install(pack());
    const server = startPluginServer(store);
    try {
      const url = await server.url(manifest.id);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toBe(PLUGIN_DOCUMENT_CSP);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toContain("test");
      expect((await fetch(new URL("/unknown", url))).status).toBe(404);
      await store.setEnabled(manifest.id, false);
      expect((await fetch(url)).status).toBe(404);
      await expect(server.url(manifest.id)).rejects.toThrow("停用");
    } finally { server.close(); }
  });
});
