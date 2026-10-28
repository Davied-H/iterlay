import { releaseNoteParts } from './releases.mjs'
import type { ReactNode } from 'react'
import { localizedReleaseBody } from './release-copy'

export default function ReleaseNotes({ body, english, tag }: { body: string | null; english: boolean; tag: string }) {
  if (!body) return <p className="release-text">{english ? 'No release notes were published for this version.' : '此版本未提供发布说明。'}</p>
  const localized = localizedReleaseBody(tag, body, english)
  return <><p className="release-translation-note">{english ? localized.translated ? 'English translation of the published notes. The original is linked below.' : 'Original published notes; a translation is not available for this revision.' : '发布说明原文；下方链接可核对 GitHub 发布记录。'}</p><p className="release-text" lang={/\p{Script=Han}/u.test(localized.body) ? 'zh-CN' : 'en'}>{(releaseNoteParts(localized.body) as Array<{ text?: string; href?: string; image?: boolean; alt?: string; src?: string }>).map((part, index): ReactNode => part.image
    ? <img className="release-image" key={index} src={part.src} alt={part.alt || (english ? 'Release illustration' : '版本配图')} loading="lazy" />
    : part.href
    ? <a key={index} href={part.href} target="_blank" rel="noreferrer">{part.text}</a>
    : part.text)}</p></>
}
