// The fact sheet behind an automatic article, for the Claude writer on the server (deploy/claude-editor): every
// number and name it may use, and the internal links that exist for the match. After it has written the article
// as sports journalism, `checkRewrite` holds the new text against the same sheet: numbers that are not in it,
// links that are not on the list, and the editor's checklist. Pure (tests/previews).

import { seoChecks } from '../seoChecks.ts'
import { form, scorers, table, venueRecord, type PreviewInput } from './build.ts'
import type { ReportInput } from '../reports/build.ts'

export interface FactLink {
  label: string
  href: string
}

export interface Facts {
  kind: 'preview' | 'report'
  /** The keyword the article is found by ("X mod Y"); must stay in the title, first paragraph and description */
  focusKeyword: string
  /** The internal links that exist for this match – the only ones the writer may use */
  links: FactLink[]
  /** Everything the writer may say, as plain data */
  data: Record<string, unknown>
}

/**
 * The numbers a writer works out from the table (gap to the leader, to the team above and below, goal
 * difference), so a sentence like "tre point ned til Brønshøj" holds against the sheet.
 */
function gaps(results: PreviewInput['results'], ids: string[]) {
  const t = table(results)
  const out: Record<string, unknown> = {}
  for (const id of ids) {
    const i = t.findIndex((r) => r.id === id)
    if (i < 0) continue
    const r = t[i]
    out[id] = { point_til_nr1: t[0].points - r.points, point_til_holdet_over: i > 0 ? t[i - 1].points - r.points : null, point_til_holdet_under: i < t.length - 1 ? r.points - t[i + 1].points : null, maalforskel: r.gf - r.ga }
  }
  return out
}

const tableWithNames = (results: PreviewInput['results'], names: Record<string, string>) =>
  table(results).map((r, i) => ({ nr: i + 1, hold: names[r.id] ?? r.id, kampe: r.played, sejre: r.won, uafgjort: r.drawn, nederlag: r.lost, maal: `${r.gf}-${r.ga}`, point: r.points }))

export function previewFacts(input: PreviewInput, links: FactLink[], focusKeyword: string): Facts {
  const { fixture: fx, results, names, goals, meetings } = input
  const club = (id: string) => ({
    form: form(id, results).map((g) => ({ dato: g.date, resultat: g.outcome, maal: `${g.f}-${g.a}`, modstander: names[g.opponentId] ?? g.opponentId, hjemme: g.home })),
    topscorere: scorers(id, goals, 3).map(([navn, maal]) => ({ navn, maal })),
  })
  return {
    kind: 'preview',
    focusKeyword,
    links,
    data: {
      kamp: { hjemmehold: fx.home.name, udehold: fx.away.name, dato: fx.date, tid: fx.time ?? null, stadion: fx.venue ?? null, tv: fx.tv ?? null },
      turnering: input.league.name,
      saeson: input.season,
      stilling: tableWithNames(results, names),
      [fx.home.name]: { ...club(fx.home.id), hjemmebane: venueRecord(fx.home.id, results, true) },
      [fx.away.name]: { ...club(fx.away.id), udebane: venueRecord(fx.away.id, results, false) },
      afledt: gaps(results, [fx.home.id, fx.away.id]),
      indbyrdes: [...meetings].sort((a, b) => b.date.localeCompare(a.date)).map((m) => ({ dato: m.date, resultat: m.atHome ? `${fx.home.name}–${fx.away.name} ${m.forHome}-${m.forAway}` : `${fx.away.name}–${fx.home.name} ${m.forAway}-${m.forHome}` })),
    },
  }
}

export function reportFacts(input: ReportInput, links: FactLink[], focusKeyword: string): Facts {
  const { match: m, results, names } = input
  const before = results.filter((r) => !(r.date === m.date && r.homeId === m.home.id && r.awayId === m.away.id))
  return {
    kind: 'report',
    focusKeyword,
    links,
    data: {
      kamp: { hjemmehold: m.home.name, udehold: m.away.name, resultat: `${m.hs}-${m.as}`, dato: m.date, tid: m.time ?? null, stadion: m.venue ?? null, dommer: m.referee ?? null },
      traenere: { [m.home.name]: m.home.coach ?? null, [m.away.name]: m.away.coach ?? null },
      maal: [...input.goals].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999)).map((g) => ({ minut: g.minute, spiller: g.name, hold: names[g.clubId] ?? (g.clubId === m.home.id ? m.home.name : m.away.name) })),
      kort: input.events.filter((e) => e.kind === 'yellow' || e.kind === 'red').map((e) => ({ kort: e.kind === 'red' ? 'rødt' : 'gult', minut: e.minute, spiller: e.name, hold: names[e.clubId] ?? e.clubId })),
      stilling_foer: tableWithNames(before, names),
      stilling_efter: tableWithNames(results, names),
      form_efter: { [m.home.name]: form(m.home.id, results).map((g) => g.outcome).join('-'), [m.away.name]: form(m.away.id, results).map((g) => g.outcome).join('-') },
      afledt: {
        ...gaps(results, [m.home.id, m.away.id]),
        maal_i_alt: m.hs + m.as,
        gule_kort: { [m.home.name]: input.events.filter((e) => e.kind === 'yellow' && e.clubId === m.home.id).length, [m.away.name]: input.events.filter((e) => e.kind === 'yellow' && e.clubId === m.away.id).length, i_alt: input.events.filter((e) => e.kind === 'yellow').length },
        placering_foer: { [m.home.name]: table(before).findIndex((r) => r.id === m.home.id) + 1, [m.away.name]: table(before).findIndex((r) => r.id === m.away.id) + 1 },
      },
      naeste_kamp: Object.fromEntries(Object.entries(input.next).map(([id, n]) => [names[id] ?? id, n ?? null])),
      turnering: input.league.name,
      saeson: input.season,
    },
  }
}

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Every number the sheet holds, with the day, month and year of its dates, and the little ones every text uses */
function allowedNumbers(f: Facts): Set<string> {
  const out = new Set(['0', '1', '2', '3'])
  for (const m of JSON.stringify(f.data).matchAll(/\d+/g)) {
    out.add(String(Number(m[0])))
  }
  return out
}

export interface RewriteCheck {
  ok: boolean
  /** Why the rewrite can't be used as it is */
  problems: string[]
}

/**
 * Holds a rewritten article against its fact sheet: every number in the text must be in the sheet, every internal
 * link must be on the list (external links are not allowed), the keyword must stay where search looks for it,
 * and the checklist may not be red. Words for numbers ("tre sejre") are the writer's own risk and read by the owner.
 */
export function checkRewrite(f: Facts, a: { title: string; excerpt: string; content: string; seoTitle?: string; metaDescription?: string; slug: string }): RewriteCheck {
  const problems: string[] = []
  const allowed = allowedNumbers(f)
  const text = `${a.title} ${a.excerpt} ${plain(a.content)} ${a.metaDescription ?? ''}`
  const unknown = [...new Set([...text.matchAll(/\d+/g)].map((m) => String(Number(m[0]))))].filter((n) => !allowed.has(n))
  if (unknown.length) problems.push(`Tal, der ikke står i data: ${unknown.slice(0, 8).join(', ')}`)
  const ok = new Set(f.links.map((l) => l.href))
  for (const m of a.content.matchAll(/href="([^"]+)"/g)) {
    const href = m[1]
    if (/^https?:\/\//i.test(href) || href.startsWith('//')) problems.push(`Eksternt link er ikke tilladt: ${href}`)
    else if (!ok.has(href)) problems.push(`Link, der ikke står på listen: ${href}`)
  }
  const internal = [...a.content.matchAll(/href="(\/[^"]*)"/g)].length
  if (internal < Math.min(3, f.links.length)) problems.push(`Kun ${internal} interne links (mindst ${Math.min(3, f.links.length)})`)
  for (const c of seoChecks({ ...a, focusKeyword: f.focusKeyword, featuredImage: 'x' })) if (c.level === 'bad') problems.push(`Tjeklisten: ${c.text}`)
  if (/\bDBU\b|API-Sports|datapartner/i.test(text)) problems.push('Teksten nævner en datakilde')
  if (/fodboldlandshold/i.test(text)) problems.push('Ordet "fodboldlandshold" må ikke bruges')
  return { ok: problems.length === 0, problems }
}
