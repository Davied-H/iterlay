import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { Buffer } from "node:buffer";
import console from "node:console";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import loadConfig from "tailwindcss/loadConfig.js";
import autoprefixer from "autoprefixer";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const assets = {};
async function collect(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    else if (entry.name.endsWith(".webp")) assets[`/${path.relative(path.join(root, "public"), absolute)}`] = `data:image/webp;base64,${(await readFile(absolute)).toString("base64")}`;
  }
}
await collect(path.join(root, "public/scene-previews"));
const result = await build({
  absWorkingDir: root,
  entryPoints: [path.join(directory, "assistant-dock-preview.tsx")],
  bundle: true,
  write: false,
  outdir: "output/assistant-dock-build",
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  treeShaking: true,
  metafile: true,
  loader: { ".png": "dataurl", ".webp": "dataurl", ".svg": "dataurl", ".woff2": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env.BASE_URL": '"/"', "import.meta.env.DEV": "false", __PREVIEW_ASSETS__: JSON.stringify(assets) },

});
const script = result.outputFiles.find(file => file.path.endsWith(".js"));
const styles = result.outputFiles.find(file => file.path.endsWith(".css"));
if (!script || !styles) throw new Error("Missing preview bundle output");
const baseConfig = loadConfig(path.join(root, "tailwind.config.ts"));
const compiled = await postcss([tailwindcss({ ...baseConfig, content: [path.join(root, "src/**/*.{ts,tsx}"), path.join(directory, "*.tsx")] }), autoprefixer]).process(styles.text, { from: undefined });
const css = compiled.css.replace(/<\/style/gi, "<\\/style");
const js = script.text.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Iterlay · 创作助手设计预览</title><link rel="icon" href="data:,"><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>\n`;
await writeFile(path.join(directory, "assistant-dock-preview.html"), html);
await mkdir(path.join(root, "output/assistant-dock-build"), { recursive: true });
await writeFile(path.join(root, "output/assistant-dock-build/sources.json"), JSON.stringify(Object.keys(result.metafile.inputs).filter(name => name.startsWith("src/")), null, 2));
console.log(`Standalone preview generated: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB; ${Object.keys(assets).length} embedded image assets; original component sources preserved.`);
