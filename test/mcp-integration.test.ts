import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  configureMcpClient,
  detectMcpClients,
  getMcpIntegrationStatus,
  installMcpSkill,
  readSkillAutoInstallPolicy,
  removeMcpIntegration,
  setSkillAutoInstallDeclined,
  syncMcpSkills,
  uninstallMcpClient,
  uninstallMcpSkill,
  upgradeInstalledMcpSkills
} from "../electron/mcp-integration.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createHome(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-mcp-"));
  temporaryDirectories.push(directory);
  return directory;
}

const command = {
  command: "/Applications/Iterlay.app/Contents/MacOS/Iterlay",
  args: ["/Applications/Iterlay.app/Contents/Resources/app.asar/dist-electron/electron/mcp-stdio-node.js"],
  env: { ELECTRON_RUN_AS_NODE: "1", ITERLAY_USER_DATA_PATH: "/tmp/iterlay", ITERLAY_VERSION: "0.1.39" }
};

describe("MCP integration configuration", () => {
  it("adds or replaces only Iterlay's Codex TOML entry", async () => {
    const home = await createHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, "[mcp_servers.existing]\ncommand = \"existing\"\n\n[mcp_servers.iterlay]\ncommand = \"old\"\nargs = [\"old\"]\n\n[mcp_servers.iterlay.env]\nELECTRON_RUN_AS_NODE = \"0\"\n", { encoding: "utf8", flag: "w" }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeFile(configPath, "[mcp_servers.existing]\ncommand = \"existing\"\n\n[mcp_servers.iterlay]\ncommand = \"old\"\nargs = [\"old\"]\n\n[mcp_servers.iterlay.env]\nELECTRON_RUN_AS_NODE = \"0\"\n");
    });

    await configureMcpClient("codex", home, command);

    const config = await readFile(configPath, "utf8");
    expect(config).toContain("[mcp_servers.existing]");
    expect(config).toContain(`command = ${JSON.stringify(command.command)}`);
    expect(config).toContain('ELECTRON_RUN_AS_NODE = "1"');
    expect(config).toContain('ITERLAY_USER_DATA_PATH = "/tmp/iterlay"');
    expect(config).not.toContain('ELECTRON_RUN_AS_NODE = "0"');
    expect(config).not.toContain('command = "old"');
    const status = await getMcpIntegrationStatus(home);
    expect(status.clients.find((client) => client.id === "codex")?.configured).toBe(true);
  });

  it("merges Iterlay into Claude Code's existing MCP configuration", async () => {
    const home = await createHome();
    const configPath = path.join(home, ".claude.json");
    await writeFile(configPath, JSON.stringify({ mcpServers: { existing: { command: "existing" } }, theme: "dark" }), "utf8");

    await configureMcpClient("claude-code", home, command);

    await expect(readFile(configPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      theme: "dark",
      mcpServers: { existing: { command: "existing" }, iterlay: command }
    });
  });

  it("installs only Iterlay's bundled Skill into the selected client directory", async () => {
    const home = await createHome();
    const bundle = path.join(home, "bundle", "iterlay-workspace");
    await mkdir(path.join(bundle, "references"), { recursive: true });
    await mkdir(path.join(bundle, "scripts"), { recursive: true });
    await writeFile(path.join(bundle, "SKILL.md"), "---\nname: iterlay-workspace\n---\n", "utf8");
    await writeFile(path.join(bundle, "references", "mcp-tools.md"), "tools", "utf8");
    await writeFile(path.join(bundle, "scripts", "validate-image-batch.mjs"), "validator", "utf8");
    const unrelatedSkill = path.join(home, ".codex", "skills", "other", "SKILL.md");
    await mkdir(path.dirname(unrelatedSkill), { recursive: true });
    await writeFile(unrelatedSkill, "other", "utf8");

    const status = await installMcpSkill("codex", home, bundle);

    expect(status.clients.find((client) => client.id === "codex")?.skillInstalled).toBe(true);
    await expect(readFile(path.join(home, ".codex", "skills", "iterlay-workspace", "references", "mcp-tools.md"), "utf8"))
      .resolves.toBe("tools");
    await expect(readFile(path.join(home, ".codex", "skills", "iterlay-workspace", "scripts", "validate-image-batch.mjs"), "utf8"))
      .resolves.toBe("validator");
    await expect(readFile(unrelatedSkill, "utf8")).resolves.toBe("other");
  });

  it("automatically upgrades installed managed Skills and removes obsolete bundled files", async () => {
    const home = await createHome();
    const bundle = path.join(home, "bundle", "iterlay-workspace");
    await mkdir(path.join(bundle, "references"), { recursive: true });
    await writeFile(path.join(bundle, "SKILL.md"), "---\nname: iterlay-workspace\n---\nold\n", "utf8");
    await writeFile(path.join(bundle, "references", "obsolete.md"), "obsolete", "utf8");
    await installMcpSkill("codex", home, bundle);

    await writeFile(path.join(bundle, "SKILL.md"), "---\nname: iterlay-workspace\n---\nnew\n", "utf8");
    await rm(path.join(bundle, "references", "obsolete.md"));
    await writeFile(path.join(bundle, "references", "mcp-tools.md"), "new tools", "utf8");
    const result = await upgradeInstalledMcpSkills(home, bundle);

    const installed = path.join(home, ".codex", "skills", "iterlay-workspace");
    await expect(readFile(path.join(installed, "SKILL.md"), "utf8")).resolves.toContain("new");
    await expect(readFile(path.join(installed, "references", "mcp-tools.md"), "utf8")).resolves.toBe("new tools");
    await expect(readFile(path.join(installed, "references", "obsolete.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(result.skillUpgrades).toEqual([
      expect.objectContaining({
        client: "codex",
        skillPath: installed,
        files: {
          added: ["references/mcp-tools.md"],
          updated: ["SKILL.md"],
          removed: ["references/obsolete.md"]
        }
      })
    ]);
  });

  it("migrates legacy installed Skills without installing into unselected clients", async () => {
    const home = await createHome();
    const bundle = path.join(home, "bundle", "iterlay-workspace");
    const claudeSkill = path.join(home, ".claude", "skills", "iterlay-workspace");
    await mkdir(bundle, { recursive: true });
    await mkdir(claudeSkill, { recursive: true });
    await writeFile(path.join(bundle, "SKILL.md"), "---\nname: iterlay-workspace\n---\ncurrent\n", "utf8");
    await writeFile(path.join(claudeSkill, "SKILL.md"), "---\nname: iterlay-workspace\n---\nlegacy\n", "utf8");

    const status = await upgradeInstalledMcpSkills(home, bundle);

    await expect(readFile(path.join(claudeSkill, "SKILL.md"), "utf8")).resolves.toContain("current");
    expect(status.clients.find((client) => client.id === "claude-code")?.skillInstalled).toBe(true);
    expect(status.clients.find((client) => client.id === "codex")?.skillInstalled).toBe(false);
    expect(status.skillUpgrades).toEqual([
      expect.objectContaining({ client: "claude-code" })
    ]);
    expect(status.skillUpgrades?.[0].previousDigest).toBeUndefined();
  });

  it("uninstalls only Iterlay's MCP entry and Skill", async () => {
    const home = await createHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "[mcp_servers.existing]\ncommand = \"existing\"\n\n# Iterlay MCP integration (managed by Iterlay)\n[mcp_servers.iterlay]\ncommand = \"iterlay\"\nargs = [\"--mcp\"]\n", "utf8");
    const iterlaySkill = path.join(home, ".codex", "skills", "iterlay-workspace", "SKILL.md");
    const otherSkill = path.join(home, ".codex", "skills", "other", "SKILL.md");
    await mkdir(path.dirname(iterlaySkill), { recursive: true });
    await mkdir(path.dirname(otherSkill), { recursive: true });
    await writeFile(iterlaySkill, "---\nname: iterlay-workspace\n---\n", "utf8");
    await writeFile(otherSkill, "other", "utf8");

    await uninstallMcpClient("codex", home);
    const status = await uninstallMcpSkill("codex", home);

    await expect(readFile(configPath, "utf8")).resolves.toContain("[mcp_servers.existing]");
    await expect(readFile(configPath, "utf8")).resolves.not.toContain("[mcp_servers.iterlay]");
    await expect(readFile(otherSkill, "utf8")).resolves.toBe("other");
    expect(status.clients.find((client) => client.id === "codex")?.skillInstalled).toBe(false);
  });

  it("removes only the selected client when both agents are integrated", async () => {
    const home = await createHome();
    const bundle = path.join(home, "bundle", "iterlay-workspace");
    await mkdir(bundle, { recursive: true });
    await writeFile(path.join(bundle, "SKILL.md"), "---\nname: iterlay-workspace\n---\n", "utf8");

    await configureMcpClient("codex", home, command);
    await configureMcpClient("claude-code", home, command);
    await installMcpSkill("codex", home, bundle);
    await installMcpSkill("claude-code", home, bundle);

    const status = await removeMcpIntegration("codex", home);

    expect(status.clients.find((client) => client.id === "codex")).toMatchObject({
      configured: false,
      skillInstalled: false
    });
    expect(status.clients.find((client) => client.id === "claude-code")).toMatchObject({
      configured: true,
      skillInstalled: true
    });
    await expect(readFile(path.join(home, ".claude", "skills", "iterlay-workspace", "SKILL.md"), "utf8"))
      .resolves.toContain("name: iterlay-workspace");
  });
});

async function createSyncBundle(home: string, content: string): Promise<string> {
  const bundle = path.join(home, "bundle", "iterlay-workspace");
  await mkdir(path.join(bundle, "references"), { recursive: true });
  await writeFile(path.join(bundle, "SKILL.md"), `---\nname: iterlay-workspace\n---\n${content}\n`, "utf8");
  await writeFile(path.join(bundle, "references", "mcp-tools.md"), content, "utf8");
  return bundle;
}

describe("automatic Skill sync", () => {
  it("installs into detected agents without touching undetected agents", async () => {
    const home = await createHome();
    const userData = path.join(home, "user-data");
    const bundle = await createSyncBundle(home, "sync");
    await mkdir(path.join(home, ".codex"), { recursive: true });

    expect(await detectMcpClients(home)).toEqual(["codex"]);
    const status = await syncMcpSkills(home, bundle, { userDataPath: userData });

    expect(status.skillAutoInstalls).toEqual(["codex"]);
    expect(status.clients.find((client) => client.id === "codex")?.skillInstalled).toBe(true);
    expect(status.clients.find((client) => client.id === "claude-code")?.skillInstalled).toBe(false);
    await expect(readFile(path.join(home, ".claude", "skills", "iterlay-workspace", "SKILL.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(await readSkillAutoInstallPolicy(userData)).toEqual({ schemaVersion: 1, declined: {} });
  });

  it("detects Claude Code via either .claude.json or the .claude directory", async () => {
    const jsonOnly = await createHome();
    await writeFile(path.join(jsonOnly, ".claude.json"), "{}", "utf8");
    expect(await detectMcpClients(jsonOnly)).toEqual(["claude-code"]);

    const directoryOnly = await createHome();
    await mkdir(path.join(directoryOnly, ".claude"), { recursive: true });
    expect(await detectMcpClients(directoryOnly)).toEqual(["claude-code"]);
  });

  it("respects the declined policy for auto installation", async () => {
    const home = await createHome();
    const userData = path.join(home, "user-data");
    const bundle = await createSyncBundle(home, "sync");
    await mkdir(path.join(home, ".codex"), { recursive: true });
    await mkdir(path.join(home, ".claude"), { recursive: true });
    await setSkillAutoInstallDeclined(userData, "codex", true);

    const status = await syncMcpSkills(home, bundle, { userDataPath: userData });

    expect(status.skillAutoInstalls).toEqual(["claude-code"]);
    expect(status.clients.find((client) => client.id === "codex")?.skillInstalled).toBe(false);
    expect(status.clients.find((client) => client.id === "claude-code")?.skillInstalled).toBe(true);
    await setSkillAutoInstallDeclined(userData, "codex", false);
    expect(await readSkillAutoInstallPolicy(userData)).toEqual({ schemaVersion: 1, declined: {} });
  });

  it("leaves user-maintained unmanaged Skill directories untouched", async () => {
    const home = await createHome();
    const bundle = await createSyncBundle(home, "sync");
    const unmanaged = path.join(home, ".codex", "skills", "iterlay-workspace");
    await mkdir(unmanaged, { recursive: true });
    await writeFile(path.join(unmanaged, "SKILL.md"), "---\nname: iterlay-workspace\n---\ncustom\n", "utf8");

    const status = await syncMcpSkills(home, bundle, { userDataPath: path.join(home, "user-data") });

    expect(status.skillAutoInstalls ?? []).toEqual([]);
    expect(status.skillUpgrades ?? []).toEqual([]);
    await expect(readFile(path.join(unmanaged, "SKILL.md"), "utf8")).resolves.toContain("custom");
  });

  it("upgrades managed Skills whose bundle digest changed", async () => {
    const home = await createHome();
    const userData = path.join(home, "user-data");
    const bundle = await createSyncBundle(home, "old");
    await mkdir(path.join(home, ".codex"), { recursive: true });
    await installMcpSkill("codex", home, bundle);

    await writeFile(path.join(bundle, "SKILL.md"), "---\nname: iterlay-workspace\n---\nnew\n", "utf8");
    const status = await syncMcpSkills(home, bundle, { userDataPath: userData });

    expect(status.skillAutoInstalls ?? []).toEqual([]);
    expect(status.skillUpgrades).toEqual([
      expect.objectContaining({ client: "codex", files: expect.objectContaining({ updated: ["SKILL.md"] }) })
    ]);
    await expect(readFile(path.join(home, ".codex", "skills", "iterlay-workspace", "SKILL.md"), "utf8"))
      .resolves.toContain("new");
  });

  it("keeps managed Skills at the same digest without reporting work", async () => {
    const home = await createHome();
    const bundle = await createSyncBundle(home, "same");
    await mkdir(path.join(home, ".codex"), { recursive: true });
    await installMcpSkill("codex", home, bundle);

    const status = await syncMcpSkills(home, bundle, { userDataPath: path.join(home, "user-data") });

    expect(status.skillAutoInstalls ?? []).toEqual([]);
    expect(status.skillUpgrades ?? []).toEqual([]);
  });
});
