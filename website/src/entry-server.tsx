import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import Site from './main'
export { metaHead, pageMeta, publicPaths, absoluteUrl } from './seo'
export { articles, isAgentContent } from './content'
export function render(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return renderToString(<StaticRouter basename={base || '/'} location={`${base}${path}`}><Site /></StaticRouter>)
}
