import { access, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DefaultResourceLoader, loadSkills, type InlineExtension, type Skill } from "./agents/coding-runtime.js";
import type { AppSettings, PiAgentResourceEntry, PiAgentResourceInventory } from "../shared/types.js";
import { listMcpTools } from "./mcp-stdio-core.js";

const BUILTIN_TOOLS: PiAgentResourceInventory["builtinTools"] = [
  { name: "read", description: "读取工作目录中的文件。", risk: "read" },
  { name: "grep", description: "搜索文件内容。", risk: "read" },
  { name: "find", description: "按模式查找文件。", risk: "read" },
  { name: "ls", description: "列出目录内容。", risk: "read" },
  { name: "edit", description: "按匹配内容编辑文件。", risk: "write" },
  { name: "write", description: "创建或覆盖文件。", risk: "write" },
  { name: "bash", description: "执行本地 Shell 命令。", risk: "execute" }
];

const EXTENSION_FILE_PATTERN = /\.(?:[cm]?[jt]s)$/iu;

export async function discoverPiAgentResources(
  cwd: string,
  agentDir: string,
  settings: AppSettings
): Promise<PiAgentResourceInventory> {
  const packageResources = await discoverPackageResources(agentDir);
  const configured = await readPiSettings(agentDir);
  const skillPaths = [
    path.join(path.dirname(path.dirname(agentDir)), ".agents", "skills"),
    ...packageResources.skillPaths,
    ...configured.skills,
    ...(settings.piAgentCustomSkillPaths ?? [])
  ];
  const loadedSkills = loadSkills({ cwd, agentDir, skillPaths, includeDefaults: true });
  const skills = loadedSkills.skills.map((skill) => skillEntry(skill, cwd, agentDir, packageResources.packageByPath));
  const extensionCandidates = Array.from(new Set([
    ...await discoverExtensionFiles(path.join(agentDir, "extensions")),
    ...await discoverExtensionFiles(path.join(cwd, ".pi", "extensions")),
    ...packageResources.extensionPaths,
    ...configured.extensions,
    ...(settings.piAgentCustomExtensionPaths ?? [])
  ]));
  const extensions = await Promise.all(extensionCandidates.map(
    (resourcePath) => extensionEntry(resourcePath, cwd, agentDir, packageResources.packageByPath)
  ));

  return {
    builtinTools: BUILTIN_TOOLS,
    iterlayTools: listMcpTools().map((tool) => ({
      name: typeof tool.name === "string" ? tool.name : "",
      description: typeof tool.description === "string" ? tool.description : ""
    })).filter((tool) => tool.name),
    skills: dedupeResources(skills),
    extensions: dedupeResources(extensions),
    warnings: loadedSkills.diagnostics.map((item) => item.message)
  };
}

export async function createPiAgentResourceLoader(
  cwd: string,
  agentDir: string,
  settings: Pick<AppSettings, "piAgentExtensionPaths" | "piAgentSkillPaths">,
  systemPrompt: string,
  requiredSkillPaths: string[] = [],
  requiredSkillIds: string[] = [],
  extensionFactories: InlineExtension[] = []
): Promise<DefaultResourceLoader> {
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    additionalExtensionPaths: settings.piAgentExtensionPaths ?? [],
    additionalSkillPaths: [
      ...requiredSkillPaths,
      ...(settings.piAgentSkillPaths ?? [])
    ],
    extensionFactories,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt
  });
  await loader.reload();
  const loadedSkillNames = new Set(loader.getSkills().skills.map((skill) => skill.name));
  for (const id of requiredSkillIds) {
    if (!loadedSkillNames.has(id)) {
      const diagnostic = loader.getSkills().diagnostics.find((item) => item.path?.includes(id));
      throw new Error(`SKILL_INVALID: ${id}${diagnostic ? ` (${diagnostic.message})` : ""}`);
    }
  }
  return loader;
}

async function readPiSettings(agentDir: string): Promise<{ skills: string[]; extensions: string[]; packages: unknown[] }> {
  try {
    const parsed = JSON.parse(await readFile(path.join(agentDir, "settings.json"), "utf8")) as Record<string, unknown>;
    return {
      skills: stringList(parsed.skills, agentDir),
      extensions: stringList(parsed.extensions, agentDir),
      packages: Array.isArray(parsed.packages) ? parsed.packages : []
    };
  } catch {
    return { skills: [], extensions: [], packages: [] };
  }
}

async function discoverPackageResources(agentDir: string): Promise<{
  skillPaths: string[];
  extensionPaths: string[];
  packageByPath: Map<string, string>;
}> {
  const settings = await readPiSettings(agentDir);
  const skillPaths: string[] = [];
  const extensionPaths: string[] = [];
  const packageByPath = new Map<string, string>();
  for (const entry of settings.packages) {
    const source = typeof entry === "string"
      ? entry
      : entry && typeof entry === "object" && typeof (entry as { source?: unknown }).source === "string"
        ? (entry as { source: string }).source
        : "";
    const packageName = npmPackageName(source);
    if (!packageName) continue;
    const packageDir = path.join(agentDir, "npm", "node_modules", packageName);
    try {
      const manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8")) as {
        pi?: { skills?: string[]; extensions?: string[] };
      };
      const skills = manifest.pi?.skills?.length ? manifest.pi.skills : ["skills"];
      const extensions = manifest.pi?.extensions?.length ? manifest.pi.extensions : ["extensions"];
      for (const item of skills) {
        const resolved = path.resolve(packageDir, item);
        if (await exists(resolved)) {
          skillPaths.push(resolved);
          packageByPath.set(resolved, packageName);
        }
      }
      for (const item of extensions) {
        const resolved = path.resolve(packageDir, item);
        if (await exists(resolved)) {
          for (const file of await discoverExtensionFiles(resolved)) {
            extensionPaths.push(file);
            packageByPath.set(file, packageName);
          }
        }
      }
    } catch {
      // Missing or invalid packages are reported by Pi itself; discovery stays best-effort.
    }
  }
  return { skillPaths, extensionPaths, packageByPath };
}

async function discoverExtensionFiles(inputPath: string): Promise<string[]> {
  try {
    const info = await stat(inputPath);
    if (info.isFile()) return EXTENSION_FILE_PATTERN.test(inputPath) && !inputPath.endsWith(".d.ts") ? [inputPath] : [];
    if (!info.isDirectory()) return [];
    const entries = await readdir(inputPath, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const child = path.join(inputPath, entry.name);
      if (entry.isFile() && EXTENSION_FILE_PATTERN.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(child);
      else if (entry.isDirectory()) files.push(...await discoverExtensionFiles(child));
    }
    return files;
  } catch {
    return [];
  }
}

function skillEntry(skill: Skill, cwd: string, agentDir: string, packageByPath: Map<string, string>): PiAgentResourceEntry {
  const packageName = packageForPath(skill.filePath, packageByPath);
  return {
    id: skill.filePath,
    kind: "skill",
    name: skill.name,
    description: skill.description,
    path: skill.filePath,
    source: resourceSource(skill.filePath, cwd, agentDir, packageName),
    ...(packageName ? { packageName } : {})
  };
}

async function extensionEntry(
  resourcePath: string,
  cwd: string,
  agentDir: string,
  packageByPath: Map<string, string>
): Promise<PiAgentResourceEntry> {
  const packageName = packageForPath(resourcePath, packageByPath);
  return {
    id: resourcePath,
    kind: "extension",
    name: path.basename(resourcePath).replace(EXTENSION_FILE_PATTERN, ""),
    description: packageName ? `来自 Pi package ${packageName}` : "Pi Agent 扩展",
    path: resourcePath,
    source: resourceSource(resourcePath, cwd, agentDir, packageName),
    ...(packageName ? { packageName } : {}),
    warning: "扩展是本地可执行代码，仅启用你信任的来源。"
  };
}

function resourceSource(
  resourcePath: string,
  cwd: string,
  agentDir: string,
  packageName?: string
): PiAgentResourceEntry["source"] {
  if (packageName) return "package";
  if (resourcePath.startsWith(path.resolve(cwd) + path.sep)) return "project";
  if (resourcePath.startsWith(path.resolve(agentDir) + path.sep) || resourcePath.startsWith(path.join(os.homedir(), ".agents") + path.sep)) {
    return "system";
  }
  return "custom";
}

function packageForPath(resourcePath: string, packageByPath: Map<string, string>): string | undefined {
  for (const [root, packageName] of packageByPath) {
    if (resourcePath === root || resourcePath.startsWith(root + path.sep)) return packageName;
  }
  return undefined;
}

function npmPackageName(source: string): string {
  if (!source.startsWith("npm:")) return "";
  const value = source.slice(4);
  if (value.startsWith("@")) {
    const slash = value.indexOf("/");
    const version = value.indexOf("@", slash);
    return version > 0 ? value.slice(0, version) : value;
  }
  const version = value.indexOf("@");
  return version > 0 ? value.slice(0, version) : value;
}

function stringList(value: unknown, baseDir: string): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.startsWith("~/")
          ? path.join(os.homedir(), item.slice(2))
          : path.resolve(baseDir, item))
    : [];
}

async function exists(resourcePath: string): Promise<boolean> {
  try {
    await access(resourcePath);
    return true;
  } catch {
    return false;
  }
}

function dedupeResources(resources: PiAgentResourceEntry[]): PiAgentResourceEntry[] {
  return [...new Map(resources.map((item) => [item.path, item])).values()]
    .sort((left, right) => left.name.localeCompare(right.name));
}
