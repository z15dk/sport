import 'server-only'
import { findMatch } from '../data/matches'
import { publishedArticles, saveArticle } from './articles'
import { hasResult, previewMatchSlug, withResult } from './previewResultText'
import { dateFromMatchSlug } from './slug'

// Previews kept fresh after the match: every half hour the published previews (category Optakter, the last
// 30 days) whose match is finished get the result at the top, with a link to the match page – what someone
// coming from Google after the match is looking for, and an updated page for the search engines.
// Once per preview (the line is the mark). PREVIEW_RESULTS=off stops it.

export function addPreviewResults(now = Date.now()): number {
  let done = 0
  for (const a of publishedArticles({ category: 'optakter', limit: 100 }).articles) {
    if (hasResult(a.content) || !a.publishedAt || now - Date.parse(a.publishedAt) > 30 * 86_400_000) continue
    const slug = previewMatchSlug(a.content)
    const date = slug && dateFromMatchSlug(slug)
    if (!slug || !date) continue
    const m = findMatch(slug, date, now)
    if (!m || m.state !== 'finished' || m.home.score == null || m.away.score == null) continue
    const r = saveArticle({ ...a, content: withResult(a.content, { slug, home: m.home.name, away: m.away.name, hs: m.home.score, as: m.away.score }) })
    if (!r.error) done++
  }
  return done
}

let started = false

export function startPreviewResults() {
  if (started || process.env.PREVIEW_RESULTS === 'off') return
  started = true
  const tick = () => {
    try {
      addPreviewResults()
    } catch {
      // next time
    }
  }
  setTimeout(tick, 5 * 60_000).unref?.()
  setInterval(tick, 30 * 60_000).unref?.()
}
