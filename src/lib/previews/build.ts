// Match previews as articles (SEO and GEO): written from real data only – the
// fixture (DBU: date, time, ground, TV), this season's results and scorers, and
// every meeting between the two clubs since 2001. Every sentence needs its own
// data and is left out without it. The facts come first and as plain answers
// (who, when, where, on which channel), followed by questions as headings, which
// is what search engines and AI answer engines quote. Pure (tests/previews).

export interface Team {
  id: string
  name: string
  /** The club page, when the club has one (/klub/…) */
  page?: string
  /** The club's name at DBU, when the text uses Matchly's own ("ASA, Aarhus" for "ASA Aarhus"): older matches are found under it */
  dbu?: string
}

export interface Fixture {
  key: string
  date: string
  time?: string | null
  venue?: string | null
  tv?: string | null
  home: Team
  away: Team
}

export interface Result {
  date: string
  homeId: string
  awayId: string
  hs: number
  as: number
}

export interface Goal {
  clubId: string
  name: string
}

/** A meeting between the two clubs, seen from the fixture's home team */
export interface Meeting {
  date: string
  /** The fixture's home team played at home */
  atHome: boolean
  /** Goals for the fixture's home team and away team */
  forHome: number
  forAway: number
}

export interface League {
  name: string
  sponsor?: string
  page: string
}

export interface PreviewInput {
  fixture: Fixture
  league: League
  season: string
  /** This season's played matches before the fixture */
  results: Result[]
  /** Club id → name, for the table and opponents */
  names: Record<string, string>
  goals: Goal[]
  meetings: Meeting[]
}

export interface Preview {
  slug: string
  title: string
  excerpt: string
  seoTitle: string
  metaDescription: string
  focusKeyword: string
  tags: string[]
  content: string
}

const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december']
const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']

export function dkDate(iso: string, withDay = true, withYear = true) {
  const d = new Date(`${iso}T12:00:00Z`)
  return `${withDay ? `${DAYS[d.getUTCDay()]} ` : ''}${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ''}`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const link = (t: Team) => (t.page ? `<a href="${t.page}">${esc(t.name)}</a>` : esc(t.name))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const time = (t?: string | null) => (t ? t.replace(':', '.') : undefined)

export interface Row {
  id: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
}

export function table(results: Result[]): Row[] {
  const rows = new Map<string, Row>()
  const row = (id: string) => rows.get(id) ?? (rows.set(id, { id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }), rows.get(id)!)
  for (const r of results) {
    for (const [id, f, a] of [
      [r.homeId, r.hs, r.as],
      [r.awayId, r.as, r.hs],
    ] as const) {
      const x = row(id)
      x.played++
      x.gf += f
      x.ga += a
      if (f > a) (x.won++, (x.points += 3))
      else if (f === a) (x.drawn++, x.points++)
      else x.lost++
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.id.localeCompare(b.id))
}

export interface FormGame {
  date: string
  opponentId: string
  home: boolean
  f: number
  a: number
  outcome: 'V' | 'U' | 'T'
}

export function form(clubId: string, results: Result[], n = 5): FormGame[] {
  return results
    .filter((r) => r.homeId === clubId || r.awayId === clubId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n)
    .map((r) => {
      const home = r.homeId === clubId
      const f = home ? r.hs : r.as
      const a = home ? r.as : r.hs
      return { date: r.date, opponentId: home ? r.awayId : r.homeId, home, f, a, outcome: f > a ? 'V' : f === a ? 'U' : 'T' }
    })
}

export function venueRecord(clubId: string, results: Result[], atHome: boolean) {
  const games = results.filter((r) => (atHome ? r.homeId : r.awayId) === clubId)
  const f = (r: Result) => (atHome ? r.hs : r.as)
  const a = (r: Result) => (atHome ? r.as : r.hs)
  return {
    played: games.length,
    won: games.filter((r) => f(r) > a(r)).length,
    drawn: games.filter((r) => f(r) === a(r)).length,
    lost: games.filter((r) => f(r) < a(r)).length,
    gf: games.reduce((s, r) => s + f(r), 0),
    ga: games.reduce((s, r) => s + a(r), 0),
    cleanSheets: games.filter((r) => a(r) === 0).length,
  }
}

export function scorers(clubId: string, goals: Goal[], n = 3) {
  const count = new Map<string, number>()
  for (const g of goals) if (g.clubId === clubId) count.set(g.name, (count.get(g.name) ?? 0) + 1)
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'da')).slice(0, n)
}

const WORD = { V: 'sejr', U: 'uafgjort', T: 'nederlag' } as const

/** How many of a club's latest matches in a row ended the same way (newest first) */
export function streak(f: FormGame[], test: (g: FormGame) => boolean): number {
  let n = 0
  for (const g of f) {
    if (!test(g)) break
    n++
  }
  return n
}

const NUMBER = ['nul', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti']
const say = (n: number) => NUMBER[n] ?? String(n)

/**
 * The story of the match in one sentence, picked from the data so the previews don't all open alike: a run of
 * wins or matches without a win, top against bottom, a scorer in form, or one side's grip on the meetings. The
 * strongest that holds; nothing when none does. Pure.
 */
export function angle(input: PreviewInput): string | undefined {
  const { fixture: fx, results, goals, meetings } = input
  const tab = table(results)
  const pos = (id: string) => tab.findIndex((r) => r.id === id) + 1
  const n = tab.length
  const H = fx.home
  const A = fx.away
  const fh = form(H.id, results, 10)
  const fa = form(A.id, results, 10)
  for (const [t, f] of [
    [H, fh],
    [A, fa],
  ] as const) {
    const wins = streak(f, (g) => g.outcome === 'V')
    if (wins >= 3) return `${esc(t.name)} kommer til kampen på ${say(wins)} sejre i træk.`
  }
  for (const [t, f] of [
    [H, fh],
    [A, fa],
  ] as const) {
    const unbeaten = streak(f, (g) => g.outcome !== 'T')
    if (unbeaten >= 5) return `${esc(t.name)} har ikke tabt i de seneste ${say(unbeaten)} kampe.`
    const winless = streak(f, (g) => g.outcome !== 'V')
    if (winless >= 4) return `${esc(t.name)} har ikke vundet i de seneste ${say(winless)} kampe og jagter en vending.`
  }
  if (n >= 6) {
    const [hp, ap] = [pos(H.id), pos(A.id)]
    if (hp && ap && Math.min(hp, ap) <= 3 && Math.max(hp, ap) >= n - 2) {
      const [top, bottom] = hp < ap ? [H, A] : [A, H]
      return `Det er top mod bund: ${esc(top.name)} er nr. ${Math.min(hp, ap)}, ${esc(bottom.name)} nr. ${Math.max(hp, ap)}.`
    }
  }
  const best = [...scorers(H.id, goals, 1), ...scorers(A.id, goals, 1)].sort((a, b) => b[1] - a[1])[0]
  if (best && best[1] >= 6) return `Kig efter ${esc(best[0])}, der allerede har scoret ${best[1]} mål i sæsonen.`
  const last5 = [...meetings].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  if (last5.length >= 4) {
    const hw = last5.filter((m) => m.forHome > m.forAway).length
    const aw = last5.filter((m) => m.forAway > m.forHome).length
    if (Math.max(hw, aw) >= last5.length - 1)
      return `${esc(hw > aw ? H.name : A.name)} har vundet ${say(Math.max(hw, aw))} af de seneste ${say(last5.length)} indbyrdes opgør.`
  }
  return undefined
}

export function buildPreview(input: PreviewInput): Preview {
  const { fixture: fx, league, season, results, names, goals, meetings } = input
  const H = fx.home
  const A = fx.away
  const tab = table(results)
  const pos = (id: string) => tab.findIndex((r) => r.id === id) + 1
  const rowOf = (id: string) => tab.find((r) => r.id === id)
  const hRow = rowOf(H.id)
  const aRow = rowOf(A.id)
  const when = `${dkDate(fx.date)}${fx.time ? ` kl. ${time(fx.time)}` : ''}`
  const leagueName = league.sponsor ? `${league.name} (${league.sponsor})` : league.name
  const out: string[] = []

  // The answer first: who, when, where, which channel, and where they stand
  // "X mod Y" is what people search for: the keyword, word for word, in the first sentence
  const lead = [`${link(H)} mod ${link(A)} spilles i <a href="${league.page}">${esc(league.name)}</a> ${when}${fx.venue ? ` på ${esc(fx.venue)}` : ''}.`]
  if (fx.tv) lead.push(`Kampen vises på ${esc(fx.tv)}.`)
  if (hRow && aRow) {
    lead.push(`Før kampen ligger ${esc(H.name)} nr. ${pos(H.id)} med ${plural(hRow.points, 'point', 'point')} efter ${plural(hRow.played, 'kamp', 'kampe')}, mens ${esc(A.name)} er nr. ${pos(A.id)} med ${plural(aRow.points, 'point', 'point')}.`)
    const gap = Math.abs(pos(H.id) - pos(A.id))
    if (pos(H.id) <= 2 && pos(A.id) <= 2) lead.push('Det er et opgør mellem rækkens to bedste hold.')
    else if (gap === 1) lead.push('Holdene ligger lige efter hinanden i tabellen.')
  }
  const story = angle(input)
  if (story) lead.splice(1, 0, story)
  out.push(`<p>${lead.join(' ')}</p>`)

  out.push('<h2>Kampen kort fortalt</h2><ul>')
  out.push(`<li><strong>Kamp:</strong> ${esc(H.name)} – ${esc(A.name)}</li>`)
  out.push(`<li><strong>Turnering:</strong> ${esc(leagueName)}, sæsonen ${esc(season)}</li>`)
  out.push(`<li><strong>Tidspunkt:</strong> ${when}</li>`)
  if (fx.venue) out.push(`<li><strong>Stadion:</strong> ${esc(fx.venue)}</li>`)
  if (fx.tv) out.push(`<li><strong>TV:</strong> ${esc(fx.tv)}</li>`)
  if (hRow && aRow) out.push(`<li><strong>Placering:</strong> ${esc(H.name)} nr. ${pos(H.id)} (${hRow.points} point), ${esc(A.name)} nr. ${pos(A.id)} (${aRow.points} point)</li>`)
  out.push('</ul>')

  // Form
  const fh = form(H.id, results)
  const fa = form(A.id, results)
  if (fh.length || fa.length) {
    out.push('<h2>Sådan er formen</h2>')
    for (const [t, f] of [
      [H, fh],
      [A, fa],
    ] as const) {
      if (!f.length) continue
      const w = f.filter((g) => g.outcome === 'V').length
      const d = f.filter((g) => g.outcome === 'U').length
      const l = f.filter((g) => g.outcome === 'T').length
      const unbeaten = f.every((g) => g.outcome !== 'T')
      const winless = f.every((g) => g.outcome !== 'V')
      out.push(
        `<p><strong>${esc(t.name)}</strong> har i de seneste ${plural(f.length, 'kamp', 'kampe')} fået ${plural(w, 'sejr', 'sejre')}, ${d} uafgjort${d === 1 ? '' : 'e'} og ${plural(l, 'nederlag', 'nederlag')}${unbeaten && f.length >= 3 ? ' – uden at tabe' : winless && f.length >= 3 ? ' – uden en sejr' : ''}.</p>`,
      )
      out.push(
        `<ul>${f.map((g) => `<li>${dkDate(g.date, false, false)}: ${WORD[g.outcome]} ${g.f}-${g.a} ${g.home ? 'hjemme mod' : 'ude mod'} ${esc(names[g.opponentId] ?? g.opponentId)}</li>`).join('')}</ul>`,
      )
    }
  }

  // Home and away
  const hv = venueRecord(H.id, results, true)
  const av = venueRecord(A.id, results, false)
  if (hv.played || av.played) {
    out.push(`<h2>${esc(H.name)} hjemme og ${esc(A.name)} ude</h2><ul>`)
    const rec = (v: ReturnType<typeof venueRecord>) =>
      `${plural(v.won, 'sejr', 'sejre')}, ${v.drawn} uafgjort${v.drawn === 1 ? '' : 'e'} og ${plural(v.lost, 'nederlag', 'nederlag')} i ${plural(v.played, 'kamp', 'kampe')}, ${v.gf}-${v.ga} i mål${v.cleanSheets ? `, ${plural(v.cleanSheets, 'kamp', 'kampe')} uden at lukke mål ind` : ''}`
    if (hv.played) out.push(`<li><strong>${esc(H.name)} på hjemmebane:</strong> ${rec(hv)}</li>`)
    if (av.played) out.push(`<li><strong>${esc(A.name)} på udebane:</strong> ${rec(av)}</li>`)
    out.push('</ul>')
  }

  // Scorers
  const sh = scorers(H.id, goals)
  const sa = scorers(A.id, goals)
  if (sh.length || sa.length) {
    out.push('<h2>Topscorere i sæsonen</h2><ul>')
    if (sh.length) out.push(`<li><strong>${esc(H.name)}:</strong> ${sh.map(([n, c]) => `${esc(n)} (${c})`).join(', ')}</li>`)
    if (sa.length) out.push(`<li><strong>${esc(A.name)}:</strong> ${sa.map(([n, c]) => `${esc(n)} (${c})`).join(', ')}</li>`)
    out.push('</ul>')
  }

  // Meetings
  const ms = [...meetings].sort((a, b) => b.date.localeCompare(a.date))
  const hw = ms.filter((m) => m.forHome > m.forAway).length
  const aw = ms.filter((m) => m.forAway > m.forHome).length
  const dr = ms.length - hw - aw
  out.push(`<h2>Hvordan er det gået i de indbyrdes opgør?</h2>`)
  if (ms.length) {
    out.push(
      `<p>I de ligakampe, vi har registreret siden 2001, har ${esc(H.name)} og ${esc(A.name)} mødt hinanden ${plural(ms.length, 'gang', 'gange')}. ${esc(H.name)} har vundet ${hw}, ${esc(A.name)} har vundet ${aw}, og ${plural(dr, 'kamp', 'kampe')} er endt uafgjort.${ms.length >= 3 ? ` Der er i snit scoret ${((ms.reduce((s, m) => s + m.forHome + m.forAway, 0) / ms.length).toFixed(1)).replace('.', ',')} mål pr. opgør.` : ''}</p>`,
    )
    out.push(
      `<ul>${ms
        .slice(0, 5)
        .map((m) => {
          const [hn, an, hs, as] = m.atHome ? [H.name, A.name, m.forHome, m.forAway] : [A.name, H.name, m.forAway, m.forHome]
          return `<li>${dkDate(m.date, false)}: ${esc(hn)}–${esc(an)} ${hs}-${as}</li>`
        })
        .join('')}</ul>`,
    )
  } else out.push(`<p>Vi har ingen tidligere ligakampe mellem ${esc(H.name)} og ${esc(A.name)} registreret.</p>`)

  // Table
  if (tab.length) {
    out.push(`<h2>Stillingen i ${esc(league.name)} før kampen</h2><ol>`)
    for (const r of tab) {
      const name = esc(names[r.id] ?? r.id)
      const b = r.id === H.id || r.id === A.id
      out.push(`<li>${b ? '<strong>' : ''}${name}: ${r.points} point (${r.played} kampe, ${r.gf}-${r.ga})${b ? '</strong>' : ''}</li>`)
    }
    out.push('</ol>')
  }

  // Questions answered plainly (quoted by search and AI answers)
  out.push('<h2>Ofte stillede spørgsmål</h2>')
  out.push(`<h3>Hvornår spiller ${esc(H.name)} mod ${esc(A.name)}?</h3><p>${esc(H.name)} – ${esc(A.name)} spilles ${when}.</p>`)
  if (fx.venue) out.push(`<h3>Hvor spilles kampen?</h3><p>Kampen spilles på ${esc(fx.venue)}, ${esc(H.name)}s hjemmebane.</p>`)
  if (fx.tv) out.push(`<h3>Hvor kan jeg se kampen?</h3><p>Kampen vises på ${esc(fx.tv)}.</p>`)
  if (ms.length) {
    const last = ms[0]
    const [hn, an, hs, as] = last.atHome ? [H.name, A.name, last.forHome, last.forAway] : [A.name, H.name, last.forAway, last.forHome]
    out.push(`<h3>Hvordan endte sidste opgør mellem holdene?</h3><p>Sidst holdene mødtes, ${dkDate(last.date, false)}, endte det ${esc(hn)}–${esc(an)} ${hs}-${as}.</p>`)
    out.push(
      `<h3>Hvem har vundet flest indbyrdes opgør?</h3><p>${hw === aw ? `Det står lige: begge hold har vundet ${hw}` : `${esc(hw > aw ? H.name : A.name)} med ${Math.max(hw, aw)} sejre mod ${Math.min(hw, aw)}`} i ${plural(ms.length, 'opgør', 'opgør')}${dr ? `, og ${dr} er endt uafgjort` : ''}.</p>`,
    )
  }
  out.push(`<p><em>Optakten er skrevet af Matchly ud fra kampdata og opdateres frem til kampen. Følg kampen, stillingen og resultaterne i <a href="${league.page}">${esc(league.name)}</a>.</em></p>`)

  const short = `${dkDate(fx.date, false, false)}`
  const title = `${H.name} – ${A.name}: optakt, form og indbyrdes opgør (${short})`
  const meta = `Optakt til ${H.name} mod ${A.name} i ${league.name} ${when}${fx.venue ? ` på ${fx.venue}` : ''}${fx.tv ? ` (${fx.tv})` : ''}`
  return {
    slug: `optakt-${slug(H.name)}-${slug(A.name)}-${fx.date}`,
    title,
    excerpt: `${H.name} møder ${A.name} ${when}${fx.venue ? ` på ${fx.venue}` : ''}. Her er formen, stillingen, topscorerne og de indbyrdes opgør før kampen.`,
    seoTitle: `${H.name} mod ${A.name}: optakt ${short}`.slice(0, 70),
    metaDescription: `${meta}: placering, form, topscorere og indbyrdes opgør.`.slice(0, 300),
    focusKeyword: `${H.name} mod ${A.name}`,
    tags: [H.name, A.name, league.name],
    content: out.join('\n'),
  }
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
