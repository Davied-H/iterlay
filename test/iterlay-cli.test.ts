import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CliError,
  runAdd,
  runRemove
} from "../cli/src/commands.js";
import { buildMcpCommand, defaultUserDataPath, resolveIterlayApp } from "../cli/src/paths.js";
import { getMcpIntegrationStatus, readSkillAutoInstallPolicy, setSkillAutoInstallDeclined } from "../electron/mcp-integration.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createSandbox(): Promise<{ home: string; userData: string }> {
  const home = await mkdtemp(path.join(os.tmpdir(), "iterlay-cli-"));
  temporaryDirectories.push(home);
  const userData = path.join(home, "user-data");
  return { home, userData };
}

async function createBundle(home: string): Promise<string> {
  const bundle = path.join(home, "bundle", "iterlay-workspace");
  await mkdir(path.join(bundle, "references"), { recursive: true });
  await writeFile(path.join(bundle, "SKILL.md"), "---\nname: iterlay-workspace\n---\ncli\n", "utf8");
  await writeFile(path.join(bundle, "references", "mcp-tools.md"), "tools", "utf8");
  return bundle;
}

async function createFakeApp(home: string): Promise<string> {
  const root = path.join(home, "Iterlay.app");
  await mkdir(path.join(root, "Contents", "MacOS"), { recursive: true });
  await mkdir(path.join(root, "Contents", "Resources", "app.asar", "dist-electron", "electron"), { recursive: true });
  await writeFile(path.join(root, "Contents", "MacOS", "Iterlay"), "binary", "utf8");
  await writeFile(path.join(root, "Contents", "Resources", "app.asar", "dist-electron", "electron", "mcp-stdio-node.js"), "server", "utf8");
  return root;
}

describe("iterlay CLI", () => {
  it("installs Skill and MCP config for detected agents and clears declined flags", async () => {
    const { home, userData } = await createSandbox();
    const bundle = await createBundle(home);
    const appRoot = await createFakeApp(home);
    await mkdir(path.join(home, ".codex"), { recursive: true });
    await writeFile(path.join(home, ".claude.json"), "{}", "utf8");
    await setSkillAutoInstallDeclined(userData, "claude-code", true);

    const result = await runAdd({
      homeDir: home,
      userDataPath: userData,
      bundledSkillPath: bundle,
      agents: null,
      skillOnly: false,
      appRoot,
      version: "0.1.54"
    });

    expect(result.appFound).toBe(true);
    expect(result.appRoot).toBe(appRoot);
    expect(result.results.map((entry) => entry.client)).toEqual(["codex", "claude-code"]);
    for (const entry of result.results) {
      expect(entry.skill).toBe("installed");
      expect(entry.mcp).toBe("configured");
      expect(entry.error).toBeUndefined();
    }
    const status = await getMcpIntegrationStatus(home);
    expect(status.clients.every((client) => client.configured && client.skillInstalled)).toBe(true);
    const config = await readFile(path.join(home, ".codex", "config.toml"), "utf8");
    expect(config).toContain(`command = ${JSON.stringify(path.join(appRoot, "Contents", "MacOS", "Iterlay"))}`);
    expect(config).toContain("ELECTRON_RUN_AS_NODE = \"1\"");
    expect(config).toContain(`ITERLAY_USER_DATA_PATH = ${JSON.stringify(userData)}`);
    expect(await readSkillAutoInstallPolicy(userData)).toEqual({ schemaVersion: 1, declined: {} });
  });

  it("falls back to Skill-only when the Iterlay app cannot be found", async () => {
    const { home, userData } = await createSandbox();
    const bundle = await createBundle(home);
    await mkdir(path.join(home, ".codex"), { recursive: true });

    const result = await runAdd({
      homeDir: home,
      userDataPath: userData,
      bundledSkillPath: bundle,
      agents: null,
      skillOnly: false,
      appRoot: path.join(home, "missing.app"),
      version: "0.1.54"
    });

    expect(result.appFound).toBe(false);
    expect(result.results[0].skill).toBe("installed");
    expect(result.results[0].mcp).toBe("skipped");
    const status = await getMcpIntegrationStatus(home);
    expect(status.clients.find((client) => client.id === "codex")?.configured).toBe(false);
    expect(status.clients.find((client) => client.id === "codex")?.skillInstalled).toBe(true);
  });

  it("fails with a clear message when no coding agent is detected", async () => {
    const { home, userData } = await createSandbox();
    const bundle = await createBundle(home);

    await expect(runAdd({
      homeDir: home,
      userDataPath: userData,
      bundledSkillPath: bundle,
      agents: null,
      skillOnly: true,
      version: "0.1.54"
    })).rejects.toBeInstanceOf(CliError);
  });

  it("removes integrations and marks the clients as declined", async () => {
    const { home, userData } = await createSandbox();
    const bundle = await createBundle(home);
    const appRoot = await createFakeApp(home);
    await mkdir(path.join(home, ".codex"), { recursive: true });
    await runAdd({
      homeDir: home,
      userDataPath: userData,
      bundledSkillPath: bundle,
      agents: ["codex"],
      skillOnly: false,
      appRoot,
      version: "0.1.54"
    });

    const result = await runRemove({ homeDir: home, userDataPath: userData, agents: null });

    expect(result.results.map((entry) => entry.client)).toEqual(["codex"]);
    expect(result.results[0]).toMatchObject({ skill: "removed", mcp: "removed" });
    const status = await getMcpIntegrationStatus(home);
    expect(status.clients.find((client) => client.id === "codex")).toMatchObject({
      configured: false,
      skillInstalled: false
    });
    expect(await readSkillAutoInstallPolicy(userData)).toEqual({ schemaVersion: 1, declined: { codex: true } });
  });

  it("skips removal for agents without any Iterlay integration", async () => {
    const { home, userData } = await createSandbox();
    await mkdir(path.join(home, ".claude"), { recursive: true });

    const result = await runRemove({ homeDir: home, userDataPath: userData, agents: null });

    expect(result.results).toEqual([
      expect.objectContaining({ client: "claude-code", skill: "skipped", mcp: "skipped" })
    ]);
    await expect(readFile(path.join(home, ".claude.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("iterlay CLI path helpers", () => {
  it("resolves the app layout from an explicit root", async () => {
    const { home } = await createSandbox();
    const appRoot = await createFakeApp(home);

    const app = await resolveIterlayApp(appRoot);

    expect(app?.root).toBe(appRoot);
    expect(app?.commandPath).toBe(path.join(appRoot, "Contents", "MacOS", "Iterlay"));
    expect(app?.scriptPath).toContain(path.join("app.asar", "dist-electron", "electron", "mcp-stdio-node.js"));
  });

  it("returns null when no app exists at the explicit root", async () => {
    const { home } = await createSandbox();
    await expect(resolveIterlayApp(path.join(home, "missing"))).resolves.toBeNull();
  });

  it("builds an MCP command that matches the app's managed entry shape", () => {
    const command = buildMcpCommand(
      {
        root: "/Applications/Iterlay.app",
        commandPath: "/Applications/Iterlay.app/Contents/MacOS/Iterlay",
        scriptPath: "/Applications/Iterlay.app/Contents/Resources/app.asar/dist-electron/electron/mcp-stdio-node.js"
      },
      defaultUserDataPath(),
      "0.1.54"
    );
    expect(command).toEqual({
      command: "/Applications/Iterlay.app/Contents/MacOS/Iterlay",
      args: ["/Applications/Iterlay.app/Contents/Resources/app.asar/dist-electron/electron/mcp-stdio-node.js"],
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        ITERLAY_USER_DATA_PATH: defaultUserDataPath(),
        ITERLAY_VERSION: "0.1.54"
      }
    });
  });
});
