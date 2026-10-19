import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

type Plausible = (event: string, options?: { u?: string; props?: Record<string, string> }) => void
const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN
export function Analytics() {
  const location = useLocation()
  useEffect(() => {
    if (!domain) return
    const host = window as Window & { plausible?: Plausible & { q?: unknown[][] } }
    if (!host.plausible) {
      const queued = ((...args: unknown[]) => { queued.q.push(args) }) as Plausible & { q: unknown[][] }
      queued.q = []
      host.plausible = queued
      const script = document.createElement('script')
      script.defer = true
      script.src = 'https://plausible.io/js/script.manual.js'
      script.dataset.domain = domain
      document.head.append(script)
    }
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      const url = new URL(anchor.href)
      const installer = url.hostname === 'github.com' && url.pathname.includes('/releases/download/') && /\.(dmg|exe|zip)$/i.test(url.pathname)
      const downloadPage = url.origin === window.location.origin && /\/(en|zh)\/download\/$/.test(url.pathname)
      const example = url.origin === window.location.origin && /\/examples\/field\/.*\.(itb|zip)$/.test(url.pathname)
      if (installer || downloadPage || example) host.plausible?.(installer ? 'InstallerClick' : example ? 'ExampleDownload' : 'DownloadPageClick', { props: { path: window.location.pathname, target: `${url.origin}${url.pathname}` } })
    }
    document.addEventListener('click', click)
    return () => document.removeEventListener('click', click)
  }, [])
  useEffect(() => {
    if (!domain) return
    // Do not send query strings, prompt text, credentials or local workspace data.
    const host = window as Window & { plausible?: Plausible }
    host.plausible?.('pageview', { u: `${window.location.origin}${window.location.pathname}` })
  }, [location.pathname])
  return null
}
