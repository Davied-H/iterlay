import { deflateSync, crc32 } from "node:zlib";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtemp, realpath, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = process.env.ITERLAY_TEST_CLI || path.join(root, "cli/dist/main.js");
const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "iterlay-standalone-smoke-")));
const common = ["--standalone", "--user-data-path", directory, "--json"];
const secret = "standalone-fixture-only";
function pngChunk(type, bytes) {
  const payload = Buffer.concat([Buffer.from(type), bytes]);
  const length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, crc]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
const image = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))), pngChunk("IEND", Buffer.alloc(0))]);
let generated = 0, videos = 0, completed = true;
const provider = createServer(async (request, response) => {
  if (request.url === "/video.mp4") { response.writeHead(200, { "content-type": "video/mp4" }).end(Buffer.from("standalone-video-fixture")); return; }
  if (request.headers.authorization !== `Bearer ${secret}`) { response.writeHead(401).end(); return; }
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  if (request.url === "/v1/images/generations" || request.url === "/v1/images/edits") {
    generated++; response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ b64_json: image.toString("base64") }] })); return;
  }
  if (request.url === "/contents/generations/tasks" && request.method === "POST") {
    videos++; response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `video-${videos}`, status: "queued" })); return;
  }
  if (request.url?.startsWith("/contents/generations/tasks/")) {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: completed ? "succeeded" : "running", ...(completed ? { content: { video_url: `http://127.0.0.1:${provider.address().port}/video.mp4` } } : {}) })); return;
  }
  response.writeHead(404).end();
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${provider.address().port}`;
async function cli(...args) {
  const { stdout, stderr } = await exec(process.execPath, [script, ...args, ...common], { timeout: 45_000, env: { ...process.env, ITERLAY_FIXTURE_KEY: secret, DISPLAY: "", WAYLAND_DISPLAY: "" } });
  assert(!stdout.includes(secret) && !stderr.includes(secret));
  const result = JSON.parse(stdout); assert.equal(result.ok, true); return result.data;
}
async function stopped() {
  for (let i = 0; i < 200; i++) {
    if (!await stat(path.join(directory, ".runtime.lock")).catch(() => null)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("后台未释放工作区锁。");
}
let foreground;
try {
  // Concurrent cold starts converge on one authenticated daemon and one workspace.
  const statuses = await Promise.all([cli("status"), cli("status"), cli("status")]);
  assert(statuses.every((s) => s.runtime === "node" && s.userDataPath === directory));
  const bridge = JSON.parse(await readFile(path.join(directory, "local-api.json"), "utf8"));
  assert.equal((await fetch(`http://127.0.0.1:${bridge.port}/call`, { method: "POST", body: "{}" })).status, 401);
  await cli("providers", "set", "--kind", "image", "--provider", "fixture", "--base-url", baseUrl, "--model", "gpt-image-1", "--default", "--api-key-env", "ITERLAY_FIXTURE_KEY");
  assert.equal((await cli("providers", "show", "fixture")).authConfigured, true);
  assert(!(await readFile(path.join(directory, "workspace/settings.json"), "utf8")).includes(secret));
  if (process.platform !== "win32") assert.equal((await stat(path.join(directory, "credential-key"))).mode & 0o777, 0o600);
  const board = await cli("boards", "create", "--name", "独立运行验收");
  const template = await cli("templates", "create", "--name", "测试模板", "--prompt", "fixture");
  const imageOut = path.join(directory, "export/result.png");
  const result = await cli("image", "generate", "--template", template.id, "--prompt", "fixture", "--board", board.id, "--request-id", "standalone-test", "--out", imageOut);
  assert.equal(result.status, "succeeded"); assert.deepEqual(await readFile(imageOut), image);
  const replay = await cli("image", "generate", "--template", template.id, "--prompt", "fixture", "--board", board.id, "--request-id", "standalone-test", "--async");
  assert.equal(replay.generationId, result.generationId); assert.equal(generated, 1);
  await assert.rejects(cli("image", "generate", "--prompt", "different", "--board", board.id, "--request-id", "standalone-test"));
  assert.equal(generated, 1);
  const edited = await cli("image", "edit", "--input", imageOut, "--prompt", "edit fixture", "--board", board.id);
  assert.equal(edited.status, "succeeded"); assert.equal(generated, 2);
  const slice = await cli("image", "slice", "--path", result.images[0].path, "--board", board.id, "--rows", "1", "--columns", "1");
  assert.equal(slice.images.length, 1);
  const shown = await cli("boards", "show", board.id);
  assert(shown.nodes.some((node) => node.imagePath === result.images[0].path));
  await cli("call", "arrange_images", "--input", JSON.stringify({ boardId: board.id, nodeIds: shown.nodes.filter((n) => n.imagePath).map((n) => n.id), mode: "grid" }));
  assert((await cli("assets", "list")).total >= 3);
  await assert.rejects(cli("call", "read_asset", "--input", JSON.stringify({ path: path.join(directory, "credential-key") })));
  await assert.rejects(cli("call", "open_iterlay"));
  // Remote video identifiers are resumed after a daemon restart, never submitted again.
  await cli("providers", "set", "--kind", "video", "--provider", "video-fixture", "--type", "ark", "--base-url", baseUrl, "--model", "fixture-video", "--default", "--api-key-env", "ITERLAY_FIXTURE_KEY");
  completed = false;
  const video = await cli("video", "generate", "--prompt", "fixture video", "--board", board.id, "--async");
  assert.equal(videos, 1);
  await cli("server", "stop"); await stopped();
  await assert.rejects(cli("status", "--no-launch"));
  completed = true;
  if (process.platform === "linux") {
    const automatic = await exec(process.execPath, [script, "status", "--user-data-path", directory, "--json"], { timeout: 45_000, env: { ...process.env, DISPLAY: "", WAYLAND_DISPLAY: "" } });
    assert.equal(JSON.parse(automatic.stdout).data.runtime, "node");
  }
  const restored = await cli("tasks", "wait", video.videoGenerationId, "--kind", "video", "--out", path.join(directory, "video.mp4"));
  assert.equal(restored.status, "completed"); assert.equal(videos, 1);
  assert.equal((await cli("tasks", "get", "standalone-test")).status, "succeeded");
  assert.equal((await cli("templates", "show", template.id)).prompt, "fixture");
  const restartOut = path.join(directory, "after-restart.png");
  await cli("image", "generate", "--prompt", "credential reload", "--board", board.id, "--out", restartOut);
  assert.equal(generated, 3);
  await cli("server", "stop"); await stopped();
  // Foreground serve works without DISPLAY and cleans up on SIGTERM.
  foreground = spawn(process.execPath, [script, "serve", ...common], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DISPLAY: "", WAYLAND_DISPLAY: "" } });
  await new Promise((resolve, reject) => {
    foreground.once("error", reject); foreground.once("exit", (code) => reject(new Error(`serve exited ${code}`)));
    foreground.stdout.once("data", resolve);
  });
  assert.equal((await cli("status", "--no-launch")).runtime, "node");
  const exit = new Promise((resolve) => foreground.once("exit", resolve)); foreground.kill("SIGTERM");
  assert.equal(await exit, 0); await stopped();
  await writeFile(path.join(directory, "credential-key"), Buffer.alloc(1));
  await assert.rejects(cli("serve"), (error) => error.stdout.includes("凭据密钥损坏"));
  console.log(JSON.stringify({ ok: true, platform: process.platform, arch: process.arch, node: process.versions.node, imageRequests: generated, videoSubmissions: videos, electron: false, checks: ["concurrent-start", "authentication", "encrypted-config", "boards", "templates", "generate", "edit", "slice", "export", "idempotency", "video-recovery", "restart", "foreground-serve", "shutdown", "invalid-key"] }, null, 2));
} finally {
  foreground?.kill("SIGTERM");
  await cli("server", "stop").catch(() => undefined); await stopped().catch(() => undefined);
  provider.closeAllConnections(); await new Promise((resolve) => provider.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
