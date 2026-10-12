import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AssistantSkillDetail,
  AssistantSkillSummary,
  CollaborateSceneRequest
} from "../shared/types.js";

export const ASSISTANT_BASE_SKILL_ID = "iterlay-assistant-base";
export const ASSISTANT_SKILL_IDS = [
  ASSISTANT_BASE_SKILL_ID,
  "iterlay-template-create",
  "iterlay-template-collaborate",
  "iterlay-template-use",
  "iterlay-board-image",
  "iterlay-image-edit",
  "iterlay-ui-design",
  "iterlay-gallery-review",
  "iterlay-video",
  "iterlay-comic-drama"
] as const;

export function resolveAssistantSkillIds(request: CollaborateSceneRequest): string[] {
  const surface = request.assistantSurface;
  if (surface === "scene-template") {
    if (request.templateWorkflow === "use") return [ASSISTANT_BASE_SKILL_ID, "iterlay-template-use"];
    if (request.templateIntent === "build" || request.templateIntent === "extract") {
      return [ASSISTANT_BASE_SKILL_ID, "iterlay-template-create"];
    }
    return [ASSISTANT_BASE_SKILL_ID, "iterlay-template-collaborate"];
  }
  if (surface === "canvas-edit") return [ASSISTANT_BASE_SKILL_ID, "iterlay-image-edit"];
  if (surface === "gallery-review") return [ASSISTANT_BASE_SKILL_ID, "iterlay-gallery-review"];
  if (surface === "comic-drama") return [ASSISTANT_BASE_SKILL_ID, "iterlay-video", "iterlay-comic-drama"];
  if (surface === "video") return [ASSISTANT_BASE_SKILL_ID, "iterlay-video"];
  if (request.assistantScenario === "ui-design") {
    return [ASSISTANT_BASE_SKILL_ID, "iterlay-ui-design"];
  }
  if (request.assistantScenario === "video") {
    return [ASSISTANT_BASE_SKILL_ID, "iterlay-video"];
  }
  return [ASSISTANT_BASE_SKILL_ID, "iterlay-board-image"];
}

export async function listAssistantSkills(
  builtInRoot: string,
  overrideRoot: string
): Promise<AssistantSkillSummary[]> {
  return Promise.all(ASSISTANT_SKILL_IDS.map(async (id) => {
    const detail = await readAssistantSkill(id, builtInRoot, overrideRoot);
    const frontmatter = parseSkillFrontmatter(detail.content, id);
    return {
      id,
      name: frontmatter.name,
      description: frontmatter.description,
      hasOverride: detail.hasOverride,
      activePath: detail.activePath
    };
  }));
}

export async function readAssistantSkill(
  id: string,
  builtInRoot: string,
  overrideRoot: string
): Promise<AssistantSkillDetail> {
  assertSkillId(id);
  const builtInPath = path.join(builtInRoot, id, "SKILL.md");
  const overridePath = path.join(overrideRoot, id, "SKILL.md");
  const builtInContent = await readFile(builtInPath, "utf8");
  const hasOverride = await exists(overridePath);
  const content = hasOverride ? await readFile(overridePath, "utf8") : builtInContent;
  const frontmatter = parseSkillFrontmatter(content, id);
  return {
    id,
    name: frontmatter.name,
    description: frontmatter.description,
    hasOverride,
    activePath: hasOverride ? overridePath : builtInPath,
    content,
    builtInContent
  };
}

export async function saveAssistantSkillOverride(
  id: string,
  content: string,
  builtInRoot: string,
  overrideRoot: string
): Promise<AssistantSkillDetail> {
  assertSkillId(id);
  if (typeof content !== "string" || content.length > 100_000) {
    throw new Error(`SKILL_INVALID: ${id} 内容为空或超过 100000 字符。`);
  }
  parseSkillFrontmatter(content, id);
  const directory = path.join(overrideRoot, id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), content.trimEnd() + "\n", {
    encoding: "utf8",
    mode: 0o600
  });
  return readAssistantSkill(id, builtInRoot, overrideRoot);
}

export async function resetAssistantSkillOverride(
  id: string,
  builtInRoot: string,
  overrideRoot: string
): Promise<AssistantSkillDetail> {
  assertSkillId(id);
  await rm(path.join(overrideRoot, id), { recursive: true, force: true });
  return readAssistantSkill(id, builtInRoot, overrideRoot);
}

function parseSkillFrontmatter(content: string, expectedId: string): { name: string; description: string } {
  const match = /^---\s*\n([\s\S]*?)\n---(?:\n|$)/u.exec(content);
  if (!match) throw new Error(`SKILL_INVALID: ${expectedId} 缺少 YAML frontmatter。`);
  const name = /^name:\s*(.+)$/mu.exec(match[1])?.[1]?.trim() ?? "";
  const description = /^description:\s*(.+)$/mu.exec(match[1])?.[1]?.trim() ?? "";
  if (name !== expectedId) {
    throw new Error(`SKILL_INVALID: ${expectedId} 的 name 必须保持为 ${expectedId}。`);
  }
  if (!description) throw new Error(`SKILL_INVALID: ${expectedId} 缺少 description。`);
  return { name, description };
}

function assertSkillId(id: string): asserts id is typeof ASSISTANT_SKILL_IDS[number] {
  if (!(ASSISTANT_SKILL_IDS as readonly string[]).includes(id)) {
    throw new Error("SKILL_NOT_FOUND: 未知的助手 Skill。");
  }
}

export async function resolveAssistantSkillPaths(
  request: CollaborateSceneRequest,
  builtInRoot: string,
  overrideRoot: string
): Promise<{ ids: string[]; paths: string[]; overriddenIds: string[] }> {
  const ids = resolveAssistantSkillIds(request);
  const paths: string[] = [];
  const overriddenIds: string[] = [];
  for (const id of ids) {
    const overridePath = path.join(overrideRoot, id, "SKILL.md");
    if (await exists(overridePath)) {
      paths.push(overridePath);
      overriddenIds.push(id);
      continue;
    }
    const builtInPath = path.join(builtInRoot, id, "SKILL.md");
    if (!await exists(builtInPath)) {
      throw new Error(`SKILL_NOT_FOUND: ${id} (${builtInPath})`);
    }
    paths.push(builtInPath);
  }
  return { ids, paths, overriddenIds };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
