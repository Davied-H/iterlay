import AdmZip from "adm-zip";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMcpPluginPackage, mcpPluginPackageFileName } from "../electron/mcp-plugin-package.js";

const temporaryDirectories: string[] = [];
const command = {
  command: "/Applications/Iterlay.app/Contents/MacOS/Iterlay",
  args: ["/Applications/Iterlay.app/Contents/Resources/app.asar/dist-electron/electron/mcp-stdio-node.js"],
  env: { ELECTRON_RUN_AS_NODE: "1", ITERLAY_VERSION: "0.1.48" }
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createSkillBundle(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "iterlay-plugin-package-"));
  temporaryDirectories.push(root);
  const skill = path.join(root, "iterlay-workspace");
  await mkdir(path.join(skill, "references"), { recursive: true });
  await mkdir(path.join(skill, "scripts"), { recursive: true });
  await writeFile(path.join(skill, "SKILL.md"), "---\nname: iterlay-workspace\ndescription: Test\n---\n", "utf8");
  await writeFile(path.join(skill, "references", "mcp-tools.md"), "tools", "utf8");
  await writeFile(path.join(skill, "scripts", "validate.mjs"), "script", "utf8");
  return skill;
}

function zipFiles(archive: Buffer): Map<string, string> {
  return new Map(new AdmZip(archive).getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => [entry.entryName, entry.getData().toString("utf8")]));
}

describe("MCP plugin package", () => {
  it("builds a valid Codex plugin layout with its bundled MCP server", async () => {
    const files = zipFiles(await buildMcpPluginPackage({
      client: "codex",
      command,
      bundledSkillPath: await createSkillBundle(),
      version: "0.1.48"
    }));

    const manifest = JSON.parse(files.get("iterlay-workspace/.codex-plugin/plugin.json") ?? "null");
    const mcp = JSON.parse(files.get("iterlay-workspace/.mcp.json") ?? "null");
    expect(manifest).toMatchObject({
      name: "iterlay-workspace",
      version: "0.1.48",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: { displayName: "Iterlay Workspace", developerName: "Iterlay" }
    });
    expect(mcp).toEqual({ mcpServers: { iterlay: command } });
    expect(files.get("iterlay-workspace/skills/iterlay-workspace/SKILL.md")).toContain("name: iterlay-workspace");
    expect(files.get("iterlay-workspace/skills/iterlay-workspace/references/mcp-tools.md")).toBe("tools");
    expect(files.get("iterlay-workspace/skills/iterlay-workspace/scripts/validate.mjs")).toBe("script");
    expect([...files.keys()].some((name) => name.includes(".claude-plugin"))).toBe(false);
  });

  it("builds a Claude Code plugin layout with a wrapped MCP server map", async () => {
    const files = zipFiles(await buildMcpPluginPackage({
      client: "claude-code",
      command,
      bundledSkillPath: await createSkillBundle(),
      version: "0.1.48"
    }));

    const manifest = JSON.parse(files.get("iterlay-workspace/.claude-plugin/plugin.json") ?? "null");
    const mcp = JSON.parse(files.get("iterlay-workspace/.mcp.json") ?? "null");
    expect(manifest).toMatchObject({
      name: "iterlay-workspace",
      displayName: "Iterlay Workspace",
      version: "0.1.48",
      skills: "./skills/",
      mcpServers: "./.mcp.json"
    });
    expect(mcp).toEqual({ mcpServers: { iterlay: command } });
    expect(files.has("iterlay-workspace/README.md")).toBe(true);
    expect([...files.keys()].some((name) => name.includes(".codex-plugin"))).toBe(false);
  });

  it("uses stable target-specific archive names", () => {
    expect(mcpPluginPackageFileName("codex", "0.1.48")).toBe("iterlay-workspace-codex-plugin-v0.1.48.zip");
    expect(mcpPluginPackageFileName("claude-code", "0.1.48")).toBe("iterlay-workspace-claude-code-plugin-v0.1.48.zip");
  });
});
