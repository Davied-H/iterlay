import { Link, useLocation } from 'react-router-dom'
import { articles, isAgentContent } from './content'
import { contentPath, sitePath, useSiteLanguage } from './site-language'
import { repository } from './releases.mjs'
import './help-page.css'
import './content-page.css'

// Read surface: extend the existing white, graphite and muted-green help layout.
// A single reading column leads from the answer to steps, limits and source evidence.
export default function ContentPage() {
  const language = useSiteLanguage()
  const en = language === 'en'
  const path = contentPath(useLocation().pathname)
  const all = articles(language)
  const article = all.find(item => item.path === path)
  const agentContent = isAgentContent(path)
  if (path === '/guides') return <div className="help-page content-page">
    <h1>{en ? 'Practical guides for your next image.' : '从配置到交付的使用指南。'}</h1>
    <p className="help-intro">{en ? 'Learn the workflow, check real results and understand what stays local and what reaches your model provider.' : '了解实际操作、检查真实结果，并分清本地保存和模型调用的边界。'}</p>
    <section><h2>{en ? 'Use the desktop app' : '使用桌面产品'}</h2><ul className="content-directory">{all.filter(item => item.path.startsWith('/guides/') && !isAgentContent(item.path)).map(item => <li key={item.path}><Link to={sitePath(item.path, language)}>{item.title}</Link><p>{item.description}</p></li>)}</ul></section>
    <section><h2>{en ? 'Explore every feature' : '了解各项功能'}</h2><ul className="content-directory">{all.filter(item => item.path.startsWith('/features/') && !isAgentContent(item.path)).map(item => <li key={item.path}><Link to={sitePath(item.path, language)}>{item.title}</Link><p>{item.description}</p></li>)}</ul></section>
    <section><h2>{en ? 'Integrate a coding agent' : '接入 Coding Agent'}</h2><p>{en ? 'For developers using CLI + Skill with the same Iterlay desktop app.' : '面向开发者，通过 CLI + Skill 连接同一个 Iterlay 桌面 App。'}</p><Link to={sitePath('/agents', language)}>{en ? 'Coding Agent integration overview' : 'Coding Agent 集成入口'}</Link><ul className="content-directory">{all.filter(item => isAgentContent(item.path)).map(item => <li key={item.path}><Link to={sitePath(item.path, language)}>{item.title}</Link><p>{item.description}</p></li>)}</ul></section>
    <ProductFacts english={en} />
  </div>
  if (!article) return <div className="help-page"><h1>{en ? 'Guide not found' : '未找到指南'}</h1><Link to={sitePath('/guides', language)}>{en ? 'Browse guides' : '浏览指南'}</Link></div>
  return <article className="help-page content-page">
    <nav aria-label={en ? 'Breadcrumb' : '面包屑导航'}><Link to={sitePath('/', language)}>Iterlay</Link><span aria-hidden="true">/</span><Link to={sitePath('/guides', language)}>{en ? 'Guides' : '使用指南'}</Link></nav>
    <h1>{article.title}</h1><p className="help-intro">{article.description}</p>
    {article.image && <figure className="content-figure"><img src={`${import.meta.env.BASE_URL}${article.image}`} alt={article.alt} width="1254" height="1254" /><figcaption>{en ? 'FIELD is a fictional example with real generated assets.' : 'FIELD 为虚构案例，图片为实际生成素材。'}</figcaption></figure>}
    {article.sections.map((section, index) => <section key={index}><h2>{section.title}</h2>{section.paragraphs?.map(p => <p key={p}>{p}</p>)}{section.steps && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}{section.code && <pre><code>{section.code}</code></pre>}</section>)}
    <section><h2>{en ? 'Check the source and continue' : '核对来源并继续使用'}</h2><p>{en ? 'This guide describes the source in this repository. Your installed version and available model capabilities may differ; match fixes to a published release.' : '本页基于仓库当前实现；已安装版本与模型支持范围可能不同，修复请以实际发布版本核对。'}</p><div className="english-product-links"><a href={`${repository}/blob/main/${article.source}`}>{en ? 'Product source' : '产品文档与代码'}</a><Link to={sitePath('/download', language)}>{en ? 'Download & releases' : '下载与版本'}</Link><Link to={sitePath(agentContent ? '/agents' : '/wiki', language)}>{agentContent ? en ? 'Coding Agent integration' : 'Coding Agent 集成' : en ? 'Explore desktop tools' : '浏览桌面创作功能'}</Link></div></section>
    <section><h2>{en ? 'Related guides' : '相关指南'}</h2><ul>{all.filter(item => item.path.startsWith('/guides/') && item.path !== article.path && isAgentContent(item.path) === agentContent).map(item => <li key={item.path}><Link to={sitePath(item.path, language)}>{item.title}</Link></li>)}</ul></section>
  </article>
}
export function ProductFacts({ english: en }: { english: boolean }) {
  return <section><h2>{en ? 'What is Iterlay?' : 'Iterlay 是什么？'}</h2><p>{en ? 'Iterlay is a free, MIT-licensed AI creative desktop workspace for macOS and Windows. Generate, edit, compare and organize visual assets on an infinite canvas in the desktop app.' : 'Iterlay 是适用于 macOS 和 Windows 的免费 MIT 开源 AI 创作桌面工作台。在桌面 App 的无限画板中生成、编辑、比较和整理视觉素材。'}</p><h3>{en ? 'How does Coding Agent fit in?' : 'Coding Agent 和产品是什么关系？'}</h3><p>{en ? 'CLI + Skill is an optional developer integration with this same desktop app. It lets an external coding agent operate the configured workspace; Iterlay itself is not a standalone coding agent.' : 'CLI + Skill 是同一桌面产品面向开发者的可选集成，让外部 Coding Agent 操作已配置的工作区；Iterlay 本身不是独立的编程 Agent。'}</p><h3>{en ? 'Is model usage free?' : '模型调用也免费吗？'}</h3><p>{en ? 'The app is free. New generation requires your own configured provider, whose charges and capability limits apply. Prepared website examples make no model calls.' : 'App 免费。新的生成使用你自己配置的服务商，费用和能力限制由该服务商决定。官网预制示例不调用模型。'}</p><h3>{en ? 'Is everything offline?' : '所有操作都离线吗？'}</h3><p>{en ? 'Boards and assets are stored on your computer. Generation sends prompts and required reference media to your selected provider. Export a board package for backup and wait for a successful save before closing.' : '画板与素材保存在本机。生成时，提示词和所需参考素材会发送给所选服务商。请导出画板包备份，并在关闭前等待保存成功。'}</p></section>
}
