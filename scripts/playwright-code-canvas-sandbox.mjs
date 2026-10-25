import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

// Exercise the shipped sandbox under both development HTTP and desktop file URLs.
// No Electron window or user workspace is opened by this regression check.
const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-canvas-sandbox-"));
let browser;
let server;
const scenarios = [
  { framework: "html", name: "HTML", code: '<!doctype html><html><head><style>h1 { color: rgb(20, 40, 60) }</style></head><body><h1>HTML ready</h1><button onclick="this.textContent = \'clicked\'">click</button><script>console.log("HTML console ready")</script></body></html>' },
  { framework: "react", name: "React", code: 'import React, { useState } from "react"; export default function App() { const [clicked, setClicked] = useState(false); return <main><h1>React ready</h1><button onClick={() => setClicked(true)}>{clicked ? "clicked" : "click"}</button></main>; }' },
  { framework: "vue", name: "Vue", code: '<template><h1>Vue ready</h1><button @click="clicked = true">{{ clicked ? "clicked" : "click" }}</button></template><script>export default { data: () => ({ clicked: false }) }</script>' },
  { framework: "vue", name: "Vue setup", code: '<script setup>import { ref } from "vue"; const clicked = ref(false);</script><template><h1>Vue setup ready</h1><button @click="clicked = true">{{ clicked ? "clicked" : "click" }}</button></template>' }
];
try {
  await cp(process.env.ITERLAY_SANDBOX_DIR || "public/code-sandbox", path.join(directory, "code-sandbox"), { recursive: true });
  const applicationHtml = await readFile("index.html", "utf8");
  const csp = applicationHtml.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/u)?.[0];
  assert(csp, "Use the application's real parent CSP");
  await writeFile(path.join(directory, "index.html"), `<!doctype html>${csp}<script src="./host.js"></script><iframe sandbox="allow-scripts" src="./code-sandbox/index.html"></iframe>`);
  await writeFile(path.join(directory, "host.js"), `window.sandboxEvents = []; addEventListener("message", event => { if (event.source === document.querySelector("iframe").contentWindow) sandboxEvents.push({ ...event.data, origin: event.origin }); });`);
  server = createServer(async (request, response) => {
    const files = { "/index.html": "index.html", "/host.js": "host.js", "/code-sandbox/index.html": "code-sandbox/index.html", "/code-sandbox/runtime.js": "code-sandbox/runtime.js" };
    const file = files[request.url];
    if (!file) { response.writeHead(404).end(); return; }
    try {
      response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : "text/html");
      response.end(await readFile(path.join(directory, file)));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const bundledBrowserAvailable = await access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(bundledBrowserAvailable ? {} : { channel: "chrome" }) });
  for (const url of [pathToFileURL(path.join(directory, "index.html")).href, `http://127.0.0.1:${server.address().port}/index.html`]) {
    for (const scenario of scenarios) {
      const page = await browser.newPage();
      try {
        await page.goto(url);
        await page.waitForFunction(() => window.sandboxEvents.some(event => event.type === "ready"), undefined, { timeout: 10_000 });
        await page.evaluate(({ framework, code }) => document.querySelector("iframe").contentWindow.postMessage({ source: "iterlay-code-host", framework, code }, "*"), scenario);
        const frame = page.frameLocator("iframe");
        await frame.getByRole("heading", { name: `${scenario.name} ready`, exact: true }).waitFor();
        await frame.getByRole("button", { name: "click", exact: true }).click();
        await frame.getByRole("button", { name: "clicked", exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => window.sandboxEvents.filter(event => event.type === "error")), []);
        assert.equal(await page.evaluate(() => window.sandboxEvents.find(event => event.type === "ready").origin), "null", "Sandbox must retain its opaque origin");
        const expression = `(() => { let isolated = false; try { parent.document.body; } catch { isolated = true; } return JSON.stringify({ isolated, node: typeof window.require, api: typeof window.imageWorkbench }); })()`;
        await page.evaluate(expression => document.querySelector("iframe").contentWindow.postMessage({ source: "iterlay-code-host", type: "evaluate", expression }, "*"), expression);
        await page.waitForFunction(() => window.sandboxEvents.some(event => event.type === "console" && event.level === "result"));
        const result = await page.evaluate(() => window.sandboxEvents.find(event => event.type === "console" && event.level === "result").message);
        assert.deepEqual(JSON.parse(result), { isolated: true, node: "undefined", api: "undefined" });
        if (scenario.framework === "html") {
          assert.equal(await frame.getByRole("heading").evaluate(element => getComputedStyle(element).color), "rgb(20, 40, 60)");
          assert(await page.evaluate(() => window.sandboxEvents.some(event => event.type === "console" && event.message.includes("HTML console ready"))));
        }
        console.log(`PASS ${new URL(url).protocol} ${scenario.name}: render, interaction, console and isolation`);
      } finally { await page.close(); }
    }
  }
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
