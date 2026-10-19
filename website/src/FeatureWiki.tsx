import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Pause, Play, Search, X } from 'lucide-react'
import { features as featuresZh } from './features'
import { featuresEn } from './features.en'
import { sitePath, useSiteLanguage } from './site-language'
import WikiFeatureVisual from './WikiFeatureVisual'
import { useTour } from './useTour'
import { repository } from './releases.mjs'
import './feature-wiki.css'

export default function FeatureWiki() {
  const [params, setParams] = useSearchParams()
  const language = useSiteLanguage()
  const english = language === 'en'
  const features = english ? featuresEn : featuresZh
  const t = (zh: string, en: string) => english ? en : zh
  const directory = useRef<HTMLElement>(null)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(params.get('sub'))
  const tour = useTour(features.length, 7000, !query && !expanded)
  const feature = features[tour.index]
  useEffect(() => {
    const nav = directory.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    const delta = active.getBoundingClientRect().left - nav.getBoundingClientRect().left
    nav.scrollTo({ left: nav.scrollLeft + delta - (nav.clientWidth - active.offsetWidth) / 2, behavior: 'instant' })
  }, [feature.id])
  const needle = query.trim().toLocaleLowerCase()
  const matches = useMemo(() => features.filter(item => `${item.name} ${item.headline} ${item.summary} ${item.children.map(child=>`${child.name} ${child.description}`).join(' ')}`.toLocaleLowerCase().includes(needle)), [needle, features])
  useEffect(() => {
    const id = params.get('feature')
    if (!id) return
    const index = features.findIndex(item => item.id === id)
    if (index < 0) return
    tour.select(index)
    const sub = params.get('sub')
    setExpanded(features[index].children.some(child => child.id === sub) ? sub : null)
    // URL changes are intentional navigation; automatic tour changes never rewrite history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])
  const choose = (index: number, child: string | null = null) => {
    tour.select(index); setExpanded(child)
    setParams(child ? { lang: language, feature: features[index].id, sub: child } : { lang: language, feature: features[index].id })
  }
  const search = (value: string) => { setQuery(value); tour.setPlaying(false) }
  const resume = () => { setQuery(''); setExpanded(null); setParams({ lang: language }, { replace:true }); tour.setPlaying(true) }
  const children = feature.children.filter(child => !needle || `${child.name} ${child.description} ${feature.name}`.toLocaleLowerCase().includes(needle))
  return <div className="wiki-page">
    <header className="wiki-intro"><div><h1>{t("功能库","Features")}</h1><p>{t("浏览 Iterlay 的创作工具，了解每一个操作。","Explore the creative tools and learn each operation.")}</p></div><label className="wiki-search"><Search size={17} /><input value={query} onChange={event=>search(event.target.value)} placeholder={t("查找功能与操作","Find a feature or operation")} aria-label={t("搜索功能","Search features")} />{query && <button aria-label={t("清空功能搜索","Clear feature search")} onClick={()=>setQuery('')}><X size={15} /></button>}</label></header>
    <nav ref={directory} className="wiki-index" aria-label={t("核心功能","Core features")}>{matches.map(item=>{const index=features.indexOf(item);return <button key={item.id} aria-current={feature.id===item.id?'page':undefined} onClick={()=>choose(index)}>{item.name}</button>})}</nav>
    {matches.length===0 ? <div className="wiki-empty"><h2>{t("没有找到相关功能。","No matching feature found.")}</h2><p>{t("试试「图片」「模板」「宫格」或其他关键词。","Try image, template, grid or another keyword.")}</p><button onClick={()=>setQuery('')}>{t("清空关键词","Clear search")}<ArrowRight size={15}/></button></div> : <>
      <section className="wiki-feature" aria-label={t("当前功能展示","Current feature")}>
        <div className="wiki-feature-story" key={feature.id} onMouseEnter={()=>tour.setHeld(true)} onMouseLeave={()=>tour.setHeld(false)} onFocusCapture={()=>tour.setHeld(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))tour.setHeld(false)}}>
          <div className="wiki-feature-copy"><h2>{feature.name}</h2><p className="wiki-feature-line">{feature.headline}</p><p className="wiki-feature-summary">{feature.summary}</p><a className="wiki-see-details" href="#wiki-details" onClick={event=>{event.preventDefault();tour.setPlaying(false);document.getElementById('wiki-details')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}}>{t("了解具体操作","See how it works")}<ArrowRight size={16}/></a><div className="wiki-tour-controls"><button aria-label={t("上一个功能","Previous feature")} onClick={()=>choose((tour.index-1+features.length)%features.length)}><ArrowLeft size={16}/></button><button className="wiki-tour-toggle" aria-label={tour.playing?t('暂停自动巡览','Pause tour'):t('开始自动巡览','Start tour')} onClick={()=>tour.playing?tour.setPlaying(false):resume()}>{tour.playing?<Pause size={13}/>:<Play size={13}/>}<span>{tour.playing?t('暂停巡览','Pause tour'):t('自动巡览','Auto tour')}</span></button><button aria-label={t("下一个功能","Next feature")} onClick={()=>choose((tour.index+1)%features.length)}><ArrowRight size={16}/></button></div></div>
          <div className="wiki-feature-stage"><WikiFeatureVisual kind={feature.preview} english={english}/></div>
        </div>
        <div className="wiki-feature-caption"><span>{t('功能示意','Illustration')} · {feature.name}</span><span>{tour.playing ? tour.held ? t('阅读时暂缓切换','Held while reading') : t('自动巡览中','Tour playing') : t('已暂停巡览','Tour paused')}</span></div>
      </section>
      <section className="wiki-details" id="wiki-details" aria-label={t("子功能与操作说明","Feature instructions")}><div className="wiki-details-heading"><h2>{feature.name}{t('使用指南',' guide')}</h2><p>{feature.children.length}{t(' 项操作，展开查看。',' operations. Expand an item to read the steps.')}</p></div><div className="wiki-subfeatures">{children.map(child=><article key={child.id} className={expanded===child.id?'is-open':''}><h3><button aria-expanded={expanded===child.id} aria-controls={`detail-${feature.id}-${child.id}`} onClick={()=>choose(tour.index,expanded===child.id?null:child.id)}><span>{child.name}</span><ChevronDown size={17}/></button></h3><p className="wiki-sub-description">{child.description}</p><div hidden={expanded!==child.id} id={`detail-${feature.id}-${child.id}`} className="wiki-sub-steps"><strong>{t("操作步骤","Steps")}</strong><ol>{child.steps.map(step=><li key={step}>{step}</li>)}</ol></div></article>)}</div>{children.length===0 && <div className="wiki-sub-empty">{t("请从上方索引选择搜索结果。","Choose a matching feature from the directory.")}</div>}<div className="wiki-boundary"><strong>{t("使用说明","Usage and limits")}</strong><p>{feature.boundary}</p><a href={`${repository}/blob/main/${feature.source}`} target="_blank" rel="noreferrer">{t("查看产品文档与代码","View product documentation and source")}<ArrowUpRight size={12}/></a></div></section>
    </>}
    <footer className="wiki-page-close"><p>{t("开始使用 Iterlay。","Start using Iterlay.")}</p><div><Link to={sitePath(english ? "/agents" : "/", language)}>{t("体验案例","Explore the example")}<ArrowUpRight size={15}/></Link><Link to={sitePath('/help', language)}>{t('配置与帮助','Setup & help')}<ArrowRight size={15}/></Link><Link to={sitePath("/download", language)}>{t("下载 Iterlay","Download Iterlay")}<ArrowRight size={15}/></Link></div></footer>
  </div>
}
