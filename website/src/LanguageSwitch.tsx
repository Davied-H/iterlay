import { useLocation, useNavigate } from 'react-router-dom'
import { languagePreferenceKey, sitePath, useSiteLanguage } from './site-language'

export default function LanguageSwitch() {
  const language = useSiteLanguage()
  const english = language === 'en'
  const location = useLocation()
  const navigate = useNavigate()
  const toggle = () => {
    const next = english ? 'zh' : 'en'
    try { localStorage.setItem(languagePreferenceKey, next) } catch { /* Switching also works without storage. */ }
    navigate(sitePath(`${location.pathname}${location.search}${location.hash}`, next))
  }
  return <nav className="site-language" aria-label="Language / 语言">
    <button className="language-switch" type="button" role="switch" aria-checked={english} aria-label={english ? 'English language' : '使用英文'} aria-describedby="language-switch-description" title={english ? 'Switch to Chinese' : '切换为英文'} onClick={toggle}>
      <span className="language-switch-label language-switch-zh" lang="zh-CN" aria-hidden="true">中</span>
      <span className="language-switch-track" aria-hidden="true"><span className="language-switch-thumb" /></span>
      <span className="language-switch-label language-switch-en" lang="en" aria-hidden="true">EN</span>
    </button>
    <span id="language-switch-description" className="sr-only">{english ? 'Current language: English. Switch off for Chinese.' : '当前语言：中文。打开开关切换为英文。'}</span>
  </nav>
}
