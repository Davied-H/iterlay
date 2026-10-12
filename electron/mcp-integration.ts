import { createHash, randomUUID } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpClientId, McpSkillUpgradeDetail } from "../shared/mcp-integration.js";

export type { McpClientId } from "../shared/mcp-integration.js";

export interface McpClientStatus {
  id: McpClientId;
  configured: boolean;
  configPath: string;
  skillInstalled: boolean;
  skillPath: string;
}

export interface McpIntegrationStatus {
  clients: McpClientStatus[];
  skillUpgrades?: McpSkillUpgradeDetail[];
  skillAutoInstalls?: McpClientId[];
}

export interface McpCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpSkillAutoInstallPolicy {
  schemaVersion: 1;
  declined: Partial<Record<McpClientId, boolean>>;
}

const MANAGED_SKILL_FILE = ".iterlay-managed.json";
const SKILL_AUTO_INSTALL_POLICY_FILE = "mcp-skill-policy.json";

interface SkillSnapshot {
  digest: string;
  files: Map<string, string>;
}

export async function getMcpIntegrationStatus(homeDir: string): Promise<McpIntegrationStatus> {
  const [codex, claudeCode] = await Promise.all([
    readCodexStatus(homeDir),
    readClaudeCodeStatus(homeDir)
  ]);
  return { clients: [codex, claudeCode] };
}

export async function installMcpSkill(
  client: McpClientId,
  homeDir: string,
  bundledSkillPath: string
): Promise<McpIntegrationStatus> {
  const skillPath = getSkillPath(client, homeDir);
  try {
    await access(path.join(bundledSkillPath, "SKILL.md"));
  } catch {
    throw new Error("Iterlay 内置 Skill 不完整，请重新安装 App 后重试。");
  }
  const bundleSnapshot = await snapshotSkill(bundledSkillPath);
  await replaceManagedSkill(skillPath, bundledSkillPath, bundleSnapshot.digest);
  return getMcpIntegrationStatus(homeDir);
}

/** Refreshes previously installed Iterlay Skills without silently installing new copies. */
export async function upgradeInstalledMcpSkills(
  homeDir: string,
  bundledSkillPath: string
): Promise<McpIntegrationStatus> {  const installedSkills = (["codex", "claude-code"] as const)
    .map((client) => ({ client, skillPath: getSkillPath(client, homeDir) }))
    .filter(({ skillPath }) => skillPath !== bundledSkillPath);
  const existingSkills: Array<{ client: McpClientId; skillPath: string }> = [];
  for (const installed of installedSkills) {
    if (await isSkillInstalled(installed.skillPath)) existingSkills.push(installed);
  }
  if (existingSkills.length === 0) return getMcpIntegrationStatus(homeDir);

  try {
    await access(path.join(bundledSkillPath, "SKILL.md"));
  } catch {
    throw new Error("Iterlay 内置 Skill 不完整，无法自动升级。");
  }
  const bundleSnapshot = await snapshotSkill(bundledSkillPath);
  const upgrades: McpSkillUpgradeDetail[] = [];
  for (const { client, skillPath } of existingSkills) {
    const previousDigest = await readManagedSkillDigest(skillPath);
    if (previousDigest === bundleSnapshot.digest) continue;
    const installedSnapshot = await snapshotSkill(skillPath);
    const files = diffSkillFiles(installedSnapshot.files, bundleSnapshot.files);
    await replaceManagedSkill(skillPath, bundledSkillPath, bundleSnapshot.digest);
    upgrades.push({
      client,
      skillPath,
      ...(previousDigest ? { previousDigest } : {}),
      currentDigest: bundleSnapshot.digest,
      upgradedAt: new Date().toISOString(),
      files
    });
  }
  return { ...await getMcpIntegrationStatus(homeDir), skillUpgrades: upgrades };
}

/** Detects installed coding agents by the presence of their user-level directories or config files. */
export async function detectMcpClients(homeDir: string): Promise<McpClientId[]> {
  const detected: McpClientId[] = [];
  if (await pathExists(path.join(homeDir, ".codex"))) detected.push("codex");
  if (
    (await pathExists(path.join(homeDir, ".claude.json"))) ||
    (await pathExists(path.join(homeDir, ".claude")))
  ) {
    detected.push("claude-code");
  }
  return detected;
}

export function skillAutoInstallPolicyPath(userDataPath: string): string {
  return path.join(userDataPath, SKILL_AUTO_INSTALL_POLICY_FILE);
}

export async function readSkillAutoInstallPolicy(userDataPath: string): Promise<McpSkillAutoInstallPolicy> {
  try {
    const parsed = JSON.parse(await readOptional(skillAutoInstallPolicyPath(userDataPath))) as unknown;
    if (isRecord(parsed) && isRecord(parsed.declined)) {
      const declined: Partial<Record<McpClientId, boolean>> = {};
      if (parsed.declined.codex === true) declined.codex = true;
      if (parsed.declined["claude-code"] === true) declined["claude-code"] = true;
      return { schemaVersion: 1, declined };
    }
  } catch {
    // Missing or unreadable policy files fall through to the default.
  }
  return { schemaVersion: 1, declined: {} };
}

/** Records or clears the user's refusal of automatic Skill installation for one client. */
export async function setSkillAutoInstallDeclined(
  userDataPath: string,
  client: McpClientId,
  declined: boolean
): Promise<void> {
  const policy = await readSkillAutoInstallPolicy(userDataPath);
  if (declined) policy.declined[client] = true;
  else delete policy.declined[client];
  await writeWithParent(skillAutoInstallPolicyPath(userDataPath), `${JSON.stringify(policy, null, 2)}\n`);
}

/**
 * Automatically installs the bundled Skill into detected coding agents and upgrades
 * previously installed managed copies. Never touches agents the user has declined,
 * agents that are not detected, or user-maintained unmanaged Skill directories.
 */
export async function syncMcpSkills(
  homeDir: string,
  bundledSkillPath: string,
  options: { userDataPath: string }
): Promise<McpIntegrationStatus> {
  try {
    await access(path.join(bundledSkillPath, "SKILL.md"));
  } catch {
    throw new Error("Iterlay 内置 Skill 不完整，无法自动同步。");
  }
  const policy = await readSkillAutoInstallPolicy(options.userDataPath);
  const targets = (await detectMcpClients(homeDir)).filter((client) => !policy.declined[client]);
  const bundleSnapshot = await snapshotSkill(bundledSkillPath);
  const upgrades: McpSkillUpgradeDetail[] = [];
  const installs: McpClientId[] = [];
  for (const client of targets) {
    const skillPath = getSkillPath(client, homeDir);
    if (skillPath === bundledSkillPath) continue;
    if (!(await pathExists(skillPath))) {
      await replaceManagedSkill(skillPath, bundledSkillPath, bundleSnapshot.digest);
      installs.push(client);
      continue;
    }
    const previousDigest = await readManagedSkillDigest(skillPath);
    if (!previousDigest) continue;
    if (previousDigest === bundleSnapshot.digest) continue;
    const installedSnapshot = await snapshotSkill(skillPath);
    const files = diffSkillFiles(installedSnapshot.files, bundleSnapshot.files);
    await replaceManagedSkill(skillPath, bundledSkillPath, bundleSnapshot.digest);
    upgrades.push({
      client,
      skillPath,
      previousDigest,
      currentDigest: bundleSnapshot.digest,
      upgradedAt: new Date().toISOString(),
      files
    });
  }
  return {
    ...await getMcpIntegrationStatus(homeDir),
    skillUpgrades: upgrades,
    ...(installs.length > 0 ? { skillAutoInstalls: installs } : {})
  };
}

export async function uninstallMcpSkill(client: McpClientId, homeDir: string): Promise<McpIntegrationStatus> {
  await rm(getSkillPath(client, homeDir), { recursive: true, force: true });
  return getMcpIntegrationStatus(homeDir);
}

/** Removes only the selected client's Iterlay configuration and bundled Skill. */
export async function removeMcpIntegration(client: McpClientId, homeDir: string): Promise<McpIntegrationStatus> {
  if (client === "codex") {
    await rm(getSkillPath("codex", homeDir), { recursive: true, force: true });
    const configPath = path.join(homeDir, ".codex", "config.toml");
    const current = await readOptional(configPath);
    await writeWithParent(configPath, `${removeTomlTable(current, "mcp_servers.iterlay").trimEnd()}\n`);
  } else {
    await rm(getSkillPath("claude-code", homeDir), { recursive: true, force: true });
    const configPath = path.join(homeDir, ".claude.json");
    const current = await readOptional(configPath);
    if (current.trim()) {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(current) as Record<string, unknown>;
      } catch {
        throw new Error("Claude Code 的 ~/.claude.json 不是有效 JSON，未修改该文件。");
      }
      if (isRecord(config.mcpServers)) delete config.mcpServers.iterlay;
      await writeWithParent(configPath, `${JSON.stringify(config, null, 2)}\n`);
    }
  }
  return getMcpIntegrationStatus(homeDir);
}

export async function configureMcpClient(
  client: McpClientId,
  homeDir: string,
  mcpCommand: McpCommand
): Promise<McpIntegrationStatus> {
  if (client === "codex") {
    await configureCodex(homeDir, mcpCommand);
  } else {
    await configureClaudeCode(homeDir, mcpCommand);
  }
  return getMcpIntegrationStatus(homeDir);
}

export async function uninstallMcpClient(client: McpClientId, homeDir: string): Promise<McpIntegrationStatus> {
  if (client === "codex") {
    const configPath = path.join(homeDir, ".codex", "config.toml");
    const current = await readOptional(configPath);
    await writeWithParent(configPath, `${removeTomlTable(current, "mcp_servers.iterlay").trimEnd()}\n`);
  } else {
    const configPath = path.join(homeDir, ".claude.json");
    const current = await readOptional(configPath);
    if (current.trim()) {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(current) as Record<string, unknown>;
      } catch {
        throw new Error("Claude Code 的 ~/.claude.json 不是有效 JSON，未修改该文件。");
      }
      if (isRecord(config.mcpServers)) delete config.mcpServers.iterlay;
      await writeWithParent(configPath, `${JSON.stringify(config, null, 2)}\n`);
    }
  }
  return getMcpIntegrationStatus(homeDir);
}

async function readCodexStatus(homeDir: string): Promise<McpClientStatus> {
  const configPath = path.join(homeDir, ".codex", "config.toml");
  const content = await readOptional(configPath);
  const skillPath = getSkillPath("codex", homeDir);
  return {
    id: "codex",
    configured: /\[mcp_servers\.iterlay\]/u.test(content),
    configPath,
    skillInstalled: await isSkillInstalled(skillPath),
    skillPath
  };
}

async function readClaudeCodeStatus(homeDir: string): Promise<McpClientStatus> {
  const configPath = path.join(homeDir, ".claude.json");
  const content = await readOptional(configPath);
  try {
    const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> };
    return {
      id: "claude-code",
      configured: Boolean(parsed.mcpServers?.iterlay),
      configPath,
      skillInstalled: await isSkillInstalled(getSkillPath("claude-code", homeDir)),
      skillPath: getSkillPath("claude-code", homeDir)
    };
  } catch {
    return {
      id: "claude-code",
      configured: false,
      configPath,
      skillInstalled: await isSkillInstalled(getSkillPath("claude-code", homeDir)),
      skillPath: getSkillPath("claude-code", homeDir)
    };
  }
}

function getSkillPath(client: McpClientId, homeDir: string): string {
  return client === "codex"
    ? path.join(homeDir, ".codex", "skills", "iterlay-workspace")
    : path.join(homeDir, ".claude", "skills", "iterlay-workspace");
}

async function isSkillInstalled(skillPath: string): Promise<boolean> {
  try {
    const content = await readFile(path.join(skillPath, "SKILL.md"), "utf8");
    return /^name:\s*iterlay-workspace\s*$/mu.test(content);
  } catch {
    return false;
  }
}

async function replaceManagedSkill(skillPath: string, bundledSkillPath: string, bundleDigest: string): Promise<void> {
  const temporaryPath = `${skillPath}.update-${process.pid}-${randomUUID()}`;
  const backupPath = `${skillPath}.backup-${process.pid}-${randomUUID()}`;
  let movedExisting = false;
  let installedNew = false;
  await mkdir(path.dirname(skillPath), { recursive: true });
  try {
    await cp(bundledSkillPath, temporaryPath, { recursive: true, force: true });
    await writeFile(path.join(temporaryPath, MANAGED_SKILL_FILE), `${JSON.stringify({ schemaVersion: 1, bundleDigest }, null, 2)}\n`, "utf8");
    try {
      await rename(skillPath, backupPath);
      movedExisting = true;
    } catch (error) {
      if (!isNodeError(error, "ENOENT")) throw error;
    }
    try {
      await rename(temporaryPath, skillPath);
      installedNew = true;
    } catch (error) {
      if (movedExisting) await rename(backupPath, skillPath);
      throw error;
    }
  } finally {
    await rm(temporaryPath, { recursive: true, force: true });
    if (installedNew) await rm(backupPath, { recursive: true, force: true });
  }
}

async function readManagedSkillDigest(skillPath: string): Promise<string | null> {
  try {
    const value = JSON.parse(await readFile(path.join(skillPath, MANAGED_SKILL_FILE), "utf8")) as { bundleDigest?: unknown };
    return typeof value.bundleDigest === "string" ? value.bundleDigest : null;
  } catch {
    return null;
  }
}

async function snapshotSkill(directory: string): Promise<SkillSnapshot> {
  const files = new Map<string, string>();
  await collectSkillFiles(directory, "", files);
  const hash = createHash("sha256");
  for (const [relativePath, fileDigest] of files) {
    hash.update(relativePath).update("\0").update(fileDigest).update("\0");
  }
  return { digest: hash.digest("hex"), files };
}

async function collectSkillFiles(directory: string, relativeDirectory: string, files: Map<string, string>): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === MANAGED_SKILL_FILE) continue;
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const sourcePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSkillFiles(sourcePath, relativePath, files);
    } else if (entry.isFile()) {
      files.set(relativePath, createHash("sha256").update(await readFile(sourcePath)).digest("hex"));
    }
  }
}

function diffSkillFiles(previous: Map<string, string>, current: Map<string, string>): McpSkillUpgradeDetail["files"] {
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  for (const [filePath, digest] of current) {
    const previousDigest = previous.get(filePath);
    if (!previousDigest) added.push(filePath);
    else if (previousDigest !== digest) updated.push(filePath);
  }
  for (const filePath of previous.keys()) {
    if (!current.has(filePath)) removed.push(filePath);
  }
  return { added, updated, removed };
}

async function configureCodex(homeDir: string, mcpCommand: McpCommand): Promise<void> {
  const configPath = path.join(homeDir, ".codex", "config.toml");
  const current = await readOptional(configPath);
  const entry = [
    "# Iterlay MCP integration (managed by Iterlay)",
    "[mcp_servers.iterlay]",
    `command = ${tomlString(mcpCommand.command)}`,
    `args = [${mcpCommand.args.map(tomlString).join(", ")}]`,
    ...(mcpCommand.env ? ["", "[mcp_servers.iterlay.env]"] : []),
    ...Object.entries(mcpCommand.env ?? {}).map(([key, value]) => `${key} = ${tomlString(value)}`)
  ].join("\n");
  const next = replaceTomlTable(current, "mcp_servers.iterlay", entry);
  await writeWithParent(configPath, `${next.trimEnd()}\n`);
}

async function configureClaudeCode(homeDir: string, mcpCommand: McpCommand): Promise<void> {
  const configPath = path.join(homeDir, ".claude.json");
  const current = await readOptional(configPath);
  let config: Record<string, unknown>;
  try {
    config = current.trim() ? JSON.parse(current) as Record<string, unknown> : {};
  } catch {
    throw new Error("Claude Code 的 ~/.claude.json 不是有效 JSON，未修改该文件。");
  }
  const mcpServers = isRecord(config.mcpServers) ? config.mcpServers : {};
  mcpServers.iterlay = { command: mcpCommand.command, args: mcpCommand.args, ...(mcpCommand.env ? { env: mcpCommand.env } : {}) };
  config.mcpServers = mcpServers;
  await writeWithParent(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function replaceTomlTable(content: string, table: string, entry: string): string {
  const tablePattern = tomlTablePattern(table);
  if (tablePattern.test(content)) return content.replace(tablePattern, `$1${entry}\n`);
  return content.trimEnd() ? `${content.trimEnd()}\n\n${entry}\n` : `${entry}\n`;
}

function removeTomlTable(content: string, table: string): string {
  return content.replace(tomlTablePattern(table), "$1");
}

function tomlTablePattern(table: string): RegExp {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|\\n)(?:#.*\\n)*\\[${escapedTable}\\][\\s\\S]*?(?=\\n(?:#.*\\n)*\\[(?!${escapedTable}\\.env\\])[^\\]]+\\]|$)`, "u");
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readOptional(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return "";
    throw error;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

async function writeWithParent(filePath: string, content: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error !== null && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
