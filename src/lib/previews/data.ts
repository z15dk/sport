import 'server-only'
import path from 'node:path'
import { shownDivisions } from '../../data/leagues'
import { addCategory, allArticles, saveArticle } from '../articles'
import { dataDir } from '../photos/config'
import { withPhotoDb } from '../photos/server'
import { clubKey } from '../photos/paths'
import { buildPreview, type Fixture, type Goal, type Meeting, type Result } from './build'

// The data behind the match previews (src/lib/previews/build.ts) and their drafts:
// the fixture, this season's results and scorers from DBU (billeder.db, pool of
// 1. division), and the clubs' meetings since 2001 from football.db and the
// statistics bank. Previews are saved as drafts – nothing is published by itself.

/** 1. division 2026/27 at DBU (see PHOTOS_DBU_POOLS); next season gets a new number */
export const PREVIEW_POOL = process.env.PREVIEW_DBU_POOL ?? '507530'
const LEAGUE = { name: '1. division', sponsor: 'Betinia Liga', page: '/turnering/1-division' }
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

/** Matchly's club page for a DBU club name */
function clubPage(name: string): string | undefined {
  const key = clubKey(name)
  for (const d of shownDivisions()) for (const c of d.clubs) if (clubKey(c.name) === key || clubKey(c.originalName ?? '') === key) return `/klub/${c.slug}`
  return undefined
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })

export interface UpcomingFixture extends Fixture {
  draft?: { id: number; status: string; updatedAt: string }
}

/** The pool's matches from today and the next `days` days */
export function upcomingFixtures(days = 14): UpcomingFixture[] {
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
      .all(`dbu:%_${PREVIEW_POOL}`, today(), to),
  ).map((r) => {
    const fx: UpcomingFixture = {
      key: String(r.match_key),
      date: String(r.date),
      time: (r.kickoff as string) ?? null,
      venue: (r.venue as string) ?? null,
      tv: (r.tv as string) ?? null,
      home: { id: String(r.home_id), name: String(r.hn ?? r.home_id), page: clubPage(String(r.hn ?? '')) },
      away: { id: String(r.away_id), name: String(r.an ?? r.away_id), page: clubPage(String(r.an ?? '')) },
    }
    const existing = bySlug.get(buildPreview({ fixture: fx, league: LEAGUE, season: SEASON, results: [], names: {}, goals: [], meetings: [] }).slug)
    if (existing) fx.draft = { id: existing.id, status: existing.status, updatedAt: existing.updatedAt }
    return fx
  })
}

/** Every league meeting of the two clubs before the date: football.db, the statistics bank and DBU's sheets, each match once */
function meetings(fx: Fixture): Meeting[] {
  const hk = clubKey(fx.home.name)
  const ak = clubKey(fx.away.name)
  const first = (k: string) => `%${k.split(' ')[0]}%`
  const seen = new Set<string>()
  const out: Meeting[] = []
  const add = (date: string, home: string, away: string, hs: unknown, as: unknown) => {
    if (hs == null || as == null || date >= fx.date) return
    const h = clubKey(home)
    const a = clubKey(away)
    const atHome = h === hk && a === ak
    if (!atHome && !(h === ak && a === hk)) return
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
  const fx = upcomingFixtures(60).find((f) => f.key === key)
  if (!fx) return undefined
  const { results, goals, names } = withPhotoDb((db) => {
    const results: Result[] = db
      .prepare(`SELECT date, home_id, away_id, home_score, away_score FROM matches WHERE match_key LIKE ? AND has_events = 1 AND home_score IS NOT NULL AND date < ?`)
      .all(`dbu:%_${PREVIEW_POOL}`, fx.date)
      .map((r) => ({ date: String(r.date), homeId: String(r.home_id), awayId: String(r.away_id), hs: Number(r.home_score), as: Number(r.away_score) }))
    const goals: Goal[] = db
      .prepare(`SELECT g.club_id, g.name FROM goals g JOIN matches m ON m.match_key = g.match_key WHERE g.match_key LIKE ? AND m.date < ?`)
      .all(`dbu:%_${PREVIEW_POOL}`, fx.date)
      .map((r) => ({ clubId: String(r.club_id), name: String(r.name) }))
    const names = Object.fromEntries(db.prepare('SELECT id, name FROM clubs').all().map((r) => [String(r.id), String(r.name)]))
    return { results, goals, names }
  })
  return { fixture: fx, preview: buildPreview({ fixture: fx, league: LEAGUE, season: SEASON, results, names, goals, meetings: meetings(fx) }) }
}

/** Writes (or updates) the preview as a draft; a published preview is never touched */
export function savePreviewDraft(key: string): { id?: number; slug?: string; error?: string; skipped?: string } {
  const p = previewFor(key)
  if (!p) return { error: 'Kampen findes ikke blandt de kommende kampe' }
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
  })
  return r.error ? { error: r.error } : { id: r.article?.id, slug: r.article?.slug }
}
