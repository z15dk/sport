// The quality gate every automatic article passes before it becomes a draft (previews now, match reports
// next). Three outcomes: "blocked" – not made at all (too little data to say anything real), "yellow" – made,
// but the owner should read it (the reasons are listed in the mail), "green" – fine to publish with "Udgiv
// alle". The checks: enough data, the editor's checklist (SEO and Læsbarhed) without red, length, too much
// like another article of the same batch, people named that are not in the club's squad, numbers that don't
// add up, and clubs the datavagt has an open finding for. Pure (tests/previews).

import { seoChecks } from '../seoChecks.ts'
import { table, type PreviewInput, type Preview } from './build.ts'

export type QualityLevel = 'green' | 'yellow' | 'blocked'

export interface Quality {
  level: QualityLevel
  /** Why it is yellow or blocked, in Danish, for the mail and the admin pages */
  reasons: string[]
}

export interface QualityContext {
  /** The other articles made in the same batch, to catch ones that read alike */
  others?: Preview[]
  /** Names of clubs the datavagt has an open finding for (coach, ground, TV …) */
  flagged?: string[]
  /** Each club's players this season (DBU's team sheets), by club id; a club missing here is not checked */
  squads?: Record<string, string[]>
}

/** Fewest matches each club must have played this season before a preview says anything about form */
export const MIN_PLAYED = 3
/** Fewest words an article may have */
export const MIN_WORDS = 350
/** How alike two articles may be (shared five-word runs, club names left out) before one is yellow; two different matches score about 0.4–0.6 */
export const MAX_ALIKE = 0.8

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const words = (html: string) => plain(html).split(' ').filter(Boolean).length

/** The text without the club names, as five-word runs */
function shingles(p: Preview, names: string[]): Set<string> {
  let t = plain(p.content).toLowerCase()
  for (const n of names) if (n) t = t.split(n.toLowerCase()).join(' ')
  // The numbers stay: they are what makes two previews of the same template different
  const w = t
    .replace(/[^a-zæøå0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const out = new Set<string>()
  for (let i = 0; i + 5 <= w.length; i++) out.add(w.slice(i, i + 5).join(' '))
  return out
}

/** How alike two texts are: shared runs over all runs (0 = nothing shared, 1 = the same) */
export function alikeness(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const x of a) if (b.has(x)) shared++
  return shared / (a.size + b.size - shared)
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zæøå ]/g, '').trim()

export function checkPreview(input: PreviewInput, preview: Preview, ctx: QualityContext = {}): Quality {
  const { fixture: fx, results, goals } = input
  const blocked: string[] = []
  const yellow: string[] = []

  // 1. Enough data: hellere ingen artikel end en tynd
  const tab = table(results)
  const played = (id: string) => tab.find((r) => r.id === id)?.played ?? 0
  for (const t of [fx.home, fx.away]) if (played(t.id) < MIN_PLAYED) blocked.push(`${t.name} har kun spillet ${played(t.id)} kampe i sæsonen (mindst ${MIN_PLAYED})`)
  if (!fx.time) blocked.push('Kampens tidspunkt kendes ikke endnu')
  if (blocked.length) return { level: 'blocked', reasons: blocked }

  // 2. Numbers that must add up: points from results, the same number of home and away games in the league
  for (const r of tab) {
    if (r.points !== r.won * 3 + r.drawn) yellow.push(`Pointtallet for ${input.names[r.id] ?? r.id} passer ikke med resultaterne`)
    if (r.won + r.drawn + r.lost !== r.played) yellow.push(`Antal kampe for ${input.names[r.id] ?? r.id} passer ikke`)
  }
  const seen = new Set<string>()
  for (const r of results) {
    const k = `${r.date}|${r.homeId}|${r.awayId}`
    if (seen.has(k)) yellow.push(`Kampen ${input.names[r.homeId] ?? r.homeId}–${input.names[r.awayId] ?? r.awayId} ${r.date} står to gange i data`)
    seen.add(k)
  }

  // 3. The editor's own checklist: no red, and long enough
  const n = words(preview.content)
  if (n < MIN_WORDS) yellow.push(`Kun ${n} ord (mindst ${MIN_WORDS})`)
  for (const c of seoChecks({ ...preview, featuredImage: 'x' })) if (c.level === 'bad') yellow.push(`Tjeklisten: ${c.text}`)

  // 4. People named must play for the club: every scorer in the club's squad this season
  for (const t of [fx.home, fx.away]) {
    const squad = ctx.squads?.[t.id]
    if (!squad?.length) continue
    const known = new Set(squad.map(fold))
    const named = new Set(goals.filter((g) => g.clubId === t.id).map((g) => g.name))
    for (const name of named) if (!known.has(fold(name)) && preview.content.includes(name)) yellow.push(`${name} står ikke i ${t.name}s trup`)
  }

  // 5. Too alike another article of the batch
  const names = Object.values(input.names)
  const mine = shingles(preview, names)
  for (const o of ctx.others ?? []) {
    if (o.slug === preview.slug) continue
    const a = alikeness(mine, shingles(o, names))
    if (a > MAX_ALIKE) yellow.push(`Ligner "${o.title}" for meget (${Math.round(a * 100)} %)`)
  }

  // 6. The datavagt has something open for one of the clubs
  for (const t of [fx.home, fx.away]) if (ctx.flagged?.some((f) => fold(f) === fold(t.name))) yellow.push(`Datavagten har et åbent fund for ${t.name} – tjek træner, stadion og TV`)

  return { level: yellow.length ? 'yellow' : 'green', reasons: [...new Set(yellow)] }
}

// ---------------------------------------------------------------- match reports

/** Fewest words a match report may have (it says less than a preview: the match is over) */
export const MIN_REPORT_WORDS = 250

/**
 * The gate for a match report: blocked while the data is not complete – the goals in the data must add up to
 * the result, or the report would name the wrong scorers – and yellow for the same reasons as a preview:
 * the checklist, length, names not on the match's team sheets, too like another report.
 */
export function checkReport(
  input: {
    match: { hs: number; as: number; home: { id: string; name: string; coach?: string | null; staff?: string[] }; away: { id: string; name: string; coach?: string | null; staff?: string[] } }
    goals: { clubId: string; name: string }[]
    events: { clubId: string; name: string }[]
    names: Record<string, string>
  },
  report: Preview,
  ctx: { others?: Preview[]; sheets?: Record<string, string[]> } = {},
): Quality {
  const { match: m, goals } = input
  const blocked: string[] = []
  const hg = goals.filter((g) => g.clubId === m.home.id).length
  const ag = goals.filter((g) => g.clubId === m.away.id).length
  if (hg !== m.hs || ag !== m.as) blocked.push(`Målene i data (${hg}-${ag}) passer ikke med resultatet ${m.hs}-${m.as} endnu`)
  if (blocked.length) return { level: 'blocked', reasons: blocked }
  const yellow: string[] = []
  const n = words(report.content)
  if (n < MIN_REPORT_WORDS) yellow.push(`Kun ${n} ord (mindst ${MIN_REPORT_WORDS})`)
  for (const c of seoChecks({ ...report, featuredImage: 'x' })) if (c.level === 'bad') yellow.push(`Tjeklisten: ${c.text}`)
  for (const t of [m.home, m.away]) {
    const sheet = ctx.sheets?.[t.id]
    if (!sheet?.length) continue
    // The coach and the bench staff get cards too
    const known = new Set([...sheet, t.coach ?? '', ...(t.staff ?? [])].filter(Boolean).map(fold))
    // Scorers only: cards also go to bench staff the team sheet doesn't list (team leaders, physios)
    for (const name of new Set(goals.filter((x) => x.clubId === t.id).map((x) => x.name))) if (!known.has(fold(name))) yellow.push(`${name} står ikke på ${t.name}s holdkort`)
  }
  const names = Object.values(input.names)
  const mine = shingles(report, names)
  for (const o of ctx.others ?? []) {
    if (o.slug === report.slug) continue
    const a = alikeness(mine, shingles(o, names))
    if (a > MAX_ALIKE) yellow.push(`Ligner "${o.title}" for meget (${Math.round(a * 100)} %)`)
  }
  return { level: yellow.length ? 'yellow' : 'green', reasons: [...new Set(yellow)] }
}
