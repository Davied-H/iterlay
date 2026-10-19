import { useLocation } from 'react-router-dom'

export type SiteLanguage = 'en' | 'zh'
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
