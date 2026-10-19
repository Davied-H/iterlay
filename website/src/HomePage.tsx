import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Download, Pause, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import InteractiveWorkbench from './InteractiveWorkbench'
import { demoCases, galleryAsset } from './demo-cases'
import './home-gallery.css'
import FeaturePreview from './FeaturePreview'
import { sitePath } from './site-language'
import { useTour } from './useTour'
import './agent-page.css'

const heroScenes = [
  { id:'poster', label:'品牌海报', title:'从一张产品图，', emphasis:'做出上新海报。', description:'保留产品，换上新的背景与排版。\n从原图到发布封面，每个版本都留在画板里。', caseIndex:0, feature:'images' },
  { id:'campaign', label:'产品广告', title:'给同一件产品，', emphasis:'换个出彩的场景。', description:'从干净棚拍，到赭红沙丘。\n保留材质细节，继续探索新的广告表达。', caseIndex:1, feature:'images' },
  { id:'assistant', label:'AI 助手', title:'说出你的想法，', emphasis:'一起找到创作方向。', description:'带着图片与助手讨论主体、场景和风格。\n把想改的地方说清楚，再继续下一版。', preview:'assistant', feature:'assistant' },
  { id:'templates', label:'模板复用', title:'把喜欢的风格，', emphasis:'留给下一次创作。', description:'保存提示词和视觉规则，复用满意的表达。\n从模板开始，也能继续调整成自己的版本。', preview:'templates', feature:'templates' },
  { id:'assets', label:'素材整理', title:'找回好素材，', emphasis:'接着上一次灵感。', description:'图片、视频和历史尝试，集中到素材库。\n搜索、筛选、收藏，把内容带回新的画板。', preview:'assets', feature:'assets' },
] as const

export default function HomePage() {
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

  if (activeCase !== null) return <section className="immersive-experience play-session" id="experience" aria-labelledby="home-title"><h1 id="home-title" className="sr-only">{demoCases[activeCase].title} · Iterlay 产品体验</h1><InteractiveWorkbench initialCase={activeCase} onExit={exitExperience} /></section>

  return <div className="showcase-home">
    <section className="showcase-hero" aria-labelledby="home-title">
      <div className="showcase-hero-inner" onMouseEnter={() => tour.setHeld(true)} onMouseLeave={() => tour.setHeld(false)} onFocusCapture={() => tour.setHeld(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) tour.setHeld(false) }}>
        <div className="showcase-hero-copy"><div className="showcase-scene-copy" key={scene.id}><h1 id="home-title">{scene.title}<br /><span>{scene.emphasis}</span></h1><p>{scene.description}</p></div><div className="showcase-actions">{'caseIndex' in scene ? <button className="showcase-primary" data-experience-key="hero" onClick={() => startExperience(scene.caseIndex, 'hero')}>开始体验<ArrowRight size={16} /></button> : <Link className="showcase-primary" data-experience-key="hero" to={sitePath(`/wiki?feature=${scene.feature}`, 'zh')}>了解{scene.label}<ArrowRight size={16} /></Link>}<Link className="showcase-download" to={sitePath('/download', 'zh')}><Download size={15} />下载桌面版</Link></div></div>
        <div className="showcase-scene-visual" key={scene.id}>{heroCase ? <figure className="showcase-hero-visual"><img className="showcase-finished" src={galleryAsset(heroCase.result)} alt={heroCase.heroAlt} fetchPriority="high" /><figcaption><span>{heroCase.outcome}</span><span>案例效果</span></figcaption><div className="showcase-source"><img src={galleryAsset(heroCase.source)} alt={heroCase.sourceName} /><span>原图</span><ArrowRight size={16} /></div></figure> : 'preview' in scene ? <FeaturePreview kind={scene.preview}/> : null}</div>
      </div>
      <div className="showcase-scene-controls" aria-label="首页场景轮播">{heroScenes.map((item,index)=><button key={item.id} aria-label={`切换到${item.label}`} aria-pressed={tour.index===index} onClick={()=>tour.select(index)}><span/>{item.label}</button>)}<button className="showcase-scene-toggle" aria-label={tour.playing?'暂停场景轮播':'播放场景轮播'} onClick={()=>tour.setPlaying(value=>!value)}>{tour.playing?<Pause size={12}/>:<Play size={12}/>}</button></div>
      <button className="showcase-see-cases" onClick={showCases}>看看你能做什么<ArrowDown size={13} /></button>
    </section>
    <section className="showcase-cases" id="creative-cases" aria-labelledby="cases-title">
      <div className="showcase-section-heading"><h2 id="cases-title">你想先做哪一张？</h2><p>先看前后效果，再选一个感兴趣的案例动手试。<br />每个案例都能体验选图、编辑与版本比较。</p></div>
      <div className="showcase-case-grid">{demoCases.map((item, index) => <article className="showcase-case" key={item.id}>
        <div className="showcase-case-images"><figure><img src={galleryAsset(item.source)} alt={`${item.sourceName}，修改前`} loading="lazy" /><figcaption>原图</figcaption></figure><ArrowRight size={16} aria-hidden="true" /><figure><img src={galleryAsset(item.result)} alt={`${item.resultName}，预制效果`} loading="lazy" /><figcaption>{item.resultName}</figcaption></figure></div>
        <div className="showcase-case-copy"><h3>{item.title}</h3><p>{item.description}</p></div><button className="showcase-case-start" data-experience-key={`case-${index}`} onClick={() => startExperience(index, `case-${index}`)}>{item.action}<ArrowUpRight size={16} /></button>
      </article>)}</div><p className="showcase-preset-note">以上为预制交互示例，不会调用模型，也不会保存可编辑的桌面画板；刷新可能重置体验。请下载图片留存，或在桌面版连接自己的 AI 服务商继续创作。<Link to={sitePath('/help?lang=zh', 'zh')}>查看保存边界</Link></p>
    </section>
    <section className="showcase-agent-link"><h2>你看画布，<br />Coding Agent 做执行。</h2><div><p>让 Codex、Claude Code 为项目生成素材、修改版本、整理画板，再导出到代码目录。从 FIELD 音箱案例开始，看一次完整的创作与交付。</p><Link to={sitePath('/agents?lang=zh', 'zh')}>查看 Agent 工作流<ArrowUpRight size={17}/></Link></div></section>
    <section className="showcase-wiki-link"><div><h2>不止改图，还有完整的创作工作流。</h2><p>AI 助手、模板、素材库、视频、Coding Agent……<br />进入功能 Wiki，跟随自动巡览，看懂每一项能力和操作。</p></div><Link to={sitePath('/wiki', 'zh')}>浏览全部功能<ArrowUpRight size={18}/></Link></section>
    <section className="showcase-close"><h2>把自己的图片，带进 Iterlay。</h2><p>生成、编辑、比较与整理，都在同一个工作空间。</p><Link className="showcase-primary" to={sitePath('/download', 'zh')}><Download size={16} />下载 Iterlay<ArrowUpRight size={15} /></Link><span>免费开源 · macOS & Windows · AI 功能需自行配置服务商</span></section>
  </div>
}
