import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppSettings } from "../shared/types.js";
import {
  createPiAgentResourceLoader,
  discoverPiAgentResources
} from "../electron/pi-agent-resources.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<{ cwd: string; agentDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "iterlay-pi-resources-"));
  directories.push(root);
  const cwd = path.join(root, "project");
  const agentDir = path.join(root, "agent");
  await mkdir(path.join(cwd, ".pi", "skills", "project-skill"), { recursive: true });
  await mkdir(path.join(agentDir, "skills", "system-skill"), { recursive: true });
  await mkdir(path.join(agentDir, "extensions"), { recursive: true });
  await writeFile(
    path.join(agentDir, "skills", "system-skill", "SKILL.md"),
    "---\nname: system-skill\ndescription: System skill fixture\n---\n\n# System\n",
    "utf8"
  );
  await writeFile(
    path.join(cwd, ".pi", "skills", "project-skill", "SKILL.md"),
    "---\nname: project-skill\ndescription: Project skill fixture\n---\n\n# Project\n",
    "utf8"
  );
  await writeFile(
    path.join(agentDir, "extensions", "fixture.ts"),
    `export default function (pi) {
      pi.registerTool({
        name: "fixture_tool",
        label: "Fixture",
        description: "Fixture extension tool",
        parameters: { type: "object", properties: {} },
        execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} })
      });
    }\n`,
    "utf8"
  );
  return { cwd, agentDir };
}

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    providers: [],
    activeProviderId: "",
    textProviders: [],
    activeTextProviderId: "",
    videoProviders: [],
    activeVideoProviderId: "",
    language: "system",
    theme: "system",
    promptDockAutoCollapse: false,
    canvasThumbnailPreview: true,
    ...overrides
  };
}

describe("Pi Agent resources", () => {
  it("discovers system and project skills without executing extensions", async () => {
    const { cwd, agentDir } = await fixture();
    const inventory = await discoverPiAgentResources(cwd, agentDir, settings());

    expect(inventory.skills.map((item) => item.name)).toEqual(
      expect.arrayContaining(["system-skill", "project-skill"])
    );
    expect(inventory.extensions).toEqual([
      expect.objectContaining({ name: "fixture", source: "system" })
    ]);
    expect(inventory.builtinTools.map((item) => item.name)).toContain("bash");
    expect(inventory.iterlayTools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["list_providers", "list_models", "generate_image", "generate_video"]));
  });

  it("loads only explicitly enabled extensions and skills", async () => {
    const { cwd, agentDir } = await fixture();
    const skillPath = path.join(agentDir, "skills", "system-skill", "SKILL.md");
    const extensionPath = path.join(agentDir, "extensions", "fixture.ts");
    const loader = await createPiAgentResourceLoader(
      cwd,
      agentDir,
      settings({
        piAgentSkillPaths: [skillPath],
        piAgentExtensionPaths: [extensionPath]
      }),
      "System prompt"
    );

    expect(loader.getSkills().skills.map((item) => item.name)).toContain("system-skill");
    expect(loader.getExtensions().extensions.flatMap((item) => [...item.tools.keys()])).toContain("fixture_tool");
  });
});
