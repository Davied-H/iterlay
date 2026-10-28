export const repository = 'https://github.com/Davied-H/iterlay'
export const releasesUrl = `${repository}/releases`
// Preserve published text. Link only references that actually appear in the notes.
export function releaseNoteParts(body) {
  /** @type {Array<{text?: string, href?: string, image?: boolean, alt?: string, src?: string}>} */
  const parts = []
  let offset = 0
  for (const match of body.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)|https:\/\/github\.com\/[\w./#?=&%+-]+|(?<![\w/.-])#\d+\b/g)) {
    if (match.index > offset) parts.push({ text: body.slice(offset, match.index) })
    if (match[0].startsWith('![')) {
      parts.push({ image: true, alt: match[1], src: match[2] })
      offset = match.index + match[0].length
      continue
    }
    const text = match[0].replace(/[.,]+$/, '')
    parts.push({ text, href: text.startsWith('#') ? `${repository}/issues/${text.slice(1)}` : text })
    offset = match.index + text.length
  }
  if (offset < body.length) parts.push({ text: body.slice(offset) })
  return parts
}
export function installerVariant(name) {
  if (/\.dmg$/i.test(name)) {
    if (/arm64|aarch64/i.test(name)) return 'darwin-arm64'
    if (/x64|x86_64|intel/i.test(name)) return 'darwin-x64'
  }
  if (/\.exe$/i.test(name)) {
    if (/-arm64\.exe$/i.test(name)) return 'win32-arm64'
    if (!/arm64|ia32/i.test(name)) return 'win32-x64'
  }
  return null
}
export function releaseInstallers(releases, variant) {
  return releases.filter(r => !r.draft).flatMap(release => {
    const asset = release.assets.find(a => installerVariant(a.name) === variant)
    return asset ? [{ release, asset }] : []
  })
}
export async function loadReleases(signal) {
  const all = []
  for (let page = 1; page <= 5; page++) {
    const response = await fetch(`https://api.github.com/repos/Davied-H/iterlay/releases?per_page=100&page=${page}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new Error('暂时无法读取 GitHub 版本列表，请重试或直接打开 GitHub Releases。')
    const batch = await response.json()
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
}
