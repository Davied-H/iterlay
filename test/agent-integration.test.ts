import { mkdir, mkdtemp, readFile, rm, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncAgentSkills, installAgentSkill, uninstallAgentSkill, setSkillAutoInstallDeclined, getAgentIntegrationStatus } from "../electron/agent-integration.js";
const homes: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(homes.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), "iterlay-agent-")); homes.push(home);
  const bundle = path.join(home, "bundle"); await mkdir(bundle); await writeFile(path.join(bundle, "SKILL.md"), "---\nname: iterlay-workspace\ndescription: CLI workflow\n---\nCLI v1");
  const entry = path.join(home, "using-iterlay"); await mkdir(entry);
  await writeFile(path.join(entry, "SKILL.md"), "---\nname: using-iterlay\ndescription: Explicit Iterlay entrypoint\ndisable-model-invocation: true\n---\nRead ../iterlay-workspace/SKILL.md");
  await mkdir(path.join(entry, "agents"));
  await writeFile(path.join(entry, "agents/openai.yaml"), "policy:\n  allow_implicit_invocation: false\n");
  vi.stubEnv("PATH", path.join(home, "empty-bin"));
  return { home, bundle, data: path.join(home, "data") };
}
describe("managed CLI Skills", () => {
  it.each(["codex", "claude-code"] as const)("installs and removes both Skills for %s with explicit invocation policies intact", async (client) => {
    const f = await fixture();
    const bundle = path.resolve("resources/skills/iterlay-workspace");
    await installAgentSkill(client, f.home, bundle);
    const root = path.join(f.home, client === "codex" ? ".codex" : ".claude", "skills");
    expect(await readFile(path.join(root, "using-iterlay/SKILL.md"), "utf8")).toContain("disable-model-invocation: true");
    expect(await readFile(path.join(root, "using-iterlay/agents/openai.yaml"), "utf8")).toContain("allow_implicit_invocation: false");
    expect(await readFile(path.join(root, "iterlay-workspace/references/cli.md"), "utf8")).toBe(await readFile(path.join(bundle, "references/cli.md"), "utf8"));
    expect((await getAgentIntegrationStatus(f.home)).clients.find((c) => c.id === client)?.skillInstalled).toBe(true);
    await uninstallAgentSkill(client, f.home);
    for (const name of ["iterlay-workspace", "using-iterlay"]) {
      await expect(readFile(path.join(root, name, "SKILL.md"))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });
  it("repairs an old installation missing the entrypoint and respects opt-out", async () => {
    const f = await fixture();
    const bin = path.join(f.home, ".local/bin"); await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, "claude"), "#!/bin/sh\nexit 0\n"); await chmod(path.join(bin, "claude"), 0o755);
    await installAgentSkill("claude-code", f.home, f.bundle);
    const entry = path.join(f.home, ".claude/skills/using-iterlay");
    await rm(entry, { recursive: true });
    expect((await getAgentIntegrationStatus(f.home)).clients.find((c) => c.id === "claude-code")?.skillInstalled).toBe(false);
    await setSkillAutoInstallDeclined(f.data, "claude-code", true);
    await syncAgentSkills(f.home, f.bundle, { userDataPath: f.data });
    await expect(readFile(path.join(entry, "SKILL.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await setSkillAutoInstallDeclined(f.data, "claude-code", false);
    await syncAgentSkills(f.home, f.bundle, { userDataPath: f.data });
    expect(await readFile(path.join(entry, "SKILL.md"), "utf8")).toContain("name: using-iterlay");
    await writeFile(path.join(f.home, "using-iterlay/SKILL.md"), "---\nname: using-iterlay\n---\nUpdated entrypoint");
    const result = await syncAgentSkills(f.home, f.bundle, { userDataPath: f.data });
    expect(result.skillUpgrades).toContainEqual(expect.objectContaining({ skillPath: entry, files: expect.objectContaining({ updated: ["SKILL.md"] }) }));
    expect(await readFile(path.join(entry, "SKILL.md"), "utf8")).toContain("Updated entrypoint");
  });
  it("protects a user-maintained entrypoint before installing or removing either Skill", async () => {
    const f = await fixture();
    const root = path.join(f.home, ".claude/skills");
    const entry = path.join(root, "using-iterlay"); await mkdir(entry, { recursive: true });
    await writeFile(path.join(entry, "SKILL.md"), "custom entrypoint");
    await expect(installAgentSkill("claude-code", f.home, f.bundle)).rejects.toThrow("自行维护");
    await expect(readFile(path.join(root, "iterlay-workspace/SKILL.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(uninstallAgentSkill("claude-code", f.home)).rejects.toThrow("未由 Iterlay 管理");
    expect(await readFile(path.join(entry, "SKILL.md"), "utf8")).toBe("custom entrypoint");
  });
  it("does not treat its own installed Skill directory as evidence of an installed Agent", async () => {
    const f = await fixture(); await installAgentSkill("claude-code", f.home, f.bundle);
    const client = (await getAgentIntegrationStatus(f.home)).clients.find((c) => c.id === "claude-code");
    expect(client).toMatchObject({ skillInstalled: true, detected: false, detection: "not-found" });
  });
  it("upgrades managed content, reports changed files and respects opt-out", async () => {
    const f = await fixture(); const bin = path.join(f.home, ".local/bin"); await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, "claude"), "#!/bin/sh\nexit 0\n"); await chmod(path.join(bin, "claude"), 0o755);
    await syncAgentSkills(f.home, f.bundle, { userDataPath: f.data });
    await writeFile(path.join(f.bundle, "SKILL.md"), "---\nname: iterlay-workspace\ndescription: CLI workflow\n---\nCLI v2");
    const upgraded = await syncAgentSkills(f.home, f.bundle, { userDataPath: f.data });
    expect(upgraded.skillUpgrades?.[0].files.updated).toContain("SKILL.md");
    await setSkillAutoInstallDeclined(f.data, "claude-code", true);
    await writeFile(path.join(f.bundle, "SKILL.md"), "CLI v3");
    await syncAgentSkills(f.home, f.bundle, { userDataPath: f.data });
    expect(await readFile(path.join(f.home, ".claude/skills/iterlay-workspace/SKILL.md"), "utf8")).toContain("CLI v2");
  });
});
