import 'server-only'
import path from 'node:path'
import { shownDivisions } from '../../data/leagues'
import { addCategory, allArticles, saveArticle } from '../articles'
import { dataDir } from '../photos/config'
import { withPhotoDb } from '../photos/server'
import { clubKey } from '../photos/paths'
import { buildPreview, type Fixture, type Goal, type League, type Meeting, type Preview, type PreviewInput, type Result } from './build'
import { checkPreview, type Quality } from './quality'
import { previewFacts, type FactLink } from './facts'
import { saveQuality } from '../articleQuality'
import { readDatavagt } from '../datavagt'
import { dbuTvChannel } from '../channels'

// The data behind the match previews (src/lib/previews/build.ts) and their drafts:
// the fixture, this season's results and scorers from DBU (billeder.db, one pool per
// league), and the clubs' meetings since 2001 from football.db and the statistics
// bank. Previews are saved as drafts – nothing is published by itself.

export interface PreviewLeague extends League {
  /** Our division id (src/data/leagues.ts) */
  id: string
  /** The league's pool at DBU this season (see PHOTOS_DBU_POOLS); next season gets new numbers */
  pool: string
  /** What the VS graphic's top line calls it */
  graphic: string
  /** A women's league: its data lives in data/dbu-kvinder.db (src/lib/reports/women.ts), never with the men's clubs */
  women?: boolean
}

/**
 * The leagues that get previews by themselves, one at a time (the owner's choice): 1. division first, then
 * 3. division from 2026-10-07. PREVIEW_LEAGUES="1div,3div" in the server's env picks them; a pool can be
 * moved with PREVIEW_POOL_<ID> (PREVIEW_POOL_3DIV=…) when DBU starts the spring's pools.
 */
const ALL_LEAGUES: PreviewLeague[] = [
  { id: '1div', pool: process.env.PREVIEW_POOL_1DIV ?? process.env.PREVIEW_DBU_POOL ?? '507530', name: '1. division', sponsor: 'Betinia Liga', page: '/turnering/1-division', graphic: 'Betinia Liga' },
  { id: '3div', pool: process.env.PREVIEW_POOL_3DIV ?? '508657', name: '3. division', sponsor: 'CampoBet 3. Division', page: '/turnering/3-division', graphic: 'CampoBet 3. Division' },
  // The women's top league: match reports from 2026-10-08 (no previews yet), from its own database
  { id: 'aliga', pool: process.env.PREVIEW_POOL_ALIGA ?? '508850', name: 'A-Liga', page: '/turnering/x-denmark-a-liga', graphic: 'A-Liga', women: true },
]
export const previewLeagues = (): PreviewLeague[] => {
  const on = (process.env.PREVIEW_LEAGUES ?? '1div,3div').split(',').map((s) => s.trim())
  return ALL_LEAGUES.filter((l) => on.includes(l.id))
}
/** The league a fixture's DBU key belongs to ("dbu:<match>_<pool>") */
export const leagueOfKey = (key: string): PreviewLeague | undefined => ALL_LEAGUES.find((l) => key.endsWith(`_${l.pool}`))
/** The 1. division pool, kept for older callers */
export const PREVIEW_POOL = ALL_LEAGUES[0].pool
const SEASON = process.env.PREVIEW_SEASON ?? '2026/27'

type Row = Record<string, unknown>
type Sqlite = { DatabaseSync: new (f: string, o?: { readOnly?: boolean }) => { prepare(s: string): { all(...p: unknown[]): Row[] }; close(): void } }

function readOnly<T>(file: string, fn: (db: { prepare(s: string): { all(...p: unknown[]): Row[] } }) => T, fallback: T): T {
  const lib = process.getBuiltinModule?.('node:sqlite') as Sqlite | undefined
  if (!lib) return fallback
  try {
    const db = new lib.DatabaseSync(file, { readOnly: true })
    try {
      return fn(db)
    } finally {
      db.close()
    }
  } catch {
    return fallback
  }
}

/** Matchly's own name for a DBU club name (the one the logos are kept under), or the name itself */
export function ourClubName(name: string): string {
  const key = clubKey(name)
  for (const d of shownDivisions()) for (const c of d.clubs) if (clubKey(c.name) === key || clubKey(c.originalName ?? '') === key) return c.name
  return name
}

/** Matchly's club slug for a DBU club name */
export function clubSlugOf(name: string): string | undefined {
  const key = clubKey(name)
  for (const d of shownDivisions()) for (const c of d.clubs) if (clubKey(c.name) === key || clubKey(c.originalName ?? '') === key) return c.slug
  return undefined
}

/**
 * The internal links that exist for a match (for the Claude writer, who may use these only): both club pages, the
 * league, the match page and the clubs' head-to-head page. Our match pages are /kamp/<home>-<away>-<date> by
 * the clubs' own slugs.
 */
export function matchLinks(homeDbu: string, awayDbu: string, date: string, league: PreviewLeague): FactLink[] {
  const h = clubSlugOf(homeDbu)
  const a = clubSlugOf(awayDbu)
  const out: FactLink[] = [{ label: league.name, href: league.page }]
  if (h) out.push({ label: ourClubName(homeDbu), href: `/klub/${h}` })
  if (a) out.push({ label: ourClubName(awayDbu), href: `/klub/${a}` })
  if (h && a) {
    out.push({ label: `${ourClubName(homeDbu)} – ${ourClubName(awayDbu)} (kampsiden)`, href: `/kamp/${h}-${a}-${date}` })
    out.push({ label: `Alle opgør mellem ${ourClubName(homeDbu)} og ${ourClubName(awayDbu)}`, href: `/opgoer/${h}-mod-${a}` })
  }
  return out
}

/** Matchly's club page for a DBU club name */
function clubPage(name: string): string | undefined {
  const key = clubKey(name)
  for (const d of shownDivisions()) for (const c of d.clubs) if (clubKey(c.name) === key || clubKey(c.originalName ?? '') === key) return `/klub/${c.slug}`
  return undefined
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })

export interface UpcomingFixture extends Fixture {
  league: PreviewLeague
  draft?: { id: number; status: string; updatedAt: string }
}

/** The leagues' matches from today and the next `days` days (every preview league, or one) */
export function upcomingFixtures(days = 14, only?: PreviewLeague): UpcomingFixture[] {
  return (only ? [only] : previewLeagues()).flatMap((l) => leagueFixtures(l, days))
}

function leagueFixtures(league: PreviewLeague, days: number): UpcomingFixture[] {
  const to = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  // Drafts as well as published articles (articleBySlug only finds live ones)
  const bySlug = new Map(allArticles().map((a) => [a.slug, a]))
  return withPhotoDb((db) =>
    db
      .prepare(
        `SELECT m.match_key, m.date, m.kickoff, m.venue, m.tv, m.home_id, m.away_id, h.name hn, a.name an FROM matches m
         LEFT JOIN clubs h ON h.id = m.home_id LEFT JOIN clubs a ON a.id = m.away_id
         WHERE m.match_key LIKE ? AND m.has_events = 0 AND m.date >= ? AND m.date <= ? ORDER BY m.date, m.kickoff`,
      )
      .all(`dbu:%_${league.pool}`, today(), to),
  ).map((r) => {
    const fx: UpcomingFixture = {
      league,
      key: String(r.match_key),
      date: String(r.date),
      time: (r.kickoff as string) ?? null,
      venue: (r.venue as string) ?? null,
      // Only a real channel: DBU writes the league's name where there is no TV
      tv: dbuTvChannel(r.tv as string),
      // Matchly's own club names in the text ("ASA Aarhus", not DBU's "ASA, Aarhus")
      home: { id: String(r.home_id), name: ourClubName(String(r.hn ?? r.home_id)), dbu: String(r.hn ?? r.home_id), page: clubPage(String(r.hn ?? '')) },
      away: { id: String(r.away_id), name: ourClubName(String(r.an ?? r.away_id)), dbu: String(r.an ?? r.away_id), page: clubPage(String(r.an ?? '')) },
    }
    const existing = bySlug.get(buildPreview({ fixture: fx, league, season: SEASON, results: [], names: {}, goals: [], meetings: [] }).slug)
    if (existing) fx.draft = { id: existing.id, status: existing.status, updatedAt: existing.updatedAt }
    return fx
  })
}

/** Every league meeting of the two clubs before the date: football.db, the statistics bank and DBU's sheets, each match once */
function meetings(fx: Fixture): Meeting[] {
  // Both the club's own name and its DBU name count (older matches are stored under either)
  const hks = new Set([fx.home.name, fx.home.dbu ?? ''].filter(Boolean).map(clubKey))
  const aks = new Set([fx.away.name, fx.away.dbu ?? ''].filter(Boolean).map(clubKey))
  const hk = clubKey(fx.home.dbu ?? fx.home.name)
  const ak = clubKey(fx.away.dbu ?? fx.away.name)
  const first = (k: string) => `%${k.split(' ')[0]}%`
  const seen = new Set<string>()
  const out: Meeting[] = []
  const add = (date: string, home: string, away: string, hs: unknown, as: unknown) => {
    if (hs == null || as == null || date >= fx.date) return
    const h = clubKey(home)
    const a = clubKey(away)
    const atHome = hks.has(h) && aks.has(a)
    if (!atHome && !(aks.has(h) && hks.has(a))) return
    const id = `${date}|${[h, a].sort().join('|')}`
    if (seen.has(id)) return
    seen.add(id)
    out.push({ date, atHome, forHome: Number(atHome ? hs : as), forAway: Number(atHome ? as : hs) })
  }
  const statsDb = process.env.STATS_DB ?? path.join(dataDir(), 'football.db')
  const archiveDb = process.env.ARCHIVE_DB ?? path.join(dataDir(), 'scoreline-arkiv.db')
  const q = `SELECT start_date d, home_name h, away_name a, home_score hs, away_score as_ FROM matches WHERE (home_name LIKE ? OR home_name LIKE ?) AND (away_name LIKE ? OR away_name LIKE ?)`
  const params = [first(hk), first(ak), first(hk), first(ak)]
  for (const file of [statsDb, archiveDb]) for (const r of readOnly(file, (db) => db.prepare(q).all(...params), [] as Row[])) add(String(r.d).slice(0, 10), String(r.h), String(r.a), r.hs, r.as_)
  withPhotoDb((db) => {
    for (const r of db
      .prepare(`SELECT m.date, h.name hn, a.name an, m.home_score, m.away_score FROM matches m JOIN clubs h ON h.id = m.home_id JOIN clubs a ON a.id = m.away_id WHERE m.has_events = 1`)
      .all())
      add(String(r.date), String(r.hn), String(r.an), r.home_score, r.away_score)
  })
  return out
}

export function previewFor(key: string) {
  const league = leagueOfKey(key)
  const fx = league && upcomingFixtures(60, league).find((f) => f.key === key)
  if (!fx) return undefined
  const { results, goals, names } = withPhotoDb((db) => {
    const results: Result[] = db
      .prepare(`SELECT date, home_id, away_id, home_score, away_score FROM matches WHERE match_key LIKE ? AND has_events = 1 AND home_score IS NOT NULL AND date < ?`)
      .all(`dbu:%_${fx.league.pool}`, fx.date)
      .map((r) => ({ date: String(r.date), homeId: String(r.home_id), awayId: String(r.away_id), hs: Number(r.home_score), as: Number(r.away_score) }))
    const goals: Goal[] = db
      .prepare(`SELECT g.club_id, g.name FROM goals g JOIN matches m ON m.match_key = g.match_key WHERE g.match_key LIKE ? AND m.date < ?`)
      .all(`dbu:%_${fx.league.pool}`, fx.date)
      .map((r) => ({ clubId: String(r.club_id), name: String(r.name) }))
    const names = Object.fromEntries(db.prepare('SELECT id, name FROM clubs').all().map((r) => [String(r.id), ourClubName(String(r.name))]))
    return { results, goals, names }
  })
  const input = { fixture: fx, league: fx.league, season: SEASON, results, names, goals, meetings: meetings(fx) }
  return { fixture: fx, input, preview: buildPreview(input) }
}

/** Each club's players this season from DBU's team sheets (club id → names), for checking the names a preview uses */
function squads(pool: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  withPhotoDb((db) => {
    for (const r of db.prepare(`SELECT DISTINCT l.club_id, l.name FROM lineups l WHERE l.match_key LIKE ?`).all(`dbu:%_${pool}`)) (out[String(r.club_id)] ??= []).push(String(r.name))
  })
  return out
}

/** The DBU names of the clubs the datavagt has an open finding for, among the fixtures' clubs */
function flagged(fixtures: Fixture[]): string[] {
  const open = new Set(readDatavagt().findings.map((f) => f.club))
  return fixtures.flatMap((f) => [f.home.name, f.away.name]).filter((n) => open.has(ourClubName(n)))
}

export interface PreviewItem {
  fixture: UpcomingFixture
  input: PreviewInput
  preview: Preview
  quality: Quality
}

/** The previews of several fixtures, each checked against the others of the batch, the squads and the datavagt */
export function previewBatch(keys: string[]): PreviewItem[] {
  const built = keys.map((k) => previewFor(k)).filter((p): p is NonNullable<ReturnType<typeof previewFor>> => !!p)
  const others = built.map((b) => b.preview)
  const bySquad = new Map<string, Record<string, string[]>>()
  const flags = flagged(built.map((b) => b.fixture))
  return built.map((b) => {
    const pool = b.fixture.league.pool
    if (!bySquad.has(pool)) bySquad.set(pool, squads(pool))
    return { ...b, quality: checkPreview(b.input, b.preview, { others, squads: bySquad.get(pool), flagged: flags }) }
  })
}

/** Writes (or updates) the preview as a draft with its quality mark; a published preview is never touched, a blocked one is not made */
export function savePreviewDraft(key: string, item?: PreviewItem): { id?: number; slug?: string; error?: string; skipped?: string; quality?: Quality } {
  const p = item ?? previewBatch([key])[0]
  if (!p) return { error: 'Kampen findes ikke blandt de kommende kampe' }
  if (p.quality.level === 'blocked') return { skipped: `Ikke lavet: ${p.quality.reasons.join(' · ')}`, quality: p.quality }
  const existing = allArticles().find((a) => a.slug === p.preview.slug)
  if (existing?.status === 'published') return { skipped: 'Optakten er allerede udgivet – den røres ikke', id: existing.id, slug: existing.slug }
  addCategory('Optakter')
  const r = saveArticle({
    id: existing?.id,
    slug: p.preview.slug,
    title: p.preview.title,
    excerpt: p.preview.excerpt,
    content: p.preview.content,
    category: 'Optakter',
    tags: p.preview.tags,
    focusKeyword: p.preview.focusKeyword,
    seoTitle: p.preview.seoTitle,
    metaDescription: p.preview.metaDescription,
    author: 'Matchly',
    status: 'draft',
    // Automatic previews are not shared on social media (the owner's choice, 2026-10-07)
    noSocial: true,
  })
  if (r.error || !r.article) return { error: r.error ?? 'Kladden kunne ikke gemmes' }
  const links = matchLinks(p.fixture.home.dbu ?? p.fixture.home.name, p.fixture.away.dbu ?? p.fixture.away.name, p.fixture.date, p.fixture.league)
  saveQuality(r.article.id, { ...p.quality, kind: 'preview', league: p.fixture.league.id, facts: previewFacts(p.input, links, p.preview.focusKeyword) })
  return { id: r.article.id, slug: r.article.slug, quality: p.quality }
}
