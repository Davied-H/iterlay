import { ArrowRight, Download, Layers3, MonitorUp, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import ProductScrollShowcase from './ProductScrollShowcase'

export default function HomePage() {
  return (
    <div className="brand-page home-page">
      <section className="home-intro-stage">
        <section className="brand-hero home-hero" aria-labelledby="home-title">
          <img
            className="brand-hero-media"
            src={`${import.meta.env.BASE_URL}iterlay-hero-studio.webp`}
            alt="从情绪板、产品图到成品视觉的 Iterlay 创作案例"
            fetchPriority="high"
          />
          <div className="brand-hero-overlay" aria-hidden="true" />
          <div className="brand-hero-content">
            <p className="brand-kicker">AI 图片生产桌面工具</p>
            <h1 id="home-title">Iterlay</h1>
            <p className="brand-hero-lead">在无限画板中完成生成、编辑、版本比较与素材整理。</p>
            <div className="brand-actions">
              <Link className="brand-cta brand-cta-primary" to="/download">
                <Download size={17} aria-hidden="true" />下载 Iterlay
              </Link>
              <a className="brand-cta brand-cta-secondary" href="https://github.com/Davied-H/iterlay">
                查看源码 <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section className="home-signal-band" aria-label="产品能力概览">
          <div><Layers3 size={19} aria-hidden="true" /><span>无限画板工作台</span></div>
          <div><Sparkles size={19} aria-hidden="true" /><span>生成与编辑一体</span></div>
          <div><MonitorUp size={19} aria-hidden="true" /><span>macOS 与 Windows</span></div>
        </section>
      </section>

      <ProductScrollShowcase />
    </div>
  )
}
