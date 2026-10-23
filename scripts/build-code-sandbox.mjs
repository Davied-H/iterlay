import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
await mkdir('public/code-sandbox', { recursive: true });
await build({ entryPoints: ['src/components/code-canvas/runtime.ts'], outfile: 'public/code-sandbox/runtime.js', bundle: true, format: 'iife', platform: 'browser', minify: true, define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } });
await writeFile('public/code-sandbox/index.html', `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob: https: http:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="./runtime.js"></script></body></html>`);

const notices = await Promise.all(['@babel/standalone', 'vue', '@vue/compiler-sfc', 'react', 'react-dom'].map(async name => `${name}\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}`));
await writeFile('public/code-sandbox/LICENSES.txt', notices.join('\n\n'));
