#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { runAdd, runRemove } from "./commands.js";
import { defaultUserDataPath, standaloneUserDataPath, resolveIterlayApp } from "./paths.js";
import { connect } from "./runtime.js";
import { listWorkspaceTools } from "../../electron/workspace-tools.js";
import { assertInlineMediaByteLength } from "../../shared/media-import.js";
import type { CodingAgentId } from "../../shared/agent-integration.js";

const HELP = `Iterlay CLI — 图片、视频与画板；支持 App 和独立 Node 运行时

iterlay status                         工作区状态
iterlay providers list [--kind image]   已保存的模型服务（不包含密钥）
iterlay providers show <id>             查看配置（不包含密钥）
iterlay providers set --kind image|video|audio --provider <id> --model <id> [配置选项]
iterlay providers default|remove <id> --kind image|video|audio
iterlay models list --provider <id>     服务已保存的模型
iterlay models set --kind image|video|audio --provider <id> --model <id> [--saved-model <id>]
配置：--type --name --base-url --voice --speech-endpoint --connection-provider
      --saved-model <id>（可重复） --default --api-key-env <变量名> | --api-key-stdin
      --clear-api-key 清除密钥；省略密钥参数则保留原凭证。audio 为独立 TTS 配置。
iterlay image generate --prompt <text> [--reference <file>] [--out <file>]
iterlay image deliver --job <id> [--delivery-format jpeg] [--delivery-size 1200x2000] [--fit scale|cover|contain] [--out <file>]
iterlay image slice --path <managed-path> --rows 3 --columns 4 [--out <directory>]
iterlay image edit --input <file> --prompt <text> [--out <file>]
iterlay video generate --prompt <text> [--board <id>]
iterlay tasks list|get|wait|cancel [task-id] [--kind video] [--out <file>]
iterlay boards list|create|show|open [id] [--name <name>]
iterlay assets list|import|export [--input <file>] [--path <managed-path>] [--out <file>]
iterlay templates list|show [id]       查询可复用模板
iterlay templates create --name <name> --prompt <rules>
iterlay templates update <id> --prompt <rules>
模板字段：--description --category --mode --use-case；--input <JSON文件>
图片生成/编辑：--template <id> --prompt <本次内容>
iterlay tools list                      完整操作目录及 JSON schema
iterlay guard descriptor                离线输出 Guard 命令描述（不会安装或启用 Guard）
iterlay call <operation> --input '<JSON>'  调用任意工作台操作
iterlay add [--agent <id>]              安装 CLI Skill，迁移旧集成
iterlay remove --agent <id>             移除 Skill

iterlay serve                          前台运行独立后台（供 systemd / Docker 托管）
iterlay server stop                    停止独立后台

通用选项：--json --async --provider <id> --model <id> --board <id>
--standalone --user-data-path <path> --app-path <path> --no-launch --timeout <seconds>
有 App 时默认连接 App；未安装时自动使用独立 Node 后台。--standalone 强制独立工作区。
--no-launch 仅连接已有服务。图片接口：--api-mode images|responses --generation-endpoint <path> --reference-endpoint <path>。
生成：--size auto --n 1 --quality high --background transparent
格式：--output-format png|jpeg|webp|svg|gif；GIF 使用 --size 512x512 --frames 9 --frame-duration-ms 200
本地交付：--delivery-format png|jpeg|webp --delivery-size WxH --fit scale|cover|contain --delivery-quality 1..100
ChatGPT OAuth 中转：providers set --kind image --provider <id> --image-control-mode automatic
未指定 --board 时使用设置中的 CLI 默认画板；未配置时使用「CLI 创作」。
默认等待任务完成；Ctrl+C 只结束等待。已有输出文件不会覆盖，除非 --overwrite。`;

type Flags = Record<string, string[]>;
function parse(argv: string[]): { words: string[]; flags: Flags } {
  const words: string[] = [], flags: Flags = {};
  const bools = new Set(["json", "async", "no-launch", "overwrite", "help", "version", "default", "api-key-stdin", "clear-api-key", "standalone"]);
  const values = new Set(["template", "description", "category", "mode", "use-case", "expected-prompt", "agent", "home", "kind", "provider", "model", "prompt", "input", "out", "path", "board", "name", "size", "quality", "style", "background", "output-format", "frames", "frame-duration-ms", "n", "reference", "ratio", "duration", "resolution", "timeout", "request-id", "app-path", "user-data-path", "type", "base-url", "voice", "speech-endpoint", "connection-provider", "saved-model", "api-key-env", "rows", "columns", "margin", "gap", "crops", "node", "api-mode", "generation-endpoint", "reference-endpoint", "job", "delivery-format", "delivery-size", "delivery-quality", "fit", "image-control-mode"]);
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
  const label = `素材「${path.basename(file)}」`;
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`${label}不是普通文件。`);
  assertInlineMediaByteLength(info.size, label);
  const bytes = await readFile(file);
  // Recheck after reading in case the file changed since stat().
  assertInlineMediaByteLength(bytes.length, label);
  const result = await call(mimeType.startsWith("video/") ? "import_video" : "import_image", { dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`, ...(boardId ? { boardId } : {}) });
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
  if (flags.standalone && get("app-path")) throw new Error("--standalone 与 --app-path 不能同时使用。");
  const standalone = Boolean(flags.standalone) || words[0] === "serve" || (!get("app-path") && !await resolveIterlayApp());
  const userDataPath = get("user-data-path") ?? process.env.ITERLAY_USER_DATA_PATH ?? (standalone ? standaloneUserDataPath() : defaultUserDataPath());
  const [group, action, id] = words;
  const output = (data: unknown) => process.stdout.write(JSON.stringify(flags.json ? { schemaVersion: 1, ok: true, data } : data, (key, value: unknown) => key === "previewImageDataUrls" ? undefined : value, 2) + "\n");
  if (group === "guard" && action === "descriptor") {
    output(JSON.parse(await readFile(path.resolve(moduleDir,"../guard/command.iterlay.json"),"utf8")));
    return;
  }
  if (group === "add" || group === "remove") {
    const agents = flags.agent as CodingAgentId[] | undefined;
    const supported = new Set(["codex", "claude-code", "workbuddy", "cursor", "windsurf", "cline", "roo-cline", "gemini-cli", "opencode"]);
    if (agents?.some((a) => !supported.has(a))) throw new Error("未知的 Coding Agent。");
    const options = { homeDir: get("home") ?? os.homedir(), userDataPath, agents: agents ?? null, bundledSkillPath: path.resolve(moduleDir, "../skills/using-iterlay") };
    output(await (group === "add" ? runAdd(options) : runRemove(options))); return;
  }
  if (group === "tools" && action === "list") { output(listWorkspaceTools()); return; }
  if (group === "serve") {
    const { startNodeServer } = await import("./server.js");
    const server = await startNodeServer(userDataPath);
    const stop = () => { void server.close(); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
    output({ runtime: "node", userDataPath: server.directory, listening: "127.0.0.1" });
    await server.closed;
    process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop);
    return;
  }
  const deliveryOptions = () => {
    const value = { format: get("delivery-format"), size: get("delivery-size"), fit: get("fit"), quality: get("delivery-quality") === undefined ? undefined : Number(get("delivery-quality")) };
    return Object.values(value).some((item) => item !== undefined) ? value : undefined;
  };
  const runtimeCall = await connect({ userDataPath, appRoot: get("app-path"), standalone, noLaunch: Boolean(flags["no-launch"]) || (!standalone && (Boolean(process.env.ITERLAY_USER_DATA_PATH) || Boolean(get("user-data-path")))) || group === "server" });
  let deliverySupported: Promise<boolean> | undefined;
  const requireDelivery = async () => {
    deliverySupported ??= runtimeCall("status").then((status) => record(status).imageDeliveryVersion === 1);
    if (!await deliverySupported) throw new Error("当前后台尚不支持本地交付，请升级 App 或使用 --standalone；未提交生成请求。");
  };
  const call = async (method: string, args: Record<string, unknown> = {}) => {
    if (method === "retry_image_delivery" || ["generate_image", "edit_image"].includes(method) && args.delivery !== undefined) {
      await requireDelivery();
    }
    return runtimeCall(method, args);
  };
  if (group === "server" && action === "stop") { output(await call("shutdown")); return; }
  if (group === "status" || group === "doctor") { output(await call("status")); return; }
  if (group === "image" && action === "deliver") {
    const jobId = get("job") ?? id;
    if (!jobId) throw new Error("缺少 --job；请使用 tasks get 返回的 job.id。");
    const result = record(await call("retry_image_delivery", { jobId, delivery: deliveryOptions() }));
    if (get("out") && record(record(result.job).delivery).status !== "failed") {
      result.exportedPaths = await exportFiles(call, (result.images as Array<{ path: string }> ?? []).map((image) => image.path), get("out")!, Boolean(flags.overwrite));
    }
    output(result); if (record(record(result.job).delivery).status === "failed") process.exitCode = 1; return;
  }
  if (group === "providers" && action === "list") { output(await call("list_providers", get("kind") ? { kind: get("kind") } : {})); return; }
  if (group === "providers" && action === "show") { output(await call("get_provider", { providerId: id ?? get("provider") })); return; }
  if ((group === "providers" && ["set", "default", "remove"].includes(action)) || (group === "models" && action === "set")) {
    if (!["image", "video", "audio"].includes(get("kind") ?? "")) throw new Error("配置必须指定 --kind image、video 或 audio。");
    const input: Record<string, unknown> = { kind: get("kind"), action: action === "set" ? "upsert" : action, providerId: id ?? get("provider") };
    if (action !== "set" && !input.providerId) throw new Error("缺少 Provider ID。");
    const fields: Record<string, string> = { name: "name", type: "type", "base-url": "baseUrl", model: "model", voice: "voice", "speech-endpoint": "speechEndpoint", "connection-provider": "connectionProviderId", "api-mode": "apiMode", "generation-endpoint": "generationEndpoint", "reference-endpoint": "referenceEndpoint", "image-control-mode": "imageControlMode" };
    for (const [flag, field] of Object.entries(fields)) if (get(flag) !== undefined) input[field] = get(flag) === "none" && flag === "connection-provider" ? "" : get(flag);
    if (flags["saved-model"]) input.models = flags["saved-model"];
    if (flags.default) input.setDefault = true;
    const keySources = [Boolean(get("api-key-env")), Boolean(flags["api-key-stdin"]), Boolean(flags["clear-api-key"])].filter(Boolean).length;
    if (keySources > 1) throw new Error("密钥参数不能同时使用。");
    if (action !== "set" && (keySources || Object.keys(input).some((key) => !["kind", "action", "providerId"].includes(key)))) throw new Error("默认/删除操作不接受其它配置字段。");
    if (get("api-key-env")) {
      const key = process.env[get("api-key-env")!];
      if (!key?.trim()) throw new Error("指定的 API Key 环境变量为空或不存在。");
      input.apiKey = key.trim();
    }
    if (flags["api-key-stdin"]) {
      if (process.stdin.isTTY) throw new Error("请通过管道向 stdin 提供密钥。");
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of process.stdin) {
        const buffer = Buffer.from(chunk as Uint8Array); bytes += buffer.length;
        if (bytes > 100_000) throw new Error("API Key 输入过长。");
        chunks.push(buffer);
      }
      const key = Buffer.concat(chunks).toString("utf8").trim();
      if (!key) throw new Error("API Key 输入为空；清除请使用 --clear-api-key。");
      input.apiKey = key;
    }
    if (flags["clear-api-key"]) input.apiKey = "";
    output(await call("configure_provider", input)); return;
  }
  if (group === "models" && action === "list") { output(await call("list_models", { providerId: get("provider") })); return; }
  if (group === "call") {
    if (!action || !listWorkspaceTools().some((tool) => tool.name === action)) throw new Error("未知的工作台操作，请运行 iterlay tools list。");
    const args: unknown = JSON.parse(get("input") ?? "{}");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("--input 必须是 JSON 对象。");
    output(await call(action, args as Record<string, unknown>)); return;
  }
  let result: unknown;
  const video = group === "video" || get("kind") === "video";
  if (group === "templates") {
    const methods: Record<string, string> = { list: "list_templates", show: "get_template", create: "create_template", update: "update_template" };
    if (!methods[action]) throw new Error("未知模板操作。");
    if (["show", "update"].includes(action) && !id) throw new Error("缺少模板 ID。");
    let input: Record<string, unknown> = {};
    if (get("input")) {
      const parsed: unknown = JSON.parse(await readFile(get("input")!, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("模板文件必须是 JSON 对象。");
      input = parsed as Record<string, unknown>;
    }
    for (const [flag, field] of Object.entries({ name: "name", prompt: "prompt", description: "description", category: "category", mode: "mode", "use-case": "useCase", "expected-prompt": "expectedPrompt" })) {
      if (get(flag) !== undefined) input[field] = get(flag);
    }
    if (id) input.templateId = id;
    output(await call(methods[action], input)); return;
  }
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
  if (group === "image" && action === "slice") {
    if ([get("input"), get("path"), get("node")].filter(Boolean).length !== 1) throw new Error("切图须指定且仅指定 --input、--path 或 --node。");
    const args: Record<string, unknown> = {};
    for (const key of ["rows", "columns", "margin", "gap"]) if (get(key) !== undefined) args[key] = Number(get(key));
    if (get("crops")) args.crops = JSON.parse(get("crops")!);
    // Resolve/create the board only after local argument validation.
    if (args.crops === undefined && (!get("rows") || !get("columns"))) throw new Error("请指定 --rows 和 --columns，或 --crops JSON。");
    const boardId = get("board") ?? String(record(await call("resolve_generation_board")).boardId);
    args.boardId = boardId;
    if (get("node")) args.nodeId = get("node");
    else args.sourcePath = get("path") ?? await importFile(call, get("input")!, boardId);
    const sliced = record(await call("slice_image", args));
    if (get("out")) {
      try { sliced.exportedPaths = await exportFiles(call, (sliced.images as Array<{ path: string }>).map((image) => image.path), path.resolve(get("out")!) + path.sep, Boolean(flags.overwrite)); }
      catch (error) { throw new Error(`切图已保存到画板 ${boardId}；导出失败，可用 assets export 重试：${error instanceof Error ? error.message : String(error)}`); }
    }
    output(sliced); return;
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
    if (video && deliveryOptions()) throw new Error("本地图片交付参数仅用于图片生成与编辑。");
    if (video && get("template")) throw new Error("--template 目前只支持图片生成和编辑。");
    if (!get("prompt")?.trim()) throw new Error("缺少 --prompt。");
    if (action === "edit" && !get("input")) throw new Error("缺少 --input。");
    if (!video && deliveryOptions()) await requireDelivery();
    let boardId = get("board");
    if (!boardId) {
      boardId = String(record(await call("resolve_generation_board")).boardId);
    }
    const args: Record<string, unknown> = { templateId: get("template"), boardId, prompt: get("prompt"), providerId: get("provider"), model: get("model"), size: get("size"), quality: get("quality"), background: get("background"), style: get("style"), n: get("n") ? Number(get("n")) : 1 };
    if (!video) { args.delivery = deliveryOptions(); args.outputFormat = get("output-format"); args.frameCount = get("frames") ? Number(get("frames")) : undefined; args.frameDurationMs = get("frame-duration-ms") ? Number(get("frame-duration-ms")) : undefined; }
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
  if (!video && record(record(task.job).delivery).status === "failed") {
    process.exitCode = 1;
    process.stderr.write(`原图已生成并保留，本地交付未完成。使用 image deliver --job ${String(record(task.job).id)} 重试，不会再次调用模型。\n`);
  }
  if (get("out") && (video || record(record(task.job).delivery).status !== "failed")) {
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
