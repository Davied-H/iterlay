import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("desktop packaged standalone CLI", () => {
  it("prepares external native runtime dependencies for every package target", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(manifest.build.afterPack).toBe("scripts/package-cli-runtime.mjs");
  });
  it.each([["darwin", "arm64"], ["darwin", "x64"], ["win32", "arm64"], ["win32", "x64"]])("prepares %s/%s from the locked production graph", async (platform, arch) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-package-cli-"));
    try {
      const source = path.join(directory, "source"), output = path.join(directory, "output");
      await mkdir(source); await mkdir(output);
      await writeFile(path.join(source, "package-lock.json"), '{"lockfileVersion":3}');
      await writeFile(path.join(output, "package.json"), '{"type":"module"}');
      const install = vi.fn(async () => {
        const sharp = path.join(output, "node_modules", "sharp"), native = path.join(output, "node_modules", "@img", `sharp-${platform}-${arch}`);
        await mkdir(sharp, { recursive: true }); await mkdir(native, { recursive: true });
        await writeFile(path.join(sharp, "package.json"), '{"main":"index.js"}');
        await writeFile(path.join(sharp, "index.js"), "module.exports = {};");
        await writeFile(path.join(native, "package.json"), JSON.stringify({ os: [platform], cpu: [arch] }));
      });
      const moduleUrl = new URL("../scripts/package-cli-runtime.mjs", import.meta.url).href;
      const { prepareCliRuntime } = await import(moduleUrl);
      await prepareCliRuntime({ sourceDirectory: source, outputDirectory: output, platform, arch }, install);
      expect(install).toHaveBeenCalledWith(expect.arrayContaining(["ci", "--omit=dev", "--ignore-scripts", `--os=${platform}`, `--cpu=${arch}`]), output);
      expect(await readFile(path.join(output, "package-lock.json"), "utf8")).toBe('{"lockfileVersion":3}');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
