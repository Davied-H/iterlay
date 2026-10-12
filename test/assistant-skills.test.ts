import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readAssistantSkill,
  resetAssistantSkillOverride,
  resolveAssistantSkillIds,
  saveAssistantSkillOverride
} from "../electron/assistant-skills.js";
import type { CollaborateSceneRequest } from "../shared/types.js";

function request(overrides: Partial<CollaborateSceneRequest>): CollaborateSceneRequest {
  return {
    instruction: "test",
    referenceImages: [],
    currentFields: [],
    workflowMode: "generate",
    ...overrides
  };
}

describe("assistant Skill routing", () => {
  it.each([
    [{ assistantSurface: "scene-template", templateIntent: "build" }, "iterlay-template-create"],
    [{ assistantSurface: "scene-template", templateIntent: "audit" }, "iterlay-template-collaborate"],
    [{ assistantSurface: "scene-template", templateWorkflow: "use" }, "iterlay-template-use"],
    [{ assistantSurface: "canvas-prompt" }, "iterlay-board-image"],
    [{ assistantSurface: "canvas-prompt", assistantScenario: "ui-design" }, "iterlay-ui-design"],
    [{ assistantSurface: "canvas-edit", workflowMode: "edit" }, "iterlay-image-edit"],
    [{ assistantSurface: "gallery-review" }, "iterlay-gallery-review"],
    [{ assistantSurface: "comic-drama" }, "iterlay-comic-drama"]
  ] as const)("routes %o to %s", (overrides, expected) => {
    const ids = resolveAssistantSkillIds(request(overrides));
    expect(ids[0]).toBe("iterlay-assistant-base");
    expect(ids).toContain(expected);
  });

  it("adds the video base Skill to comic-drama", () => {
    expect(resolveAssistantSkillIds(request({ assistantSurface: "comic-drama" }))).toEqual([
      "iterlay-assistant-base",
      "iterlay-video",
      "iterlay-comic-drama"
    ]);
  });

  it("saves and resets a validated user override", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "iterlay-assistant-skills-"));
    try {
      const builtInRoot = path.join(root, "builtin");
      const overrideRoot = path.join(root, "overrides");
      const id = "iterlay-board-image";
      await mkdir(path.join(builtInRoot, id), { recursive: true });
      const builtIn = `---\nname: ${id}\ndescription: Built in\n---\n\n# Built in\n`;
      await writeFile(path.join(builtInRoot, id, "SKILL.md"), builtIn, "utf8");

      const saved = await saveAssistantSkillOverride(
        id,
        `---\nname: ${id}\ndescription: User version\n---\n\n# User\n`,
        builtInRoot,
        overrideRoot
      );
      expect(saved.hasOverride).toBe(true);
      expect(saved.description).toBe("User version");
      expect((await readAssistantSkill(id, builtInRoot, overrideRoot)).content).toContain("# User");

      const reset = await resetAssistantSkillOverride(id, builtInRoot, overrideRoot);
      expect(reset.hasOverride).toBe(false);
      expect(reset.content).toBe(builtIn);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects overrides that change the required Skill name", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "iterlay-assistant-skills-"));
    try {
      const builtInRoot = path.join(root, "builtin");
      const id = "iterlay-board-image";
      await mkdir(path.join(builtInRoot, id), { recursive: true });
      await writeFile(
        path.join(builtInRoot, id, "SKILL.md"),
        `---\nname: ${id}\ndescription: Built in\n---\n`,
        "utf8"
      );
      await expect(saveAssistantSkillOverride(
        id,
        "---\nname: changed\ndescription: Invalid\n---\n",
        builtInRoot,
        path.join(root, "overrides")
      )).rejects.toThrow(`name 必须保持为 ${id}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
