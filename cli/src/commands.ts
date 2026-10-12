import {
  configureMcpClient,
  detectMcpClients,
  getMcpIntegrationStatus,
  installMcpSkill,
  removeMcpIntegration,
  setSkillAutoInstallDeclined,
  type McpClientId
} from "../../electron/mcp-integration.js";
import {
  buildMcpCommand,
  resolveIterlayApp,
  type ResolvedIterlayApp
} from "./paths.js";

export interface AddOptions {
  homeDir: string;
  userDataPath: string;
  bundledSkillPath: string;
  /** Explicit --agent targets, or null to auto-detect installed coding agents. */
  agents: McpClientId[] | null;
  skillOnly: boolean;
  appRoot?: string;
  version: string;
}

export interface RemoveOptions {
  homeDir: string;
  userDataPath: string;
  agents: McpClientId[] | null;
}

export interface ClientActionResult {
  client: McpClientId;
  skill: "installed" | "removed" | "skipped" | "failed";
  mcp: "configured" | "removed" | "skipped" | "failed";
  error?: string;
  skillPath: string;
  configPath: string;
}

export interface CommandResult {
  results: ClientActionResult[];
  appFound: boolean;
  appRoot?: string;
}

export class CliError extends Error {}

async function resolveTargets(homeDir: string, agents: McpClientId[] | null): Promise<McpClientId[]> {
  if (agents && agents.length > 0) return agents;
  return detectMcpClients(homeDir);
}

/** Installs the Iterlay Skill (and MCP configuration when the Iterlay app is found) into each target agent. */
export async function runAdd(options: AddOptions): Promise<CommandResult> {
  const targets = await resolveTargets(options.homeDir, options.agents);
  if (targets.length === 0) {
    throw new CliError("未检测到已安装的 Coding Agent（Codex 或 Claude Code）。使用 --agent <codex|claude-code> 显式指定。");
  }
  const { access } = await import("node:fs/promises");
  const path = await import("node:path");
  try {
    await access(path.join(options.bundledSkillPath, "SKILL.md"));
  } catch {
    throw new CliError("iterlay 包内的 Skill 不完整，请更新到最新版本后重试。");
  }

  let app: ResolvedIterlayApp | null = null;
  if (!options.skillOnly) app = await resolveIterlayApp(options.appRoot);

  const results: ClientActionResult[] = [];
  for (const client of targets) {
    const result: ClientActionResult = {
      client,
      skill: "skipped",
      mcp: "skipped",
      skillPath: "",
      configPath: ""
    };
    try {
      const status = await installMcpSkill(client, options.homeDir, options.bundledSkillPath);
      result.skill = "installed";
      const entry = status.clients.find((item) => item.id === client);
      result.skillPath = entry?.skillPath ?? "";
      result.configPath = entry?.configPath ?? "";
      if (app) {
        await configureMcpClient(client, options.homeDir, buildMcpCommand(app, options.userDataPath, options.version));
        result.mcp = "configured";
      }
      await setSkillAutoInstallDeclined(options.userDataPath, client, false);
    } catch (error) {
      result.skill = result.skill === "installed" ? result.skill : "failed";
      result.mcp = result.mcp === "configured" ? result.mcp : "failed";
      result.error = error instanceof Error ? error.message : String(error);
    }
    results.push(result);
  }
  return {
    results,
    appFound: Boolean(app),
    ...(app ? { appRoot: app.root } : {})
  };
}

/** Removes Iterlay's Skill and MCP configuration from each target agent. */
export async function runRemove(options: RemoveOptions): Promise<CommandResult> {
  const targets = await resolveTargets(options.homeDir, options.agents);
  if (targets.length === 0) {
    throw new CliError("未检测到已安装的 Coding Agent（Codex 或 Claude Code）。使用 --agent <codex|claude-code> 显式指定。");
  }
  const results: ClientActionResult[] = [];
  for (const client of targets) {
    const before = (await getMcpIntegrationStatus(options.homeDir)).clients.find((item) => item.id === client);
    if (!before?.configured && !before?.skillInstalled) {
      results.push({
        client,
        skill: "skipped",
        mcp: "skipped",
        skillPath: before?.skillPath ?? "",
        configPath: before?.configPath ?? ""
      });
      continue;
    }
    const status = await removeMcpIntegration(client, options.homeDir);
    await setSkillAutoInstallDeclined(options.userDataPath, client, true);
    const entry = status.clients.find((item) => item.id === client);
    results.push({
      client,
      skill: "removed",
      mcp: "removed",
      skillPath: entry?.skillPath ?? "",
      configPath: entry?.configPath ?? ""
    });
  }
  return { results, appFound: false };
}
