import { mkdir, mkdtemp, readFile, rm, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncAgentSkills, installAgentSkill, setSkillAutoInstallDeclined, getAgentIntegrationStatus } from "../electron/agent-integration.js";
const homes: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(homes.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), "iterlay-agent-")); homes.push(home);
  const bundle = path.join(home, "bundle"); await mkdir(bundle); await writeFile(path.join(bundle, "SKILL.md"), "---\nname: iterlay-workspace\ndescription: CLI workflow\n---\nCLI v1");
  vi.stubEnv("PATH", path.join(home, "empty-bin"));
  return { home, bundle, data: path.join(home, "data") };
}
describe("managed CLI Skills", () => {
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
