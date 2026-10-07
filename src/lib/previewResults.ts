import 'server-only'
import { findMatch } from '../data/matches'
import { publishedArticles, saveArticle } from './articles'
import { hasResult, isRoundUp, previewMatchSlug, withResult, withoutResult } from './previewResultText'
import { findPastMatch } from './pastMatch'
import { dateFromMatchSlug } from './slug'

// Previews kept fresh after the match: every half hour the published previews (category Optakter, the last
// 30 days; not round-ups of a day's matches) whose match is finished – in the live data or the match database – get the result at the top, with a link to the match page – what someone
// coming from Google after the match is looking for, and an updated page for the search engines.
// Once per preview (the line is the mark). PREVIEW_RESULTS=off stops it.

export function addPreviewResults(now = Date.now()): number {
  let done = 0
  for (const a of publishedArticles({ category: 'optakter', limit: 100 }).articles) {
    // A round-up of a day's matches is no preview of one match: no result line (and away with one put there before)
    if (isRoundUp(a.content)) {
      if (hasResult(a.content)) saveArticle({ ...a, content: withoutResult(a.content) })
      continue
    }
    if (hasResult(a.content) || !a.publishedAt || now - Date.parse(a.publishedAt) > 30 * 86_400_000) continue
    const slug = previewMatchSlug(a.content)
    const date = slug && dateFromMatchSlug(slug)
    if (!slug || !date) continue
    // The live data first; an older match from the match database
    const past = findMatch(slug, date, now) ? undefined : findPastMatch(slug)
    const m = findMatch(slug, date, now) ?? (past && 'match' in past ? past.match : undefined)
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
