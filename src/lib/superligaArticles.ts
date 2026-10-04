import 'server-only'
import { DIVISIONS, type Club, type Division } from '../data/leagues'
import { allFixtures, isFinished, standings, type Fixture, type StandingRow } from '../data/season'
import { INTERVALS, leagueStats } from '../data/stats'
import { addCategory, allArticles, saveArticle } from './articles'
import { paths } from './site'

// Three long articles about the Superliga, written from this season's real matches (results,
// half-time scores, goal minutes, scorers, cards, attendance): "the season in numbers", "the form
// right now" and "the race for the top six". Every sentence needs its own numbers and is left out
// without them; nothing is guessed. Saved as drafts – a published article is never touched again.

export type SuperligaKind = 'tal' | 'form' | 'top6'

export interface SuperligaArticle {
  kind: SuperligaKind
  slug: string
  title: string
  excerpt: string
  content: string
  tags: string[]
  focusKeyword: string
  seoTitle: string
  metaDescription: string
}

export const SUPERLIGA_KINDS: { kind: SuperligaKind; label: string; slug: string }[] = [
  { kind: 'tal', label: 'Superligaen i tal', slug: 'superligaen-i-tal' },
  { kind: 'form', label: 'Formen lige nu', slug: 'superligaen-formtabel' },
  { kind: 'top6', label: 'Kampen om top 6', slug: 'superligaen-kampen-om-top-6' },
]

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
const num = (n: number, digits = 0) => n.toLocaleString('da-DK', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)
const club = (c: Club) => `<a href="${paths.club(c.slug)}">${esc(c.name)}</a>`
const game = (f: Fixture) => `<a href="${paths.match(f.slug)}">${esc(f.home.name)} – ${esc(f.away.name)} ${f.score[0]}-${f.score[1]}</a>`
const p = (html: string) => `<p>${html}</p>`
const h2 = (text: string) => `<h2>${esc(text)}</h2>`
const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '')
const table = (head: string[], rows: (string | number)[][]) =>
  `<table><tbody><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
const faq = (items: [string, string][]) => [h2('Spørgsmål og svar'), ...items.flatMap(([q, a]) => [`<h3>${esc(q)}</h3>`, p(a)])].join('')
const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`
const dkDate = (d: Date) => d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', timeZone: 'Europe/Copenhagen' })

interface Season {
  div: Division
  finished: Fixture[]
  upcoming: Fixture[]
  table: StandingRow[]
  rounds: number
  /** Rounds before the split into the championship and relegation rounds (22 with 12 clubs) */
  regular: number
}

function season(): Season | undefined {
  const div = DIVISIONS.find((d) => d.id === 'superliga')
  if (!div) return undefined
  const all = allFixtures().filter((f) => f.division === div)
  const finished = all.filter(isFinished).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const table = standings(div)
  if (finished.length < 18 || table.length < 6) return undefined
  const rounds = Math.max(...table.map((r) => r.played))
  const regular = (table.length - 1) * (div.meetings ?? 2)
  const soon = Date.now() - 3 * 3_600_000
  const upcoming = all.filter((f) => !isFinished(f) && f.real.state !== 'postponed' && f.kickoff.getTime() > soon).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  return { div, finished, upcoming, table, rounds, regular }
}

const pointsOf = (f: Fixture, c: Club) => {
  const [mine, theirs] = f.home.id === c.id ? f.score : [f.score[1], f.score[0]]
  return mine > theirs ? 3 : mine === theirs ? 1 : 0
}
const playedBy = (s: Season, c: Club) => s.finished.filter((f) => f.home.id === c.id || f.away.id === c.id)
const position = (s: Season, c: Club) => s.table.findIndex((r) => r.club.id === c.id) + 1
const gd = (r: StandingRow) => r.goalsFor - r.goalsAgainst
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

// ---------------------------------------------------------------- 1. the season in numbers

function numbers(s: Season): SuperligaArticle | undefined {
  const st = leagueStats(s.div)
  if (!st) return undefined
  const after = `efter ${s.rounds} runder`
  const parts: string[] = []
  // The sections are numbered as they come (one without its numbers is left out)
  let n = 0
  const sec = (title: string) => `<h2>${++n}. ${title}</h2>`
  const leader = s.table[0]
  parts.push(
    p(
      `Superligaen har spillet ${plural(st.played, 'kamp', 'kampe')} ${after}, og der er scoret ${plural(st.goals, 'mål', 'mål')} – ${num(st.goalsPerMatch, 2)} pr. kamp. ` +
        `${club(leader.club)} fører med ${plural(leader.points, 'point', 'point')}. Her er, hvad tallene fortæller om sæsonen indtil nu – hentet fra alle sæsonens kampe, ikke fra fornemmelser.`,
    ),
  )

  // 1. Goals
  parts.push(sec(`${num(st.goalsPerMatch, 2)} mål pr. kamp`))
  parts.push(
    p(
      `${st.over25Pct} % af kampene har haft mindst tre mål, og i ${st.bttsPct} % har begge hold scoret. ` +
        (st.mostGoals ? `Sæsonens største målfest indtil nu er ${game(st.mostGoals as Fixture)} med ${st.mostGoals.score[0] + st.mostGoals.score[1]} mål. ` : '') +
        (st.biggestWin ? `Den største sejr er ${game(st.biggestWin as Fixture)}.` : ''),
    ),
  )

  // 2. Home advantage
  const homeTable = venueTable(s, true)
  const awayTable = venueTable(s, false)
  parts.push(sec(`Hjemmebanen er ${st.homeWinPct >= st.awayWinPct ? 'stadig en fordel' : 'ikke nogen fordel i år'}`))
  parts.push(
    p(
      `Hjemmeholdet har vundet ${st.homeWinPct} % af kampene, ${st.drawPct} % er endt uafgjort, og udeholdet har vundet ${st.awayWinPct} %. ` +
        (homeTable[0] ? `Bedst hjemme er ${club(homeTable[0].club)} med ${plural(homeTable[0].points, 'point', 'point')} på ${plural(homeTable[0].played, 'hjemmekamp', 'hjemmekampe')}. ` : '') +
        (awayTable[0] ? `Bedst ude er ${club(awayTable[0].club)} med ${plural(awayTable[0].points, 'point', 'point')} på ${plural(awayTable[0].played, 'udekamp', 'udekampe')}.` : ''),
    ),
  )

  // 3. When the goals come
  if (st.byInterval) {
    const g = st.byInterval.goals
    const total = g.reduce((a, b) => a + b, 0)
    const late = g[5]
    const top = g.indexOf(Math.max(...g))
    parts.push(sec(`${pct(late, total)} % af målene falder i de sidste 15 minutter`))
    parts.push(
      p(
        `I de ${plural(st.byInterval.matches, 'kamp', 'kampe')}, hvor vi kender alle målenes minut, er ${plural(late, 'mål', 'mål')} af ${num(total)} scoret fra det 76. minut og frem. ` +
          `Det mest målrige kvarter er ${INTERVALS[top]} med ${plural(g[top], 'mål', 'mål')}. ` +
          (st.firstHalfPct !== undefined ? `Samlet falder ${st.firstHalfPct} % af målene i første halvleg og ${100 - st.firstHalfPct} % efter pausen.` : ''),
      ),
    )
    parts.push(table(['Minut', 'Mål', 'Andel'], INTERVALS.map((label, i) => [label, num(g[i]), `${pct(g[i], total)} %`])))
  }

  // 4. Comebacks
  const comebacks = s.finished.filter((f) => f.ht && Math.sign(f.ht[0] - f.ht[1]) !== 0 && Math.sign(f.score[0] - f.score[1]) !== Math.sign(f.ht[0] - f.ht[1]))
  const withHt = s.finished.filter((f) => f.ht).length
  if (withHt >= 10) {
    parts.push(sec(`${plural(comebacks.length, 'gang', 'gange')} har det førende hold ved pausen ikke vundet`))
    parts.push(
      p(
        `Af ${plural(withHt, 'kamp', 'kampe')} med kendt pauseresultat er ${plural(comebacks.length, 'kamp', 'kampe')} endt uden sejr til holdet, der førte ved pausen. ` +
          (comebacks.length ? `Senest skete det i ${game(comebacks[comebacks.length - 1])}.` : 'En føring ved pausen har indtil nu været nok hver gang.'),
      ),
    )
  }

  // 5. Scorers
  if (st.scorers.length) {
    const s1 = st.scorers[0]
    const pens = st.scorers.reduce((a, r) => a + r.penalties, 0)
    parts.push(sec(`${esc(s1.player)} fører topscorerlisten`))
    parts.push(
      p(
        `${esc(s1.player)} fra ${esc(s1.club.name)} har scoret ${plural(s1.goals, 'mål', 'mål')}` +
          (s1.penalties ? `, heraf ${plural(s1.penalties, 'straffespark', 'straffespark')}` : '') +
          `. De ti øverste har tilsammen ${plural(
            st.scorers.reduce((a, r) => a + r.goals, 0),
            'mål',
            'mål',
          )}, ${pens ? `og ${plural(pens, 'af dem', 'af dem')} er kommet på straffespark` : 'og ingen af dem er scoret på straffespark'}. Hele listen står på <a href="${paths.league(s.div.slug)}/topscorere">Superligaens topscorerliste</a>.`,
      ),
    )
    parts.push(table(['#', 'Spiller', 'Klub', 'Mål', 'Heraf straffe'], st.scorers.slice(0, 8).map((r, i) => [i + 1, esc(r.player), esc(r.club.name), r.goals, r.penalties])))
  }

  // 6. Defence
  const clean = s.table.map((r) => ({ r, n: playedBy(s, r.club).filter((f) => (f.home.id === r.club.id ? f.score[1] : f.score[0]) === 0).length })).sort((a, b) => b.n - a.n || a.r.goalsAgainst - b.r.goalsAgainst)
  const tight = [...s.table].sort((a, b) => a.goalsAgainst / Math.max(1, a.played) - b.goalsAgainst / Math.max(1, b.played))[0]
  parts.push(sec(`${esc(tight.club.name)} har ligaens bedste forsvar`))
  parts.push(
    p(
      `${club(tight.club)} har kun lukket ${plural(tight.goalsAgainst, 'mål', 'mål')} ind på ${plural(tight.played, 'kamp', 'kampe')} – ${num(tight.goalsAgainst / Math.max(1, tight.played), 2)} pr. kamp. ` +
        (clean[0]?.n ? `Flest kampe uden mål imod har ${club(clean[0].r.club)} med ${plural(clean[0].n, 'clean sheet', 'clean sheets')}.` : ''),
    ),
  )

  // 7. Attack
  const attack = [...s.table].sort((a, b) => b.goalsFor / Math.max(1, b.played) - a.goalsFor / Math.max(1, a.played))[0]
  parts.push(sec(`${esc(attack.club.name)} scorer flest`))
  parts.push(p(`${club(attack.club)} har scoret ${plural(attack.goalsFor, 'mål', 'mål')} – ${num(attack.goalsFor / Math.max(1, attack.played), 2)} pr. kamp og en målforskel på ${signed(gd(attack))}.`))

  // 8. Draws
  const draws = [...s.table].sort((a, b) => b.drawn - a.drawn)[0]
  if (draws.drawn >= 2) {
    parts.push(sec(`${esc(draws.club.name)} er uafgjort-kongerne`))
    parts.push(p(`${club(draws.club)} har spillet ${plural(draws.drawn, 'uafgjort kamp', 'uafgjorte kampe')} af ${num(draws.played)}. Uafgjort er endt i ${st.drawPct} % af ligaens kampe.`))
  }

  // 9. Attendance
  if (st.attendance.length >= 3) {
    const top = st.attendance[0]
    const low = st.attendance[st.attendance.length - 1]
    parts.push(sec(`${num(top.average)} tilskuere i snit hos ${esc(top.club.name)}`))
    parts.push(
      p(
        `${esc(top.club.name)} trækker flest tilskuere med ${num(top.average)} i snit på ${plural(top.matches, 'hjemmekamp', 'hjemmekampe')}. ` +
          `Færrest har ${esc(low.club.name)} med ${num(low.average)}.`,
      ),
    )
    parts.push(table(['Klub', 'Tilskuere i snit', 'Hjemmekampe'], st.attendance.map((a) => [esc(a.club.name), num(a.average), a.matches])))
  }

  // 10. Cards
  if (st.cards.length) {
    const c = st.cards[0]
    parts.push(sec(`${esc(c.club.name)} har fået flest kort`))
    parts.push(p(`${esc(c.club.name)} har fået ${plural(c.yellow, 'gult kort', 'gule kort')} og ${plural(c.red, 'rødt kort', 'røde kort')}.`))
  }

  parts.push(
    faq([
      [`Hvor mange mål bliver der scoret i Superligaen?`, `Der er scoret ${plural(st.goals, 'mål', 'mål')} i sæsonens første ${plural(st.played, 'kamp', 'kampe')}, ${num(st.goalsPerMatch, 2)} mål pr. kamp.`],
      [`Hvem fører Superligaen?`, `${esc(leader.club.name)} fører ${after} med ${plural(leader.points, 'point', 'point')} og en målforskel på ${signed(gd(leader))}.`],
      ...(st.scorers[0] ? ([[`Hvem er topscorer i Superligaen?`, `${esc(st.scorers[0].player)} (${esc(st.scorers[0].club.name)}) fører med ${plural(st.scorers[0].goals, 'mål', 'mål')}.`]] as [string, string][]) : []),
    ]),
  )
  parts.push(p(`Følg stillingen, kampene og topscorerne live på <a href="${paths.league(s.div.slug)}">Superligaens side på Matchly</a>.`))
  return {
    kind: 'tal',
    slug: 'superligaen-i-tal',
    title: `Superligaen i tal: ${n} ting statistikken afslører ${after}`,
    excerpt: `Mål pr. kamp, hjemmebanefordel, sene mål, topscorere, forsvar og tilskuere – Superligaen ${after} forklaret med tal fra alle sæsonens kampe.`,
    content: parts.join(''),
    tags: ['Superliga', 'Statistik'],
    focusKeyword: 'superligaen statistik',
    seoTitle: `Superligaen i tal ${after} – statistik og topscorere`,
    metaDescription: `Superligaen ${after}: ${num(st.goalsPerMatch, 2)} mål pr. kamp, ${st.homeWinPct} % hjemmesejre og ${leader.club.name} i front. ${n} ting statistikken afslører.`.slice(0, 158),
  }
}

function venueTable(s: Season, home: boolean) {
  return s.table
    .map((r) => {
      const games = s.finished.filter((f) => (home ? f.home.id : f.away.id) === r.club.id)
      return { club: r.club, played: games.length, points: games.reduce((a, f) => a + pointsOf(f, r.club), 0) }
    })
    .filter((x) => x.played)
    .sort((a, b) => b.points / b.played - a.points / a.played || b.points - a.points)
}

// ---------------------------------------------------------------- 2. the form right now

function form(s: Season): SuperligaArticle | undefined {
  const N = 5
  const rows = s.table.map((r) => {
    const last = playedBy(s, r.club).slice(-N)
    const pts = last.reduce((a, f) => a + pointsOf(f, r.club), 0)
    const gf = last.reduce((a, f) => a + (f.home.id === r.club.id ? f.score[0] : f.score[1]), 0)
    const ga = last.reduce((a, f) => a + (f.home.id === r.club.id ? f.score[1] : f.score[0]), 0)
    const letters = last.map((f) => ['T', 'U', '', 'V'][pointsOf(f, r.club)]).join('')
    // Current run: matches in a row without losing / without winning
    const all = playedBy(s, r.club)
    let unbeaten = 0
    for (let i = all.length - 1; i >= 0 && pointsOf(all[i], r.club) > 0; i--) unbeaten++
    let winless = 0
    for (let i = all.length - 1; i >= 0 && pointsOf(all[i], r.club) < 3; i--) winless++
    return { r, pts, gf, ga, letters, games: last.length, unbeaten, winless, pos: position(s, r.club) }
  })
  if (rows.some((x) => x.games < 3)) return undefined
  const formTable = [...rows].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf)
  const hot = formTable[0]
  const cold = formTable[formTable.length - 1]
  const climber = [...formTable].map((x, i) => ({ x, diff: x.pos - (i + 1) })).sort((a, b) => b.diff - a.diff)[0]
  const faller = [...formTable].map((x, i) => ({ x, diff: x.pos - (i + 1) })).sort((a, b) => a.diff - b.diff)[0]
  const longestUnbeaten = [...rows].sort((a, b) => b.unbeaten - a.unbeaten)[0]
  const longestWinless = [...rows].sort((a, b) => b.winless - a.winless)[0]
  const parts: string[] = []
  parts.push(
    p(
      `Stillingen fortæller, hvor holdene står efter ${s.rounds} runder. Formtabellen fortæller, hvor de er på vej hen. ` +
        `Vi har lavet Superligaens tabel over de seneste ${N} kampe – og den ser anderledes ud end den rigtige. ` +
        `${club(hot.r.club)} er ligaens varmeste hold med ${plural(hot.pts, 'point', 'point')} af ${N * 3} mulige, mens ${club(cold.r.club)} kun har hentet ${plural(cold.pts, 'point', 'point')}.`,
    ),
  )
  parts.push(h2(`Formtabellen: de seneste ${N} kampe`))
  parts.push(table(['#', 'Klub', 'Form', 'Mål', 'P', 'I tabellen'], formTable.map((x, i) => [i + 1, club(x.r.club), x.letters, `${x.gf}-${x.ga}`, x.pts, `nr. ${x.pos}`])))
  parts.push(p('Form læses fra venstre mod højre, nyeste kamp til sidst: V = sejr, U = uafgjort, T = nederlag.'))

  parts.push(h2(`${hot.r.club.name}: ligaens varmeste hold`))
  parts.push(
    p(
      `${club(hot.r.club)} har formen ${hot.letters} og en målscore på ${hot.gf}-${hot.ga} i de seneste ${N} kampe. ` +
        `I den rigtige tabel ligger holdet nr. ${hot.pos} med ${plural(hot.r.points, 'point', 'point')}` +
        (hot.pos > 1 ? `, ${plural(s.table[0].points - hot.r.points, 'point', 'point')} efter ${esc(s.table[0].club.name)}.` : ' – i front.'),
    ),
  )
  if (climber.diff >= 2 && climber.x !== hot) {
    parts.push(h2(`${climber.x.r.club.name} spiller bedre end placeringen`))
    parts.push(p(`${club(climber.x.r.club)} ligger nr. ${climber.x.pos} i tabellen, men nr. ${climber.x.pos - climber.diff} på formen med ${plural(climber.x.pts, 'point', 'point')} i de seneste ${N} kampe (${climber.x.letters}). Holdet er på vej op.`))
  }
  parts.push(h2(`${cold.r.club.name}: formkrisen`))
  parts.push(p(`${club(cold.r.club)} har formen ${cold.letters} og har lukket ${plural(cold.ga, 'mål', 'mål')} ind i de seneste ${N} kampe. Holdet ligger nr. ${cold.pos} i tabellen.`))
  if (faller.diff <= -2 && faller.x !== cold) {
    parts.push(h2(`${faller.x.r.club.name} er gået i stå`))
    parts.push(p(`${club(faller.x.r.club)} ligger nr. ${faller.x.pos} i tabellen, men kun nr. ${faller.x.pos - faller.diff} på formen (${faller.x.letters}). Placeringen er hentet tidligere i sæsonen.`))
  }
  parts.push(h2('Stimerne'))
  parts.push(
    list([
      ...(longestUnbeaten.unbeaten >= 3 ? [`${club(longestUnbeaten.r.club)} er ubesejret i ${plural(longestUnbeaten.unbeaten, 'kamp', 'kampe')} i træk.`] : []),
      ...(longestWinless.winless >= 3 ? [`${club(longestWinless.r.club)} har ikke vundet i ${plural(longestWinless.winless, 'kamp', 'kampe')} i træk.`] : []),
    ]),
  )
  const home = venueTable(s, true)
  const away = venueTable(s, false)
  parts.push(h2('Hjemme og ude'))
  parts.push(
    p(
      `På egen bane er ${club(home[0].club)} stærkest med ${num(home[0].points / home[0].played, 2)} point pr. kamp, ude er det ${club(away[0].club)} med ${num(away[0].points / away[0].played, 2)}. ` +
        `Svagest hjemme er ${club(home[home.length - 1].club)}, svagest ude ${club(away[away.length - 1].club)}.`,
    ),
  )
  parts.push(
    table(
      ['Klub', 'Hjemme (P/kamp)', 'Ude (P/kamp)'],
      s.table.map((r) => {
        const h = home.find((x) => x.club.id === r.club.id)
        const a = away.find((x) => x.club.id === r.club.id)
        return [club(r.club), h ? num(h.points / h.played, 2) : '–', a ? num(a.points / a.played, 2) : '–']
      }),
    ),
  )
  parts.push(
    faq([
      [`Hvilket hold er i bedst form i Superligaen?`, `${esc(hot.r.club.name)} har hentet ${plural(hot.pts, 'point', 'point')} i de seneste ${N} kampe (${hot.letters}) og er ligaens formstærkeste hold.`],
      [`Hvilket hold er i dårligst form i Superligaen?`, `${esc(cold.r.club.name)} har kun hentet ${plural(cold.pts, 'point', 'point')} i de seneste ${N} kampe (${cold.letters}).`],
    ]),
  )
  parts.push(p(`Se stillingen og holdenes form live på <a href="${paths.league(s.div.slug)}">Superligaens side på Matchly</a>.`))
  return {
    kind: 'form',
    slug: 'superligaen-formtabel',
    title: `Formtabellen: Superligaens varmeste og koldeste hold lige nu`,
    excerpt: `Tabellen over de seneste ${N} kampe viser, hvem der er på vej op og ned i Superligaen – ${hot.r.club.name} i topform, ${cold.r.club.name} i krise.`,
    content: parts.join(''),
    tags: ['Superliga', 'Statistik', hot.r.club.name, cold.r.club.name],
    focusKeyword: 'superligaen form',
    seoTitle: `Superligaen formtabel – hvem er i form efter ${s.rounds} runder?`,
    metaDescription: `Superligaens formtabel over de seneste ${N} kampe: ${hot.r.club.name} er varmest med ${hot.pts} point, ${cold.r.club.name} koldest. Hjemme, ude og stimer.`.slice(0, 158),
  }
}

// ---------------------------------------------------------------- 3. the race for the top six

function top6(s: Season): SuperligaArticle | undefined {
  const cut = s.div.zones?.top ?? 6
  const left = s.regular - s.rounds
  if (left < 1) return undefined
  const sixth = s.table[cut - 1]
  const seventh = s.table[cut]
  const before = s.upcoming.filter((f) => f.round > 0 && f.round <= s.regular)
  const rows = s.table.map((r, i) => {
    const games = before.filter((f) => f.home.id === r.club.id || f.away.id === r.club.id)
    const opp = games.map((f) => (f.home.id === r.club.id ? f.away : f.home))
    const avgOpp = opp.length ? opp.reduce((a, c) => a + position(s, c), 0) / opp.length : 0
    const homeGames = games.filter((f) => f.home.id === r.club.id).length
    const pace = r.played ? (r.points / r.played) * s.regular : 0
    const max = r.points + 3 * Math.max(0, s.regular - r.played)
    return { r, pos: i + 1, games, avgOpp, homeGames, pace, max }
  })
  const safe = rows.filter((x) => x.pos <= cut && x.r.points > Math.max(...rows.filter((y) => y.pos > cut).map((y) => y.max)))
  const out = rows.filter((x) => x.pos > cut && x.max < sixth.points)
  // Only clubs with at least two matches left in the programme are compared
  const hardest = [...rows].filter((x) => x.games.length >= 2).sort((a, b) => a.avgOpp - b.avgOpp)[0]
  const easiest = [...rows].filter((x) => x.games.length >= 2).sort((a, b) => b.avgOpp - a.avgOpp)[0]
  const parts: string[] = []
  parts.push(
    p(
      `Efter ${s.regular} runder deles Superligaen i to: de ${cut} bedste spiller om mesterskabet og Europa, resten om at blive i ligaen. ` +
        `Der er ${plural(left, 'runde', 'runder')} tilbage af grundspillet, og stregen går lige nu mellem ${club(sixth.club)} på ${plural(sixth.points, 'point', 'point')} og ${club(seventh.club)} på ${plural(seventh.points, 'point', 'point')}. ` +
        `Vi har regnet på, hvem der har det letteste og det sværeste program frem mod delingen.`,
    ),
  )
  parts.push(h2('Stillingen ved stregen'))
  parts.push(`<p>[tabel liga="${s.div.slug}"]</p>`)
  parts.push(
    table(
      ['#', 'Klub', 'P', 'Kampe i programmet', 'Heraf hjemme', 'Modstandernes snitplacering', 'Pointsnit × ' + s.regular],
      rows.map((x) => [x.pos, club(x.r.club), x.r.points, x.games.length, x.homeGames, x.games.length ? num(x.avgOpp, 1) : '–', num(x.pace, 0)]),
    ),
  )
  parts.push(p(`"Modstandernes snitplacering" er den gennemsnitlige placering i tabellen nu for de hold, klubben møder i resten af grundspillet – jo lavere tal, jo sværere program. "Pointsnit × ${s.regular}" er klubbens pointsnit indtil nu ganget op til ${s.regular} kampe – en fremskrivning, ikke en forudsigelse.`))
  if (hardest && easiest && hardest !== easiest) {
    parts.push(h2('Det sværeste og det letteste program'))
    parts.push(
      p(
        `${club(hardest.r.club)} har det sværeste program: ${plural(hardest.games.length, 'kamp', 'kampe')} mod hold, der i snit ligger nr. ${num(hardest.avgOpp, 1)}. ` +
          `${club(easiest.r.club)} har det letteste med modstandere, der i snit ligger nr. ${num(easiest.avgOpp, 1)}.`,
      ),
    )
  }
  parts.push(h2(`Kampen om ${cut}.-pladsen`))
  const around = rows.filter((x) => x.pos >= cut - 2 && x.pos <= cut + 2)
  parts.push(
    list(
      around.map((x) => {
        const next = x.games[0]
        return (
          `${club(x.r.club)} (nr. ${x.pos}, ${plural(x.r.points, 'point', 'point')}): ${plural(x.games.length, 'kamp', 'kampe')} tilbage, ${plural(x.homeGames, 'hjemme', 'hjemme')}` +
          (next ? `. Næste kamp: <a href="${paths.match(next.slug)}">${esc(next.home.name)} – ${esc(next.away.name)}</a> ${dkDate(next.kickoff)}` : '') +
          '.'
        )
      }),
    ),
  )
  if (safe.length) parts.push(p(`Allerede sikre af top ${cut}: ${safe.map((x) => club(x.r.club)).join(', ')} – ingen under stregen kan nå dem.`))
  if (out.length) parts.push(p(`Kan ikke længere nå top ${cut}: ${out.map((x) => club(x.r.club)).join(', ')}.`))
  const bottom = s.table.slice(-2)
  parts.push(h2('I bunden'))
  parts.push(p(`${s.div.movement ?? ''} Lige nu ligger ${bottom.map((r) => `${club(r.club)} (${plural(r.points, 'point', 'point')})`).join(' og ')} sidst. Pointene tages med ind i slutspillet, så hvert point i grundspillet tæller.`))
  parts.push(
    faq([
      [`Hvor mange runder er der i Superligaens grundspil?`, `Grundspillet har ${s.regular} runder. Derefter deles ligaen i et mesterskabsspil for de ${cut} bedste og et nedrykningsspil for resten.`],
      [`Hvem ligger nr. ${cut} i Superligaen?`, `${esc(sixth.club.name)} ligger nr. ${cut} med ${plural(sixth.points, 'point', 'point')}, ${plural(sixth.points - seventh.points, 'point', 'point')} foran ${esc(seventh.club.name)} på ${cut + 1}.-pladsen.`],
      ...(hardest ? ([[`Hvem har det sværeste program i Superligaen?`, `${esc(hardest.r.club.name)} møder i resten af grundspillet hold, der i snit ligger nr. ${num(hardest.avgOpp, 1)} i tabellen.`]] as [string, string][]) : []),
    ]),
  )
  parts.push(p(`Kampprogrammet med tider og TV-kanaler står på <a href="${paths.league(s.div.slug)}/kampprogram">Superligaens kampprogram</a>.`))
  return {
    kind: 'top6',
    slug: 'superligaen-kampen-om-top-6',
    title: `Kampen om top ${cut}: Sådan ser vejen til Superligaens mesterskabsspil ud`,
    excerpt: `${plural(left, 'runde', 'runder')} tilbage af grundspillet. Vi har regnet på programmet for alle 12 klubber – hvem har det sværeste, og hvem er allerede sikre?`,
    content: parts.join(''),
    tags: ['Superliga', sixth.club.name, seventh.club.name],
    focusKeyword: 'superligaen top 6',
    seoTitle: `Superligaen top ${cut}: program og stilling før mesterskabsspillet`,
    metaDescription: `Hvem når Superligaens top ${cut}? ${plural(left, 'runde', 'runder')} tilbage: ${sixth.club.name} har ${sixth.points} point på ${cut}.-pladsen. Alle klubbers program frem mod delingen.`.slice(0, 158),
  }
}

/** The article of a kind as it would be written now, or why it can't be */
export function superligaArticle(kind: SuperligaKind): { article?: SuperligaArticle; error?: string } {
  const s = season()
  if (!s) return { error: 'Superligaen har endnu ikke spillet nok kampe (mindst 3 runder)' }
  const article = kind === 'tal' ? numbers(s) : kind === 'form' ? form(s) : top6(s)
  if (!article) return { error: kind === 'top6' ? 'Grundspillet er slut – artiklen om top 6 giver ikke mening nu' : 'Der mangler data til artiklen' }
  return { article }
}

/** Saves (or updates) the article as a draft; a published one is never touched */
export function saveSuperligaDraft(kind: SuperligaKind): { id?: number; slug?: string; error?: string; skipped?: string } {
  const { article, error } = superligaArticle(kind)
  if (!article) return { error }
  const existing = allArticles().find((a) => a.slug === article.slug)
  if (existing?.status === 'published') return { skipped: 'Artiklen er allerede udgivet – den røres ikke', id: existing.id, slug: existing.slug }
  addCategory('Statistik')
  const r = saveArticle({
    id: existing?.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    category: 'Statistik',
    tags: article.tags,
    focusKeyword: article.focusKeyword,
    seoTitle: article.seoTitle,
    metaDescription: article.metaDescription,
    author: 'Matchly',
    status: 'draft',
  })
  return r.error ? { error: r.error } : { id: r.article?.id, slug: r.article?.slug }
}
