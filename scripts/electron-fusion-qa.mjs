import { app, session } from "electron";
import path from "node:path";
import os from "node:os";
import { URL, pathToFileURL, fileURLToPath } from "node:url";

const directory = process.env.ITERLAY_QA_DATA_DIR;
if (!directory || !path.resolve(directory).startsWith(path.join(os.tmpdir(), "iterlay-fusion-qa-"))) {
  throw new Error("An isolated temporary QA directory is required");
}
app.setPath("appData", directory);
app.setPath("userData", directory);
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) return Promise.reject(new Error("External requests disabled in isolated UI QA"));
  return originalFetch(input, options);
};
app.once("ready", () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const allowed = ["file:", "data:", "blob:", "iterlay-asset:", "devtools:"].includes(url.protocol) ||
      ["127.0.0.1", "localhost"].includes(url.hostname);
    callback({ cancel: !allowed });
  });
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.getAppPath = () => root;
await import(pathToFileURL(path.join(root, "dist-electron/electron/main.js")).href);
