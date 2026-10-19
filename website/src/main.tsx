import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { ArrowUpRight } from 'lucide-react'
import HomePage from './HomePage'
import DownloadPage from './DownloadPage'
import FeatureWiki from './FeatureWiki'
import AgentPage from './AgentPage'
import EnglishHomePage from './EnglishHomePage'
import HelpPage from './HelpPage'
import { siteLanguage, sitePath } from './site-language'
import { repository } from './releases.mjs'
import './base.css'
import './public.css'
import './site.css'
function Site() {
  const location = useLocation()
  const isAgentPage = location.pathname === '/agents'
  const language = siteLanguage(location.pathname, location.search)
  const english = language === 'en'
  const paramsForOtherLanguage = new URLSearchParams(location.search)
  paramsForOtherLanguage.set('lang', english ? 'zh' : 'en')
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  useEffect(() => {
    document.documentElement.lang = english ? 'en' : 'zh-CN'
    document.title = isAgentPage ? english ? 'Iterlay — A canvas for your coding agent' : 'Iterlay — 给 Coding Agent 一张创作画布' : english ? 'Iterlay — Open-source visual workspace' : 'Iterlay — 开源 AI 创作工作台'
    document.querySelector('meta[name="description"]')?.setAttribute('content', isAgentPage ? english ? 'Create, refine, compare and export project images with Codex or Claude Code. Explore a real FIELD case and connect your own models in Iterlay.' : '让 Codex、Claude Code 生成、修改、比较并交付项目素材。查看真实 FIELD 案例，连接你在 Iterlay 中配置的模型。' : english ? 'Generate, edit, compare and export images on a local visual workspace, using your own model providers.' : 'Iterlay 开源 AI 创作工作台：无限画板、图片编辑与版本管理。')
  }, [english, isAgentPage])
  return <div className={`public-app ${location.pathname === '/' && !english ? 'is-immersive' : ''} ${isAgentPage ? 'is-agent-page' : ''}`}>
    <a className="skip-link" href="#content" onClick={event => { event.preventDefault(); document.getElementById('content')?.focus() }}>{english ? 'Skip to content' : '跳到正文'}</a>
    <header className="public-header"><div className="public-header-inner">
      <NavLink to={sitePath('/', language)} className="brand-link"><img width="30" height="30" src={`${import.meta.env.BASE_URL}iterlay-logo.png`} alt="" />Iterlay</NavLink>
      <nav className="public-nav" aria-label={english ? 'Main navigation' : '主导航'}><NavLink className="nav-link" to={sitePath('/', language)} end>{english ? 'Product' : '产品'}</NavLink><NavLink className="nav-link nav-wiki" to={sitePath('/wiki', language)}>{english ? 'Features' : '功能 Wiki'}</NavLink><NavLink className="nav-link nav-agent" to={sitePath('/agents', language)}>Coding Agent</NavLink><a className="nav-link nav-github" href={repository}>GitHub <ArrowUpRight size={12} /></a><NavLink className="nav-link nav-download" to={sitePath('/download', language)}>{english ? 'Get the app' : '下载 App'} <ArrowUpRight size={13} /></NavLink></nav>
    </div></header>
    <main id="content" tabIndex={-1} className="public-main"><Routes><Route path="/" element={english ? <EnglishHomePage /> : <HomePage />} /><Route path="/download" element={<DownloadPage />} /><Route path="/wiki" element={<FeatureWiki />} /><Route path="/agents" element={<AgentPage />} /><Route path="/help" element={<HelpPage />} /><Route path="*" element={<Navigate to={sitePath('/', language)} replace />} /></Routes></main>
    <footer className="public-footer"><div className="public-footer-inner"><span>{english ? 'Iterlay · Open-source visual workspace' : 'Iterlay · 开源 AI 创作工作台'}</span><div><NavLink to={sitePath('/help', language)}>{english ? 'Setup & help' : '配置与帮助'}</NavLink><a href={`${repository}/blob/main/LICENSE`}>MIT License</a><a href={`${repository}/issues`}>{english ? 'Report an issue' : '反馈问题'}</a><a href={`${repository}/releases`}>GitHub Releases</a><NavLink className="site-language-link" lang={english ? 'zh-CN' : 'en'} to={`${location.pathname}?${paramsForOtherLanguage}`}>{english ? '中文' : 'English'}</NavLink></div></div></footer>
  </div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><Site /></HashRouter></React.StrictMode>)
