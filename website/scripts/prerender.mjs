import { createServer } from 'vite'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { render, metaHead, pageMeta, publicPaths, absoluteUrl, articles, isAgentContent } = await vite.ssrLoadModule('/src/entry-server.tsx')
  const template = (await readFile('dist/index.html', 'utf8')).replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta name="description"[^>]*>/, '')
  const paths = ['/', ...publicPaths('zh'), ...publicPaths('en'), '/404.html']
  for (const path of paths) {
    const actual = path === '/' ? '/zh/' : path
    const meta = pageMeta(actual)
    const html = template.replace('lang="zh-CN"', `lang="${meta.language === 'en' ? 'en' : 'zh-CN'}"`)
      .replace('</head>', `${metaHead(actual)}\n</head>`)
      .replace('<div id="root"></div>', `<div id="root" data-path="${actual}">${render(actual)}</div>`)
    const output = resolve('dist', path === '/404.html' ? '404.html' : `.${path}index.html`)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, html)
  }
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  const canonicalPaths = [...publicPaths('zh'), ...publicPaths('en')]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${canonicalPaths.map(path => `<url><loc>${escape(absoluteUrl(path))}</loc>${pageMeta(path).alternates.map(a => `<xhtml:link rel="alternate" hreflang="${a.lang}" href="${escape(a.href)}"/>`).join('')}</url>`).join('\n')}\n</urlset>\n`
  await writeFile('dist/sitemap.xml', sitemap)
  await writeFile('dist/robots.txt', `# Effective only when served at the host root /robots.txt.\n# Search crawling is allowed. This file does not grant content licenses.\nUser-agent: *\nAllow: /\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`)
  const llms = `# Iterlay\n\n> Images, videos, and creative workflows. One canvas. Iterlay is a free, MIT-licensed AI creative app for macOS and Windows. Generate and edit images, create videos, and organize references, versions and finished assets in one workspace. Choose your own model providers.\n\nCreative workflows connect image creation and editing, video generation, templates, version comparison, asset organization and export. This does not imply a general-purpose node editor or a fully automated pipeline. Video capabilities depend on the selected model. Boards and assets are local. Generation sends prompts and required reference media to the selected provider. Provider fees apply. Website examples are prepared results and do not call models or save desktop boards.\n\n## Product and source\n- [Product](${absoluteUrl('/en/')})\n- [Download and published releases](${absoluteUrl('/en/download/')})\n- [Practical tips](${absoluteUrl('/en/tips/')})\n- [Setup and storage boundaries](${absoluteUrl('/en/help/')})\n- [Source](https://github.com/Davied-H/iterlay)\n\n## Desktop product guides and features\n${articles('en').filter(a => !isAgentContent(a.path)).map(a => `- [${a.title}](${absoluteUrl(`/en${a.path}/`)}): ${a.description}`).join('\n')}\n\n## Coding Agent integration (CLI + Skill)\nThis is an optional developer integration with the same Iterlay desktop app, not a separate coding agent product. External agents use the app-configured providers and export files into code projects.\n- [Integration overview](${absoluteUrl('/en/agents/')})\n${articles('en').filter(a => isAgentContent(a.path)).map(a => `- [${a.title}](${absoluteUrl(`/en${a.path}/`)}): ${a.description}`).join('\n')}\n\n## 中文\n- [中文产品页](${absoluteUrl('/zh/')})\n- [中文使用指南](${absoluteUrl('/zh/guides/')})\n\nThis optional index is for discovery. It does not guarantee search inclusion or AI citation. Do not infer that main-branch changes are present in a published installer.\n`
  await writeFile('dist/llms.txt', llms)
  await writeFile('dist/.nojekyll', '')
  console.log(`Prerendered ${canonicalPaths.length} canonical pages, root and 404; generated sitemap.xml, robots.txt and llms.txt.`)
} finally {
  await vite.close()
}
