#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { runAdd, runRemove } from "./commands.js";
import { defaultUserDataPath } from "./paths.js";
import { connect } from "./runtime.js";
import { listWorkspaceTools } from "../../electron/workspace-tools.js";
import type { CodingAgentId } from "../../shared/agent-integration.js";

const HELP = `Iterlay CLI — 使用 App 保存的模型创作

iterlay status                         工作区状态
iterlay providers list [--kind image]   已保存的模型服务（不包含密钥）
iterlay models list --provider <id>     服务已保存的模型
iterlay image generate --prompt <text> [--reference <file>] [--out <file>]
iterlay image edit --input <file> --prompt <text> [--out <file>]
iterlay video generate --prompt <text> [--board <id>]
iterlay tasks list|get|wait|cancel [task-id] [--kind video] [--out <file>]
iterlay boards list|create|show|open [id] [--name <name>]
iterlay assets list|import|export [--input <file>] [--path <managed-path>] [--out <file>]
iterlay tools list                      完整操作目录及 JSON schema
iterlay guard descriptor                离线输出 Guard 命令描述（不会安装或启用 Guard）
iterlay call <operation> --input '<JSON>'  调用任意工作台操作
iterlay add [--agent codex|claude-code]  安装 CLI Skill，迁移旧集成
iterlay remove --agent <id>             移除 Skill

通用选项：--json --async --provider <id> --model <id> --board <id>
--user-data-path <path> --app-path <path> --no-launch --timeout <seconds>
生成：--size auto --n 1 --quality high --background transparent
未指定 --board 时使用设置中的 CLI 默认画板；未配置时使用「CLI 创作」。
默认等待任务完成；Ctrl+C 只结束等待。已有输出文件不会覆盖，除非 --overwrite。`;

type Flags = Record<string, string[]>;
function parse(argv: string[]): { words: string[]; flags: Flags } {
  const words: string[] = [], flags: Flags = {};
  const bools = new Set(["json", "async", "no-launch", "overwrite", "help", "version"]);
  const values = new Set(["agent", "home", "kind", "provider", "model", "prompt", "input", "out", "path", "board", "name", "size", "quality", "style", "background", "n", "reference", "ratio", "duration", "resolution", "timeout", "request-id", "app-path", "user-data-path"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { words.push(arg); continue; }
    const key = arg.slice(2);
    if (bools.has(key)) { flags[key] = ["true"]; continue; }
    if (!values.has(key)) throw new Error(`未知参数 --${key}。`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`参数 --${key} 缺少值。`);
    (flags[key] ??= []).push(value);
  }
  return { words, flags };
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
async function importFile(call: Awaited<ReturnType<typeof connect>>, file: string, boardId?: string): Promise<string> {
  const mime: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" };
  const mimeType = mime[path.extname(file).toLowerCase()];
  if (!mimeType) throw new Error("不支持的素材文件格式。");
  if ((await stat(file)).size > 20 * 1024 * 1024) throw new Error("素材超过 20 MB，请先通过 App 导入。");
  const result = await call(mimeType.startsWith("video/") ? "import_video" : "import_image", { dataUrl: `data:${mimeType};base64,${(await readFile(file)).toString("base64")}`, ...(boardId ? { boardId } : {}) });
  if (typeof result === "string") return result;
  const r = record(result);
  const managed = r.path ?? r.videoPath ?? r.imagePath;
  if (typeof managed !== "string") throw new Error("素材导入未返回受管路径。");
  return managed;
}
async function exportFiles(call: Awaited<ReturnType<typeof connect>>, paths: string[], destination: string, overwrite: boolean): Promise<string[]> {
  if (!paths.length) throw new Error("没有可导出的素材。");
  const directory = paths.length > 1 || destination.endsWith(path.sep) || (await stat(destination).catch(() => null))?.isDirectory();
  const outputs: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const target = path.resolve(directory ? path.join(destination, `${i + 1}-${path.basename(paths[i])}`) : destination);
    const data = record(await call("read_asset", { path: paths[i] })).dataUrl;
    if (typeof data !== "string" || !/^data:[^;]+;base64,/u.test(data)) throw new Error("素材数据格式无效。");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(data.slice(data.indexOf(",") + 1), "base64"), { flag: overwrite ? "w" : "wx" });
    outputs.push(target);
  }
  return outputs;
}
async function main(): Promise<void> {
  const { words, flags } = parse(process.argv.slice(2));
  const get = (key: string) => flags[key]?.at(-1);
  if (flags.help || words[0] === "help" || (!words.length && !flags.version)) { process.stdout.write(HELP + "\n"); return; }
  if (flags.version || words[0] === "version") {
    const pkg = JSON.parse(await readFile(path.resolve(moduleDir, "../package.json"), "utf8")) as { version: string };
    process.stdout.write(pkg.version + "\n"); return;
  }
  const timeout = Number(get("timeout") ?? "600");
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("--timeout 必须是正数。");
  const userDataPath = get("user-data-path") ?? process.env.ITERLAY_USER_DATA_PATH ?? defaultUserDataPath();
  const [group, action, id] = words;
  const output = (data: unknown) => process.stdout.write(JSON.stringify(flags.json ? { schemaVersion: 1, ok: true, data } : data, (key, value: unknown) => key === "previewImageDataUrls" ? undefined : value, 2) + "\n");
  if (group === "guard" && action === "descriptor") {
    output(JSON.parse(await readFile(path.resolve(moduleDir,"../guard/command.iterlay.json"),"utf8")));
    return;
  }
  if (group === "add" || group === "remove") {
    const agents = flags.agent as CodingAgentId[] | undefined;
    if (agents?.some((a) => a !== "codex" && a !== "claude-code")) throw new Error("未知的 Coding Agent。");
    const options = { homeDir: get("home") ?? os.homedir(), userDataPath, agents: agents ?? null, bundledSkillPath: path.resolve(moduleDir, "../skills/iterlay-workspace") };
    output(await (group === "add" ? runAdd(options) : runRemove(options))); return;
  }
  if (group === "tools" && action === "list") { output(listWorkspaceTools()); return; }
  const call = await connect({ userDataPath, appRoot: get("app-path"), noLaunch: Boolean(flags["no-launch"]) || Boolean(process.env.ITERLAY_USER_DATA_PATH) || Boolean(get("user-data-path")) });
  if (group === "status" || group === "doctor") { output(await call("status")); return; }
  if (group === "providers" && action === "list") { output(await call("list_providers", get("kind") ? { kind: get("kind") } : {})); return; }
  if (group === "models" && action === "list") { output(await call("list_models", { providerId: get("provider") })); return; }
  if (group === "call") {
    if (!action || !listWorkspaceTools().some((tool) => tool.name === action)) throw new Error("未知的工作台操作，请运行 iterlay tools list。");
    const args: unknown = JSON.parse(get("input") ?? "{}");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("--input 必须是 JSON 对象。");
    output(await call(action, args as Record<string, unknown>)); return;
  }
  let result: unknown;
  const video = group === "video" || get("kind") === "video";
  if (group === "boards") {
    const methods: Record<string, string> = { list: "list_boards", create: "create_board", show: "get_board", open: "open_board", active: "get_active_board" };
    if (!methods[action]) throw new Error("未知画板操作。");
    output(await call(methods[action], { boardId: id, name: get("name") })); return;
  }
  if (group === "assets") {
    if (action === "list") { output(await call("list_assets")); return; }
    if (action === "import" && get("input")) { output({ path: await importFile(call, get("input")!, get("board")) }); return; }
    if (action === "export" && get("path") && get("out")) { output({ paths: await exportFiles(call, [get("path")!], get("out")!, Boolean(flags.overwrite)) }); return; }
    throw new Error("素材操作缺少参数。运行 iterlay help 查看用法。");
  }
  if (group === "tasks" && action === "list") { output(await call("list_tasks")); return; }
  if (group === "tasks" && action === "cancel") {
    if (!id) throw new Error("缺少任务 ID。");
    if (video) throw new Error("视频远端取消不在此操作范围；仅停止等待不会停止远端任务。");
    output(await call("cancel_generation",{generationId:id})); return;
  }
  if (group === "tasks" && (action === "get" || action === "wait")) {
    if (!id) throw new Error("缺少任务 ID。");
    result = await call(video ? "get_video_generation_status" : "get_generation_status", video ? { videoGenerationId: id } : { generationId: id });
    if (action === "get") { const r = record(result); delete r.previewImageDataUrls; output(r); return; }
  } else if ((group === "image" && (action === "generate" || action === "edit")) || (group === "video" && action === "generate")) {
    if (!get("prompt")?.trim()) throw new Error("缺少 --prompt。");
    if (action === "edit" && !get("input")) throw new Error("缺少 --input。");
    let boardId = get("board");
    if (!boardId) {
      boardId = String(record(await call("resolve_generation_board")).boardId);
    }
    const args: Record<string, unknown> = { boardId, prompt: get("prompt"), providerId: get("provider"), model: get("model"), size: get("size"), quality: get("quality"), background: get("background"), style: get("style"), n: get("n") ? Number(get("n")) : 1 };
    if (flags.reference) args[video ? "referenceImagePaths" : "referencePaths"] = await Promise.all(flags.reference.map((file) => importFile(call, file, boardId)));
    if (action === "edit") { if (!get("input")) throw new Error("缺少 --input。"); args.sourcePath = await importFile(call, get("input")!, boardId); }
    if (video) { args.aspectRatio = get("ratio"); args.durationSeconds = get("duration") ? Number(get("duration")) : undefined; args.resolution = get("resolution"); }
    args.requestId = get("request-id") ?? randomUUID();
    if (!video) process.stderr.write(`提交请求 ${String(args.requestId)}\n`);
    try { result = await call(video ? "generate_video" : action === "edit" ? "edit_image" : "generate_image", args); }
    catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)}${video ? "" : `；请求 ID ${String(args.requestId)}，请先查询任务状态再决定是否重新生成。`}`); }
    if (flags.async) { output(result); return; }
  } else throw new Error("未知命令。运行 iterlay help 查看用法。");
  let task = record(result);
  const taskId = task.generationId ?? task.videoGenerationId;
  if (typeof taskId !== "string") throw new Error("任务不存在或未返回任务 ID。");
  process.stderr.write(`任务 ${taskId}；Ctrl+C 结束等待，可用 tasks wait ${taskId}${video ? " --kind video" : ""} 继续。\n`);
  const deadline = Date.now() + timeout * 1000;
  while (!["succeeded", "completed", "failed", "cancelled", "interrupted", "unknown"].includes(String(task.status))) {
    if (Date.now() >= deadline) throw new Error(`等待超时，任务仍可查询：${taskId}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    task = record(await call(video ? "get_video_generation_status" : "get_generation_status", video ? { videoGenerationId: taskId } : { generationId: taskId }));
  }
  delete task.previewImageDataUrls;
  if (["failed", "cancelled", "interrupted", "unknown"].includes(String(task.status))) throw new Error(`任务 ${taskId}：${String(task.error ?? task.status)}`);
  if (get("out")) {
    const paths = video ? [String(record(task.video).path)] : (task.images as Array<{ path: string }> ?? []).map((image) => image.path);
    try { task.exportedPaths = await exportFiles(call, paths, get("out")!, Boolean(flags.overwrite)); }
    catch (error) { throw new Error(`生成已完成，任务 ${taskId}；导出失败：${error instanceof Error ? error.message : String(error)}。可再次 tasks wait 导出。`); }
  }
  output(task);
}
void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) process.stdout.write(JSON.stringify({ schemaVersion: 1, ok: false, error: { code: "ITERLAY_ERROR", message } }) + "\n");
  else process.stderr.write(`iterlay：${message}\n`);
  process.exitCode = 1;
});
