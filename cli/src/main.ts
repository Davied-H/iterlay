#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import type { McpClientId } from "../../shared/mcp-integration.js";
import { CliError, runAdd, runRemove, type ClientActionResult, type CommandResult } from "./commands.js";
import { defaultUserDataPath } from "./paths.js";

const USAGE = `Iterlay CLI — 一条命令连接 Coding Agent

用法:
  iterlay add [选项]     安装 Iterlay Skill 并配置 MCP（默认命令）
  iterlay remove [选项]  移除 Iterlay Skill 与 MCP 配置
  iterlay help           显示帮助

选项:
  --agent <id>           目标 agent：codex 或 claude-code，可重复；缺省自动检测
  --skill-only           只安装 Skill，不写 MCP 配置
  --app-path <path>     Iterlay App 安装路径（自动探测失败时指定）
  --user-data-path <p>   Iterlay 用户数据目录（默认与 App 一致）
  --json                 输出 JSON 结果
  --version              显示版本`;

interface ParsedArguments {
  command: "add" | "remove" | "help" | "version";
  agents: McpClientId[] | null;
  skillOnly: boolean;
  appRoot?: string;
  userDataPath?: string;
  homeDir?: string;
  json: boolean;
}

function parseArguments(argv: string[]): ParsedArguments {
  const parsed: ParsedArguments = { command: "add", agents: null, skillOnly: false, json: false };
  const agents: McpClientId[] = [];
  const positional: string[] = [];
  let index = 0;
  while (index < argv.length) {
    const argument = argv[index];
    if (argument === "add" || argument === "remove" || argument === "help" || argument === "version") {
      positional.push(argument);
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      positional.push("help");
      index += 1;
      continue;
    }
    if (argument === "--version" || argument === "-V") {
      positional.push("version");
      index += 1;
      continue;
    }
    if (argument === "--skill-only" || argument === "--json") {
      if (argument === "--skill-only") parsed.skillOnly = true;
      else parsed.json = true;
      index += 1;
      continue;
    }
    if (argument === "--agent" || argument === "--app-path" || argument === "--user-data-path" || argument === "--home") {
      const value = argv[index + 1];
      if (!value) throw new CliError(`参数 ${argument} 缺少值。`);
      if (argument === "--agent") {
        if (value !== "codex" && value !== "claude-code") throw new CliError(`未知的 agent：${value}（可用：codex、claude-code）。`);
        agents.push(value);
      } else if (argument === "--app-path") parsed.appRoot = value;
      else if (argument === "--user-data-path") parsed.userDataPath = value;
      else parsed.homeDir = value;
      index += 2;
      continue;
    }
    throw new CliError(`未知的参数：${argument}。运行 iterlay help 查看用法。`);
  }
  parsed.command = (positional[0] as ParsedArguments["command"]) ?? "add";
  if (agents.length > 0) parsed.agents = agents;
  return parsed;
}

function moduleRelative(...segments: string[]): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ...segments);
}

function bundledSkillPath(): string {
  return moduleRelative("skills", "iterlay-workspace");
}

function cliVersion(): string {
  try {
    const parsed = JSON.parse(readFileSync(moduleRelative("package.json"), "utf8")) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

const clientTitles: Record<McpClientId, string> = {
  codex: "Codex",
  "claude-code": "Claude Code"
};

function printClientResult(entry: ClientActionResult): void {
  const title = clientTitles[entry.client];
  if (entry.error) {
    process.stdout.write(`✘ ${title}：失败 — ${entry.error}\n`);
    return;
  }
  if (entry.skill === "installed") {
    process.stdout.write(`✓ ${title}：Skill 已安装 · ${entry.skillPath}\n`);
    if (entry.mcp === "configured") process.stdout.write(`✓ ${title}：MCP 已配置 · ${entry.configPath}\n`);
    return;
  }
  if (entry.skill === "removed") {
    process.stdout.write(`✓ ${title}：已移除 Iterlay 集成（Skill 与 MCP 配置）\n`);
    return;
  }
  process.stdout.write(`- ${title}：未安装 Iterlay 集成，已跳过\n`);
}

function printResult(result: CommandResult, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  for (const entry of result.results) printClientResult(entry);
  if (!result.appFound && result.results.some((entry) => entry.error === undefined && entry.mcp === "skipped" && entry.skill === "installed")) {
    process.stdout.write("⚠ 未找到 Iterlay App，已跳过 MCP 配置。安装 App 后重新运行 iterlay add，或用 --app-path 指定路径。\n");
  }
}

async function main(): Promise<number> {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (parsed.command === "version") {
    process.stdout.write(`${cliVersion()}\n`);
    return 0;
  }
  const homeDir = parsed.homeDir ?? os.homedir();
  const userDataPath = parsed.userDataPath ?? defaultUserDataPath();
  if (parsed.command === "remove") {
    printResult(await runRemove({ homeDir, userDataPath, agents: parsed.agents }), parsed.json);
    return 0;
  }
  printResult(
    await runAdd({
      homeDir,
      userDataPath,
      bundledSkillPath: bundledSkillPath(),
      agents: parsed.agents,
      skillOnly: parsed.skillOnly,
      ...(parsed.appRoot ? { appRoot: parsed.appRoot } : {}),
      version: cliVersion()
    }),
    parsed.json
  );
  return 0;
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    const message = error instanceof CliError ? error.message : error instanceof Error ? error.message : String(error);
    process.stderr.write(`iterlay：${message}\n`);
    process.exitCode = 1;
  }
);
