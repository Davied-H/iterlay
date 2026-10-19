import { useLocation } from 'react-router-dom'

export type SiteLanguage = 'en' | 'zh'
export const languagePreferenceKey = 'iterlay.site-language'

export function preferredSiteLanguage(languages: readonly string[], saved?: string | null): SiteLanguage {
  if (saved === 'zh' || saved === 'en') return saved
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return 'zh'
    if (/^en(?:-|$)/i.test(language)) return 'en'
  }
  return 'en'
}

// Explicit locale links and unknown URLs retain their identity (including 404s).
export function initialSitePath(path: string, search: string, hash: string, languages: readonly string[], saved?: string | null): string {
  const url = new URL(hash.startsWith('#/') ? hash.slice(1) : `${path}${search}${hash}`, 'https://local.invalid')
  if (/^\/(en|zh)(\/|$)/.test(url.pathname)) return `${url.pathname}${url.search}${url.hash}`
  if (!/^\/(?:$|(?:download|wiki|help|agents|guides)\/?$|(?:guides|features)\/[^/]+\/?$)/.test(url.pathname)) return `${url.pathname}${url.search}${url.hash}`
  const requested = url.searchParams.get('lang')
  const language = requested === 'zh' || requested === 'en' ? requested : preferredSiteLanguage(languages, saved)
  return sitePath(`${url.pathname}${url.search}${url.hash}`, language)
}
export function siteLanguage(pathname: string, search = ''): SiteLanguage {
  const prefix = pathname.match(/^\/(en|zh)(?:\/|$)/)?.[1]
  if (prefix) return prefix as SiteLanguage
  const requested = new URLSearchParams(search).get('lang')
  return requested === 'en' || (pathname === '/agents' && requested !== 'zh') ? 'en' : 'zh'
}
export function contentPath(pathname: string) {
  return pathname.replace(/^\/(en|zh)(?=\/|$)/, '').replace(/\/$/, '') || '/'
}
export function sitePath(path: string, language: SiteLanguage): string {
  const url = new URL(path, 'https://local.invalid')
  url.searchParams.delete('lang')
  const pathname = contentPath(url.pathname)
  return `/${language}${pathname === '/' ? '/' : `${pathname}/`}${url.search}${url.hash}`
}
export function publicHref(path: string, language: SiteLanguage) {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}${sitePath(path, language)}`
}
export function useSiteLanguage() {
  const { pathname, search } = useLocation()
  return siteLanguage(pathname, search)
}
