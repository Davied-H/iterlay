import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { ArrowUpRight } from 'lucide-react'
import HomePage from './HomePage'
import DownloadPage from './DownloadPage'
import FeatureWiki from './FeatureWiki'
import AgentPage from './AgentPage'
import TipsPage from './TipsPage'
import HelpPage from './HelpPage'
import LanguageSwitch from './LanguageSwitch'
import { contentPath, siteLanguage, sitePath } from './site-language'
import { repository } from './releases.mjs'
import ContentPage from './ContentPage'
import { Seo } from './seo'
import { Analytics } from './analytics'
import './base.css'
import './public.css'
import './site.css'
export default function Site() {
  const location = useLocation()
  const pathname = contentPath(location.pathname)
  const language = siteLanguage(location.pathname, location.search)
  const english = language === 'en'
  const content = useRef<HTMLElement>(null)
  const previousLanguage = useRef(language)
  useEffect(() => {
    if (previousLanguage.current === language) return
    previousLanguage.current = language
    if (typeof location.state?.languageScrollY === 'number') {
      // Settle the translated layout before restoring its viewport position.
      content.current?.getBoundingClientRect()
      window.scrollTo(0, location.state.languageScrollY)
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animation = content.current?.animate?.([{ opacity: .82 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.22, 1, .36, 1)' })
    return () => animation?.cancel()
  }, [language, location.state])
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return <div className="public-app">
    <Seo /><Analytics />
    <a className="skip-link" href="#content" onClick={event => { event.preventDefault(); document.getElementById('content')?.focus() }}>{english ? 'Skip to content' : '跳到正文'}</a>
    <header className="public-header"><div className="public-header-inner">
      <NavLink to={sitePath('/', language)} className="brand-link" end><img width="30" height="30" src={`${import.meta.env.BASE_URL}iterlay-logo.png`} alt="" />Iterlay</NavLink>
      <nav className="public-nav" aria-label={english ? 'Main navigation' : '主导航'}><NavLink className="nav-link" to={sitePath('/', language)} end>{english ? 'Product' : '产品'}</NavLink><NavLink className="nav-link nav-wiki" to={sitePath('/wiki', language)}>{english ? 'Features' : '功能 Wiki'}</NavLink><NavLink className="nav-link nav-tips" to={sitePath('/tips', language)}>{english ? 'Tips' : '使用技巧'}</NavLink><NavLink className="nav-link nav-agent" to={sitePath('/agents', language)}>Coding Agent</NavLink><a className="nav-link nav-github" href={repository}>GitHub <ArrowUpRight size={12} /></a><NavLink className="nav-link nav-download" to={sitePath('/download', language)}>{english ? 'Get the app' : '下载 App'} <ArrowUpRight size={13} /></NavLink></nav>
      <LanguageSwitch />
    </div></header>
    <main ref={content} id="content" tabIndex={-1} className="public-main">
      <Routes>
        {(['en', 'zh'] as const).flatMap(locale => [
          <Route key={`${locale}-home`} path={`/${locale}/`} element={<HomePage key={language} />} />,
          <Route key={`${locale}-download`} path={`/${locale}/download`} element={<DownloadPage />} />,
          <Route key={`${locale}-wiki`} path={`/${locale}/wiki`} element={<FeatureWiki />} />,
          <Route key={`${locale}-agents`} path={`/${locale}/agents`} element={<AgentPage />} />,
          <Route key={`${locale}-tips`} path={`/${locale}/tips`} element={<TipsPage />} />,
          <Route key={`${locale}-help`} path={`/${locale}/help`} element={<HelpPage />} />,
          <Route key={`${locale}-guides`} path={`/${locale}/guides`} element={<ContentPage />} />,
          <Route key={`${locale}-feature`} path={`/${locale}/features/:slug`} element={<ContentPage />} />,
          <Route key={`${locale}-guide`} path={`/${locale}/guides/:slug`} element={<ContentPage />} />,
        ])}
        <Route path="*" element={<div className="help-page"><h1>{english ? 'Page not found' : '页面未找到'}</h1><NavLink to={sitePath('/', language)}>{english ? 'Back to product' : '返回产品首页'}</NavLink></div>} />
      </Routes>
    </main>
    <footer className="public-footer"><div className="public-footer-inner"><span>{english ? 'Iterlay · Images, videos, creative workflows' : 'Iterlay · 图片、视频与创作工作流'}</span><div><NavLink to={sitePath('/tips', language)}>{english ? 'Tips' : '使用技巧'}</NavLink><NavLink to={sitePath('/guides', language)}>{english ? 'Guides' : '使用指南'}</NavLink><NavLink to={sitePath('/help', language)}>{english ? 'Setup & help' : '配置与帮助'}</NavLink><a href={`${repository}/blob/main/LICENSE`}>MIT License</a><a href={`${repository}/issues`}>{english ? 'Report an issue' : '反馈问题'}</a><a href={`${repository}/releases`}>GitHub Releases</a></div></div></footer>
  </div>
}
