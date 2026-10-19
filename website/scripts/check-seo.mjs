import assert from 'node:assert/strict'
import { URL } from 'node:url'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('dist')
const sitemap = await readFile(`${root}/sitemap.xml`, 'utf8')
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].replaceAll('&amp;', '&'))
assert.equal(urls.length, 40, 'Expected 20 pages in each language; update deliberately when adding routes')
assert.equal(new Set(urls).size, urls.length, 'Duplicate sitemap URLs')
const first = new URL(urls[0])
const base = first.pathname.replace(/zh\/$/, '')
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
const pages = new Set(urls.map(url => new URL(url).pathname))
const titles = new Set()
let internalLinks = 0
for (const address of urls) {
  const url = new URL(address)
  const html = await readFile(resolve(root, `.${url.pathname.slice(base.length - 1)}index.html`), 'utf8')
  const title = html.match(/<title>(.*?)<\/title>/)?.[1]
  assert.ok(title && !titles.has(title), `${address}: missing or duplicate title`)
  titles.add(title)
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${address}: expected one visible page heading`)
  assert.ok(html.includes(`<link rel="canonical" href="${address}"`), `${address}: canonical mismatch`)
  assert.ok(!html.includes('content="noindex'), `${address}: unexpectedly noindex`)
  assert.ok(html.includes(`lang="${url.pathname.includes('/en/') ? 'en' : 'zh-CN'}"`), `${address}: language mismatch`)
  for (const lang of ['en', 'zh-CN', 'x-default']) assert.ok(html.includes(`hreflang="${lang}"`), `${address}: missing ${lang} alternate`)
  for (const marker of ['name="description"', 'property="og:image"', 'property="og:title"', 'name="twitter:card"']) assert.ok(html.includes(marker), `${address}: missing ${marker}`)
  const json = html.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/s)?.[1]
  const graph = JSON.parse(json)['@graph']
  assert.ok(graph.some(node => ['WebPage', 'TechArticle'].includes(node['@type'])))
  assert.ok(html.match(/<main[^>]*>[\s\S]{300,}<\/main>/), `${address}: missing prerendered body`)
  for (const match of html.matchAll(/<(?:a|img|script|link)\b[^>]*?\b(href|src)="([^"]+)"[^>]*>/g)) {
    const target = decode(match[2])
    if (/^(?:mailto:|data:|javascript:|#)/.test(target)) continue
    const link = new URL(target, address)
    if (link.origin !== url.origin) continue
    assert.ok(!target.startsWith('#/'), `${address}: old hash link`)
    assert.ok(link.pathname.startsWith(base), `${address}: escaped deployment base: ${target}`)
    if (pages.has(link.pathname)) { internalLinks++; continue }
    const local = resolve(root, `.${link.pathname.slice(base.length - 1)}`)
    const exists = await stat(local).then(s => s.isDirectory() ? stat(`${local}/index.html`).then(() => true) : true).catch(() => false)
    assert.ok(exists, `${address}: broken local link or asset ${target}`)
  }
}
const missing = await readFile(`${root}/404.html`, 'utf8')
assert.ok(missing.includes('content="noindex,follow"'), '404 must not be indexed')
const home = await readFile(`${root}/index.html`, 'utf8')
assert.ok(home.includes(`<link rel="canonical" href="${first.origin}${base}zh/"`), 'Root canonical must match Chinese landing page')
for (const name of ['robots.txt', 'llms.txt']) assert.ok((await readFile(`${root}/${name}`, 'utf8')).includes(first.origin), `${name}: missing deployment origin`)
async function files(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(d => d.isDirectory() ? files(`${dir}/${d.name}`) : `${dir}/${d.name}`))).flat() }
for (const file of await files(`${root}/assets`)) if (file.endsWith('.js')) assert.ok(!(await readFile(file, 'utf8')).includes('localhost:5180'), 'Development URL leaked')
console.log(`SEO checks passed: ${urls.length} HTML pages, unique titles, metadata, structured data, language alternates, ${internalLinks} internal links, assets, sitemap and noindex 404.`)
