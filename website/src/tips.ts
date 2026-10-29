export type TipStatus = 'draft' | 'published'

export interface TipLocaleCopy {
  category: string
  title: string
  summary: string
  story: string
  steps: string[]
  command: string
  note: string
  alt: string
}

export interface TipEntry {
  id: string
  date: string
  status: TipStatus
  image: string
  zh: TipLocaleCopy
  en: TipLocaleCopy
}

/**
 * Daily tips are intentionally content-addressable and status-gated.
 * A generated entry stays a draft until the user approves it; production
 * renders published entries only. Move the asset into this folder, add the
 * copy, then change status to published as the approval step.
 */
export const tipEntries: TipEntry[] = [
  {
    id: '2026-10-28-one-page-summary',
    date: '2026-10-28',
    status: 'draft',
    image: 'tips/2026-10-28-one-page-summary.png',
    zh: {
      category: '长文整理',
      title: '长文太长？先整理成一页重点',
      summary: '把文章、报告或网页内容先整理成重点，再决定要不要细读。',
      story: '遇到一篇很长的文章，我不会一上来就从头读。先把内容丢给 Coding Agent，让它帮我提炼结论、关键数据和行动建议。',
      steps: ['粘贴文章、报告或网页内容', '让 AI 提炼结论、关键数据和行动建议', '输入「$using-iterlay 帮我做成分享图」'],
      command: '$using-iterlay 帮我做成分享图',
      note: '先看重点，再决定要不要细读。',
      alt: '长文整理成一页重点的 Iterlay 技巧分享图',
    },
    en: {
      category: 'Long-form reading',
      title: 'Turn a long piece into one clear page',
      summary: 'Pull out the useful parts first, then decide whether the full text needs your time.',
      story: 'When an article is long, I do not start by reading every line. I give it to a coding agent first and ask for the conclusion, key data and next actions.',
      steps: ['Paste an article, report or web page', 'Ask AI to extract the conclusion, key data and next actions', 'Type “$using-iterlay make a share image”'],
      command: '$using-iterlay make a share image',
      note: 'See the important parts first, then decide what deserves a full read.',
      alt: 'Iterlay tip image showing a long article distilled into one clear page',
    },
  },
]

export function tipsFor(language: 'zh' | 'en', status: TipStatus) {
  return tipEntries.filter(tip => tip.status === status).map(tip => ({ ...tip, copy: tip[language] }))
}
