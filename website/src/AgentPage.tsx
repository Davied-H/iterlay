import { useState } from 'react'
import { publicHref, useSiteLanguage } from './site-language'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Copy, Download } from 'lucide-react'
import { AGENT_STARTER, buildAgentStarterPrompt } from '../../shared/agent-starter'
import './agent-page.css'

// THESIS: Show a completed FIELD asset workflow before asking a developer to install.
// OWN-WORLD: Extend the white, graphite and quiet green website with real rectangular images.
// STORY: See the outcome, inspect the source and edits, prepare an agent, deliver project files.
// FIRST VIEWPORT: Plain-language offer beside the real outdoor result; open the finished site.
// FORM: The agreed evidence-led case, followed by three explicit setup and delivery steps.
// FINISH: Desktop/mobile interaction review and source-backed documentation close this addition.

type Language = 'en' | 'zh'
type Agent = 'codex' | 'claude-code'
type TaskMode = 'check' | 'create' | 'deliver'

const text = {
  en: {
    language: 'Page language', title: 'Give your coding agent a canvas.',
    intro: 'Iterlay brings images, videos and creative workflows into one desktop app. Connect Codex or Claude Code through CLI + Skill to generate and edit project images, review versions on the canvas, and export the files into your code project.',
    seeResult: 'Open the finished website', start: 'Set up CLI + Skill',
    terms: 'Free, MIT-licensed app · macOS & Windows · Model usage billed by your provider',
    heroAlt: 'Screenshot of the finished FIELD example website using the generated orange speaker image',
    heroCaption: 'FIELD / Finished example website', heroProof: 'Actual page screenshot',
    caseTitle: 'One product. A set of assets that belong together.',
    caseIntro: 'FIELD is a fictional portable speaker. These images were made with Iterlay’s CLI and a configured image model. The sample website uses the finished assets; it is a static example, not a live generation.',
    sourceTitle: 'Start with the product', sourceBody: 'An orange studio shot establishes the product’s shape, lettering, materials and carry loop.',
    sourceAlt: 'Orange FIELD speaker studio image used as the reference for the following images',
    colorTitle: 'Refine one version', colorBody: 'Change the body, grille and buttons to sage green. Keep the shape, lettering, loop, framing and background.',
    colorAlt: 'The same FIELD speaker edited to sage green with the studio setting preserved',
    campaignTitle: 'Take it into a scene', campaignBody: 'Use the orange product as the reference for an outdoor campaign image.',
    posterTitle: 'Make a launch poster', posterBody: 'Keep the product identity and add an editorial layout for the same fictional brand.',
    posterAlt: 'FIELD brand poster with the orange speaker, black title and warm cream background',
    provenance: 'Read the original prompts & generation record',
    boardTitle: 'Keep the context. Continue the work.',
    boardBody: 'The downloadable board contains the existing results and their context. Import it into Iterlay to inspect the images and compare the orange and sage versions before making your own changes.',
    boardDownload: 'Download the FIELD board', projectDownload: 'Download the complete example project', boardNote: 'Opening the board does not generate images or use model quota.',
    setupTitle: 'From setup to your first delivery.',
    setupIntro: 'Inspect and export the included example without a model account. Connect a model when you want to create new images.',
    prepare: 'Prepare Iterlay', prepareBody: 'Install and open the desktop app, then install the Skill in Settings → Coding Agent or use the command below. To use the existing example, open the board list → Import board and choose field-starter.itb. Viewing and exporting it needs no model configuration. For new images, add an image model in Settings → AI Services; your provider bills for generation.',
    getApp: 'Download Iterlay', copyCommand: 'Copy install command',
    taskTitle: 'Give your agent a concrete task', taskBody: 'Choose an agent and a stage. Check the connection, deliver the existing example without a model call, or create a new image with your configured provider.',
    modes: { check: 'Check setup', create: 'Create assets', deliver: 'Deliver files' },
    taskLabel: 'Task to paste into your coding agent', copyTask: 'Copy task', copied: 'Copied',
    copyError: 'Clipboard access was unavailable. The text is selected; copy it with your keyboard.',
    inspectTitle: 'Review, then deliver', inspectBody: 'Open the board in Iterlay. Compare the versions and tell the agent which image to keep. Ask it to export the selected files into your project and report the exact paths.',
    checklist: ['The board opens with the generated assets.', 'You can find and compare the original and edited version.', 'The exported files exist in your project and open correctly.'],
    scope: 'Codex and Claude Code use the same CLI and configured providers. Installing a Skill for an agent does not create a separate workspace, quota or permission boundary.',
    privacyTitle: 'Your workspace. Your model provider.',
    privacy: 'Boards and assets stay on your machine. Prompts and required reference images are sent to the model service you choose. The CLI connects to the running app; provider credentials stay in Iterlay.',
    docs: 'Setup, saving & troubleshooting', source: 'View source', finalTitle: 'Make something your project can use.', finalBody: 'Start from the FIELD example, then bring your own product, brief and references.',
  },
  zh: {
    language: '页面语言', title: '给你的 Coding Agent，一张创作画布。',
    intro: 'Iterlay 把图片、视频与创作工作流放在同一个 App。通过 CLI + Skill 接入 Codex 或 Claude Code，让 Agent 生成、修改项目图片，你在画布中检查版本，再把选定文件导出到代码目录。',
    seeResult: '打开案例成品网页', start: '配置 CLI + Skill',
    terms: 'MIT 免费开源 · macOS 与 Windows · 模型调用由服务商计费',
    heroAlt: 'FIELD 成品示例网页的真实截图，使用已生成的橙色音箱主图',
    heroCaption: 'FIELD / 成品示例网页', heroProof: '实际网页截图',
    caseTitle: '同一件产品，做出一组连贯的素材。',
    caseIntro: 'FIELD 是一个虚构的便携音箱品牌。这组图片通过 Iterlay CLI 和已配置的图片模型制作。成品网页使用这些素材，是静态案例，不会实时调用模型。',
    sourceTitle: '先确定产品原图', sourceBody: '橙色棚拍图确定主体的形状、字标、材质与挂绳，作为后续创作的参考。',
    sourceAlt: '作为后续创作参考的橙色 FIELD 音箱棚拍原图',
    colorTitle: '再修改一个版本', colorBody: '把外壳、网罩和按钮改为鼠尾草绿，保留形状、字标、挂绳、构图和背景。',
    colorAlt: '保持原有构图与棚拍背景，将同一 FIELD 音箱改为鼠尾草绿的版本',
    campaignTitle: '把产品带进场景', campaignBody: '沿用橙色产品参考，制作高山湖畔的户外广告图。',
    posterTitle: '继续做发布海报', posterBody: '保留产品辨识度，为同一个虚构品牌增加版式与发布文案。',
    posterAlt: '奶油色背景、黑色字标与橙色音箱构成的 FIELD 品牌海报',
    provenance: '查看原始提示词与生成记录',
    boardTitle: '把上下文留下，接着往下做。',
    boardBody: '下载的画板包含已有结果与创作上下文。导入 Iterlay 后，先查看素材、比较橙色原图与绿色版本，再继续自己的修改。',
    boardDownload: '下载 FIELD 案例画板', projectDownload: '下载完整示例项目', boardNote: '打开画板不会自动生成图片，也不会消耗模型额度。',
    setupTitle: '从准备环境，到第一次交付。',
    setupIntro: '先查看和导出已有案例，无需模型账号。想生成新图片时，再连接模型服务。',
    prepare: '准备 Iterlay', prepareBody: '安装并打开桌面版，在「设置 → Coding Agent」中安装 Skill，或使用下面的命令。使用已有案例时，到画板列表点击「导入画板」，选择 field-starter.itb；查看和导出都无需配置模型。生成新图时，再到「设置 → AI 服务」配置图片模型，由服务商收取生成费用。',
    getApp: '下载 Iterlay', copyCommand: '复制安装命令',
    taskTitle: '给 Agent 一项具体任务', taskBody: '选择 Agent 和当前阶段：检查连接、不调用模型交付已有案例，或使用你配置的服务商生成新图片。',
    modes: { check: '检查准备', create: '创建素材', deliver: '交付文件' },
    taskLabel: '复制到 Coding Agent 的任务', copyTask: '复制任务', copied: '已复制',
    copyError: '无法访问剪贴板。已选中文本，请用键盘复制。',
    inspectTitle: '检查结果，再交付项目', inspectBody: '在 Iterlay 中打开画板，比较版本并告诉 Agent 保留哪一张。让它把选中的素材导出到项目，并返回准确文件路径。',
    checklist: ['画板能打开，并显示生成的素材。', '能找到原图和修改后的版本，并进行比较。', '导出文件已出现在项目目录，且可以正常打开。'],
    scope: 'Codex 和 Claude Code 使用同一套 CLI 与已配置的服务商。为某个 Agent 安装 Skill，不会创建独立工作区、额度或权限边界。',
    privacyTitle: '你的工作区，你选择的模型。',
    privacy: '画板和素材保存在本机。提示词与所需参考图片会发送给你选择的模型服务。CLI 连接正在运行的 App，服务商凭据保留在 Iterlay 中。',
    docs: '配置、保存与问题排查', source: '查看源码', finalTitle: '做出项目真正能用的素材。', finalBody: '先从 FIELD 案例开始，再换成自己的产品、需求与参考。',
  },
}

const asset = (file: string) => `${import.meta.env.BASE_URL}examples/field/site/assets/${file}`
const taskModes: TaskMode[] = ['check', 'create', 'deliver']

export default function AgentPage() {
  const language: Language = useSiteLanguage()
  const t = text[language]
  const [agent, setAgent] = useState<Agent>('codex')
  const [mode, setMode] = useState<TaskMode>('check')
  const [copied, setCopied] = useState<string | null>(null)
  const [copyError, setCopyError] = useState(false)
  const installCommand = `npx iterlay add --agent ${agent}`
  const task = buildAgentStarterPrompt(agent, language, mode)
  const copy = async (value: string, target: string) => {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(target)
    } catch {
      const field = document.getElementById(target) as HTMLTextAreaElement | HTMLInputElement | null
      field?.focus()
      field?.select()
      setCopied(null)
      setCopyError(true)
    }
  }
  const scrollToSetup = () => document.getElementById('agent-setup')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  const examplePage = language === 'zh' ? AGENT_STARTER.pagePath.replace('index.html', 'index.zh.html') : AGENT_STARTER.pagePath
  const appDownload = publicHref('/download', language)

  return <div className="agent-page" lang={language === 'zh' ? 'zh-CN' : 'en'}>
    <section className="agent-hero agent-container" aria-labelledby="agent-title">
      <div className="agent-hero-layout"><div className="agent-hero-copy"><h1 id="agent-title">{t.title}</h1><p>{t.intro}</p><div className="agent-actions"><button className="agent-primary" onClick={scrollToSetup}>{t.start}<ArrowDown size={16} /></button><a className="agent-text-link" href={`${import.meta.env.BASE_URL}${examplePage}`} target="_blank" rel="noreferrer">{t.seeResult}<ArrowUpRight size={16} /></a></div><p className="agent-terms">{t.terms}</p></div><figure className="agent-hero-image"><a href={`${import.meta.env.BASE_URL}${examplePage}`} target="_blank" rel="noreferrer" aria-label={t.seeResult}><img src={`${import.meta.env.BASE_URL}agent-field-site.webp`} alt={t.heroAlt} width="1200" height="900" fetchPriority="high" /></a><figcaption><span>{t.heroCaption}</span><span>{t.heroProof}</span></figcaption></figure></div>
    </section>

    <section className="agent-case agent-container" aria-labelledby="agent-case-title"><div className="agent-section-heading"><h2 id="agent-case-title">{t.caseTitle}</h2><p>{t.caseIntro}</p></div><div className="agent-asset-grid">
      <figure><img src={asset('field-studio.webp')} alt={t.sourceAlt} width="1254" height="1254" loading="lazy" /><figcaption><h3>{t.sourceTitle}</h3><p>{t.sourceBody}</p></figcaption></figure>
      <figure><img src={asset('field-sage.webp')} alt={t.colorAlt} width="1254" height="1254" loading="lazy" /><figcaption><h3>{t.colorTitle}</h3><p>{t.colorBody}</p></figcaption></figure>
      <figure><img src={asset('field-outdoor.webp')} alt={language === 'zh' ? '同一橙色 FIELD 音箱位于高山湖畔的户外广告图' : 'The same orange FIELD speaker in an alpine outdoor campaign scene'} width="1254" height="1254" loading="lazy" /><figcaption><h3>{t.campaignTitle}</h3><p>{t.campaignBody}</p></figcaption></figure>
      <figure><img src={asset('field-poster.webp')} alt={t.posterAlt} width="1254" height="1254" loading="lazy" /><figcaption><h3>{t.posterTitle}</h3><p>{t.posterBody}</p></figcaption></figure>
    </div><a className="agent-text-link agent-provenance" href={`${import.meta.env.BASE_URL}${AGENT_STARTER.promptsPath}`} target="_blank" rel="noreferrer">{t.provenance}<ArrowUpRight size={15} /></a>
      <div className="agent-board"><div><h3>{t.boardTitle}</h3><p>{t.boardBody}</p></div><div><a className="agent-secondary" href={`${import.meta.env.BASE_URL}${AGENT_STARTER.archivePath}`} download={AGENT_STARTER.archiveFileName}><Download size={16} />{t.boardDownload}</a><a className="agent-text-link agent-project-download" href={`${import.meta.env.BASE_URL}${AGENT_STARTER.bundlePath}`} download>{t.projectDownload}<ArrowDown size={14} /></a><p>{t.boardNote}</p></div></div>
    </section>

    <section className="agent-setup" id="agent-setup" aria-labelledby="agent-setup-title"><div className="agent-container"><div className="agent-section-heading"><h2 id="agent-setup-title">{t.setupTitle}</h2><p>{t.setupIntro}</p></div>
      <ol className="agent-steps"><li><div className="agent-step-heading"><span aria-hidden="true">1</span><h3>{t.prepare}</h3></div><div className="agent-step-body"><p>{t.prepareBody}</p><a className="agent-text-link" href={appDownload}>{t.getApp}<ArrowUpRight size={15} /></a><div className="agent-selector" aria-label={language === 'zh' ? '选择 Coding Agent' : 'Choose a coding agent'}>{(['codex', 'claude-code'] as Agent[]).map(value => <button key={value} aria-pressed={agent === value} onClick={() => { setAgent(value); setCopied(null); setCopyError(false) }}>{value === 'codex' ? 'Codex' : 'Claude Code'}</button>)}</div><div className="agent-command"><input id="agent-install-command" value={installCommand} readOnly aria-label={t.copyCommand} /><button onClick={() => void copy(installCommand, 'agent-install-command')} aria-label={copied === 'agent-install-command' ? t.copied : t.copyCommand}>{copied === 'agent-install-command' ? <Check size={17} /> : <Copy size={17} />}</button></div></div></li>
      <li><div className="agent-step-heading"><span aria-hidden="true">2</span><h3>{t.taskTitle}</h3></div><div className="agent-step-body"><p>{t.taskBody}</p><div className="agent-task-modes" aria-label={language === 'zh' ? '选择任务阶段' : 'Choose a task stage'}>{taskModes.map(value => <button key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setCopied(null); setCopyError(false) }}>{t.modes[value]}</button>)}</div><label className="sr-only" htmlFor="agent-task">{t.taskLabel}</label><textarea id="agent-task" readOnly value={task} spellCheck={false} /><div className="agent-copy-row"><span> {agent === 'codex' ? 'Codex' : 'Claude Code'}<ArrowRight size={13} />Iterlay<ArrowRight size={13} />{t.modes[mode]}</span><button className="agent-secondary" onClick={() => void copy(task, 'agent-task')}>{copied === 'agent-task' ? <Check size={15} /> : <Copy size={15} />}{copied === 'agent-task' ? t.copied : t.copyTask}</button></div><p className="agent-copy-status" role="status">{copyError ? t.copyError : copied ? t.copied : ''}</p></div></li>
      <li><div className="agent-step-heading"><span aria-hidden="true">3</span><h3>{t.inspectTitle}</h3></div><div className="agent-step-body"><p>{t.inspectBody}</p><ul className="agent-checklist">{t.checklist.map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul></div></li></ol><p className="agent-scope">{t.scope}</p>
    </div></section>

    <section className="agent-privacy agent-container"><h2>{t.privacyTitle}</h2><div><p>{t.privacy}</p><a className="agent-text-link" href={publicHref('/help', language)}>{t.docs}<ArrowUpRight size={15} /></a><p className="help-note">{language === 'en' ? 'This website shows prepared examples and does not save an editable desktop board. Download the FIELD files to keep them. In the desktop app, wait for a successful save; if saving fails, keep it open and retry.' : '官网展示预制示例，不会保存可编辑的桌面画板。请下载 FIELD 文件留存。桌面 App 中请等待保存成功；保存失败时保持打开并重试。'}</p></div></section>
    <section className="agent-close"><h2>{t.finalTitle}</h2><p>{t.finalBody}</p><a className="agent-primary" href={appDownload}>{t.getApp}<Download size={16} /></a></section>
  </div>
}
