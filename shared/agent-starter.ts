import type { CodingAgentId } from "./agent-integration.js";

/** Public paths are relative so the starter also works under a hosted subdirectory. */
export const AGENT_STARTER = {
  id: "field",
  archiveFileName: "field-starter.itb",
  archivePath: "examples/field/field-starter.itb",
  pagePath: "examples/field/site/index.html",
  bundlePath: "examples/field/field-starter.zip",
  promptsPath: "examples/field/prompts.json",
  boardName: "FIELD · 便携音箱视觉探索",
  outputDirectory: "./public/iterlay-starter",
  assets: [
    { id: "studio", file: "field-studio.webp", exportName: "hero.png", role: "hero" },
    { id: "outdoor", file: "field-outdoor.webp", exportName: "scene.png", role: "scene" },
    { id: "poster", file: "field-poster.webp", exportName: "campaign.png", role: "campaign" },
    { id: "sage", file: "field-sage.webp", exportName: "sage-variant.png", role: "variant" }
  ]
} as const;

export type AgentStarterLanguage = "zh" | "en";
export type AgentStarterMode = "check" | "create" | "deliver";

/** Keep first-run instructions shared between the website and the installation guide. */
export function buildAgentStarterPrompt(
  agent: CodingAgentId,
  language: AgentStarterLanguage,
  mode: AgentStarterMode
): string {
  const agentName = agent === "codex" ? "Codex" : "Claude Code";
  const invocation = agent === "codex" ? "$using-iterlay" : "/using-iterlay";
  const providerInstruction = language === "zh"
    ? mode === "deliver" ? "导出已有素材不需要图片服务或模型授权；即使未配置 Provider，也继续导出。" : "没有可用图片服务时，引导我去模型设置。"
    : mode === "deliver" ? "Exporting existing assets needs no image provider or model authorization; continue even if no provider is configured." : "If no image provider is configured, guide me to model settings.";
  const readiness = language === "zh"
    ? `${invocation}\n请使用 Iterlay 工作流。你是 ${agentName}。先运行 iterlay status --json、iterlay providers list --kind image --json 和 iterlay tools list --json；检查 ok 字段和退出码。CLI 为建立连接而启动 App 属于本次准备检查。只读取 CLI 返回的配置元数据，不读取设置文件、密钥或账号信息。命令缺失时，引导我打开 Iterlay → 设置 → Coding Agent 修复安装；${providerInstruction} 默认不覆盖任何已有导出文件，不使用 --overwrite。`
    : `${invocation}\nUse the Iterlay workflow as ${agentName}. Start with iterlay status --json, iterlay providers list --kind image --json, and iterlay tools list --json; check each ok field and exit code. The CLI may start the App to establish its connection during this readiness check. Read only configuration metadata returned by the CLI, never settings files, credentials, or account information. If the CLI is missing, guide me to Iterlay → Settings → Coding Agent to repair it; ${providerInstruction} Preserve existing export files; do not use --overwrite.`;

  if (mode === "check") {
    return `${readiness}\n\n${language === "zh"
      ? "这次只做准备检查：报告 App 连接、图片服务配置和还需要我做什么。Skill 是否加载仅依据你实际读取的 Skill，不要从 tools list 推断。不要创建画板、导入素材、修改工作区或调用模型；已保存的 Provider 配置不等于远端服务已经实测可用。"
      : "This is a read-only readiness check. Report App connectivity, image provider configuration, and any action I need to take. Report Skill loading only from the Skill you actually read, never infer it from tools list. Do not create boards, import assets, mutate the workspace, or call a model. Saved provider configuration does not prove remote availability."}`;
  }

  if (mode === "create") {
    return `${readiness}\n\n${language === "zh"
      ? `帮我完成第一张网站主图：虚构户外音箱品牌 FIELD，陶土橙便携音箱、奶油白背景、自然侧光、克制的产品摄影。准备检查后，先说明将使用的 Provider/模型、只生成 1 张，以及费用由该服务收取；在我确认之前不要提交生成。确认后使用 iterlay image generate，--n 1 和一个稳定的 --request-id；导出到 ${AGENT_STARTER.outputDirectory}/hero.png。沿用 App 默认画板或用户指定画板，不要操作无关画板。已有同名文件时停下并让我选择其他文件名。等待真实任务完成，检查文件实际像素尺寸，返回画板、任务 ID 和导出路径，并引导我回到画板检查。若生成成功但导出失败，用原任务重新导出；不要重复付费生成。`
      : `Help me deliver my first website hero image: a matte burnt-orange portable speaker for the fictional outdoor audio brand FIELD, warm ivory background, natural side light, restrained product photography. After the readiness check, tell me the chosen provider/model, that you will generate exactly one image, and that the provider charges for model usage. Wait for my confirmation before submitting generation. Once confirmed, use iterlay image generate with --n 1 and a stable --request-id, exporting to ${AGENT_STARTER.outputDirectory}/hero.png. Use the App's default board or my specified board; do not touch unrelated boards. If the output exists, stop and ask me to choose another filename. Wait for the actual task result, verify the file's actual pixel dimensions, return the board, task ID and exported path, and guide me back to inspect the canvas. If generation succeeds but export fails, export the same task again; do not generate again.`}`;
  }

  return `${readiness}\n\n${language === "zh"
    ? `使用我已导入的 FIELD 示例交付网站素材，不调用模型，不产生新的生成费用。先运行 iterlay boards list --json，找到「${AGENT_STARTER.boardName}」，再用 iterlay boards show <返回的画板 ID> --json 检查节点与版本；重名时让我选择。若尚未导入，引导我在 App 的画板列表使用「导入画板」打开 ${AGENT_STARTER.archiveFileName}，不要臆造 CLI 导入命令。导入后 ID 会重映射，不要使用示例原始 ID。依据画板说明、真实提示词和版本历史，选择陶土橙原始产品图作为 hero.png、户外图作为 scene.png、海报作为 campaign.png；绿色只是编辑变体，保留它及橙→绿版本链。必要时通过 tools list 返回的 set_image_version schema 选择已有版本，绝不重新生成。使用 iterlay assets export --path <实际返回的托管图片路径> --out <目标路径> --json 导出这 3 张到 ${AGENT_STARTER.outputDirectory}/，默认不覆盖已有文件。核对真实尺寸、文件存在和用途，返回 3 个导出路径及对应画板节点/版本，并告诉我如何在网站中引用它们。`
    : `Deliver website assets from the FIELD example I imported. Do not call a model or incur new generation charges. Run iterlay boards list --json, find “${AGENT_STARTER.boardName}”, then inspect nodes and versions with iterlay boards show <returned-board-id> --json; ask me to choose if names are duplicated. If it is not imported yet, guide me to the App's board list and “Import board” to open ${AGENT_STARTER.archiveFileName}; do not invent a CLI archive-import command. Import remaps IDs, so never use the example's original IDs. Use the board notes, actual prompts and version history to select the original burnt-orange product image for hero.png, outdoor image for scene.png, and poster for campaign.png. The sage image is an edit variant; preserve it and the orange-to-sage version chain. If necessary, select an existing version using the set_image_version schema returned by tools list; never regenerate. Export these three to ${AGENT_STARTER.outputDirectory}/ using iterlay assets export --path <returned-managed-image-path> --out <destination> --json, preserving existing files. Verify actual dimensions, file existence and intended use. Return the three exported paths with their board nodes/versions, and explain how to reference them in my website.`}`;
}
