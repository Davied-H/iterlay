import React from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import Site from './main'
import { initialSitePath, languagePreferenceKey } from './site-language'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
// Detect language only for unlocalized entries; preserve explicit shared links.
let savedLanguage: string | null = null
try { savedLanguage = localStorage.getItem(languagePreferenceKey) } catch { /* Storage can be blocked. */ }
const path = window.location.pathname.slice(base.length) || '/'
const initial = initialSitePath(path, location.search, location.hash, navigator.languages?.length ? navigator.languages : [navigator.language], savedLanguage)
if (`${path}${location.search}${location.hash}` !== initial) window.history.replaceState(null, '', `${base}${initial}`)
const root = document.getElementById('root')!
const app = <React.StrictMode><BrowserRouter basename={base || '/'}><Site /></BrowserRouter></React.StrictMode>
// A legacy hash may select a different page than the HTML originally served.
if (root.dataset.path === window.location.pathname.slice(base.length)) hydrateRoot(root, app)
else createRoot(root).render(app)
