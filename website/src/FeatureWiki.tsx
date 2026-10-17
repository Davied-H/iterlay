import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Pause, Play, Search, X } from 'lucide-react'
import { features } from './features'
import WikiFeatureVisual from './WikiFeatureVisual'
import { useTour } from './useTour'
import { repository } from './releases.mjs'
import './feature-wiki.css'

export default function FeatureWiki() {
  const [params, setParams] = useSearchParams()
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
  const matches = useMemo(() => features.filter(item => `${item.name} ${item.headline} ${item.summary} ${item.children.map(child=>`${child.name} ${child.description}`).join(' ')}`.toLocaleLowerCase().includes(needle)), [needle])
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
    setParams(child ? { feature: features[index].id, sub: child } : { feature: features[index].id })
  }
  const search = (value: string) => { setQuery(value); tour.setPlaying(false) }
  const resume = () => { setQuery(''); setExpanded(null); setParams({}, { replace:true }); tour.setPlaying(true) }
  const children = feature.children.filter(child => !needle || `${child.name} ${child.description} ${feature.name}`.toLocaleLowerCase().includes(needle))
  return <div className="wiki-page">
    <header className="wiki-intro"><div><h1>功能库</h1><p>浏览 Iterlay 的创作工具，了解每一个操作。</p></div><label className="wiki-search"><Search size={17} /><input value={query} onChange={event=>search(event.target.value)} placeholder="查找功能与操作" aria-label="搜索功能" />{query && <button aria-label="清空功能搜索" onClick={()=>setQuery('')}><X size={15} /></button>}</label></header>
    <nav ref={directory} className="wiki-index" aria-label="核心功能">{matches.map(item=>{const index=features.indexOf(item);return <button key={item.id} aria-current={feature.id===item.id?'page':undefined} onClick={()=>choose(index)}>{item.name}</button>})}</nav>
    {matches.length===0 ? <div className="wiki-empty"><h2>没有找到相关功能。</h2><p>试试「图片」「模板」「宫格」或其他关键词。</p><button onClick={()=>setQuery('')}>清空关键词<ArrowRight size={15}/></button></div> : <>
      <section className="wiki-feature" aria-label="当前功能展示">
        <div className="wiki-feature-story" key={feature.id} onMouseEnter={()=>tour.setHeld(true)} onMouseLeave={()=>tour.setHeld(false)} onFocusCapture={()=>tour.setHeld(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))tour.setHeld(false)}}>
          <div className="wiki-feature-copy"><h2>{feature.name}</h2><p className="wiki-feature-line">{feature.headline}</p><p className="wiki-feature-summary">{feature.summary}</p><a className="wiki-see-details" href="#wiki-details" onClick={event=>{event.preventDefault();tour.setPlaying(false);document.getElementById('wiki-details')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}}>了解具体操作<ArrowRight size={16}/></a><div className="wiki-tour-controls"><button aria-label="上一个功能" onClick={()=>choose((tour.index-1+features.length)%features.length)}><ArrowLeft size={16}/></button><button className="wiki-tour-toggle" aria-label={tour.playing?'暂停自动巡览':'开始自动巡览'} onClick={()=>tour.playing?tour.setPlaying(false):resume()}>{tour.playing?<Pause size={13}/>:<Play size={13}/>}<span>{tour.playing?'暂停巡览':'自动巡览'}</span></button><button aria-label="下一个功能" onClick={()=>choose((tour.index+1)%features.length)}><ArrowRight size={16}/></button></div></div>
          <div className="wiki-feature-stage"><WikiFeatureVisual kind={feature.preview}/></div>
        </div>
        <div className="wiki-feature-caption"><span>功能示意 · {feature.name}</span><span>{tour.playing ? tour.held ? '阅读时暂缓切换' : '自动巡览中' : '已暂停巡览'}</span></div>
      </section>
      <section className="wiki-details" id="wiki-details" aria-label="子功能与操作说明"><div className="wiki-details-heading"><h2>{feature.name}使用指南</h2><p>{feature.children.length} 项操作，展开查看。</p></div><div className="wiki-subfeatures">{children.map(child=><article key={child.id} className={expanded===child.id?'is-open':''}><h3><button aria-expanded={expanded===child.id} aria-controls={`detail-${feature.id}-${child.id}`} onClick={()=>choose(tour.index,expanded===child.id?null:child.id)}><span>{child.name}</span><ChevronDown size={17}/></button></h3><p className="wiki-sub-description">{child.description}</p><div hidden={expanded!==child.id} id={`detail-${feature.id}-${child.id}`} className="wiki-sub-steps"><strong>操作步骤</strong><ol>{child.steps.map(step=><li key={step}>{step}</li>)}</ol></div></article>)}</div>{children.length===0 && <div className="wiki-sub-empty">请从上方索引选择搜索结果。</div>}<div className="wiki-boundary"><strong>使用说明</strong><p>{feature.boundary}</p><a href={`${repository}/blob/main/${feature.source}`} target="_blank" rel="noreferrer">查看产品文档与代码<ArrowUpRight size={12}/></a></div></section>
    </>}
    <footer className="wiki-page-close"><p>开始使用 Iterlay。</p><div><Link to="/">体验案例<ArrowUpRight size={15}/></Link><Link to="/download">下载 Iterlay<ArrowRight size={15}/></Link></div></footer>
  </div>
}
