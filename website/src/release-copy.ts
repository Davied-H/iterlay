import translations from './release-translations.json'

// Only show a translation when it matches the exact published source revision.
// A changed upstream note must never silently reuse an outdated translation.
export function localizedReleaseBody(tag: string, body: string, english: boolean) {
  const record = (translations as Record<string, { source: string; en: string }>)[tag]
  const translated = Boolean(english && record?.source === body)
  return { body: translated ? record.en : body, translated }
}
