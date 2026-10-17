import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, Check, Code2, ExternalLink, Layers3, Monitor } from 'lucide-react'
import { repository, releasesUrl, releaseInstallers, loadReleases, type GitHubRelease, type InstallerVariant } from './releases.mjs'
import './download.css'

const platforms = [
  { id: 'win32-x64', label: 'Windows', detail: '适用于 Windows x64 设备', system: 'windows' },
  { id: 'win32-arm64', label: 'Windows ARM64', detail: '适用于搭载 ARM 处理器的 Windows 设备', system: 'windows' },
  { id: 'darwin-x64', label: 'macOS Intel 芯片版', detail: '适用于搭载 Intel 处理器的 Mac', system: 'apple' },
  { id: 'darwin-arm64', label: 'macOS Apple 芯片版', detail: '适用于搭载 Apple M 系列芯片的 Mac', system: 'apple' },
] as const

function PlatformIcon({ system }: { system: 'windows' | 'apple' }) {
  return system === 'windows' ? <svg className="dl-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#f25022" d="M2 3h9v9H2z" /><path fill="#7fba00" d="M12 3h9v9h-9z" /><path fill="#00a4ef" d="M2 13h9v9H2z" /><path fill="#ffb900" d="M12 13h9v9h-9z" /></svg> : <svg className="dl-platform-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 2.1c.2 1.5-.5 2.9-1.3 3.8-.9 1-2.3 1.7-3.7 1.6-.2-1.5.6-3 1.4-3.9.9-.9 2.4-1.6 3.6-1.5ZM20.6 17.8c-.5 1.1-.8 1.6-1.5 2.6-.9 1.2-2.1 2.7-3.5 2.7-1.3 0-1.7-.9-3.5-.9s-2.3.9-3.6.9c-1.3 0-2.4-1.3-3.4-2.5-2.6-3.6-2.9-7.8-1.3-10 1.1-1.6 2.8-2.4 4.4-2.4 1.4 0 2.3.9 3.5.9 1.1 0 1.8-.9 3.5-.9 1.3 0 2.7.7 3.7 1.8-3.3 1.8-2.8 6.3 1.2 7.8Z" /></svg>
}

export default function DownloadPage() {
  const [variant, setVariant] = useState<InstallerVariant>(() => /Windows/i.test(navigator.userAgent) ? 'win32-x64' : 'darwin-arm64')
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  const [detected, setDetected] = useState<InstallerVariant | null>(null)
  useEffect(() => {
    // Architecture is unavailable in some browsers; never guess Apple vs Intel.
    const ua = navigator as Navigator & { userAgentData?: { getHighEntropyValues: (keys: string[]) => Promise<{ platform?: string; architecture?: string }> } }
    let active = true
    ua.userAgentData?.getHighEntropyValues(['platform', 'architecture']).then(info => {
      if (!active) return
      const os = info.platform === 'Windows' ? 'win32' : info.platform === 'macOS' ? 'darwin' : null
      const arch = info.architecture === 'arm' ? 'arm64' : info.architecture === 'x86' ? 'x64' : null
      if (os && arch) { const id = `${os}-${arch}` as InstallerVariant; setDetected(id); setVariant(id) }
    }).catch(() => {})
    return () => { active = false }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    loadReleases(controller.signal).then(data => { setReleases(data); setStatus('ready') }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [retry])
  const stable = releases.find(release => !release.draft && !release.prerelease)
  const installers = releaseInstallers(releases, variant)
  const platformName = platforms.find(platform => platform.id === variant)?.label
  return <div className="dl-page">
    <section className="dl-heading" aria-labelledby="download-title">
      <div className="dl-title-wrap"><div className="dl-doodle dl-doodle-left" aria-hidden="true"><svg viewBox="0 0 65 40"><path d="m8 32 7-20 9 12L34 5l9 21 15-8" /></svg><img src={`${import.meta.env.BASE_URL}iterlay-logo.png`} alt="" /></div><h1 id="download-title">下载 <span>Iterlay<svg viewBox="0 0 360 38" preserveAspectRatio="none" aria-hidden="true"><path d="M9 24C98 1 221 3 348 11M72 34c71-17 159-21 240-16" /></svg></span> 客户端</h1><div className="dl-doodle dl-doodle-right" aria-hidden="true"><div><Layers3 size={28} /></div><svg viewBox="0 0 85 35"><path d="M6 27Q38 5 76 8M24 32Q50 17 69 18" /></svg></div></div>
      <p className="dl-subtitle">选择适合你的版本，开始在无边画板上创作</p>
      <div className="dl-meta"><p>支持 macOS、Windows，桌面客户端免费开源</p><p>请保持客户端为最新版本，获取最新功能。<a href={releasesUrl}>查看更新说明</a></p><p>开发者：Davied-H<span className="dl-meta-divider">|</span><a href={`${repository}/blob/main/LICENSE`}>开源许可</a><span className="dl-meta-divider">|</span>{status === 'loading' ? '正在读取版本信息…' : stable ? <>版本号：{stable.tag_name}<span className="dl-meta-divider">|</span>更新时间：{new Date(stable.published_at).toLocaleDateString('zh-CN').replaceAll('/', '–')}</> : status === 'error' ? '版本信息暂不可用' : '暂无稳定版本'}</p></div>
    </section>
    <section className="dl-panels" aria-label="客户端下载">
      <div className="dl-desktop-panel"><h2>桌面端</h2>
        <div className="dl-status" role="status">{status === 'error' && <><span>暂时无法读取版本列表。</span><button onClick={() => setRetry(value => value + 1)}>重新加载</button><a href={releasesUrl}>前往 GitHub Releases<ArrowUpRight size={12} /></a></>}</div>
        <div className="dl-platform-list">{platforms.map(platform => {
          const installer = releaseInstallers(releases, platform.id).find(item => !item.release.prerelease)
          const current = detected === platform.id
          return <article className={`dl-platform-row ${current ? 'is-current' : ''}`} key={platform.id}>
            <div className="dl-platform-content"><h3><PlatformIcon system={platform.system} />{platform.label}</h3><p>{platform.detail}<button className="dl-history-link" onClick={() => { setVariant(platform.id); document.getElementById('release-history-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }) }}>历史版本</button></p>{status === 'ready' && !installer && <small>此平台暂未发布稳定版安装包</small>}</div>
            {current && <span className="dl-current-badge">当前设备</span>}
            {status === 'loading' ? <span className="dl-row-loading" aria-label={`正在读取 ${platform.label} 安装包`} /> : installer ? <a className="dl-row-download" href={installer.asset.browser_download_url} aria-label={`下载 ${platform.label}`} title={`下载 ${platform.label} ${installer.release.tag_name}`}><ArrowDownToLine size={25} /></a> : <a className="dl-row-download dl-row-fallback" href={releasesUrl} aria-label={`查看 ${platform.label} 发布情况`} title="前往 GitHub 查看发布情况"><ExternalLink size={21} /></a>}
          </article>
        })}<article className="dl-platform-row dl-source-row"><div className="dl-platform-content"><h3><Code2 size={23} />从源码运行</h3><p>查看开源代码、本地开发与构建说明。<a href={`${repository}#本地开发`}>开发文档</a></p></div><a className="dl-row-download" href={repository} aria-label="查看源码"><ArrowUpRight size={24} /></a></article></div>
      </div>
      <aside className="dl-companion-panel"><h2>其他设备</h2><div className="dl-qr"><img src={`${import.meta.env.BASE_URL}download-qr.svg`} width="200" height="200" alt="扫码打开 Iterlay 官方下载页面" /></div><p className="dl-scan-label">扫码打开官方下载页</p><div className="dl-device-note"><Monitor size={31} strokeWidth={1.5} /><h3>创作，在电脑上继续</h3><p>Iterlay 为桌面创作而设计。<br />在 Mac 或 Windows 上下载安装，<br />连接你自己的 AI 服务商。</p><span><Check size={13} />免费开源，无需激活</span></div></aside>
    </section>
    <p className="dl-install-note">AI 功能需要自行配置服务商 API Key。安装包由 GitHub Releases 提供。<a href={releasesUrl}>所有发布版本<ArrowUpRight size={12} /></a></p>
    <section className="dl-history" aria-labelledby="release-history-title"><div className="dl-history-heading"><div><h2 id="release-history-title">版本记录</h2><p>查看更新说明与历史安装包</p></div><label>选择平台<select aria-label="版本记录平台" value={variant} onChange={event => setVariant(event.target.value as InstallerVariant)}>{platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.label}</option>)}</select></label></div>
      {status === 'loading' ? <p className="dl-history-state">正在读取 GitHub Releases…</p> : status === 'error' ? <p className="dl-history-state">版本记录暂不可用，可重新加载或直接<a href={releasesUrl}>打开 GitHub Releases</a>。</p> : installers.length === 0 ? <p className="dl-history-state">暂无 {platformName} 安装包。</p> : <div className="dl-history-list">{installers.map(({ release, asset }) => <article key={asset.id}><div><h3>{release.tag_name}<span>{release.prerelease ? '测试版' : '稳定版'}</span></h3><time dateTime={release.published_at}>{new Date(release.published_at).toLocaleDateString('zh-CN')}</time></div><div><p className="release-text">{release.body || '此版本未提供发布说明。'}</p><a href={release.html_url}>完整发布说明<ArrowUpRight size={12} /></a></div><a className="dl-history-download" href={asset.browser_download_url}>下载此版本<ArrowDownToLine size={15} /></a></article>)}</div>}
    </section>
  </div>
}
