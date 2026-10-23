import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAdd, runRemove } from "../cli/src/commands.js";
import { installCli } from "../electron/cli-installation.js";
import { getAgentIntegrationStatus, removeLegacyIntegration } from "../electron/agent-integration.js";
const directories: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), "iterlay-cli-")); directories.push(home);
  const skill = path.join(home, "bundle"); await mkdir(skill);
  await writeFile(path.join(skill, "SKILL.md"), "---\nname: using-iterlay\ndescription: Use the CLI\n---\nUse iterlay CLI.");
  return { home, skill, userDataPath: path.join(home, "data") };
}
describe("CLI installation and Skill migration", () => {
  it("installs the CLI Skill, removes only Iterlay's old Codex tables and retains other config", async () => {
    const f = await fixture(); await mkdir(path.join(f.home, ".codex"));
    await writeFile(path.join(f.home, ".codex/config.toml"), '[mcp_servers.other]\ncommand="other"\n\n[mcp_servers.iterlay]\ncommand="old"\n[mcp_servers.iterlay.env]\nOLD="1"\n\n[features]\nworks=true\n');
    await runAdd({ homeDir: f.home, userDataPath: f.userDataPath, bundledSkillPath: f.skill, agents: ["codex"] });
    const config = await readFile(path.join(f.home, ".codex/config.toml"), "utf8");
    expect(config).toContain('command="other"'); expect(config).toContain('[features]'); expect(config).not.toContain('mcp_servers.iterlay');
    expect(await readFile(path.join(f.home, ".codex/skills/using-iterlay/SKILL.md"), "utf8")).toContain("CLI");
    await runRemove({ homeDir: f.home, userDataPath: f.userDataPath, agents: ["codex"] });
    expect(JSON.parse(await readFile(path.join(f.userDataPath, "mcp-skill-policy.json"), "utf8")).declined.codex).toBe(true);
  });
  it("preserves other Claude Code settings and refuses malformed config", async () => {
    const f = await fixture(); const configPath = path.join(f.home, ".claude.json");
    await writeFile(configPath, JSON.stringify({ theme: "dark", mcpServers: { other: { command: "keep" }, iterlay: { command: "old" } } }));
    await removeLegacyIntegration("claude-code", f.home);
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({ theme: "dark", mcpServers: { other: { command: "keep" } } });
    await writeFile(configPath, "malformed");
    await expect(removeLegacyIntegration("claude-code", f.home)).rejects.toThrow("有效 JSON");
    expect(await readFile(configPath, "utf8")).toBe("malformed");
  });
  it.each([["/bin/zsh", ".zshrc"], ["/bin/bash", ".bashrc"]])("installs a launcher for %s that handles quotes without duplicating PATH blocks", async (shell, profileName) => {
    vi.stubEnv("SHELL", shell);
    const f = await fixture(); const scriptPath = path.join(f.home, "App's Resources/main.js");
    await mkdir(path.dirname(scriptPath)); await writeFile(scriptPath, "console.log('ok')");
    const options = { homeDir: f.home, executable: "/Applications/Iterlay App/Iterlay", scriptPath };
    expect((await installCli(options)).installed).toBe(true);
    await installCli(options);
    const profile = await readFile(path.join(f.home, profileName), "utf8");
    expect(profile.match(/# >>> Iterlay CLI >>>/gu)).toHaveLength(1);
    const launcher = await readFile(path.join(f.home, ".local/bin/iterlay"), "utf8");
    expect(launcher).toContain("ELECTRON_RUN_AS_NODE=1"); expect(launcher).toContain('"$@"'); expect(launcher).toContain("'\\''");
  });
  it("does not replace a command from another installation", async () => {
    const f = await fixture(); await mkdir(path.join(f.home, ".local/bin"), { recursive: true });
    const target = path.join(f.home, ".local/bin/iterlay"); await writeFile(target, "unrelated");
    const result = await installCli({ homeDir: f.home, executable: "app", scriptPath: path.join(f.skill, "SKILL.md") });
    expect(result.error).toContain("同名"); expect(await readFile(target, "utf8")).toBe("unrelated");
  });
  it("protects an unmanaged Skill from installation and removal", async () => {
    const f = await fixture(); const existing = path.join(f.home, ".codex/skills/using-iterlay"); await mkdir(existing, { recursive: true });
    await writeFile(path.join(existing, "SKILL.md"), "custom skill");
    await expect(runAdd({ homeDir: f.home, userDataPath: f.userDataPath, bundledSkillPath: f.skill, agents: ["codex"] })).rejects.toThrow("自行维护");
    await expect(runRemove({ homeDir: f.home, userDataPath: f.userDataPath, agents: ["codex"] })).rejects.toThrow("未由 Iterlay 管理");
    expect(await readFile(path.join(existing, "SKILL.md"), "utf8")).toBe("custom skill");
  });
  it("detects Skill state without marking legacy config as a verified connection", async () => {
    const f = await fixture(); await runAdd({ homeDir: f.home, userDataPath: f.userDataPath, bundledSkillPath: f.skill, agents: ["codex"] });
    const client = (await getAgentIntegrationStatus(f.home)).clients.find((c) => c.id === "codex");
    expect(client).toMatchObject({ skillInstalled: true, skillManaged: true, legacyConfigured: false });
    expect(client).not.toHaveProperty("configured");
  });
});
