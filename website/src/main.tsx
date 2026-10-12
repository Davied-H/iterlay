import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import HomePage from './HomePage'
import DownloadPage from './DownloadPage'
import { repository } from './releases.mjs'
import './base.css'
import './public.css'
import './site.css'
function Site() {
  const location = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  return <div className="public-app">
    <a className="skip-link" href="#content">跳到正文</a>
    <header className="public-header"><div className="public-header-inner">
      <NavLink to="/" className="brand-link"><img width="30" height="30" src={`${import.meta.env.BASE_URL}iterlay-logo.png`} alt="" />Iterlay</NavLink>
      <nav className="public-nav" aria-label="主导航"><NavLink className="nav-link" to="/" end>产品</NavLink><NavLink className="nav-link" to="/download">下载</NavLink><a className="nav-link" href={repository}>GitHub</a></nav>
    </div></header>
    <main id="content" className="public-main"><Routes><Route path="/" element={<HomePage />} /><Route path="/download" element={<DownloadPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></main>
    <footer className="public-footer"><div className="public-footer-inner"><span>Iterlay · 开源 AI 创作工作台</span><div><a href={`${repository}/blob/main/LICENSE`}>MIT License</a><a href={`${repository}/issues`}>反馈问题</a><a href={`${repository}/releases`}>GitHub Releases</a></div></div></footer>
  </div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><Site /></HashRouter></React.StrictMode>)
