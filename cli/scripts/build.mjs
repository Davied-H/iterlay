import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
const common = { bundle: true, nodePaths: [path.resolve("node_modules")], platform: "node", format: "esm", target: "node22", banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } };
await build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.js", external: ["./server.js"] });
await build({ ...common, entryPoints: ["src/server.ts"], outfile: "dist/server.js", external: ["sharp"], plugins: [{ name: "no-electron-runtime", setup(builder) { builder.onResolve({ filter: /^electron$/ }, () => { throw new Error("Standalone runtime must not import Electron"); }); } }] });

await mkdir("docs", { recursive: true });
await cp("../docs/cli-standalone.md", "docs/cli-standalone.md");
