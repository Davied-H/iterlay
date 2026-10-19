import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { createServer } from 'vite'
let vite, server, language
before(async () => {
  vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  server = await vite.ssrLoadModule('/src/entry-server.tsx')
  language = await vite.ssrLoadModule('/src/site-language.ts')
})
after(async () => { await vite?.close() })
test('localized routes preserve deep links and replace legacy language queries', () => {
  assert.equal(language.sitePath('/wiki?feature=templates&sub=create&lang=en', 'zh'), '/zh/wiki/?feature=templates&sub=create')
  assert.equal(language.sitePath('/en/guides/model-setup/?lang=en', 'zh'), '/zh/guides/model-setup/')
  assert.equal(language.siteLanguage('/zh/agents/', '?lang=en'), 'zh')
  assert.equal(language.siteLanguage('/agents', ''), 'en')
  assert.equal(language.sitePath('/help#saving', 'en'), '/en/help/#saving')
})
test('all public routes render body, local deployment links and consistent language without browser globals', async () => {
  for (const lang of ['zh', 'en']) for (const path of server.publicPaths(lang)) {
    const body = server.render(path)
    assert.match(body, /<h1[\s>]/, path)
    assert.ok(body.length > 1500, path)
    if (path.includes('/guides/model-setup/')) assert.ok(body.includes(lang === 'en' ? 'How to configure an image model' : '如何配置 Iterlay 图片模型'), path)
    assert.ok(!body.includes('href="/zh/') && !body.includes('href="/en/'), `SSR lost deployment base on ${path}`)
    const meta = server.pageMeta(path)
    assert.equal(meta.language, lang)
    assert.ok(meta.found)
    assert.ok(meta.canonical.endsWith(path))
  }
  for (const lang of ['zh', 'en']) for (const article of server.articles(lang)) await access(`../${article.source.split('#')[0]}`)
})
test('unknown guides do not redirect or masquerade as indexed content', () => {
  assert.equal(server.pageMeta('/en/guides/missing/').found, false)
  assert.match(server.metaHead('/en/guides/missing/'), /noindex,follow/)
  assert.match(server.render('/en/guides/missing/'), /Guide not found/)
  assert.match(server.render('/unknown/'), /页面未找到/)
  assert.equal(server.pageMeta('/unknown/').found, false)
})
test('structured data describes actual software and article evidence', () => {
  const home = server.pageMeta('/en/')
  const app = home.structured['@graph'].find(n => n['@type'] === 'SoftwareApplication')
  assert.equal(app.operatingSystem, 'macOS, Windows')
  assert.ok(!app.aggregateRating && !app.review, 'Do not invent ratings')
  const article = server.pageMeta('/zh/guides/field-case/').structured['@graph'].find(n => n['@type'] === 'TechArticle')
  assert.match(article.citation, /README.zh-CN.md$/)
})
test('desktop product and coding agent integration have separate search identities', () => {
  for (const lang of ['en', 'zh']) {
    const product = server.pageMeta(`/${lang}/`)
    const agent = server.pageMeta(`/${lang}/agents/`)
    assert.notEqual(product.image, agent.image, 'Product and developer integration must not share a generic preview')
    assert.doesNotMatch(product.description, /CLI|Skill|Coding Agent|coding agent/)
    assert.match(agent.title, /CLI \+ Skill/)
    const productPage = product.structured['@graph'].find(n => n['@type'] === 'WebPage')
    const agentPage = agent.structured['@graph'].find(n => n['@type'] === 'WebPage')
    assert.notDeepEqual(productPage.about, agentPage.about)
    const integration = agent.structured['@graph'].find(n => n['@type'] === 'SoftwareSourceCode')
    assert.deepEqual(integration.isPartOf, productPage.about, 'The integration belongs to the same desktop product')
    for (const path of ['/guides/coding-agent', '/guides/field-case', '/features/agent']) {
      const article = server.pageMeta(`/${lang}${path}/`).structured['@graph'].find(n => n['@type'] === 'TechArticle')
      assert.deepEqual(article.about, agentPage.about)
    }
  }
  const productBody = server.render('/en/')
  assert.match(productBody, /Explore the creative tools/)
  assert.match(productBody, /Working with a coding agent\?/)
  assert.match(server.render('/en/agents/'), /Set up CLI \+ Skill/)
})
