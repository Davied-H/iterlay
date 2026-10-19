import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sitePath, useSiteLanguage } from './site-language'
import ReleaseNotes from './ReleaseNotes'
import { ArrowDownToLine, ArrowUpRight, Check, Code2, ExternalLink, Layers3, Monitor } from 'lucide-react'
import { repository, releasesUrl, releaseInstallers, loadReleases, type GitHubRelease, type InstallerVariant } from './releases.mjs'
import './download.css'

const platformsZh = [
  { id: 'win32-x64', label: 'Windows', detail: '适用于 Windows x64 设备', system: 'windows' },
  { id: 'win32-arm64', label: 'Windows ARM64', detail: '适用于搭载 ARM 处理器的 Windows 设备', system: 'windows' },
  { id: 'darwin-x64', label: 'macOS Intel 芯片版', detail: '适用于搭载 Intel 处理器的 Mac', system: 'apple' },
  { id: 'darwin-arm64', label: 'macOS Apple 芯片版', detail: '适用于搭载 Apple M 系列芯片的 Mac', system: 'apple' },
] as const

function PlatformIcon({ system }: { system: 'windows' | 'apple' }) {
  return system === 'windows' ? <svg className="dl-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#f25022" d="M2 3h9v9H2z" /><path fill="#7fba00" d="M12 3h9v9h-9z" /><path fill="#00a4ef" d="M2 13h9v9H2z" /><path fill="#ffb900" d="M12 13h9v9h-9z" /></svg> : <svg className="dl-platform-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 2.1c.2 1.5-.5 2.9-1.3 3.8-.9 1-2.3 1.7-3.7 1.6-.2-1.5.6-3 1.4-3.9.9-.9 2.4-1.6 3.6-1.5ZM20.6 17.8c-.5 1.1-.8 1.6-1.5 2.6-.9 1.2-2.1 2.7-3.5 2.7-1.3 0-1.7-.9-3.5-.9s-2.3.9-3.6.9c-1.3 0-2.4-1.3-3.4-2.5-2.6-3.6-2.9-7.8-1.3-10 1.1-1.6 2.8-2.4 4.4-2.4 1.4 0 2.3.9 3.5.9 1.1 0 1.8-.9 3.5-.9 1.3 0 2.7.7 3.7 1.8-3.3 1.8-2.8 6.3 1.2 7.8Z" /></svg>
}

export default function DownloadPage() {
  const language = useSiteLanguage()
  const english = language === 'en'
  const t = (zh: string, en: string) => english ? en : zh
  const platforms = platformsZh.map(platform => ({ ...platform, label: english ? ({ 'win32-x64': 'Windows x64', 'win32-arm64': 'Windows ARM64', 'darwin-x64': 'macOS Intel', 'darwin-arm64': 'macOS Apple silicon' }[platform.id]) : platform.label, detail: english ? ({ 'win32-x64': 'For Windows devices with an x64 processor', 'win32-arm64': 'For Windows devices with an ARM processor', 'darwin-x64': 'For Mac computers with an Intel processor', 'darwin-arm64': 'For Mac computers with an Apple M-series processor' }[platform.id]) : platform.detail }))
  const [variant, setVariant] = useState<InstallerVariant>('darwin-arm64')
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  const [detected, setDetected] = useState<InstallerVariant | null>(null)
  useEffect(() => {
    if (/Windows/i.test(navigator.userAgent)) setVariant('win32-x64')
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
      <div className="dl-title-wrap"><div className="dl-doodle dl-doodle-left" aria-hidden="true"><svg viewBox="0 0 65 40"><path d="m8 32 7-20 9 12L34 5l9 21 15-8" /></svg><img src={`${import.meta.env.BASE_URL}iterlay-logo.png`} alt="" /></div><h1 id="download-title">{t("下载 ","Download ")}<span>Iterlay<svg viewBox="0 0 360 38" preserveAspectRatio="none" aria-hidden="true"><path d="M9 24C98 1 221 3 348 11M72 34c71-17 159-21 240-16" /></svg></span>{t(" 客户端","")}</h1><div className="dl-doodle dl-doodle-right" aria-hidden="true"><div><Layers3 size={28} /></div><svg viewBox="0 0 85 35"><path d="M6 27Q38 5 76 8M24 32Q50 17 69 18" /></svg></div></div>
      <p className="dl-subtitle">{t("图片、视频与创作工作流，在同一个 App 开始","Bring images, videos and creative workflows together in one app.")}</p>
      <div className="dl-meta"><p>{t("支持 macOS、Windows，桌面客户端免费开源","Free, open-source desktop app for macOS and Windows.")}</p><p>{t("请保持客户端为最新版本，获取最新功能。","Use a current version for the latest changes. ")}<a href={releasesUrl}>{t("查看更新说明","Read release notes")}</a></p><p>{t("开发者：Davied-H","Developer: Davied-H")}<span className="dl-meta-divider">|</span><a href={`${repository}/blob/main/LICENSE`}>{t("开源许可","License")}</a><span className="dl-meta-divider">|</span>{status === 'loading' ? t('正在读取版本信息…','Loading release information…') : stable ? <>{t('版本号：','Version: ')}{stable.tag_name}<span className="dl-meta-divider">|</span>{t('更新时间：','Updated: ')}{new Date(stable.published_at).toLocaleDateString(english ? 'en-US' : 'zh-CN').replaceAll('/', '–')}</> : status === 'error' ? t('版本信息暂不可用','Release information unavailable') : t('暂无稳定版本','No stable release listed')}</p></div>
    </section>
    <section className="dl-panels" aria-label={t("客户端下载","Desktop app downloads")}>
      <div className="dl-desktop-panel"><h2>{t("桌面端","Desktop")}</h2>
        <div className="dl-status" role="status">{status === 'error' && <><span>{t("暂时无法读取版本列表。","The release list could not be loaded.")}</span><button onClick={() => setRetry(value => value + 1)}>{t("重新加载","Reload")}</button><a href={releasesUrl}>{t("前往 GitHub Releases","Open GitHub Releases")}<ArrowUpRight size={12} /></a></>}</div>
        <div className="dl-platform-list">{platforms.map(platform => {
          const installer = releaseInstallers(releases, platform.id).find(item => !item.release.prerelease)
          const current = detected === platform.id
          return <article className={`dl-platform-row ${current ? 'is-current' : ''}`} key={platform.id}>
            <div className="dl-platform-content"><h3><PlatformIcon system={platform.system} />{platform.label}</h3><p>{platform.detail}<button className="dl-history-link" onClick={() => { setVariant(platform.id); document.getElementById('release-history-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }) }}>{t("历史版本","Version history")}</button></p>{status === 'ready' && !installer && <small>{t("此平台暂未发布稳定版安装包","No stable installer is listed for this platform.")}</small>}</div>
            {current && <span className="dl-current-badge">{t("当前设备","Detected device")}</span>}
            {status === 'loading' ? <span className="dl-row-loading" aria-label={t(`正在读取 ${platform.label} 安装包`, `Loading ${platform.label} installers`)} /> : installer ? <a className="dl-row-download" href={installer.asset.browser_download_url} aria-label={t(`下载 ${platform.label}`, `Download ${platform.label}`)} title={t(`下载 ${platform.label} ${installer.release.tag_name}`, `Download ${platform.label} ${installer.release.tag_name}`)}><ArrowDownToLine size={25} /></a> : <a className="dl-row-download dl-row-fallback" href={releasesUrl} aria-label={t(`查看 ${platform.label} 发布情况`, `View ${platform.label} availability`)} title={t("前往 GitHub 查看发布情况","View availability on GitHub")}><ExternalLink size={21} /></a>}
          </article>
        })}<article className="dl-platform-row dl-source-row"><div className="dl-platform-content"><h3><Code2 size={23} />{t("从源码运行","Run from source")}</h3><p>{t("查看开源代码、本地开发与构建说明。","Read the source, development and build instructions. ")}<a href={english ? `${repository}#develop-and-contribute` : `${repository}/blob/main/README.zh-CN.md#开发与贡献`}>{t("开发文档","Development guide")}</a></p></div><a className="dl-row-download" href={repository} aria-label={t("查看源码","View source")}><ArrowUpRight size={24} /></a></article></div>
      </div>
      <aside className="dl-companion-panel"><h2>{t("其他设备","Another device")}</h2><div className="dl-qr"><img src={`${import.meta.env.BASE_URL}download-qr.svg`} width="200" height="200" alt={t("扫码打开 Iterlay 官方下载页面","QR code for the Iterlay official download page")} /></div><p className="dl-scan-label">{t("扫码打开官方下载页","Scan to open the official download page")}</p><div className="dl-device-note"><Monitor size={31} strokeWidth={1.5} /><h3>{t("创作，在电脑上继续","Continue creating on your computer")}</h3><p>{t("Iterlay 为桌面创作而设计。","Iterlay is designed for desktop work.")}<br />{t("在 Mac 或 Windows 上下载安装，","Install it on a Mac or Windows device")}<br />{t("连接你自己的 AI 服务商。","and connect your own AI provider.")}</p><span><Check size={13} />{t("免费开源，无需激活","Free and open source; no activation")}</span></div></aside>
    </section>
    <p className="dl-install-note">{t("AI 功能需要自行配置服务商 API Key。安装包由 GitHub Releases 提供。","AI features require your own provider configuration. Installers come from GitHub Releases.")}<a href={releasesUrl}>{t("所有发布版本","All releases")}<ArrowUpRight size={12} /></a></p>
    <p className="dl-install-note"><Link to={sitePath('/help', language)}>{t('配置、保存与安装排障','Setup, saving and installation help')}</Link></p>
    <section className="dl-history" aria-labelledby="release-history-title"><div className="dl-history-heading"><div><h2 id="release-history-title">{t("版本记录","Release history")}</h2><p>{t("查看更新说明与历史安装包","Read published notes and find earlier installers.")}</p></div><label>{t("选择平台","Platform")}<select aria-label={t("版本记录平台","Release-history platform")} value={variant} onChange={event => setVariant(event.target.value as InstallerVariant)}>{platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.label}</option>)}</select></label></div>
      <p className="dl-release-note">{t('以下版本、说明与安装包均来自实际 GitHub Releases。英文页提供与发布原文对应的译文，可通过下方链接核对原始记录，issue 编号可直接打开；仅关闭 issue 不代表已发版，请核对包含修复的版本标签与同条安装包。','Tags, notes and installers below come from actual GitHub Releases. English translations match the published source revision; original notes are linked for verification. Notes without a matching translation are explicitly labeled. Issue references link to the issue; a closed issue alone does not prove a fix has shipped. Match the release tag to its installer.')} <Link to={sitePath('/help', language)}>{t('如何确认修复版本','How to verify a released fix')}</Link></p>
      {status === 'loading' ? <p className="dl-history-state">{t('正在读取 GitHub Releases…','Loading GitHub Releases…')}</p> : status === 'error' ? <p className="dl-history-state">{t("版本记录暂不可用，可重新加载或直接","Release history is unavailable. Reload or ")}<a href={releasesUrl}>{t("打开 GitHub Releases","open GitHub Releases")}</a>{english ? '.' : '。'}</p> : installers.length === 0 ? <p className="dl-history-state">{t(`暂无 ${platformName} 安装包。`, `No ${platformName} installer is listed.`)}</p> : <div className="dl-history-list">{installers.map(({ release, asset }) => <article key={asset.id}><div><h3>{release.tag_name}<span>{release.prerelease ? t('测试版','Prerelease') : t('稳定版','Stable')}</span></h3><time dateTime={release.published_at}>{new Date(release.published_at).toLocaleDateString(english ? 'en-US' : 'zh-CN')}</time></div><div><ReleaseNotes body={release.body} english={english} tag={release.tag_name} /><a href={release.html_url}>{t("完整发布说明","Original release notes")}<ArrowUpRight size={12} /></a></div><a className="dl-history-download" href={asset.browser_download_url}>{t("下载此版本","Download this release")}<ArrowDownToLine size={15} /></a></article>)}</div>}
    </section>
  </div>
}
