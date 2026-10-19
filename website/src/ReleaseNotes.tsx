import { releaseNoteParts } from './releases.mjs'

export default function ReleaseNotes({ body, english }: { body: string | null; english: boolean }) {
  if (!body) return <p className="release-text">{english ? 'No release notes were published for this version.' : '此版本未提供发布说明。'}</p>
  return <p className="release-text">{releaseNoteParts(body).map((part, index) => part.href
    ? <a key={index} href={part.href} target="_blank" rel="noreferrer">{part.text}</a>
    : part.text)}</p>
}
