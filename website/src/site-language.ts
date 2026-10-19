import { useLocation } from 'react-router-dom'

export type SiteLanguage = 'en' | 'zh'

export function siteLanguage(pathname: string, search: string): SiteLanguage {
  const requested = new URLSearchParams(search).get('lang')
  return requested === 'en' || (pathname === '/agents' && requested !== 'zh') ? 'en' : 'zh'
}

export function sitePath(path: string, language: SiteLanguage): string {
  const [pathname, search = ''] = path.split('?')
  const params = new URLSearchParams(search)
  params.set('lang', language)
  return `${pathname}?${params}`
}

export function useSiteLanguage() {
  const { pathname, search } = useLocation()
  return siteLanguage(pathname, search)
}
