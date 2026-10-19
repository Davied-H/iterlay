import React from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import Site from './main'
import { siteLanguage, sitePath } from './site-language'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
// Keep published hash URLs, query deep links and old QR codes working.
if (window.location.hash.startsWith('#/')) {
  const old = new URL(window.location.hash.slice(1), window.location.origin)
  const language = siteLanguage(old.pathname, old.search)
  window.history.replaceState(null, '', `${base}${sitePath(`${old.pathname}${old.search}`, language)}`)
} else {
  const path = window.location.pathname.slice(base.length) || '/'
  if (!/^\/(en|zh)(\/|$)/.test(path) && ['/', '/download', '/wiki', '/help', '/agents'].includes(path.replace(/\/$/, '') || '/')) {
    window.history.replaceState(null, '', `${base}${sitePath(`${path}${window.location.search}${window.location.hash}`, siteLanguage(path, window.location.search))}`)
  }
}
const root = document.getElementById('root')!
const app = <React.StrictMode><BrowserRouter basename={base || '/'}><Site /></BrowserRouter></React.StrictMode>
// A legacy hash may select a different page than the HTML originally served.
if (root.dataset.path === window.location.pathname.slice(base.length)) hydrateRoot(root, app)
else createRoot(root).render(app)
