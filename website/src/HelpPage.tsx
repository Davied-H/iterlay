import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { repository, releasesUrl } from './releases.mjs'
import { sitePath, useSiteLanguage } from './site-language'
import './agent-page.css'
import './help-page.css'

export default function HelpPage() {
  const language = useSiteLanguage()
  const english = language === 'en'
  return <div className="help-page">
    <h1>{english ? 'Setup, saving and troubleshooting.' : '配置、保存与问题排查。'}</h1>
    <p className="help-intro">{english ? 'Start with the included example, connect your own provider when you need a new image, and verify the files you keep.' : '先查看已有案例，需要新图片时再连接自己的服务商，并检查需要留下的文件。'}</p>
    <nav aria-label={english ? 'Help topics' : '帮助主题'} onClick={event => {
      const anchor = (event.target as Element).closest('a')
      const target = anchor?.getAttribute('href')?.slice(1)
      if (!target) return
      event.preventDefault()
      document.getElementById(target)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }}><a href="#setup">{english ? 'Set up a provider' : '配置服务商'}</a><a href="#saving">{english ? 'Where work is saved' : '保存位置与边界'}</a><a href="#troubleshooting">{english ? 'Troubleshoot' : '排查问题'}</a><a href="#fixes">{english ? 'Find a released fix' : '找到已发布的修复'}</a></nav>
    <section id="setup"><h2>{english ? 'Connect a provider only when you need it.' : '需要生成时，再连接服务商。'}</h2><ol>
      <li>{english ? 'Download the desktop app for your operating system and processor. Open it once before using the CLI.' : '按操作系统和处理器下载安装桌面版，使用 CLI 前先打开一次 App。'}</li>
      <li>{english ? 'Open Settings → AI Services. Add the provider URL and supported authorization, then choose an image model. Conversation and video models are configured separately.' : '打开「设置 → AI 服务」，填写服务地址与支持的认证方式，选择图片模型；对话和视频模型分别配置。'}</li>
      <li>{english ? 'Read what a test actually checks. A reachable service or accepted authorization does not prove image generation or editing works. An explicit generation test may use paid provider quota; review the request before running it.' : '查看测试实际验证的内容。联网或鉴权成功不代表图片生成、编辑可用；主动生图测试可能消耗付费额度，执行前先核对请求。'}</li>
      <li>{english ? 'For Codex or Claude Code, install the Skill in Settings → Coding Agent, or use the matching command below. This selects the integration target; it does not create separate quotas, credentials or permissions.' : '使用 Codex 或 Claude Code 时，在「设置 → Coding Agent」安装 Skill，或执行对应命令。该选项选择集成目标，不会隔离额度、凭据或权限。'}</li>
    </ol><pre><code>npx iterlay add --agent codex{'\n'}npx iterlay add --agent claude-code{'\n'}iterlay status --json{'\n'}iterlay providers list --json</code></pre><p className="help-note">{english ? 'Status and provider-list commands inspect the local integration and saved configuration; they do not verify a live model request. No model account is needed to view or export the existing FIELD board.' : 'status 和 providers list 检查本地集成与已保存配置，不代表已验证真实模型请求。查看、导出已有 FIELD 画板不需要模型账号。'}</p><Link className="agent-text-link" to={sitePath('/agents', language)}>{english ? 'Follow the FIELD setup and delivery steps' : '查看 FIELD 配置与交付步骤'}<ArrowRight size={15} /></Link></section>
    <section id="saving"><h2>{english ? 'Website examples and desktop work have different storage.' : '官网示例和桌面工作区的保存方式不同。'}</h2>
      <h3>{english ? 'Public website examples' : '官网公开示例'}</h3><p>{english ? 'The website uses prepared assets and simulated interactions. Changing a prompt or switching a version in an example does not create or save a desktop board, and it makes no model call. Reloading may reset the example. Download images, the .itb board or the complete FIELD project to keep the supplied files.' : '官网使用预制素材和模拟交互。在示例里修改提示词、切换版本不会创建或保存桌面画板，也不会调用模型；刷新可能重置体验。需要留下文件时，请下载图片、.itb 画板或完整 FIELD 项目。'}</p>
      <h3>{english ? 'Desktop app' : '桌面 App'}</h3><p>{english ? 'The desktop app stores boards and assets locally, rather than in a website account or a cloud backup. Wait for a successful save before closing or restarting. If saving fails, keep the app open, retry and export a board package when possible. A failure or pending save must not be treated as saved. Keep exported packages separately before moving machines or deleting app data.' : '桌面 App 将画板与素材保存在本机，不等于网站账号或云端备份。关闭或重启前请等待保存成功。保存失败时保持 App 打开，重试并尽可能导出画板包；失败或等待保存都不能当作已保存。换机器或清理 App 数据前，先单独保留导出的画板包。'}</p>
      <h3>{english ? 'Local development in a browser' : '本地网页开发模式'}</h3><p>{english ? 'The repository’s browser development mode connects to a separate local backend and an isolated development workspace. It is not the public website or the installed app’s normal workspace. A backend disconnect can interrupt saving: keep the page open and reconnect before leaving. Do not use development storage as a backup of production work.' : '仓库的网页开发模式连接本地后台，使用隔离的开发工作区，与官网和已安装 App 的正式工作区不同。后台断开可能中断保存：保持页面打开，重连后再离开。不要把开发数据当作正式工作区的备份。'}</p>
    </section>
    <section id="troubleshooting"><h2>{english ? 'Recover the current task before starting another.' : '先恢复当前任务，再重新开始。'}</h2><ul>
      <li>{english ? 'CLI cannot connect: open Iterlay and run iterlay status --json. Check the CLI installation in Settings → Coding Agent. A custom user-data path connects only to that workspace; it does not automatically open another one.' : 'CLI 无法连接：先打开 Iterlay，执行 iterlay status --json，并在「设置 → Coding Agent」检查安装状态。指定用户数据目录时只连接该工作区，不会自动打开另一个工作区。'}</li>
      <li>{english ? 'A model request fails: check the provider URL, authorization, model name and supported image/editing capabilities. Review the provider response before retrying. Avoid sharing keys or credentials in an issue.' : '模型请求失败：检查服务地址、认证、模型名和图片或编辑能力，阅读服务商返回的信息再重试。不要在 issue 中提交密钥或凭据。'}</li>
      <li>{english ? 'Waiting ends or a connection drops: do not assume the remote model stopped or stopped billing. Find the original task and inspect its status before resubmitting. Use iterlay tasks wait TASK_ID --json to resume waiting for a known task.' : '结束等待或连接断开：不能据此认定远端模型已停止或停费。先查原任务状态再决定是否重提；已知任务 ID 时可用 iterlay tasks wait TASK_ID --json 继续等待。'}</li>
      <li>{english ? 'Generation completed but export failed: retry exporting the existing result. Do not generate again solely to recover a local file.' : '生成完成但导出失败：先重试导出已有结果，不要只为补一个本地文件重新生成。'}</li>
      <li>{english ? 'Work appears missing: verify which workspace and board you opened. Keep the current app or development page open if saving is still pending. Import a previously exported board package if needed.' : '内容看起来丢失：先核对工作区与画板；仍有待保存内容时保留当前 App 或开发页面。需要时导入此前保存的画板包。'}</li>
    </ul></section>
    <section id="fixes"><h2>{english ? 'Match a fix to a downloadable release.' : '把修复对应到可下载版本。'}</h2><p>{english ? 'Check the exact tag and installer listed on the download page. Each history entry links its original release notes and the installer from that same GitHub release. Issue references in published notes link to the corresponding issue. A closed issue or a change on main alone does not confirm that your installer includes a fix.' : '在下载页核对准确版本标签与安装包。每条版本记录都链接同一 GitHub Release 的原始说明与安装包，说明中的 issue 编号可直接打开。仅关闭 issue 或合并到 main，不代表当前安装包已经包含修复。'}</p><p>{english ? 'When reporting a problem, include your installed version, operating system and processor, steps to reproduce, expected behavior and the error message. Include a task ID when relevant, and remove provider credentials and private images.' : '反馈时请提供已安装版本、系统与处理器、复现步骤、预期行为和错误信息；相关时附任务 ID，并去掉服务商凭据与私人图片。'}</p><div className="english-product-links"><Link className="agent-text-link" to={sitePath('/download', language)}>{english ? 'Check releases and installers' : '查看版本与安装包'}<ArrowRight size={15} /></Link><a href={`${repository}/issues/new?title=${encodeURIComponent('[Bug] ')}&body=${encodeURIComponent(english ? 'Installed version:\nOS and processor:\nSteps to reproduce:\nExpected behavior:\nActual behavior / error:\nTask ID (if relevant):\n\nRemove API keys and private data before posting.' : '已安装版本：\n系统与处理器：\n复现步骤：\n预期行为：\n实际行为或错误：\n任务 ID（相关时）：\n\n发布前请移除 API Key 与私人数据。')}`}>{english ? 'Report an issue' : '反馈问题'}</a><a href={releasesUrl}>GitHub Releases</a></div></section>
  </div>
}
