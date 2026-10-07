// Match reports as articles, written from real data only – the result, the goals with minutes, the cards,
// the referee and coaches, and the table before and after the match – the same way as the previews
// (src/lib/previews/build.ts): every sentence needs its own data and is left out without it, the answer
// comes first, and questions people search for are headings. The headline picks the story from the data
// (a late winner, a comeback, a hat-trick, a big win). Pure (tests/reports).

import { dkDate, form, slug, table, type League, type Result, type Team } from '../previews/build.ts'

export interface ReportTeam extends Team {
  coach?: string | null
  /** The rest of the bench staff (assistant coaches …), who can get cards too */
  staff?: string[]
}

export interface ReportGoal {
  minute: number | null
  name: string
  clubId: string
}

export interface ReportEvent {
  kind: 'yellow' | 'red' | string
  minute: number | null
  name: string
  clubId: string
}

export interface NextMatch {
  date: string
  opponent: string
  home: boolean
}

export interface ReportInput {
  match: {
    key: string
    date: string
    time?: string | null
    venue?: string | null
    referee?: string | null
    home: ReportTeam
    away: ReportTeam
    hs: number
    as: number
  }
  league: League
  season: string
  /** This season's played matches, this one included */
  results: Result[]
  names: Record<string, string>
  goals: ReportGoal[]
  events: ReportEvent[]
  /** Each club's next match after this one, by club id */
  next: Record<string, NextMatch | undefined>
  /** The preview of the match, when Matchly wrote one */
  preview?: { title: string; path: string }
}

export interface Report {
  slug: string
  title: string
  excerpt: string
  seoTitle: string
  metaDescription: string
  focusKeyword: string
  tags: string[]
  content: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const link = (t: Team) => (t.page ? `<a href="${t.page}">${esc(t.name)}</a>` : esc(t.name))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const min = (m: number | null) => (m == null ? '' : `${m}. minut`)

/** The goals in match order with the score after each, as "1-0", from the home team's side */
export function runningScore(m: ReportInput['match'], goals: ReportGoal[]) {
  let h = 0
  let a = 0
  return [...goals]
    .sort((x, y) => (x.minute ?? 999) - (y.minute ?? 999))
    .map((g) => {
      if (g.clubId === m.home.id) h++
      else a++
      return { ...g, score: `${h}-${a}` }
    })
}

/** The story of the match for the headline and the first sentence, from the data; undefined for a plain report */
export function storyOf(input: ReportInput): { headline: string; sentence: string } | undefined {
  const { match: m } = input
  const goals = runningScore(m, input.goals)
  const winner = m.hs > m.as ? m.home : m.as > m.hs ? m.away : undefined
  const loser = winner && (winner === m.home ? m.away : m.home)
  const count = new Map<string, number>()
  for (const g of goals) count.set(`${g.clubId}|${g.name}`, (count.get(`${g.clubId}|${g.name}`) ?? 0) + 1)
  const hat = [...count].find(([, n]) => n >= 3)
  if (hat) {
    const name = hat[0].split('|').slice(1).join('|')
    return { headline: `hattrick af ${name}`, sentence: `${esc(name)} scorede ${hat[1] === 3 ? 'hattrick' : `${hat[1]} mål`}.` }
  }
  // A comeback: the winner was behind at some point
  if (winner && goals.some((g) => (winner === m.home ? Number(g.score.split('-')[0]) < Number(g.score.split('-')[1]) : Number(g.score.split('-')[1]) < Number(g.score.split('-')[0]))))
    return { headline: `${winner.name} vendte kampen`, sentence: `${esc(winner.name)} var bagud, men vendte kampen.` }
  // A late winner: the last goal decided it after the 80th minute
  const last = goals.at(-1)
  if (winner && last && last.clubId === winner.id && (last.minute ?? 0) >= 80 && Math.abs(m.hs - m.as) === 1)
    return { headline: `sejrsmål i ${last.minute}. minut`, sentence: `${esc(last.name)} afgjorde kampen i ${last.minute}. minut.` }
  if (winner && loser && Math.abs(m.hs - m.as) >= 3) return { headline: `storsejr til ${winner.name}`, sentence: `${esc(winner.name)} var klart bedst og vandt med ${Math.abs(m.hs - m.as)} måls forskel.` }
  if (!winner && m.hs + m.as >= 4) return { headline: 'målfest uden vinder', sentence: `Holdene delte ${m.hs + m.as} mål og et point hver.` }
  return undefined
}

export function buildReport(input: ReportInput): Report {
  const { match: m, league, season, results, names, events, next } = input
  const H = m.home
  const A = m.away
  const goals = runningScore(m, input.goals)
  const before = table(results.filter((r) => r.date < m.date || (r.date === m.date && !(r.homeId === H.id && r.awayId === A.id))))
  const after = table(results)
  const pos = (t: ReturnType<typeof table>, id: string) => t.findIndex((r) => r.id === id) + 1
  const row = (id: string) => after.find((r) => r.id === id)
  const when = `${dkDate(m.date)}${m.time ? ` kl. ${m.time.replace(':', '.')}` : ''}`
  const score = `${m.hs}-${m.as}`
  const story = storyOf(input)
  const out: string[] = []

  // The answer first: who won, how, where and when
  const outcome = m.hs > m.as ? `${link(H)} tog alle tre point på hjemmebane.` : m.as > m.hs ? `${link(A)} tog alle tre point med hjem.` : `${link(H)} og ${link(A)} delte pointene.`
  const lead = [`${esc(H.name)} mod ${esc(A.name)} endte ${score} i <a href="${league.page}">${esc(league.name)}</a> ${when}${m.venue ? ` på ${esc(m.venue)}` : ''}.`, outcome]
  if (story) lead.push(story.sentence)
  const hr = row(H.id)
  const ar = row(A.id)
  if (hr && ar) lead.push(`Efter kampen ligger ${esc(H.name)} nr. ${pos(after, H.id)} med ${plural(hr.points, 'point', 'point')}, og ${esc(A.name)} er nr. ${pos(after, A.id)} med ${plural(ar.points, 'point', 'point')}.`)
  out.push(`<p>${lead.join(' ')}</p>`)

  out.push('<h2>Kampen kort fortalt</h2><ul>')
  out.push(`<li><strong>Resultat:</strong> ${esc(H.name)} – ${esc(A.name)} ${score}</li>`)
  out.push(`<li><strong>Turnering:</strong> ${esc(league.sponsor ? `${league.name} (${league.sponsor})` : league.name)}, sæsonen ${esc(season)}</li>`)
  out.push(`<li><strong>Dato:</strong> ${when}</li>`)
  if (m.venue) out.push(`<li><strong>Stadion:</strong> ${esc(m.venue)}</li>`)
  if (m.referee) out.push(`<li><strong>Dommer:</strong> ${esc(m.referee)}</li>`)
  if (goals.length) out.push(`<li><strong>Mål:</strong> ${goals.map((g) => `${esc(g.name)}${g.minute != null ? ` ${g.minute}'` : ''}`).join(', ')}</li>`)
  out.push('</ul>')

  // The goals
  out.push('<h2>Hvem scorede målene?</h2>')
  if (goals.length) {
    out.push(`<p>Der blev scoret ${plural(goals.length, 'mål', 'mål')} i kampen.</p><ul>`)
    for (const g of goals) out.push(`<li>${g.score}: ${esc(g.name)} (${esc(names[g.clubId] ?? (g.clubId === H.id ? H.name : A.name))})${g.minute != null ? `, ${min(g.minute)}` : ''}</li>`)
    out.push('</ul>')
  } else out.push('<p>Kampen endte målløs.</p>')

  // Cards
  const cards = events.filter((e) => e.kind === 'yellow' || e.kind === 'red')
  if (cards.length) {
    out.push('<h2>Kort i kampen</h2><ul>')
    for (const t of [H, A]) {
      const y = cards.filter((c) => c.clubId === t.id && c.kind === 'yellow')
      const r = cards.filter((c) => c.clubId === t.id && c.kind === 'red')
      if (!y.length && !r.length) continue
      const parts = [y.length ? `${plural(y.length, 'gult kort', 'gule kort')}` : '', r.length ? `rødt kort til ${r.map((c) => `${esc(c.name)}${c.minute != null ? ` (${c.minute}.)` : ''}`).join(' og ')}` : ''].filter(Boolean)
      out.push(`<li><strong>${esc(t.name)}:</strong> ${parts.join(', ')}</li>`)
    }
    out.push('</ul>')
  }

  // The table: what the result means
  if (hr && ar) {
    out.push(`<h2>Hvad betyder resultatet for stillingen?</h2>`)
    const move = (id: string, name: string) => {
      const b = pos(before, id)
      const a = pos(after, id)
      if (!b) return `${esc(name)} er nr. ${a}.`
      return a < b ? `${esc(name)} rykker fra nr. ${b} op på nr. ${a}.` : a > b ? `${esc(name)} falder fra nr. ${b} til nr. ${a}.` : `${esc(name)} bliver på nr. ${a}.`
    }
    out.push(`<p>${move(H.id, H.name)} ${move(A.id, A.name)}</p>`)
    out.push(`<h2>Stillingen i ${esc(league.name)} efter kampen</h2><ol>`)
    for (const r of after) {
      const b = r.id === H.id || r.id === A.id
      out.push(`<li>${b ? '<strong>' : ''}${esc(names[r.id] ?? r.id)}: ${r.points} point (${r.played} kampe, ${r.gf}-${r.ga})${b ? '</strong>' : ''}</li>`)
    }
    out.push('</ol>')
  }

  // Each club's season so far: record and the latest results, so the result can be read in context
  const season2 = (t: ReportTeam) => {
    const r = row(t.id)
    if (!r) return undefined
    const last = form(t.id, results, 5)
    const w = last.filter((g) => g.outcome === 'V').length
    return `<li><strong>${esc(t.name)}</strong> har ${plural(r.won, 'sejr', 'sejre')}, ${r.drawn} uafgjort${r.drawn === 1 ? '' : 'e'} og ${plural(r.lost, 'nederlag', 'nederlag')} efter ${plural(r.played, 'kamp', 'kampe')} og en målscore på ${r.gf}-${r.ga}.${last.length >= 3 ? ` I de seneste ${plural(last.length, 'kamp', 'kampe')} er det blevet til ${plural(w, 'sejr', 'sejre')} (${last.map((g) => g.outcome).join('-')}, nyeste først).` : ''}</li>`
  }
  const sh = season2(H)
  const sa = season2(A)
  if (sh || sa) out.push(`<h2>Sådan ser holdenes sæson ud</h2><ul>${sh ?? ''}${sa ?? ''}</ul>`)

  // Coaches
  if (H.coach || A.coach) {
    out.push('<h2>Trænerne</h2><ul>')
    if (H.coach) out.push(`<li><strong>${esc(H.name)}:</strong> ${esc(H.coach)}</li>`)
    if (A.coach) out.push(`<li><strong>${esc(A.name)}:</strong> ${esc(A.coach)}</li>`)
    out.push('</ul>')
  }

  // Next matches
  const nh = next[H.id]
  const na = next[A.id]
  if (nh || na) {
    out.push('<h2>Hvornår spiller holdene igen?</h2><ul>')
    for (const [t, n] of [
      [H, nh],
      [A, na],
    ] as const)
      if (n) out.push(`<li><strong>${esc(t.name)}</strong> spiller ${n.home ? 'hjemme mod' : 'ude mod'} ${esc(n.opponent)} ${dkDate(n.date)}.</li>`)
    out.push('</ul>')
  }

  out.push('<h2>Ofte stillede spørgsmål</h2>')
  out.push(`<h3>Hvad endte ${esc(H.name)} mod ${esc(A.name)}?</h3><p>Kampen endte ${score}${m.hs === m.as ? ' – uafgjort' : ` til ${esc((m.hs > m.as ? H : A).name)}`}.</p>`)
  if (goals.length) out.push(`<h3>Hvem scorede for ${esc(H.name)}?</h3><p>${goals.filter((g) => g.clubId === H.id).map((g) => `${esc(g.name)}${g.minute != null ? ` (${g.minute}.)` : ''}`).join(', ') || `${esc(H.name)} scorede ikke`}.</p>`)
  if (input.preview) out.push(`<p>Læs også optakten: <a href="${input.preview.path}">${esc(input.preview.title)}</a>.</p>`)
  out.push(`<p><em>Referatet er skrevet af Matchly ud fra kampdata. Følg resultaterne og stillingen i <a href="${league.page}">${esc(league.name)}</a>.</em></p>`)

  const short = dkDate(m.date, false, false)
  const title = `${H.name} – ${A.name} ${score}${story ? `: ${story.headline}` : ': referat og målscorere'}`
  return {
    slug: `referat-${slug(H.name)}-${slug(A.name)}-${m.date}`,
    title,
    excerpt: `${H.name} mod ${A.name} endte ${score} ${short}${m.venue ? ` på ${m.venue}` : ''}. Her er målene, kortene og stillingen efter kampen.`,
    seoTitle: `${H.name} mod ${A.name} ${score}: referat ${short}`.slice(0, 70),
    metaDescription: `${H.name} mod ${A.name} endte ${score} i ${league.name} ${short}. Se målscorerne, kortene og hvad resultatet betyder for stillingen.`.slice(0, 300),
    focusKeyword: `${H.name} mod ${A.name}`,
    tags: [H.name, A.name, league.name],
    content: out.join('\n'),
  }
}
