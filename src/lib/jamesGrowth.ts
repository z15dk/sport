import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { allArticles } from './articles'
import { freshSearchConsole, type GscRow } from './growth'
import { OVERRIDE_PATHS } from './seoOverrideRules'
import { DAILY_TITLES, LOCK_DAYS, readSeoOverrides, setToday, type SeoBaseline } from './seoOverrides'
import { cacheDir } from './tsdb'
import { visitStats } from './visits'

// James' daily growth round (deploy/claude-editor/VAEKST.md): every morning he reads what this file gathers – the
// page views (yesterday, the day before, the same day last week), where the visitors came from, the Google numbers
// (the last 7 days against the 7 before, the pages close to page 1 with the searches that bring them, the pages
// rising and falling) and his own title tests with their numbers before and since – and acts: better titles on the
// pages close to page 1 (src/lib/seoOverrides.ts), keeping or undoing the tests that are 14 days old, a news draft
// for a search Matchly has no page for. What he did and why goes in his diary (data/vaekst/dagbog.json), shown on
// /admin/vaekst.

const DAY = 86_400_000
const dagbogFile = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'vaekst', 'dagbog.json')

export interface DiaryEntry {
  day: string
  at: number
  /** What the numbers say and what he did, in two to four sentences */
  text: string
  actions: string[]
  /** Article ideas for the news scout (it writes with Fable; the growth round only finds them): "Søgning – vinkel" */
  ideas?: string[]
  /** The numbers the entry was written from */
  numbers?: { viewsYesterday: number; viewsDayBefore: number; clicks7?: number; impressions7?: number; position7?: number }
}

export function readDiary(): DiaryEntry[] {
  try {
    return JSON.parse(readFileSync(dagbogFile(), 'utf8')) as DiaryEntry[]
  } catch {
    return []
  }
}

const danishDay = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(ms))

/** Today's entry (a second one the same day replaces the first) */
export function writeDiary(text: string, actions: string[], numbers?: DiaryEntry['numbers'], ideas: string[] = []): { error?: string } {
  if (!text?.trim()) return { error: 'Skriv hvad du har set og gjort' }
  const now = Date.now()
  const day = danishDay(now)
  const list = readDiary().filter((e) => e.day !== day)
  list.push({ day, at: now, text: text.trim().slice(0, 1500), actions: actions.map((a) => String(a).trim().slice(0, 300)).filter(Boolean).slice(0, 20), ideas: ideas.map((a) => String(a).trim().slice(0, 300)).filter(Boolean).slice(0, 5), numbers })
  mkdirSync(path.dirname(dagbogFile()), { recursive: true })
  writeFileSync(dagbogFile(), JSON.stringify(list.slice(-120), null, 2))
  return {}
}

/** "Brøndby → /klub/broendby-if" into its two halves */
const split = (r: GscRow) => {
  const i = r.key.lastIndexOf(' → ')
  return i < 0 ? { query: '', page: r.key } : { query: r.key.slice(0, i), page: r.key.slice(i + 3) }
}
const metrics = (r?: GscRow): SeoBaseline | undefined => r && { position: r.position, ctr: r.ctr, impressions: r.impressions, clicks: r.clicks }

/** A page's Google numbers of the last 28 days (the baseline of a title test) */
export async function pageBaseline(pagePath: string): Promise<SeoBaseline | undefined> {
  const g = await freshSearchConsole()
  return metrics(g?.pages?.find((r) => r.key === pagePath))
}

export async function growthBrief(now = Date.now()) {
  const g = await freshSearchConsole()
  const v = visitStats(7)
  const days = v?.days ?? []
  const viewsOn = (back: number) => days[days.length - 1 - back]?.views ?? 0
  const overrides = readSeoOverrides()
  const locked = new Set(Object.entries(overrides.pages).filter(([, o]) => now - o.at < LOCK_DAYS * DAY).map(([p]) => p))
  const pages7 = new Map((g?.pages7 ?? []).map((r) => [r.key, r]))
  const pagesPrev7 = new Map((g?.pagesPrev7 ?? []).map((r) => [r.key, r]))

  // The pages close to page 1 (places 7–20) that James may retitle, each with the searches that bring them
  const byPage = new Map<string, { page: string; impressions: number; clicks: number; position: number; queries: { query: string; impressions: number; clicks: number; position: number }[] }>()
  for (const r of g?.pairs ?? []) {
    const { query, page } = split(r)
    if (!OVERRIDE_PATHS.test(page)) continue
    const e = byPage.get(page) ?? byPage.set(page, { page, impressions: 0, clicks: 0, position: 0, queries: [] }).get(page)!
    e.queries.push({ query, impressions: r.impressions, clicks: r.clicks, position: r.position })
  }
  for (const r of g?.pages ?? []) {
    const e = byPage.get(r.key)
    if (e) Object.assign(e, { impressions: r.impressions, clicks: r.clicks, position: r.position })
  }
  const close = [...byPage.values()]
    .filter((e) => e.position >= 7 && e.position <= 20 && e.impressions >= 5 && !locked.has(e.page))
    .map((e) => ({ ...e, queries: e.queries.sort((a, b) => b.impressions - a.impressions).slice(0, 5), title: overrides.pages[e.page]?.title }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25)

  const change = [...new Set([...pages7.keys(), ...pagesPrev7.keys()])].map((page) => {
    const a = pages7.get(page)
    const b = pagesPrev7.get(page)
    return { page, impressions7: a?.impressions ?? 0, impressionsPrev7: b?.impressions ?? 0, clicks7: a?.clicks ?? 0, clicksPrev7: b?.clicks ?? 0, position7: a?.position, positionPrev7: b?.position }
  })
  const rising = change.filter((c) => c.impressions7 >= 10 && c.impressions7 >= c.impressionsPrev7 * 1.5).sort((a, b) => b.impressions7 - b.impressionsPrev7 - (a.impressions7 - a.impressionsPrev7)).slice(0, 15)
  const falling = change.filter((c) => c.impressionsPrev7 >= 10 && c.impressions7 <= c.impressionsPrev7 * 0.6).sort((a, b) => a.impressions7 - a.impressionsPrev7 - (b.impressions7 - b.impressionsPrev7)).slice(0, 15)

  // The searches seen most that bring no Matchly page into the top 20: room for an article
  const unserved = (g?.pairs ?? [])
    .map(split)
    .map((x, i) => ({ ...x, r: g!.pairs![i] }))
    .filter((x) => x.query && x.r.position > 20 && x.r.impressions >= 5)
    .sort((a, b) => b.r.impressions - a.r.impressions)
    .slice(0, 15)
    .map((x) => ({ query: x.query, page: x.page, impressions: x.r.impressions, position: x.r.position }))

  const tests = Object.entries(overrides.pages).map(([page, o]) => {
    const ageDays = Math.floor((now - o.at) / DAY)
    return { page, title: o.title, description: o.description, faq: o.faq?.map((f) => f.q), query: o.query, why: o.why, by: o.by, setOn: danishDay(o.at), ageDays, before: o.before, last7: metrics(pages7.get(page)), kept: o.kept, dueForVerdict: !o.kept && ageDays >= LOCK_DAYS }
  })

  return {
    today: danishDay(now),
    views: {
      yesterday: viewsOn(1),
      dayBefore: viewsOn(2),
      sameDayLastWeek: viewsOn(8),
      last14: days.slice(-15, -1),
      sources7: v?.refs ?? [],
      topPages7: v?.pages ?? [],
    },
    google: g
      ? { fetchedAt: g.fetchedAt, error: g.error, last7: g.last7, prev7: g.prev7, perDay: g.perDay.slice(-14), topQueries: g.topQueries }
      : { error: 'Ingen Google-tal (nøglen mangler på serveren)' },
    closeToPage1: close,
    rising,
    falling,
    unserved,
    titleTests: tests,
    limits: { titlesLeftToday: Math.max(0, DAILY_TITLES - setToday(overrides, now)), lockDays: LOCK_DAYS },
    articles: allArticles()
      .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
      .slice(0, 40)
      .map((a) => ({ slug: a.slug, title: a.title, status: a.status })),
    diary: readDiary().slice(-7),
  }
}
