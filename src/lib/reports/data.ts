import 'server-only'
import { addCategory, allArticles, saveArticle } from '../articles'
import { saveQuality } from '../articleQuality'
import { withPhotoDb } from '../photos/server'
import { checkReport, type Quality } from '../previews/quality'
import { leagueOfKey, ourClubName, type PreviewLeague } from '../previews/data'
import { knownCoach } from '../rettelser'
import { shownDivisions } from '../../data/leagues'
import { clubKey } from '../photos/paths'
import { buildReport, type Report, type ReportInput } from './build'

// The data behind the match reports (src/lib/reports/build.ts) and their drafts: a finished match in a report
// league with its goals, cards, referee and coaches from DBU's match page (billeder.db, once the nightly job
// has read it), the season's results, each club's next match, and Matchly's preview of the match. The coach
// is the datavagt's corrected one when there is one (DBU's reports sometimes name someone else). Drafts only.

/** The leagues that get match reports by themselves (the owner's choice: 3. division first, 2026-10-07) */
export const reportLeagues = (): PreviewLeague[] =>
  (process.env.REPORT_LEAGUES ?? '3div')
    .split(',')
    .map((s) => s.trim())
    .map((id) => leagueOfKey(`_${poolOf(id)}`))
    .filter((l): l is PreviewLeague => !!l)

const POOLS: Record<string, string | undefined> = { '1div': process.env.PREVIEW_POOL_1DIV ?? '507530', '3div': process.env.PREVIEW_POOL_3DIV ?? '508657' }
const poolOf = (id: string) => POOLS[id] ?? '-'
const SEASON = process.env.PREVIEW_SEASON ?? '2026/27'

/** Matchly's club page and slug for a DBU club name */
function ourClub(name: string): { page?: string; slug?: string } {
  const key = clubKey(name)
  for (const d of shownDivisions()) for (const c of d.clubs) if (clubKey(c.name) === key || clubKey(c.originalName ?? '') === key) return { page: `/klub/${c.slug}`, slug: c.slug }
  return {}
}

type Row = Record<string, unknown>

export interface ReportItem {
  key: string
  league: PreviewLeague
  input: ReportInput
  report: Report
  quality: Quality
  /** The players on each club's team sheet for the match, by club id */
  sheets: Record<string, string[]>
}

/** Played matches of the league in the last `days` days that have their details and no report yet */
export function finishedWithoutReport(league: PreviewLeague, days = 5): string[] {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const slugs = new Set(allArticles().map((a) => a.slug))
  return withPhotoDb((db) =>
    db
      .prepare(`SELECT match_key, date, home_id, away_id FROM matches WHERE match_key LIKE ? AND has_events = 1 AND has_details = 1 AND home_score IS NOT NULL AND date >= ? ORDER BY date`)
      .all(`dbu:%_${league.pool}`, from),
  )
    .filter((r) => !slugs.has(reportFor(String(r.match_key))?.report.slug ?? ''))
    .map((r) => String(r.match_key))
}

/** The report of one finished match, built but not checked against others */
export function reportFor(key: string): Omit<ReportItem, 'quality'> | undefined {
  const league = leagueOfKey(key)
  if (!league) return undefined
  return withPhotoDb((db) => {
    const m = db
      .prepare(`SELECT m.*, h.name hn, a.name an FROM matches m LEFT JOIN clubs h ON h.id = m.home_id LEFT JOIN clubs a ON a.id = m.away_id WHERE m.match_key = ? AND m.has_events = 1`)
      .all(key)[0] as Row | undefined
    if (!m || m.home_score == null) return undefined
    // Matchly's own club names in the text ("ASA Aarhus", not DBU's "ASA, Aarhus")
    const names = Object.fromEntries(db.prepare('SELECT id, name FROM clubs').all().map((r) => [String(r.id), ourClubName(String(r.name))]))
    const list = (v: unknown): string[] => {
      try {
        const a = JSON.parse(String(v ?? '[]')) as unknown
        return Array.isArray(a) ? a.map(String) : []
      } catch {
        return []
      }
    }
    const team = (id: unknown, name: unknown, coach: unknown, staff: unknown) => {
      const dbu = String(name ?? id)
      const ours = ourClub(dbu)
      return { id: String(id), name: ourClubName(dbu), page: ours.page, coach: (ours.slug && knownCoach(ours.slug)?.name) || ((coach as string) ?? null), staff: list(staff) }
    }
    const date = String(m.date)
    const results = db
      .prepare(`SELECT date, home_id, away_id, home_score, away_score FROM matches WHERE match_key LIKE ? AND has_events = 1 AND home_score IS NOT NULL AND date <= ?`)
      .all(`dbu:%_${league.pool}`, date)
      .map((r) => ({ date: String(r.date), homeId: String(r.home_id), awayId: String(r.away_id), hs: Number(r.home_score), as: Number(r.away_score) }))
    const goals = db.prepare(`SELECT minute, name, club_id FROM goals WHERE match_key = ? ORDER BY seq`).all(key).map((r) => ({ minute: r.minute == null ? null : Number(r.minute), name: String(r.name), clubId: String(r.club_id) }))
    const events = db.prepare(`SELECT kind, minute, name, club_id FROM match_events WHERE match_key = ? AND kind IN ('yellow','red') ORDER BY seq`).all(key).map((r) => ({ kind: String(r.kind), minute: r.minute == null ? null : Number(r.minute), name: String(r.name), clubId: String(r.club_id) }))
    const sheets: Record<string, string[]> = {}
    for (const r of db.prepare(`SELECT club_id, name FROM lineups WHERE match_key = ?`).all(key)) (sheets[String(r.club_id)] ??= []).push(String(r.name))
    const next: ReportInput['next'] = {}
    for (const id of [String(m.home_id), String(m.away_id)]) {
      const n = db
        .prepare(`SELECT date, home_id, away_id FROM matches WHERE match_key LIKE ? AND has_events = 0 AND date > ? AND (home_id = ? OR away_id = ?) ORDER BY date LIMIT 1`)
        .all(`dbu:%_${league.pool}`, date, id, id)[0]
      if (n) next[id] = { date: String(n.date), home: String(n.home_id) === id, opponent: names[String(String(n.home_id) === id ? n.away_id : n.home_id)] ?? '' }
    }
    const input: ReportInput = {
      match: { key, date, time: (m.kickoff as string) ?? null, venue: (m.venue as string) ?? null, referee: (m.referee as string) ?? null, home: team(m.home_id, m.hn, m.home_coach, m.home_trainers), away: team(m.away_id, m.an, m.away_coach, m.away_trainers), hs: Number(m.home_score), as: Number(m.away_score) },
      league,
      season: SEASON,
      results,
      names,
      goals,
      events,
      next,
    }
    // Matchly's preview of the match, when it is live
    const preview = allArticles().find((a) => a.status === 'published' && a.slug.startsWith('optakt-') && a.slug.endsWith(date) && a.tags.includes(input.match.home.name) && a.tags.includes(input.match.away.name))
    if (preview) input.preview = { title: preview.title, path: `/artikler/${preview.slug}` }
    return { key, league, input, report: buildReport(input), sheets }
  })
}

/** Several reports, each checked against the others of the batch and its own team sheets */
export function reportBatch(keys: string[]): ReportItem[] {
  const built = keys.map(reportFor).filter((r): r is NonNullable<typeof r> => !!r)
  const others = built.map((b) => b.report)
  return built.map((b) => ({ ...b, quality: checkReport(b.input, b.report, { others, sheets: b.sheets }) }))
}

/** Writes the report as a draft with its quality mark; a published one is never touched, a blocked one not made */
export function saveReportDraft(item: ReportItem): { id?: number; skipped?: string } {
  if (item.quality.level === 'blocked') return { skipped: item.quality.reasons.join(' · ') }
  const existing = allArticles().find((a) => a.slug === item.report.slug)
  if (existing?.status === 'published') return { skipped: 'Allerede udgivet', id: existing.id }
  addCategory('Referater')
  const r = saveArticle({ id: existing?.id, ...item.report, category: 'Referater', author: 'Matchly', status: 'draft' })
  if (r.error || !r.article) return { skipped: r.error }
  saveQuality(r.article.id, { ...item.quality, kind: 'report', league: item.league.id })
  return { id: r.article.id }
}
