import { createHash, randomUUID } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CodingAgentId, AgentSkillUpgradeDetail } from "../shared/agent-integration.js";

export type { CodingAgentId } from "../shared/agent-integration.js";

export interface CodingAgentStatus {
  id: CodingAgentId;
  detected: boolean;
  detection: "installed" | "config-only" | "not-found";
  executablePath?: string;
  skillInstalled: boolean;
  skillManaged: boolean;
  skillPath: string;
  legacyConfigured: boolean;
}
export interface AgentIntegrationStatus {
  clients: CodingAgentStatus[];
  skillUpgrades?: AgentSkillUpgradeDetail[];
  skillAutoInstalls?: CodingAgentId[];
}

export interface SkillAutoInstallPolicy {
  schemaVersion: 1;
  declined: Partial<Record<CodingAgentId, boolean>>;
}

const MANAGED_SKILL_FILE = ".iterlay-managed.json";
const SKILL_AUTO_INSTALL_POLICY_FILE = "mcp-skill-policy.json";

interface SkillSnapshot {
  digest: string;
  files: Map<string, string>;
}

export async function getAgentIntegrationStatus(homeDir: string): Promise<AgentIntegrationStatus> {
  return { clients: await Promise.all(SUPPORTED_AGENT_IDS.map((client) => agentStatus(client, homeDir))) };
}

const AGENT_SKILL_NAMES = ["using-iterlay"] as const;
type AgentSkillName = typeof AGENT_SKILL_NAMES[number];

async function bundledAgentSkills(bundledSkillPath: string) {
  const bundles = AGENT_SKILL_NAMES.map((name) => ({
    name,
    source: bundledSkillPath
  }));
  for (const { source } of bundles) {
    try { await access(path.join(source, "SKILL.md")); }
    catch { throw new Error("Iterlay 内置 Skill 不完整，请重新安装 App 后重试。"); }
  }
  return Promise.all(bundles.map(async (bundle) => ({ ...bundle, snapshot: await snapshotSkill(bundle.source) })));
}

export async function installAgentSkill(
  client: CodingAgentId,
  homeDir: string,
  bundledSkillPath: string
): Promise<AgentIntegrationStatus> {
  const bundles = await bundledAgentSkills(bundledSkillPath);
  // Protect user-maintained Skills before installing.
  for (const { name } of bundles) {
    const target = getSkillPath(client, homeDir, name);
    if (await pathExists(target) && !await readManagedSkillDigest(target)) {
      throw new Error(`已有自行维护的同名 Skill（${name}），请先处理该目录再安装。`);
    }
  }
  for (const { name, source, snapshot } of bundles) {
    const target = getSkillPath(client, homeDir, name);
    if (target !== source) await replaceManagedSkill(target, source, snapshot.digest);
  }
  await removeManagedWorkspaceSkill(client, homeDir);
  return getAgentIntegrationStatus(homeDir);
}

/** Refresh existing integrations, including their explicit invocation entrypoint. */
export async function upgradeInstalledAgentSkills(
  homeDir: string,
  bundledSkillPath: string
): Promise<AgentIntegrationStatus> {
  const clients = (await getAgentIntegrationStatus(homeDir)).clients;
  const targets: CodingAgentId[] = [];
  for (const client of clients) {
    if (await isSkillInstalled(client.skillPath) || await readManagedSkillDigest(path.join(path.dirname(client.skillPath), "iterlay-workspace"))) targets.push(client.id);
  }
  return syncSkillsForClients(homeDir, bundledSkillPath, targets);
}

async function syncSkillsForClients(homeDir: string, bundledSkillPath: string, targets: CodingAgentId[]): Promise<AgentIntegrationStatus> {
  const bundles = await bundledAgentSkills(bundledSkillPath);
  const upgrades: AgentSkillUpgradeDetail[] = [];
  const installs = new Set<CodingAgentId>();
  for (const client of targets) {
    for (const { name, source, snapshot } of bundles) {
      const skillPath = getSkillPath(client, homeDir, name);
      if (skillPath === source) continue;
      if (!(await pathExists(skillPath))) {
        await replaceManagedSkill(skillPath, source, snapshot.digest);
        installs.add(client);
        continue;
      }
      const previousDigest = await readManagedSkillDigest(skillPath);
      if (!previousDigest || previousDigest === snapshot.digest) continue;
      const installedSnapshot = await snapshotSkill(skillPath);
      const files = diffSkillFiles(installedSnapshot.files, snapshot.files);
      await replaceManagedSkill(skillPath, source, snapshot.digest);
      upgrades.push({ client, skillPath, previousDigest, currentDigest: snapshot.digest, upgradedAt: new Date().toISOString(), files });
    }
    if (await readManagedSkillDigest(getSkillPath(client, homeDir))) await removeManagedWorkspaceSkill(client, homeDir);
  }
  return {
    ...await getAgentIntegrationStatus(homeDir),
    skillUpgrades: upgrades,
    ...(installs.size > 0 ? { skillAutoInstalls: [...installs] } : {})
  };
}

export async function detectCodingAgents(homeDir: string): Promise<CodingAgentId[]> {
  const status = await getAgentIntegrationStatus(homeDir);
  return status.clients.filter((client) => client.detected).map((client) => client.id);
}

export function skillAutoInstallPolicyPath(userDataPath: string): string {
  return path.join(userDataPath, SKILL_AUTO_INSTALL_POLICY_FILE);
}

export async function readSkillAutoInstallPolicy(userDataPath: string): Promise<SkillAutoInstallPolicy> {
  try {
    const parsed = JSON.parse(await readOptional(skillAutoInstallPolicyPath(userDataPath))) as unknown;
    if (isRecord(parsed) && isRecord(parsed.declined)) {
      const declined: Partial<Record<CodingAgentId, boolean>> = {};
      for (const id of SUPPORTED_AGENT_IDS) if (parsed.declined[id] === true) declined[id] = true;
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
  client: CodingAgentId,
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
export async function syncAgentSkills(
  homeDir: string,
  bundledSkillPath: string,
  options: { userDataPath: string }
): Promise<AgentIntegrationStatus> {
  const policy = await readSkillAutoInstallPolicy(options.userDataPath);
  const targets = (await detectCodingAgents(homeDir)).filter((client) => !policy.declined[client]);
  return syncSkillsForClients(homeDir, bundledSkillPath, targets);
}

export async function uninstallAgentSkill(client: CodingAgentId, homeDir: string): Promise<AgentIntegrationStatus> {
  const targets = AGENT_SKILL_NAMES.map((name) => getSkillPath(client, homeDir, name));
  for (const target of targets) {
    if (await pathExists(target) && !await readManagedSkillDigest(target)) throw new Error("此 Skill 未由 Iterlay 管理，未移除。");
  }
  for (const target of targets) await rm(target, { recursive: true, force: true });
  await removeManagedWorkspaceSkill(client, homeDir);
  return getAgentIntegrationStatus(homeDir);
}

/** Only retire old copies installed by Iterlay; preserve user-maintained Skills. */
async function removeManagedWorkspaceSkill(client: CodingAgentId, homeDir: string): Promise<void> {
  const legacyPath = path.join(path.dirname(getSkillPath(client, homeDir)), "iterlay-workspace");
  if (await readManagedSkillDigest(legacyPath)) await rm(legacyPath, { recursive: true, force: true });
}

/** Migration only: remove Iterlay's old entry, preserving every unrelated server. */
export async function removeLegacyIntegration(client: CodingAgentId, homeDir: string): Promise<void> {
  if (client !== "codex" && client !== "claude-code") return;
  const configPath = path.join(homeDir, client === "codex" ? ".codex/config.toml" : ".claude.json");
  const current = await readOptional(configPath);
  if (!current.trim()) return;
  let next = current;
  if (client === "codex") {
    next = removeTomlTable(current, "mcp_servers.iterlay");
  } else {
    let config: unknown;
    try { config = JSON.parse(current); } catch { throw new Error("Claude Code 配置不是有效 JSON，未修改该文件。"); }
    if (!isRecord(config)) throw new Error("Claude Code 配置格式无效，未修改该文件。");
    if (!isRecord(config.mcpServers) || !("iterlay" in config.mcpServers)) return;
    delete config.mcpServers.iterlay;
    next = JSON.stringify(config, null, 2) + "\n";
  }
  if (next !== current) await writeWithParent(configPath, next);
}

async function agentStatus(client: CodingAgentId, homeDir: string): Promise<CodingAgentStatus> {
  const executable = AGENT_EXECUTABLES[client];
  const directories = [...(process.env.PATH ?? "").split(path.delimiter), path.join(homeDir, ".local/bin"), path.join(homeDir, ".npm-global/bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  let executablePath: string | undefined;
  for (const directory of directories.filter(Boolean)) {
    const candidate = path.join(directory, executable + (process.platform === "win32" ? ".cmd" : ""));
    try { await access(candidate, 1); executablePath = candidate; break; } catch { /* Next known location. */ }
  }
  const desktop = client === "codex" && process.platform === "darwin" && (await pathExists("/Applications/Codex.app") || await pathExists(path.join(homeDir, "Applications/Codex.app")));
  const configPath = path.join(homeDir, client === "codex" ? ".codex/config.toml" : client === "claude-code" ? ".claude.json" : AGENT_CONFIG_PATHS[client]);
  const content = await readOptional(configPath);
  let legacyConfigured = false;
  if (client === "codex") legacyConfigured = /\[mcp_servers\.iterlay\]/u.test(content);
  else { try { legacyConfigured = Boolean(JSON.parse(content).mcpServers?.iterlay); } catch { /* Report separately when migrating. */ } }
  const skillPath = getSkillPath(client, homeDir);
  const skillPaths = AGENT_SKILL_NAMES.map((name) => getSkillPath(client, homeDir, name));
  const skillInstalled = (await Promise.all(skillPaths.map((target, index) => isSkillInstalled(target, AGENT_SKILL_NAMES[index])))).every(Boolean);
  const skillManaged = (await Promise.all(skillPaths.map(readManagedSkillDigest))).every(Boolean);
  const detected = Boolean(executablePath || desktop);
  return { id: client, detected, detection: detected ? "installed" : content.trim() ? "config-only" : "not-found", executablePath, skillInstalled, skillManaged, skillPath, legacyConfigured };
}

const SUPPORTED_AGENT_IDS = ["codex", "claude-code", "workbuddy", "cursor", "windsurf", "cline", "roo-cline", "gemini-cli", "opencode"] as const;
const AGENT_EXECUTABLES: Record<CodingAgentId, string> = { codex: "codex", "claude-code": "claude", workbuddy: "workbuddy", cursor: "cursor", windsurf: "windsurf", cline: "cline", "roo-cline": "roo", "gemini-cli": "gemini", opencode: "opencode" };
const AGENT_SKILL_DIRS: Record<CodingAgentId, string> = { codex: ".codex/skills", "claude-code": ".claude/skills", workbuddy: ".workbuddy/skills", cursor: ".cursor/skills", windsurf: ".codeium/windsurf/skills", cline: ".cline/skills", "roo-cline": ".roo/skills", "gemini-cli": ".gemini/skills", opencode: ".config/opencode/skills" };
const AGENT_CONFIG_PATHS: Record<Exclude<CodingAgentId, "codex" | "claude-code">, string> = { workbuddy: ".workbuddy/config.json", cursor: ".cursor/config.json", windsurf: ".codeium/windsurf/config.json", cline: ".cline/config.json", "roo-cline": ".roo/config.json", "gemini-cli": ".gemini/settings.json", opencode: ".config/opencode/config.json" };
function getSkillPath(client: CodingAgentId, homeDir: string, name: AgentSkillName = "using-iterlay"): string { return path.join(homeDir, AGENT_SKILL_DIRS[client], name); }

async function isSkillInstalled(skillPath: string, name: AgentSkillName = "using-iterlay"): Promise<boolean> {
  try {
    const content = await readFile(path.join(skillPath, "SKILL.md"), "utf8");
    return new RegExp(`^name:\\s*${name}\\s*$`, "mu").test(content);
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

function diffSkillFiles(previous: Map<string, string>, current: Map<string, string>): AgentSkillUpgradeDetail["files"] {
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

function removeTomlTable(content: string, table: string): string {
  return content.replace(tomlTablePattern(table), "$1");
}

function tomlTablePattern(table: string): RegExp {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|\\n)(?:#.*\\n)*\\[${escapedTable}\\][\\s\\S]*?(?=\\n(?:#.*\\n)*\\[(?!${escapedTable}\\.env\\])[^\\]]+\\]|$)`, "u");
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
