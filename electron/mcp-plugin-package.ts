import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { buildNamedArchive, type NamedArchiveItem } from "./asset-archive.js";
import type { McpClientId, McpCommand } from "./mcp-integration.js";

const PLUGIN_NAME = "iterlay-workspace";
const PLUGIN_ROOT = `${PLUGIN_NAME}/`;
const MAX_PLUGIN_FILES = 500;
const MAX_PLUGIN_BYTES = 20 * 1024 * 1024;

export interface McpPluginPackageInput {
  client: McpClientId;
  command: McpCommand;
  bundledSkillPath: string;
  version: string;
}

export async function buildMcpPluginPackage(input: McpPluginPackageInput): Promise<Buffer> {
  await ensureBundledSkill(input.bundledSkillPath);
  const skillFiles = await collectFiles(input.bundledSkillPath, `${PLUGIN_ROOT}skills/${PLUGIN_NAME}`);
  const entries: NamedArchiveItem[] = [
    jsonEntry(`${PLUGIN_ROOT}${manifestPath(input.client)}`, pluginManifest(input.client, input.version)),
    jsonEntry(`${PLUGIN_ROOT}.mcp.json`, mcpConfig(input.client, input.command)),
    textEntry(`${PLUGIN_ROOT}README.md`, packageReadme(input.client, input.version)),
    ...skillFiles
  ];
  const totalBytes = entries.reduce((total, item) => total + item.bytes.byteLength, 0);
  if (entries.length > MAX_PLUGIN_FILES || totalBytes > MAX_PLUGIN_BYTES) {
    throw new Error("Iterlay 插件包内容过大，无法导出。");
  }
  return buildNamedArchive(entries);
}

export function mcpPluginPackageFileName(client: McpClientId, version: string): string {
  const safeVersion = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version) ? version : "0.0.0";
  const target = client === "codex" ? "codex" : "claude-code";
  return `${PLUGIN_NAME}-${target}-plugin-v${safeVersion}.zip`;
}

function pluginManifest(client: McpClientId, version: string): Record<string, unknown> {
  const common = {
    name: PLUGIN_NAME,
    version: normalizeVersion(version),
    description: "Connect Codex or Claude Code to the Iterlay visual workspace through MCP and a bundled workflow skill.",
    author: { name: "Iterlay" },
    skills: "./skills/",
    mcpServers: "./.mcp.json"
  };
  if (client === "claude-code") {
    return {
      ...common,
      displayName: "Iterlay Workspace",
      keywords: ["iterlay", "mcp", "visual-workspace"]
    };
  }
  return {
    ...common,
    keywords: ["iterlay", "mcp", "visual-workspace"],
    interface: {
      displayName: "Iterlay Workspace",
      shortDescription: "Connect Codex to the Iterlay visual workspace",
      longDescription: "Use Iterlay MCP tools and the bundled workflow skill to inspect boards, create or edit images, validate outputs, and export selected assets.",
      developerName: "Iterlay",
      category: "Productivity",
      capabilities: ["Read", "Write"],
      defaultPrompt: [
        "Use Iterlay Workspace to inspect my active board.",
        "Use Iterlay Workspace to create and validate visual assets."
      ],
      brandColor: "#111827"
    }
  };
}

function mcpConfig(_client: McpClientId, command: McpCommand): Record<string, unknown> {
  const server = {
    command: command.command,
    args: command.args,
    ...(command.env ? { env: command.env } : {})
  };
  return { mcpServers: { iterlay: server } };
}

function packageReadme(client: McpClientId, version: string): string {
  const target = client === "codex" ? "Codex" : "Claude Code";
  const validation = client === "codex"
    ? "将解压后的 iterlay-workspace 目录加入 Codex 插件 Marketplace 后安装。"
    : "可先运行 `claude plugin validate ./iterlay-workspace --strict`，再通过 Claude Code Marketplace 安装；也可放入个人 skills 目录作为 skills-directory plugin。";
  return [
    `# Iterlay Workspace for ${target}`,
    "",
    `版本：${normalizeVersion(version)}`,
    "",
    "此插件包包含 Iterlay MCP 服务配置和 iterlay-workspace Skill。",
    validation,
    "",
    "使用前请保持生成此插件包的 Iterlay App 已安装；调用画板、素材或生成工具时需保持 Iterlay 正在运行。",
    ""
  ].join("\n");
}

function manifestPath(client: McpClientId): string {
  return client === "codex" ? ".codex-plugin/plugin.json" : ".claude-plugin/plugin.json";
}

function normalizeVersion(version: string): string {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version) ? version : "0.0.0";
}

async function ensureBundledSkill(skillPath: string): Promise<void> {
  try {
    await access(path.join(skillPath, "SKILL.md"));
  } catch {
    throw new Error("Iterlay 内置 Skill 不完整，请重新安装 App 后重试。");
  }
}

async function collectFiles(directory: string, archiveDirectory: string): Promise<NamedArchiveItem[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: NamedArchiveItem[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const sourcePath = path.join(directory, entry.name);
    const archivePath = `${archiveDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectFiles(sourcePath, archivePath));
    } else if (entry.isFile()) {
      files.push({ name: archivePath, bytes: await readFile(sourcePath) });
    }
  }
  return files;
}

function jsonEntry(name: string, value: Record<string, unknown>): NamedArchiveItem {
  return textEntry(name, `${JSON.stringify(value, null, 2)}\n`);
}

function textEntry(name: string, value: string): NamedArchiveItem {
  return { name, bytes: Buffer.from(value, "utf8") };
}
