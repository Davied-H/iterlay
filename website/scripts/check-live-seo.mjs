// Read-only post-deploy audit; never submits URLs or creates external accounts.
import { writeFile, mkdir } from 'node:fs/promises'
import { URL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
const site = new URL(process.env.SEO_SITE_URL || 'https://davied-h.github.io/iterlay/')
if (!site.pathname.endsWith('/')) site.pathname += '/'
const report = { checkedAt: new Date().toISOString(), site: site.href, pages: [], issues: [], hostRobots: null, missingStatus: null, llmsStatus: null, note: 'A technical crawl check does not prove search index inclusion or AI citation. Inspect host robots directives and Search Console/Bing reports separately.' }
async function fetchText(url, expectPublished = true) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Iterlay-SEO-Audit/1.0' } })
      const result = { status: response.status, url: response.url, headers: Object.fromEntries(response.headers), text: await response.text() }
      if (!expectPublished || response.status === 200 || attempt === 2) return result
    } catch (error) { if (attempt === 2) throw error }
    await delay(2000)
  }
}
try {
  const robotsUrl = new URL('/robots.txt', site)
  const robots = await fetchText(robotsUrl, false)
  report.hostRobots = { url: robotsUrl.href, status: robots.status, body: robots.status === 200 ? robots.text : null }
  const sitemap = await fetchText(new URL('sitemap.xml', site))
  if (sitemap.status !== 200) throw new Error(`Sitemap returned ${sitemap.status}; deploy the built website first`)
  const urls = [...sitemap.text.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].replaceAll('&amp;', '&'))
  if (urls.length !== 40 || new Set(urls).size !== urls.length) report.issues.push(`Expected 40 unique sitemap URLs; got ${urls.length}`)
  for (const address of urls) {
    if (!address.startsWith(site.href)) { report.issues.push(`Sitemap URL outside configured site: ${address}`); continue }
    const page = await fetchText(address)
    const canonical = page.text.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
    const ok = page.status === 200 && canonical === address && /<h1[\s>]/.test(page.text) && !/content="noindex/.test(page.text) && !/noindex/i.test(page.headers['x-robots-tag'] || '')
    report.pages.push({ url: address, status: page.status, canonical, ok })
    if (!ok) report.issues.push(`HTML/status/canonical/indexing failure: ${address}`)
  }
  const missing = await fetchText(new URL('en/this-page-does-not-exist/', site), false)
  report.missingStatus = missing.status
  if (missing.status !== 404) report.issues.push(`Unknown URL should return HTTP 404; got ${missing.status}`)
  const llms = await fetchText(new URL('llms.txt', site))
  report.llmsStatus = llms.status
  if (llms.status !== 200) report.issues.push('Missing llms.txt')
} catch (error) { report.issues.push(error.message) }
await mkdir('output/seo', { recursive: true })
await writeFile('output/seo/live-audit.json', JSON.stringify(report, null, 2) + '\n')
console.log(`${report.pages.length} pages checked; ${report.issues.length} issues. Host /robots.txt: HTTP ${report.hostRobots?.status ?? 'unavailable'}. Report: output/seo/live-audit.json`)
report.issues.forEach(issue => console.error(issue))
if (report.issues.length) process.exitCode = 1
