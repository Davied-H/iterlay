import { features } from './features'
import { featuresEn } from './features.en'
import type { SiteLanguage } from './site-language'

export interface Section { title: string; paragraphs?: string[]; steps?: string[]; code?: string }
export interface Article { path: string; title: string; description: string; sections: Section[]; source: string; image?: string; alt?: string }
const zhGuides: Article[] = [
  { path: '/guides/model-setup', title: '如何配置 Iterlay 图片模型', description: '连接自己的服务商、选择图片模型，并区分本地配置检查与真实生成测试。', source: 'README.zh-CN.md', sections: [
    { title: '开始前需要什么？', paragraphs: ['先安装并打开 Iterlay 桌面 App。软件采用 MIT 许可证，免费开源；模型服务与额度由你选择的服务商提供和计费。官网案例使用预制素材，浏览案例不需要模型账号。'] },
    { title: '连接图片服务商', steps: ['打开「设置 → AI 服务」，选择或添加所需服务商。', '填写该服务商要求的地址、API Key 或受支持的账户授权。不要把凭据放进提示词或 issue。', '选择支持图片生成的模型；需要改图时还要确认该模型支持图片编辑与参考图。', '分别设置图片、对话和视频模型，不能用对话接口成功推断图片接口可用。'] },
    { title: '先检查配置，再决定是否实测', paragraphs: ['下面命令只检查本地连接和已保存的图片模型配置，不能证明远端生成成功。真实生成测试可能消耗额度，应先核对模型、图片数量和服务商费用。'], code: 'iterlay status --json\niterlay providers list --kind image --json' },
    { title: '失败时检查什么？', steps: ['阅读错误返回，核对服务地址、授权、模型名称与支持的能力。', '任务等待中断时，先查看原任务，不要直接重提以免重复计费。', '如果生成成功但导出失败，重新导出已有结果；不需要重新生成。'] },
    { title: '素材与凭据在哪里？', paragraphs: ['桌面画板与素材保存在本机。生成时，提示词和所需参考素材会发送给你选定的服务商；凭据用于对应服务的认证。本地保存不是云备份，也不代表模型推理全程离线。'] },
  ] },
  { path: '/guides/version-comparison', title: '如何保留原图并比较图片编辑版本', description: '在同一个画板节点中保留编辑版本，检查主体细节，并导出选中的结果。', source: 'src/components/canvas/image-node/ImageNodeVersions.tsx', sections: [
    { title: '什么情况下使用版本对比？', paragraphs: ['当你想比较换背景、改颜色或调整光线后的变化时，可以从现有图片继续编辑，再回看同一节点的原图与后续版本。模型不保证每个细节完全一致，最终选择需要人工检查。'] },
    { title: '从原图继续编辑', steps: ['导入或生成一张图片，选中图片并打开编辑。', '写清需要保留的主体、需要修改的部分与构图要求，确认所选模型支持编辑后提交。', '等待任务实际完成，通过图片版本控件切回原图或新版本。', '打开对比，检查主体形状、材质、文字和背景边缘，再决定是否继续编辑。'] },
    { title: '保存与交付', steps: ['选中实际需要交付的版本再保存或导出。', '打开导出的文件检查尺寸、格式与内容，不能只根据文件名判断。', '等待画板保存成功；换机器或清理数据前，另行导出画板包。保存失败时保持 App 打开并重试。'] },
  ] },
  { path: '/guides/coding-agent', title: '让 Coding Agent 生成并交付项目图片', description: '为 Codex 或 Claude Code 安装 Iterlay Skill，检查连接，并按准备、创作、交付三个阶段工作。', source: 'cli/README.md', sections: [
    { title: '集成使用什么方式？', paragraphs: ['Iterlay 通过 CLI + Skill 连接 Coding Agent，使用 App 中已配置的模型。先安装并打开 App。为不同 Agent 安装 Skill 只是选择集成目标，不会自动隔离工作区、权限、凭据或额度。'] },
    { title: '安装对应 Skill', paragraphs: ['选择与你实际使用的 Agent 对应的命令；也可以在 App「设置 → Coding Agent」安装或修复。'], code: 'npx iterlay add --agent codex\n# 或使用 Claude Code\nnpx iterlay add --agent claude-code' },
    { title: '第一步：只检查准备状态', code: 'iterlay status --json\niterlay providers list --kind image --json\niterlay tools list --json', paragraphs: ['检查退出码与 ok 字段。已保存的配置不代表远端模型已实测可用。CLI 为建立连接可能启动 App；这里只检查准备，不需要生成、创建画板或读取凭据文件。'] },
    { title: '第二步：明确创作任务', paragraphs: ['告诉 Agent 图片用途、主体、尺寸期望和导出目录。提交前确认实际服务商、模型、生成数量和费用，使用稳定的 request ID 并保留任务 ID。不要把官网的预制结果当成刚运行的生成。'] },
    { title: '第三步：检查并交付文件', steps: ['回到 App 检查画板、版本和真实结果。', '将选定素材导出到项目目录，默认不覆盖已有文件。', '核对文件存在、实际尺寸与格式；生成完成但导出失败时，重试导出同一个结果。', '等待中断时用原任务 ID 恢复检查，不要默认远端已停止或停费。'], code: 'iterlay tasks wait TASK_ID --json' },
  ] },
  { path: '/guides/field-case', title: 'FIELD 案例：从产品原图到网站素材交付', description: '检查真实生成的产品图、改色版本、户外广告与海报，导入示例画板并导出网站素材。', source: 'website/public/examples/field/README.zh-CN.md', image: 'examples/field/site/assets/field-outdoor.webp', alt: '虚构品牌 FIELD 的橙色音箱位于山间湖畔的实际生成广告图', sections: [
    { title: '这个案例包含什么？', paragraphs: ['FIELD 是虚构的户外音响品牌，不是客户案例。项目提供实际生成的橙色产品原图、鼠尾草绿编辑版本、户外广告、海报、可导入的 .itb 画板和成品静态网站。官网展示已有结果，不执行新的模型调用。'] },
    { title: '先检查已有素材，不需要生成', steps: ['从 Coding Agent 页面下载 FIELD 画板或完整项目。', '在桌面 App 的画板列表选择「导入画板」，打开 .itb 文件；不需要模型账号来查看和导出已有图片。', '查看橙色原图到绿色修改版的版本链，并与户外图和海报区分。导入后 ID 会重映射，使用 App 或 CLI 实际返回的 ID。'] },
    { title: '选择三张交付图', paragraphs: ['网站示例将橙色原始产品图用于 hero.png、户外图用于 scene.png、海报用于 campaign.png，输出到 ./public/iterlay-starter/。绿色图片只是编辑变体，保留它和原始版本链，不要为交付重新生成。'], code: 'iterlay boards list --json\niterlay boards show <实际返回的画板ID> --json\niterlay assets export --path <实际返回的托管图片路径> --out <目标路径> --json' },
    { title: '完成交付前核对', steps: ['确认导出目录里实际存在三个文件，且没有覆盖已有项目素材。', '检查图片实际尺寸和内容，在网页中完整预览桌面与移动布局。', '需要继续编辑时保留 .itb 和完整项目；导出的图片不能替代画板备份。'] },
  ] },
]
const enGuides: Article[] = [
  { path: '/guides/model-setup', title: 'How to configure an image model in Iterlay', description: 'Connect your own provider, choose an image model and distinguish a configuration check from a live generation test.', source: 'README.md', sections: [
    { title: 'What do you need?', paragraphs: ['Install and open the desktop app first. Iterlay is free and MIT-licensed. Your chosen provider supplies and bills model usage. The prepared website examples do not require a model account.'] },
    { title: 'Connect an image provider', steps: ['Open Settings → AI Services and choose or add a provider.', 'Enter the required endpoint and API key or supported account authorization. Never include credentials in prompts or issues.', 'Select a model that supports image generation; editing also requires image-editing and reference-image support.', 'Configure conversation, image and video capabilities separately. A successful conversation request does not verify image generation.'] },
    { title: 'Check configuration before a live test', paragraphs: ['These commands inspect the local connection and saved image-provider configuration. They do not prove a remote generation request will succeed. A live test may consume paid quota: check the model, quantity and provider charges first.'], code: 'iterlay status --json\niterlay providers list --kind image --json' },
    { title: 'If a request fails', steps: ['Read the returned error and check the endpoint, authorization, model name and capabilities.', 'If waiting is interrupted, inspect the original task before submitting again to avoid duplicate charges.', 'If generation succeeds but export fails, export the existing result again instead of generating another one.'] },
    { title: 'Where does data go?', paragraphs: ['Desktop boards and assets are stored locally. Prompts and required reference media are sent to your selected provider for generation; credentials authenticate requests to that service. Local storage is not a cloud backup and does not mean model inference runs offline.'] },
  ] },
  { path: '/guides/version-comparison', title: 'How to keep an original image and compare edit versions', description: 'Keep edits on one canvas node, inspect changes and export the version you choose.', source: 'src/components/canvas/image-node/ImageNodeVersions.tsx', sections: [
    { title: 'When should you compare versions?', paragraphs: ['Compare a background replacement, color change or lighting edit against its original on the same image node. Models do not guarantee identical fine details, so inspect the result before delivery.'] },
    { title: 'Continue from an original', steps: ['Import or generate an image, select it and open editing.', 'Describe what to preserve and what to change. Confirm the selected model supports editing before submitting.', 'Wait for the actual result and switch between original and edited versions using the image controls.', 'Open comparison and inspect shape, materials, text and background edges before editing further.'] },
    { title: 'Save and deliver', steps: ['Select the version you actually want before saving or exporting.', 'Open the exported file and check its real dimensions, format and content.', 'Wait for a successful board save. Export a board package before moving machines or deleting app data. Keep the app open and retry if saving fails.'] },
  ] },
  { path: '/guides/coding-agent', title: 'Generate and deliver project images with a coding agent', description: 'Install the Iterlay Skill for Codex or Claude Code, check readiness and follow a prepare, create and deliver workflow.', source: 'cli/README.md', sections: [
    { title: 'How does the integration work?', paragraphs: ['Iterlay connects coding agents through CLI + Skill and uses the models configured in the app. Install and open the app first. Selecting an agent does not create separate workspaces, permissions, credentials or quotas.'] },
    { title: 'Install the matching Skill', paragraphs: ['Choose the command for the agent you use, or install and repair the integration from Settings → Coding Agent.'], code: 'npx iterlay add --agent codex\n# Or for Claude Code\nnpx iterlay add --agent claude-code' },
    { title: '1. Check readiness without generating', code: 'iterlay status --json\niterlay providers list --kind image --json\niterlay tools list --json', paragraphs: ['Check exit codes and ok fields. Saved provider configuration is not a live model test. The CLI may start the app to establish its connection. This check needs no generation, board creation or access to credential files.'] },
    { title: '2. Give the agent a concrete task', paragraphs: ['Specify the image purpose, subject, expected dimensions and output directory. Confirm the actual provider, model, quantity and charges before generation. Use a stable request ID and keep the task ID. Prepared website results are not evidence of a new model run.'] },
    { title: '3. Inspect and deliver the files', steps: ['Review the real board, versions and results in the app.', 'Export selected assets into your project without overwriting existing files by default.', 'Check file existence, real dimensions and format. Retry export of the same result if only local delivery failed.', 'Resume an interrupted wait using the original task ID. A disconnect does not mean the remote task or billing stopped.'], code: 'iterlay tasks wait TASK_ID --json' },
  ] },
  { path: '/guides/field-case', title: 'FIELD case: from a product image to website assets', description: 'Inspect generated product images, a color edit, outdoor campaign and poster, then import the board and export project assets.', source: 'website/public/examples/field/README.md', image: 'examples/field/site/assets/field-outdoor.webp', alt: 'An actual generated campaign image of the fictional FIELD orange speaker beside an alpine lake', sections: [
    { title: 'What is included?', paragraphs: ['FIELD is a fictional outdoor audio brand, not a customer case. It includes real generated orange product photography, a sage edit, outdoor campaign, poster, importable .itb board and finished static website. This page displays existing results without making a new model call.'] },
    { title: 'Inspect existing assets without generating', steps: ['Download the FIELD board or complete project from the Coding Agent page.', 'Choose Import board in the desktop board library and open the .itb file. Viewing and exporting existing images needs no model account.', 'Inspect the orange-to-sage version chain separately from the outdoor scene and poster. Import remaps IDs: use IDs actually returned by the app or CLI.'] },
    { title: 'Select three deliverable images', paragraphs: ['Use the original orange product image for hero.png, the outdoor scene for scene.png and the poster for campaign.png in ./public/iterlay-starter/. Keep the sage variant and the original version chain. Do not generate again just to deliver existing files.'], code: 'iterlay boards list --json\niterlay boards show <returned-board-id> --json\niterlay assets export --path <returned-managed-image-path> --out <output-path> --json' },
    { title: 'Check the delivery', steps: ['Confirm all three files exist and no existing project files were overwritten.', 'Inspect actual dimensions and content, then preview the website at desktop and mobile sizes.', 'Keep the .itb and full project if you need future edits. Exported images are not a board backup.'] },
  ] },
]
export function articles(language: SiteLanguage): Article[] {
  const english = language === 'en'
  const data = english ? featuresEn : features
  return [...data.map(feature => ({ path: `/features/${feature.id}`, title: `${feature.name}${english ? ' guide' : '使用指南'} — Iterlay`, description: feature.summary, source: feature.source, sections: [
    { title: feature.headline, paragraphs: [feature.summary] },
    ...feature.children.map(child => ({ title: child.name, paragraphs: [child.description], steps: child.steps })),
    { title: english ? 'Requirements and limits' : '使用条件与能力边界', paragraphs: [feature.boundary] },
  ] })), ...(english ? enGuides : zhGuides)]
}

/** Developer integration content is distinct from the desktop creation workflow. */
export function isAgentContent(path: string) {
  return ['/agents', '/features/agent', '/guides/coding-agent', '/guides/field-case'].includes(path)
}
