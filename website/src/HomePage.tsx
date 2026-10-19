import { localizeCreative, translateCreative } from './creative-copy'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Download, Pause, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import InteractiveWorkbench from './InteractiveWorkbench'
import { demoCases as presetCases, galleryAsset } from './demo-cases'
import './home-gallery.css'
import FeaturePreview from './FeaturePreview'
import { sitePath, useSiteLanguage } from './site-language'
import { useTour } from './useTour'
import './agent-page.css'

const presetScenes = [
  { id:'poster', label:'图片创作', description:'生成图片、修改细节，再用图片制作视频。\n参考、版本和成品放在一起，从想法接着做到成品。', caseIndex:0, feature:'images' },
  { id:'video', label:'视频创作', description:'用文字生成视频，或让已有图片动起来。\n查看任务、播放结果，再导出生成的视频。', preview:'video', feature:'video' },
  { id:'campaign', label:'产品广告', description:'从干净棚拍，到赭红沙丘。\n保留材质细节，继续探索新的广告表达。', caseIndex:1, feature:'images' },
  { id:'assistant', label:'AI 助手', description:'带着图片与助手讨论主体、场景和风格。\n把想改的地方说清楚，再继续下一版。', preview:'assistant', feature:'assistant' },
  { id:'templates', label:'模板复用', description:'保存提示词和视觉规则，复用满意的表达。\n从模板开始，也能继续调整成自己的版本。', preview:'templates', feature:'templates' },
  { id:'assets', label:'素材整理', description:'图片、视频和历史尝试，集中到素材库。\n搜索、筛选、收藏，把内容带回新的画板。', preview:'assets', feature:'assets' },
] as const

export default function HomePage() {
  const language = useSiteLanguage()
  const t = (text: string) => translateCreative(text, language)
  const demoCases = localizeCreative(presetCases, language)
  const heroScenes = localizeCreative(presetScenes, language)
  const [activeCase, setActiveCase] = useState<number | null>(null)
  const tour = useTour(heroScenes.length, 6500, activeCase === null)
  const scene = heroScenes[tour.index]
  const heroCase = 'caseIndex' in scene ? demoCases[scene.caseIndex] : null
  const returnPosition = useRef(0)
  const returnKey = useRef('hero')
  const restoring = useRef(false)
  const startExperience = (index: number, key: string) => {
    returnPosition.current = window.scrollY
    returnKey.current = key
    setActiveCase(index)
  }
  const exitExperience = useCallback(() => {
    restoring.current = true
    setActiveCase(null)
  }, [])
  useLayoutEffect(() => {
    if (activeCase !== null) window.scrollTo(0, 0)
    else if (restoring.current) {
      restoring.current = false
      window.scrollTo(0, returnPosition.current)
      document.querySelector<HTMLElement>(`[data-experience-key="${returnKey.current}"]`)?.focus({ preventScroll: true })
    }
  }, [activeCase])
  const showCases = () => document.getElementById('creative-cases')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })

  if (activeCase !== null) return <section className="immersive-experience play-session" id="experience" aria-labelledby="home-title"><h1 id="home-title" className="sr-only">{demoCases[activeCase].title}{t("· Iterlay 产品体验")}</h1><InteractiveWorkbench initialCase={activeCase} onExit={exitExperience} /></section>

  return <div className={`showcase-home ${language === 'en' ? 'is-english' : ''}`}>
    <section className="showcase-hero" aria-labelledby="home-title">
      <div className="showcase-hero-inner" onMouseEnter={() => tour.setHeld(true)} onMouseLeave={() => tour.setHeld(false)} onFocusCapture={() => tour.setHeld(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) tour.setHeld(false) }}>
        <div className="showcase-hero-copy"><div className="showcase-scene-copy" key={scene.id}><h1 id="home-title">{t("图片、视频与创作工作流，")}<br /><span>{t("一张画布串起来。")}</span></h1><p>{scene.description}</p></div><div className="showcase-actions">{'caseIndex' in scene ? <button className="showcase-primary" data-experience-key="hero" onClick={() => startExperience(scene.caseIndex, 'hero')}>{t("开始体验")}<ArrowRight size={16} /></button> : <Link className="showcase-primary" data-experience-key="hero" to={sitePath(`/wiki?feature=${scene.feature}`, language)}>{t("了解")}{scene.label}<ArrowRight size={16} /></Link>}<Link className="showcase-download" to={sitePath('/download', language)}><Download size={15} />{t("下载桌面版")}</Link></div></div>
        <div className="showcase-scene-visual" key={scene.id}>{heroCase ? <figure className="showcase-hero-visual"><img className="showcase-finished" src={galleryAsset(heroCase.result)} alt={heroCase.heroAlt} fetchPriority="high" /><figcaption><span>{heroCase.outcome}</span><span>{t("案例效果")}</span></figcaption><div className="showcase-source"><img src={galleryAsset(heroCase.source)} alt={heroCase.sourceName} /><span>{t("原图")}</span><ArrowRight size={16} /></div></figure> : 'preview' in scene ? <FeaturePreview kind={scene.preview}/> : null}</div>
      </div>
      <div className="showcase-scene-controls" aria-label={t("首页场景轮播")}>{heroScenes.map((item,index)=><button key={item.id} aria-label={language === 'en' ? `Show ${item.label}` : `切换到${item.label}`} aria-pressed={tour.index===index} onClick={()=>tour.select(index)}><span/>{item.label}</button>)}<button className="showcase-scene-toggle" aria-label={tour.playing?t("暂停场景轮播"):t("播放场景轮播")} onClick={()=>tour.setPlaying(value=>!value)}>{tour.playing?<Pause size={12}/>:<Play size={12}/>}</button></div>
      <button className="showcase-see-cases" onClick={showCases}>{t("看看你能做什么")}<ArrowDown size={13} /></button>
    </section>
    <section className="showcase-cases" id="creative-cases" aria-labelledby="cases-title">
      <div className="showcase-section-heading"><h2 id="cases-title">{t("你想先做哪一张？")}</h2><p>{t("先看前后效果，再选一个感兴趣的案例动手试。")}<br />{t("每个案例都能体验选图、编辑与版本比较。")}</p></div>
      <div className="showcase-case-grid">{demoCases.map((item, index) => <article className="showcase-case" key={item.id}>
        <div className="showcase-case-images"><figure><img src={galleryAsset(item.source)} alt={`${item.sourceName} · ${t("原图")}`} loading="lazy" /><figcaption>{t("原图")}</figcaption></figure><ArrowRight size={16} aria-hidden="true" /><figure><img src={galleryAsset(item.result)} alt={`${item.resultName} · ${t("案例效果")}`} loading="lazy" /><figcaption>{item.resultName}</figcaption></figure></div>
        <div className="showcase-case-copy"><h3>{item.title}</h3><p>{item.description}</p></div><button className="showcase-case-start" data-experience-key={`case-${index}`} onClick={() => startExperience(index, `case-${index}`)}>{item.action}<ArrowUpRight size={16} /></button>
      </article>)}</div><p className="showcase-preset-note">{t("以上为预制交互示例，不会调用模型，也不会保存可编辑的桌面画板；刷新可能重置体验。请下载图片留存，或在桌面版连接自己的 AI 服务商继续创作。")}<Link to={sitePath('/help?lang=zh', language)}>{t("查看保存边界")}</Link></p>
    </section>
    <section className="showcase-agent-link"><h2>{t("你看画布，")}<br />{t("Coding Agent 做执行。")}</h2><div><p>{t("让 Codex、Claude Code 为项目生成素材、修改版本、整理画板，再导出到代码目录。从 FIELD 音箱案例开始，看一次完整的创作与交付。")}</p><Link to={sitePath('/agents?lang=zh', language)}>{t("查看 Agent 工作流")}<ArrowUpRight size={17}/></Link></div></section>
    <section className="showcase-wiki-link"><div><h2>{t("从一张图，到一套创作素材。")}</h2><p>{t("生成图片、修改版本、制作视频，再整理导出。")}<br />{t("用模板复用风格，也可以让 Coding Agent 接手执行。")}</p></div><Link to={sitePath('/wiki', language)}>{t("浏览全部功能")}<ArrowUpRight size={18}/></Link></section>
    <section className="showcase-close"><h2>{t("让下一个想法，在 Iterlay 开始。")}</h2><p>{t("图片、视频与创作工作流，都在同一个 App。")}</p><Link className="showcase-primary" to={sitePath('/download', language)}><Download size={16} />{t("下载 Iterlay")}<ArrowUpRight size={15} /></Link><span>{t("App 免费开源 · macOS & Windows · 自选模型，调用由服务商计费")}</span></section>
  </div>
}
