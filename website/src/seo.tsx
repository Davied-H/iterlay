import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { articles, isAgentContent } from './content'
import { contentPath, siteLanguage, sitePath, type SiteLanguage } from './site-language'
import { repository } from './releases.mjs'

export const origin = (import.meta.env.VITE_SITE_ORIGIN || 'https://davied-h.github.io').replace(/\/$/, '')
export const siteBase = import.meta.env.BASE_URL.replace(/\/$/, '')
export const absoluteUrl = (path: string) => `${origin}${siteBase}${path}`
const summaries = {
  zh: {
    '/': ['Iterlay — 图片、视频与创作工作流，一张画布串起来', '免费开源的 AI 创作 App。生成图片、修改细节、制作视频，把参考、版本和成品整理在同一张画布上。支持 macOS 与 Windows；自选模型，调用由服务商计费。'],
    '/download': ['下载 Iterlay — macOS 与 Windows 安装包', '按操作系统和处理器下载 Iterlay 免费开源桌面版，核对 GitHub Releases 安装包、版本记录与原始更新说明。'],
    '/wiki': ['Iterlay 功能库 — 图片、视频与创作工作流', '浏览 Iterlay 十类创作功能，了解图片编辑、模板、素材库、版本管理、视频、导出和 Coding Agent 的操作与能力边界。'],
    '/agents': ['Iterlay Coding Agent 集成 — Codex / Claude Code 的 CLI + Skill 工作流', '通过 CLI + Skill，让 Codex 或 Claude Code 使用 Iterlay 配置的模型生成、编辑、比较并导出图片；查看真实 FIELD 示例与交付步骤。'],
    '/tips': ['Iterlay 使用技巧 — 每天一个真实工作流', '从真实场景出发，分享 Iterlay、Coding Agent 和 $using-iterlay 的具体用法。新技巧先确认，再进入公开集合。'],
    '/help': ['Iterlay 配置与帮助 — 模型、保存和故障排查', '配置自己的模型服务商，了解官网示例、桌面画板和开发工作区的保存边界，排查 CLI、生成、导出与版本问题。'],
    '/guides': ['Iterlay 使用指南 — 从模型配置到素材交付', '阅读 Iterlay 模型配置、版本对比、Coding Agent 和 FIELD 案例教程，核对实际操作、模型费用和本地保存边界。'],
  },
  en: {
    '/': ['Iterlay — Images, videos, and creative workflows. One canvas.', 'A free, open-source AI creative app for macOS and Windows. Generate and edit images, create videos, and keep references, versions and finished assets on one canvas. Choose your models; provider fees apply.'],
    '/download': ['Download Iterlay — macOS and Windows installers', 'Download the free, open-source Iterlay desktop app for your OS and processor. Check installers, release history and original GitHub release notes.'],
    '/wiki': ['Iterlay features — Images, videos and creative workflows', 'Explore ten creative tool categories, including image editing, templates, assets, versions, video, export and coding agents, with instructions and limits.'],
    '/agents': ['Iterlay Coding Agent integration — CLI + Skill for Codex & Claude Code', 'Use CLI + Skill with Codex or Claude Code to generate, edit, compare and export images using your configured providers. Inspect the real FIELD example and delivery workflow.'],
    '/tips': ['Iterlay practical tips — one real workflow at a time', 'Plain-language Iterlay, coding agent and $using-iterlay workflows from real situations. New tips are reviewed before they join the public collection.'],
    '/help': ['Iterlay setup & help — Models, saving and troubleshooting', 'Configure a model provider, understand website and desktop storage boundaries, and troubleshoot CLI connections, generation, exports and release versions.'],
    '/guides': ['Iterlay guides — From model setup to asset delivery', 'Follow practical model setup, version comparison, coding agent and FIELD case guides. Understand provider charges, real operations and local storage limits.'],
  },
} as const
export function publicPaths(language: SiteLanguage) {
  return [...Object.keys(summaries[language]), ...articles(language).map(a => a.path)].map(p => sitePath(p, language))
}
export function pageMeta(pathname: string) {
  const language = siteLanguage(pathname)
  const path = contentPath(pathname)
  const article = articles(language).find(a => a.path === path)
  const info = summaries[language][path as keyof typeof summaries.zh]
  const found = Boolean(article || info)
  const title = article ? `${article.title}${article.title.endsWith('Iterlay') ? '' : ' | Iterlay'}` : info?.[0] || (language === 'en' ? 'Page not found | Iterlay' : '页面未找到 | Iterlay')
  const description = article?.description || info?.[1] || (language === 'en' ? 'The requested page could not be found.' : '请求的页面不存在。')
  const canonical = absoluteUrl(sitePath(path, language))
  const agentContent = isAgentContent(path)
  const image = absoluteUrl(agentContent ? '/agent-field-site.webp' : '/examples/field/site/assets/field-studio.webp')
  const imageAlt = agentContent ? language === 'en' ? 'FIELD website assets delivered through the Iterlay coding agent workflow' : '通过 Iterlay Coding Agent 工作流交付的 FIELD 网站素材' : language === 'en' ? 'FIELD product image created for editing and version comparison in Iterlay' : '用于 Iterlay 图片编辑与版本对比的 FIELD 产品图'
  const alternates = ['en', 'zh', 'x-default'].map(lang => ({ lang: lang === 'zh' ? 'zh-CN' : lang, href: absoluteUrl(sitePath(path, lang === 'en' ? 'en' : 'zh')) }))
  const siteId = absoluteUrl('/#website')
  const softwareId = absoluteUrl('/#software')
  const integrationId = absoluteUrl('/#agent-integration')
  const graph: Record<string, unknown>[] = [
    { '@type': 'WebSite', '@id': siteId, name: 'Iterlay', url: absoluteUrl('/'), inLanguage: ['en', 'zh-CN'] },
    { '@type': article ? 'TechArticle' : 'WebPage', '@id': `${canonical}#page`, url: canonical, name: title, ...(article ? { headline: article.title, citation: `${repository}/blob/main/${article.source}` } : {}), description, about: { '@id': agentContent ? integrationId : softwareId }, audience: { '@type': 'Audience', audienceType: agentContent ? 'Developers using coding agents' : 'Visual creators' }, inLanguage: language === 'en' ? 'en' : 'zh-CN', isPartOf: { '@id': siteId } },
  ]
  if (agentContent) graph.push({ '@type': 'SoftwareSourceCode', '@id': integrationId, name: 'Iterlay CLI + Skill', description: language === 'en' ? 'Optional CLI and Skill integration connecting external coding agents to the Iterlay desktop app and its configured providers.' : '通过 CLI 与 Skill 将外部 Coding Agent 连接到 Iterlay 桌面 App 和已配置服务商的可选集成。', codeRepository: `${repository}/tree/main/cli`, programmingLanguage: 'TypeScript', isPartOf: { '@id': softwareId } })
  if (path === '/') graph.push({ '@type': 'SoftwareApplication', '@id': absoluteUrl('/#software'), name: 'Iterlay', url: absoluteUrl('/'), description, applicationCategory: 'MultimediaApplication', operatingSystem: 'macOS, Windows', license: `${repository}/blob/main/LICENSE`, isAccessibleForFree: true, downloadUrl: absoluteUrl(sitePath('/download', language)), sameAs: [repository] })
  if (path !== '/' && found) graph.push({ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Iterlay', item: absoluteUrl(sitePath('/', language)) },
    ...(article ? [{ '@type': 'ListItem', position: 2, name: language === 'en' ? 'Guides' : '使用指南', item: absoluteUrl(sitePath('/guides', language)) }] : []),
    { '@type': 'ListItem', position: article ? 3 : 2, name: article?.title || title, item: canonical },
  ] })
  return { language, title, description, canonical, image, imageAlt, alternates, found, structured: { '@context': 'https://schema.org', '@graph': graph } }
}
export const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
export const jsonLd = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c')
export function metaHead(path: string) {
  const meta = pageMeta(path)
  const tags: [string, string, string][] = [
    ['name', 'description', meta.description], ['name', 'robots', meta.found ? 'index,follow,max-image-preview:large' : 'noindex,follow'],
    ['property', 'og:title', meta.title], ['property', 'og:description', meta.description], ['property', 'og:url', meta.canonical],
    ['property', 'og:type', meta.structured['@graph'].some(node => node['@type'] === 'TechArticle') ? 'article' : 'website'], ['property', 'og:site_name', 'Iterlay'],
    ['property', 'og:locale', meta.language === 'en' ? 'en_US' : 'zh_CN'], ['property', 'og:image', meta.image], ['property', 'og:image:alt', meta.imageAlt],
    ['name', 'twitter:card', 'summary_large_image'], ['name', 'twitter:title', meta.title], ['name', 'twitter:description', meta.description], ['name', 'twitter:image', meta.image],
  ]
  if (import.meta.env.VITE_GOOGLE_SITE_VERIFICATION) tags.push(['name', 'google-site-verification', import.meta.env.VITE_GOOGLE_SITE_VERIFICATION])
  if (import.meta.env.VITE_BING_SITE_VERIFICATION) tags.push(['name', 'msvalidate.01', import.meta.env.VITE_BING_SITE_VERIFICATION])
  return `<title>${escapeHtml(meta.title)}</title>\n${tags.map(([key, name, content]) => `<meta ${key}="${name}" content="${escapeHtml(content)}" data-seo>`).join('\n')}\n<link rel="canonical" href="${escapeHtml(meta.canonical)}" data-seo>\n${meta.found ? meta.alternates.map(a => `<link rel="alternate" hreflang="${a.lang}" href="${escapeHtml(a.href)}" data-seo>`).join('\n') : ''}\n<script type="application/ld+json" data-seo>${jsonLd(meta.structured)}</script>`
}
export function Seo() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.querySelectorAll('[data-seo]').forEach(node => node.remove())
    document.querySelector('meta[name="description"]')?.remove()
    document.title = pageMeta(pathname).title
    document.documentElement.lang = pageMeta(pathname).language === 'en' ? 'en' : 'zh-CN'
    const template = document.createElement('template')
    template.innerHTML = metaHead(pathname).replace(/<title>[\s\S]*?<\/title>/, '')
    document.head.append(template.content)
  }, [pathname])
  return null
}
