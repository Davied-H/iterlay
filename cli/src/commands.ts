import { detectCodingAgents, installAgentSkill, uninstallAgentSkill, removeLegacyIntegration, setSkillAutoInstallDeclined, type CodingAgentId } from "../../electron/agent-integration.js";
export class CliError extends Error {}
export async function runAdd(options: { homeDir: string; userDataPath: string; bundledSkillPath: string; agents: CodingAgentId[] | null }): Promise<unknown> {
  const targets = options.agents ?? await detectCodingAgents(options.homeDir);
  if (!targets.length) throw new CliError("未检测到 Coding Agent。使用 --agent workbuddy 等指定目标。");
  const results = [];
  for (const client of targets) {
    await installAgentSkill(client, options.homeDir, options.bundledSkillPath);
    await removeLegacyIntegration(client, options.homeDir);
    await setSkillAutoInstallDeclined(options.userDataPath, client, false);
    results.push({ client, skill: "installed" });
  }
  return { results };
}
export async function runRemove(options: { homeDir: string; userDataPath: string; agents: CodingAgentId[] | null }): Promise<unknown> {
  const targets = options.agents ?? await detectCodingAgents(options.homeDir);
  for (const client of targets) {
    await uninstallAgentSkill(client, options.homeDir);
    await removeLegacyIntegration(client, options.homeDir);
    await setSkillAutoInstallDeclined(options.userDataPath, client, true);
  }
  return { results: targets.map((client) => ({ client, skill: "removed" })) };
}
