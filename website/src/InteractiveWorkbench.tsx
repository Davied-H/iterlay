import { localizeCreative, translateCreative } from './creative-copy'
// Website-only preset adapter. Product anatomy follows TopBar.tsx,
// ImageNodeToolbar.tsx, ImageNodeVersions.tsx and PromptFusionDock.tsx.
// The numbered guide is website chrome; actions run on the product-like surface.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Download, Hand, History, ImagePlus, Maximize, Minus, MousePointer2, Pencil, Plus, RotateCcw, Sparkles, SplitSquareHorizontal, X } from 'lucide-react'
import { sitePath, useSiteLanguage } from './site-language'
import { Link } from 'react-router-dom'
import './workbench-demo.css'
import { demoCases as presetCases, galleryAsset as asset } from './demo-cases'

const presetSteps = [
  { label: '选中图片', title: '从一张图片开始。', description: '点击画板上的图片，再点击浮动工具栏里的「编辑」。', hint: '点击图片，显示操作工具栏' },
  { label: '编辑图片', title: '说说你想改变什么。', description: '图片已带入编辑面板。查看预置描述，点击「生成」，体验编辑过程。', hint: '在下方编辑描述，点击「生成」' },
  { label: '查看版本', title: '新版本来了，原图还在。', description: '用图片下方的箭头切换版本，或打开对比，拖动分界线看变化。', hint: '切换图片下方的版本，或比较前后变化' },
] as const
type Step = 0 | 1 | 2
type Point = { x: number; y: number }

export default function InteractiveWorkbench({ initialCase = 0, onExit }: { initialCase?: number; onExit: () => void }) {
  const language = useSiteLanguage()
  const t = (text: string) => translateCreative(text, language)
  const cases = localizeCreative(presetCases, language)
  const steps = localizeCreative(presetSteps, language)
  const [caseIndex, setCaseIndex] = useState(initialCase)
  const [step, setStep] = useState<Step>(0)
  const [reachedStep, setReachedStep] = useState<Step>(0)
  const [selected, setSelected] = useState(false)
  const [position, setPosition] = useState<Point>({ x: -170, y: -192 })
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [fitScale, setFitScale] = useState(1)
  const [hand, setHand] = useState(false)
  const [working, setWorking] = useState(false)
  const [hasResult, setHasResult] = useState(false)
  const [prompt, setPrompt] = useState<string>(cases[initialCase].prompt)
  const [version, setVersion] = useState<0 | 1>(0)
  const [compare, setCompare] = useState(false)
  const [split, setSplit] = useState(50)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const viewport = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const drag = useRef<{ id: number; image: boolean; start: Point; origin: Point } | null>(null)
  const current = cases[caseIndex]
  const showingResult = step === 2 && version === 1
  const imageName = showingResult ? current.result : current.source
  const scale = zoom * fitScale

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { if (step === 1) textarea.current?.focus({ preventScroll: true }) }, [step])
  useEffect(() => { const image = new Image(); image.src = asset(current.result) }, [current.result])
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setFitScale(Math.max(.4, Math.min(1.1, width / 510, (height - 110) / 385)))
    })
    observer.observe(element)
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) setZoom(value => Math.max(.5, Math.min(1.8, value * Math.exp(-event.deltaY * .008))))
      else setPan(value => ({ x: value.x - event.deltaX, y: value.y - event.deltaY }))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => { observer.disconnect(); element.removeEventListener('wheel', onWheel) }
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (compare || historyOpen) { setCompare(false); setHistoryOpen(false) }
        else onExit()
        return
      }
      if ((event.target as HTMLElement).closest('input,textarea,select,button,a,[contenteditable]') || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() === 'h') setHand(true)
      if (event.key.toLowerCase() === 'v') setHand(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compare, historyOpen, onExit])
  const resetView = () => { setPosition({ x: -170, y: -192 }); setPan({ x: 0, y: 0 }); setZoom(1) }
  const chooseCase = (index: number) => {
    clearTimeout(timer.current)
    setCaseIndex(index); setStep(0); setReachedStep(0); setSelected(false)
    setWorking(false); setHasResult(false); setPrompt(cases[index].prompt)
    setVersion(0); setCompare(false); setSplit(50); setHistoryOpen(false); setHand(false); resetView()
    setAnnouncement(language === 'en' ? `Switched to ${cases[index].name}. Select the image to begin.` : `已切换到${cases[index].name}案例，请选中图片开始。`)
  }
  const goToStep = (next: Step) => {
    if (working || next > reachedStep) return
    setStep(next); setSelected(next !== 0); setCompare(false); setHistoryOpen(false)
    setVersion(next === 2 ? 1 : 0); resetView()
    setAnnouncement(language === 'en' ? `Step ${next + 1}: ${steps[next].label}` : `第 ${next + 1} 步：${steps[next].label}`)
  }
  const beginEdit = () => {
    if (working) return
    setStep(1); setReachedStep(value => Math.max(value, 1) as Step)
    setSelected(true); setCompare(false); setHistoryOpen(false); resetView()
    setAnnouncement(t("图片已带入编辑面板。请查看描述并点击生成。"))
  }
  const simulate = () => {
    if (!prompt.trim() || working || step !== 1) return
    setWorking(true); setAnnouncement(t("正在播放预制编辑演示"))
    timer.current = setTimeout(() => {
      setWorking(false); setHasResult(true); setReachedStep(2); setStep(2)
      setSelected(true); setVersion(1); setCompare(false); resetView()
      setAnnouncement(t("新版本已就绪。已进入第 3 步，可切换版本或比较原图。"))
    }, 1000)
  }
  const startDrag = (event: ReactPointerEvent, image: boolean) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button:not(.demo-node-image),input,textarea,a')) return
    event.preventDefault()
    const moveImage = image && !hand
    drag.current = { id: event.pointerId, image: moveImage, start: { x: event.clientX, y: event.clientY }, origin: moveImage ? position : pan }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (moveImage) setSelected(true)
  }
  const moveDrag = (event: ReactPointerEvent) => {
    const value = drag.current
    if (!value || value.id !== event.pointerId) return
    const divisor = value.image ? scale : 1
    const next = { x: value.origin.x + (event.clientX - value.start.x) / divisor, y: value.origin.y + (event.clientY - value.start.y) / divisor }
    if (value.image) setPosition(next)
    else setPan(next)
  }
  return <div className="demo-workbench" data-step={step} aria-label={t("Iterlay 分步体验工作台")}>
    <nav className="demo-stepbar" aria-label={t("体验步骤")}>
      {steps.map((item, index) => <button key={item.label} disabled={working || index > reachedStep} aria-current={step === index ? 'step' : undefined} onClick={() => goToStep(index as Step)}><span>{index < reachedStep && index !== step ? <Check size={13} /> : index + 1}</span><strong>{item.label}</strong>{index < 2 && <i aria-hidden="true" />}</button>)}
    </nav>
    <header className="demo-topbar">
      <div className="demo-breadcrumb"><button className="demo-return" onClick={onExit}><ChevronLeft size={14} />{t("返回案例")}</button><ChevronRight size={13} /><strong>{current.name}</strong></div>
      <div className="demo-top-actions"><button className="demo-reset" aria-label={t("重置体验")} title={t("重置体验")} onClick={() => chooseCase(caseIndex)}><RotateCcw size={14} /><span>{t("重新开始")}</span></button>{hasResult && <button aria-label={t("生成历史")} title={t("生成历史")} aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}><History size={16} /></button>}<span className="demo-preset-label">{t("预制内容演示")}</span></div>
    </header>
    <div className="demo-main">
      <div className="demo-canvas-area">
        <div className={`demo-viewport ${hand ? 'hand-mode' : ''}`} ref={viewport} aria-label={t("交互画板，拖动图片或空白区域")} onPointerDown={event => startDrag(event, false)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          <div className="demo-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
            <div className={`demo-node ${selected ? 'selected' : ''}`} style={{ transform: `translate(${position.x}px, ${position.y}px)` }} onPointerDown={event => { event.stopPropagation(); startDrag(event, true) }}>
              <div className="demo-node-title"><span>{showingResult ? current.resultName : current.sourceName}</span></div>
              {selected && <div className="demo-node-toolbar" style={{ transform: `translateX(-50%) scale(${1 / scale})` }} role="toolbar" aria-label={t("图片操作")}>
                <button className="demo-edit-button" aria-label={t("编辑图片")} disabled={working} onClick={beginEdit}><Pencil size={13} />{t("编辑")}</button>

                {step === 2 && <button aria-label={t("比较原图与结果")} aria-pressed={compare} onClick={() => { setCompare(value => !value); setVersion(1) }}><SplitSquareHorizontal size={14} /></button>}
                <a download={`Iterlay-${imageName.includes('.') ? imageName : `${imageName}.jpg`}`} href={asset(imageName)} aria-label={t("下载演示图片")}><Download size={14} /></a>
              </div>}
              <div className="demo-node-media">
                <button className="demo-node-image" aria-label={t("选中产品原图")} aria-pressed={selected} onClick={() => setSelected(true)}><img key={imageName} src={asset(imageName)} alt={showingResult ? `${current.resultName} · ${t("案例效果")}` : `${current.subject}: ${current.sourceName}`} draggable={false} /></button>
                {working && <div className="demo-working"><span className="demo-spinner" />{t("演示编辑过程…")}</div>}
                {step === 2 && compare && <div className="demo-compare"><img src={asset(current.source)} alt={t("编辑前的原图")} style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} /><div className="demo-compare-line" style={{ left: `${split}%` }} /><div className="demo-compare-labels"><span>{t("原图")}</span><span>{t("新版本")}</span></div><input type="range" min="0" max="100" value={split} aria-label={t("原图与结果对比位置")} onChange={event => setSplit(Number(event.target.value))} /></div>}
                {step === 2 && !compare && <div className="demo-version-switch" style={{ transform: `translateX(-50%) scale(${1 / scale})` }}><button aria-label={t("查看原始版本")} disabled={version === 0} onClick={() => setVersion(0)}><ChevronLeft size={12} /></button><span>v{version + 1}/2</span><button aria-label={t("查看新版本")} disabled={version === 1} onClick={() => setVersion(1)}><ChevronRight size={12} /></button></div>}
              </div>
              {selected && ['tl', 'tr', 'bl', 'br'].map(corner => <i key={corner} className={`demo-selection ${corner}`} />)}
              <div className="demo-node-meta"><span>{current.dimensions}</span><span>{step === 2 ? t("2 个版本") : imageName.split('.').pop()?.toUpperCase()}</span></div>
            </div>
          </div>
        </div>
        <div className="demo-canvas-hint"><MousePointer2 size={12} />{steps[step].hint}</div>
        {historyOpen && <aside className="demo-history" aria-label={t("体验生成历史")}><header><strong>{t("生成历史")}</strong><button aria-label={t("关闭生成历史")} onClick={() => setHistoryOpen(false)}><X size={14} /></button></header><button className="demo-history-entry" onClick={() => goToStep(2)}><img src={asset(current.result)} alt="" /><span><strong>{current.resultName}</strong><small>{t("预制结果 · 版本 2")}</small></span></button></aside>}
        {step === 1 && <form className="demo-fusion" aria-busy={working} onSubmit={event => { event.preventDefault(); simulate() }}>
          <div className="demo-fusion-surface">
            <div className="demo-context"><div><img src={asset(current.source)} alt="" /><span><strong>{current.sourceName}</strong><small>{t("编辑目标")}</small></span></div></div>
            <textarea ref={textarea} aria-label={t("编辑描述")} rows={2} value={prompt} disabled={working} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); simulate() } }} maxLength={300} />
            <div className="demo-fusion-toolbar"><span className="demo-mode-label">{t("普通")}</span><span className="demo-model-label">{t("预制演示")}</span><span className="demo-size">{current.dimensions}</span><button type="submit" className="demo-generate" disabled={!prompt.trim() || working} aria-label={t("体验模拟编辑")}>{working ? <><span className="demo-spinner" />{t("演示中")}</> : <>{t("生成")}<Sparkles size={14} /></>}</button></div>
          </div><p className="demo-disclosure">{t("预制结果，不调用模型。修改描述不会改变案例结果。")}</p>
        </form>}
        <div className="demo-zoom" role="group" aria-label={t("画板工具")}><button aria-label={t("选择素材")} aria-pressed={!hand} onClick={() => setHand(false)}><MousePointer2 size={14} /></button><button aria-label={t("拖动画布")} aria-pressed={hand} onClick={() => setHand(true)}><Hand size={14} /></button><span /><button aria-label={t("缩小")} disabled={zoom <= .5} onClick={() => setZoom(value => Math.max(.5, value - .15))}><Minus size={14} /></button><output aria-label={t("缩放比例")}>{Math.round(zoom * 100)}%</output><button aria-label={t("放大")} disabled={zoom >= 1.8} onClick={() => setZoom(value => Math.min(1.8, value + .15))}><Plus size={14} /></button><span /><button aria-label={t("重置画板视图")} onClick={resetView}><Maximize size={14} /></button></div>
      </div>
      <aside className="demo-guide" aria-label={t("当前步骤与案例")}>
        <div className="demo-step-copy" key={step}><span className="demo-step-count">{step + 1} / 3</span><h2>{step === 0 ? current.title : steps[step].title}</h2><p>{steps[step].description}</p>{step === 0 && <div className="demo-guide-detail"><MousePointer2 size={16} /><span>{selected ? t("已选中。点击图片上方的「编辑」。") : t("图片可以像 App 中一样拖动、选中。")}</span></div>}{step === 1 && <div className="demo-guide-detail"><ImagePlus size={16} /><span>{t("图片已带入编辑目标，直接描述调整即可。")}</span></div>}{step === 2 && <button className="demo-guide-compare" aria-pressed={compare} onClick={() => { setCompare(value => !value); setVersion(1) }}><SplitSquareHorizontal size={15} />{compare ? t("退出对比") : t("比较原图与新版本")}</button>}</div>
        <div className="demo-guide-bottom">{step === 2 ? <><h3>{t("轮到你的想法了。")}</h3><p>{t("下载 Iterlay，用自己的图片继续创作。")}</p><Link to={sitePath("/download", language)}>{t("下载 Iterlay")}<ArrowUpRight size={14} /></Link><button onClick={onExit}>{t("换个案例")}<ArrowRight size={12} /></button></> : <p className="demo-guide-footnote">{t("本体验还原 App 的核心操作，")}<br />{t("使用预制素材，无需登录或配置模型。")}</p>}</div>
      </aside>
    </div><p className="sr-only" role="status">{announcement}</p>
  </div>
}
