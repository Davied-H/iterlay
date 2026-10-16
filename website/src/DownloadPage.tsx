import { useEffect, useState } from 'react'
import { repository, releasesUrl, releaseInstallers, loadReleases, type GitHubRelease, type InstallerVariant } from './releases.mjs'
const variants = [ ['darwin-arm64', 'macOS Apple 芯片'], ['darwin-x64', 'macOS Intel 芯片'], ['win32-x64', 'Windows x64'], ['win32-arm64', 'Windows ARM64'] ] as const
export default function DownloadPage() {
  const [variant, setVariant] = useState<InstallerVariant>(() => /Windows/i.test(navigator.userAgent) ? 'win32-x64' : 'darwin-arm64')
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [status, setStatus] = useState('loading')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    loadReleases(controller.signal).then(data => { setReleases(data); setStatus('ready') }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [retry])
  const installers = releaseInstallers(releases, variant)
  const latest = installers.find(item => !item.release.prerelease)
  return <div className="download-page">
    <section className="download-intro" aria-labelledby="download-title">
      <div className="download-intro-copy">
        <img className="download-app-icon" src={`${import.meta.env.BASE_URL}iterlay-logo.png`} alt="" />
        <h1 id="download-title">下载 Iterlay 桌面版</h1>
        <p className="download-lead">在无限画板中生成、编辑、比较版本，并把创作素材整理到一个工作空间。</p>
        <div className="download-platform-picker" role="group" aria-label="选择安装平台">
          {variants.map(([key, label]) => <button key={key} type="button" aria-pressed={variant === key} className={`download-platform-option ${variant === key ? 'active' : ''}`} onClick={() => setVariant(key)}>{label}</button>)}
        </div>
        <div aria-live="polite" className="download-main-action-row">
          {status === 'loading' ? <p>正在读取 GitHub Releases…</p> : status === 'error' ? <div><p>暂时无法读取版本列表。</p><button className="brand-cta" onClick={() => setRetry(retry + 1)}>重新加载</button></div> : latest ? <a className="brand-cta brand-cta-primary" href={latest.asset.browser_download_url}>下载 {variants.find(([key]) => key === variant)?.[1]}</a> : <p>此平台暂未发布稳定版安装包。</p>}
        </div>
        {latest && <p className="download-current-meta">{latest.release.tag_name} · {new Date(latest.release.published_at).toLocaleDateString('zh-CN')}</p>}
        <p className="download-requirement">安装包由 GitHub Releases 提供。AI 功能需要自行配置服务商 API Key。</p>
        <p><a href={releasesUrl}>打开 GitHub Releases</a> · <a href={`${repository}#本地开发`}>从源码运行</a></p>
      </div>
      <figure className="download-product-preview"><img src={`${import.meta.env.BASE_URL}iterlay-demo-board.png`} alt="Iterlay 无限画板界面" /></figure>
    </section>
    <section className="release-history-section" aria-labelledby="release-history-title">
      <header className="release-history-header"><div><h2 id="release-history-title">版本记录</h2><p>查看更新说明与历史版本，测试版会单独标注。</p></div></header>
      {status === 'ready' && installers.length === 0 && <p>暂无此平台的安装包。发布后会自动出现在这里。</p>}
      <div className="release-history-list">{installers.map(({ release, asset }) => <article className="release-history-item" key={asset.id}>
        <div className="release-version-column"><h3>{release.tag_name}</h3><time dateTime={release.published_at}>{new Date(release.published_at).toLocaleDateString('zh-CN')}</time><span>{release.prerelease ? '测试版' : '稳定版'}</span></div>
        <div className="release-notes-column"><p className="release-text">{release.body || '此版本未提供发布说明。'}</p><a href={release.html_url}>完整发布说明</a></div>
        <a className="brand-cta" href={asset.browser_download_url}>下载此版本</a>
      </article>)}</div>
    </section>
  </div>
}
