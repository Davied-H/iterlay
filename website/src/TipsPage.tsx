import { ArrowRight, Check, Clock3, Download, Eye, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { sitePath, useSiteLanguage } from './site-language'
import { tipsFor } from './tips'
import './tips-page.css'

export default function TipsPage() {
  const language = useSiteLanguage()
  const english = language === 'en'
  const published = tipsFor(language, 'published')
  // Keep drafts available to a local browser reviewer, but never include them
  // in prerendered HTML or production output before approval.
  const drafts = import.meta.env.DEV && !import.meta.env.SSR ? tipsFor(language, 'draft') : []

  return <div className="tips-page">
    <section className="tips-hero" aria-labelledby="tips-title">
      <div className="tips-hero-copy">
        <p className="tips-meta">ITERLAY / {english ? 'PRACTICAL TIPS' : '使用技巧'}</p>
        <h1 id="tips-title">{english ? 'Small workflows that make the next step clearer.' : '把每天会用到的小技巧，整理在这里。'}</h1>
        <p className="tips-hero-intro">{english ? 'Real situations, plain-language prompts and a finished share image. New tips are reviewed before they become part of the public collection.' : '从真实场景出发，把操作过程写得像一次经验分享。每天生成的新内容，会先交给你确认，再进入公开的技巧集合。'}</p>
      </div>
      <div className="tips-hero-note"><Sparkles size={17} /><p>{english ? 'A useful tip should help someone try it in the next five minutes.' : '好的技巧，看完就知道下一步怎么试。'}</p></div>
    </section>

    {drafts.length > 0 && <section className="tips-review" aria-labelledby="tips-review-title">
      <div className="tips-section-heading"><div><p className="tips-meta">LOCAL PREVIEW</p><h2 id="tips-review-title">{english ? 'Waiting for your approval' : '待你确认的今日草稿'}</h2></div><p>{english ? 'This preview is visible in development only. Publishing means changing the entry status and deploying the website.' : '这部分只在本地开发预览中显示。确认后，将内容标记为已发布，再部署官网。'}</p></div>
      <div className="tips-review-list">{drafts.map(tip => <TipEntry key={tip.id} tip={tip} english={english} draft />)}</div>
    </section>}

    <section className="tips-collection" aria-labelledby="tips-collection-title">
      <div className="tips-section-heading"><div><p className="tips-meta">{english ? 'THE COLLECTION' : '技巧集合'}</p><h2 id="tips-collection-title">{english ? 'Try one when the moment comes.' : '遇到类似场景时，拿来就用。'}</h2></div><p>{english ? 'Each entry keeps the situation, the prompt and the small detail that makes the workflow practical.' : '每一条都保留具体场景、可复制的指令，以及真正让操作变方便的细节。'}</p></div>
      {published.length > 0 ? <div className="tips-feed">{published.map(tip => <TipEntry key={tip.id} tip={tip} english={english} />)}</div> : <div className="tips-empty"><Clock3 size={19} /><div><h3>{english ? 'The first public tip is being prepared.' : '第一条公开技巧正在准备中。'}</h3><p>{english ? 'Generated tips stay private until they are checked and approved.' : '生成后的技巧会先保持待确认状态，核对后才会显示在这里。'}</p></div></div>}
    </section>

    <section className="tips-process" aria-labelledby="tips-process-title">
      <div className="tips-section-heading"><div><p className="tips-meta">{english ? 'HOW IT WORKS' : '更新方式'}</p><h2 id="tips-process-title">{english ? 'A small editorial loop.' : '一套简单的内容更新流程。'}</h2></div><p>{english ? 'The page stays useful because every new tip has a clear review point before it is published.' : '每天新增一条，但每条都先经过确认，再进入官网。'}</p></div>
      <ol className="tips-process-list">
        <li><span>01</span><div><strong>{english ? 'Generate' : '生成'}</strong><p>{english ? 'Choose a real Iterlay use case and make the image plus a natural sharing caption.' : '选一个真实的 Iterlay 使用场景，生成分享图和自然的推广文案。'}</p></div></li>
        <li><span>02</span><div><strong>{english ? 'Review' : '确认'}</strong><p>{english ? 'Check the wording, image, privacy notes and whether the tip feels useful.' : '你检查文案、图片、隐私提示和实际可用性。'}</p></div></li>
        <li><span>03</span><div><strong>{english ? 'Publish' : '部署'}</strong><p>{english ? 'After approval, the entry becomes public and the website is deployed with its permanent URL.' : '确认后，把条目标记为已发布，再上传部署官网并保留固定链接。'}</p></div></li>
      </ol>
      <Link className="tips-download-link" to={sitePath('/download', language)}><Download size={15} />{english ? 'Get Iterlay and try a tip' : '下载 Iterlay，开始试一个技巧'}<ArrowRight size={15} /></Link>
    </section>
  </div>
}

function TipEntry({ tip, english, draft = false }: { tip: ReturnType<typeof tipsFor>[number]; english: boolean; draft?: boolean }) {
  return <article className={`tips-entry${draft ? ' tips-entry-draft' : ''}`}>
    <figure className="tips-entry-media"><img src={`${import.meta.env.BASE_URL}${tip.image}`} alt={tip.copy.alt} loading="lazy" /><figcaption>{draft ? (english ? 'Draft preview · not public' : '待确认预览 · 尚未公开') : tip.copy.category}</figcaption></figure>
    <div className="tips-entry-copy">
      <div className="tips-entry-topline"><time dateTime={tip.date}>{tip.date}</time>{draft && <span className="tips-draft-label"><Eye size={12} />{english ? 'Review' : '待确认'}</span>}</div>
      <h3>{tip.copy.title}</h3><p className="tips-entry-summary">{tip.copy.summary}</p><p className="tips-entry-story">{tip.copy.story}</p>
      <ol className="tips-step-list">{tip.copy.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
      <div className="tips-command"><Check size={14} /><code>{tip.copy.command}</code></div><p className="tips-entry-note">{tip.copy.note}</p>
    </div>
  </article>
}
