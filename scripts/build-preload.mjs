import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { URL } from "node:url";
// Existing checkouts can have Vite's transitive esbuild before the next install.
const require = createRequire(import.meta.url);
const { build, context } = await import(createRequire(require.resolve("vite/package.json")).resolve("esbuild"));
await mkdir(new URL("../dist-electron/shared/", import.meta.url), { recursive: true });
await copyFile(new URL("../shared/media-tools-manifest.json", import.meta.url), new URL("../dist-electron/shared/media-tools-manifest.json", import.meta.url));
const options = {
  entryPoints: ["electron/preload/preload.ts"],
  outfile: "dist-electron/electron/preload/preload.cjs",
  bundle: true, platform: "node", format: "cjs", target: "node22", external: ["electron"]
};
if (process.argv.includes("--watch")) {
  const compiler = await context(options);
  await compiler.watch();
} else await build(options);
