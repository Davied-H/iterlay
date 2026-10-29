import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Download, Grid2X2, LayoutPanelTop, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import InteractiveWorkbench from './InteractiveWorkbench'
import { demoCases as presetCases } from './demo-cases'
import { sitePath, useSiteLanguage } from './site-language'
import './landing-home.css'

const text = {
  zh: {
    headline: 'AI 助手帮你想清楚，创作画布帮你做出来。', subhead: '从一句话、一张参考图，开始一段可以继续的创作。', start: '开始体验', download: '下载 App', explore: '看看怎么用',
    assistant: 'AI 助手', assistantBody: '从模糊的想法开始，对话会帮你找到清晰的方向。', canvas: '创作画布', canvasBody: '参考、尝试和版本放在一起，每一步都能接着做。', delivery: '项目交付', deliveryBody: '把图片、视频和素材整理好，带回正在做的项目。',
    footer: '免费开源 · 本地工作区 · 自选模型服务',
  },
  en: {
    headline: 'Let the assistant clarify it. Let the canvas make it real.', subhead: 'Start with a sentence or a reference image, then keep creating.', start: 'Try the demo', download: 'Get the app', explore: 'See how it works',
    assistant: 'AI assistant', assistantBody: 'Start with a rough thought and find a direction through conversation.', canvas: 'Creative canvas', canvasBody: 'Keep references, attempts and versions together as you work.', delivery: 'Project delivery', deliveryBody: 'Organize images, video and assets, then bring them into your project.',
    footer: 'Free and open source · Local workspace · Bring your own models',
  },
} as const

const scenarios = [
  { id: 'assistant', image: 'home-assets/assistant-scene.png', icon: MessageCircle },
  { id: 'canvas', image: 'home-assets/canvas-scene.png', icon: LayoutPanelTop },
  { id: 'delivery', image: 'home-assets/delivery-scene.png', icon: Grid2X2 },
] as const

export default function HomePage() {
  const language = useSiteLanguage(); const t = text[language]
  const [activeCase, setActiveCase] = useState<number | null>(null); const returnPosition = useRef(0); const returnKey = useRef('hero'); const restoring = useRef(false)
  const startExperience = (index = 0, key = 'hero') => { returnPosition.current = window.scrollY; returnKey.current = key; setActiveCase(index) }
  const exitExperience = useCallback(() => { restoring.current = true; setActiveCase(null) }, [])
  useLayoutEffect(() => { if (activeCase !== null) window.scrollTo(0, 0); else if (restoring.current) { restoring.current = false; window.scrollTo(0, returnPosition.current); document.querySelector<HTMLElement>(`[data-experience-key="${returnKey.current}"]`)?.focus({ preventScroll: true }) } }, [activeCase])
  if (activeCase !== null) return <section className="immersive-experience play-session" id="experience" aria-labelledby="home-title"><h1 id="home-title" className="sr-only">{presetCases[activeCase].title} · Iterlay</h1><InteractiveWorkbench initialCase={activeCase} onExit={exitExperience} /></section>
  return <div className="landing-home">
    <section className="landing-hero" aria-labelledby="home-title"><div className="landing-hero-copy"><span className="landing-overline">ITERLAY / CREATIVE WORKSPACE</span><h1 id="home-title">{t.headline}</h1><p>{t.subhead}</p><div className="landing-actions"><button className="landing-primary" data-experience-key="hero" onClick={() => startExperience()}>{t.start}<ArrowRight size={16} /></button><Link className="landing-download" to={sitePath('/download', language)}><Download size={15} />{t.download}</Link></div></div><div className="landing-scenarios" aria-label={t.explore}>{scenarios.map(({ id, image, icon: Icon }) => { const title = t[id as 'assistant' | 'canvas' | 'delivery']; const body = t[`${id}Body` as 'assistantBody' | 'canvasBody' | 'deliveryBody']; return <article className="landing-scenario" key={id}><div className="landing-scenario-art"><img src={`${import.meta.env.BASE_URL}${image}`} alt="" loading="lazy" /><Icon size={18} /></div><h2>{title}</h2><p>{body}</p><ArrowUpRight size={17} /></article> })}</div></section>
    <section className="landing-close"><h2>{language === 'zh' ? '让下一步，变得清楚。' : 'Make the next step clear.'}</h2><Link className="landing-primary" to={sitePath('/download', language)}><Download size={16} />{t.download}</Link><span>{t.footer}</span></section>
  </div>
}
