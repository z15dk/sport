import 'server-only'
import { DIVISIONS, SEASON, type Club, type Division } from '../data/leagues'
import { channelsFor } from '../data/channels'
import { hashString, seeded } from '../data/fixtures'
import { allFixtures, isFinished, standings, toMatch, type Fixture, type StandingRow } from '../data/season'
import { INTERVALS, leagueStats } from '../data/stats'
import { addCategory, allArticles, saveArticle } from './articles'
import { paths } from './site'
import { formatTime } from './time'

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
    title: `Superligaen ${SEASON} i tal: ${n} ting statistikken afslører ${after}`,
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
    title: `Formtabellen: Superligaens varmeste og koldeste hold efter ${s.rounds} runder`,
    excerpt: `Tabellen over de seneste ${N} kampe viser, hvem der er på vej op og ned i Superligaen – ${hot.r.club.name} i topform, ${cold.r.club.name} i krise.`,
    content: parts.join(''),
    tags: ['Superliga', 'Statistik', hot.r.club.name, cold.r.club.name],
    focusKeyword: 'superligaen form',
    seoTitle: `Superligaen formtabel – hvem er i form efter ${s.rounds} runder?`,
    metaDescription: `Superligaens formtabel over de seneste ${N} kampe: ${hot.r.club.name} er varmest med ${hot.pts} point, ${cold.r.club.name} koldest. Hjemme, ude og stimer.`.slice(0, 158),
  }
}

// ---------------------------------------------------------------- 3. the race for the top six

const WORDS = ['nul', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti', 'elleve', 'tolv']
/** "seks" for 6 – numbers up to twelve in words, as in running text */
const word = (n: number) => WORDS[n] ?? num(n)
const kickoffText = (f: Fixture) => {
  const tv = channelsFor(toMatch(f, Date.now())).map((c) => c.name)
  return `${dkDate(f.kickoff)} kl. ${formatTime(f.kickoff)}${tv.length ? ` (${esc(tv.join(', '))})` : ''}`
}
const fixtureLink = (f: Fixture) => `<a href="${paths.match(f.slug)}">${esc(f.home.name)} – ${esc(f.away.name)}</a>`
const letters = (s: Season, c: Club, n = 5) => playedBy(s, c).slice(-n).map((f) => ['T', 'U', '', 'V'][pointsOf(f, c)]).join('')

/**
 * The rest of the regular season played many times over (seeded, so the same data gives the same
 * numbers): each side's goals drawn from a Poisson distribution built from its goals for and against
 * so far, pulled towards the league average while few matches are played, with the home side's edge.
 */
function simulate(s: Season, remaining: Fixture[], runs = 10_000) {
  const games = s.finished.length
  const goals = s.finished.reduce((a, f) => a + f.score[0] + f.score[1], 0)
  const homeGoals = s.finished.reduce((a, f) => a + f.score[0], 0)
  const avg = goals / Math.max(1, 2 * games)
  const edge = Math.sqrt(Math.max(0.5, Math.min(2, homeGoals / Math.max(1, goals - homeGoals))))
  const K = 4
  const strength = new Map(
    s.table.map((r) => [r.club.id, { att: (r.goalsFor + K * avg) / (r.played + K) / avg, def: (r.goalsAgainst + K * avg) / (r.played + K) / avg }]),
  )
  const rand = seeded(hashString(`${s.finished.length}|${remaining.map((f) => f.id).join(',')}`))
  const poisson = (l: number) => {
    const L = Math.exp(-l)
    let k = 0
    let q = 1
    do {
      k++
      q *= rand()
    } while (q > L)
    return k - 1
  }
  const ids = s.table.map((r) => r.club.id)
  const top = new Map(ids.map((id) => [id, 0]))
  const first = new Map(ids.map((id) => [id, 0]))
  const last2 = new Map(ids.map((id) => [id, 0]))
  const cut = s.div.zones?.top ?? 6
  const linePoints: number[] = []
  for (let run = 0; run < runs; run++) {
    const pts = new Map(s.table.map((r) => [r.club.id, { p: r.points, gd: gd(r), gf: r.goalsFor, tie: rand() }]))
    for (const f of remaining) {
      const h = strength.get(f.home.id)
      const a = strength.get(f.away.id)
      const ph = pts.get(f.home.id)
      const pa = pts.get(f.away.id)
      if (!h || !a || !ph || !pa) continue
      const hg = poisson(avg * edge * h.att * a.def)
      const ag = poisson((avg / edge) * a.att * h.def)
      ph.gd += hg - ag
      pa.gd += ag - hg
      ph.gf += hg
      pa.gf += ag
      if (hg > ag) ph.p += 3
      else if (hg < ag) pa.p += 3
      else {
        ph.p++
        pa.p++
      }
    }
    const order = [...pts.entries()].sort((x, y) => y[1].p - x[1].p || y[1].gd - x[1].gd || y[1].gf - x[1].gf || y[1].tie - x[1].tie)
    order.slice(0, cut).forEach(([id]) => top.set(id, top.get(id)! + 1))
    order.slice(-2).forEach(([id]) => last2.set(id, last2.get(id)! + 1))
    first.set(order[0][0], first.get(order[0][0])! + 1)
    linePoints.push(order[cut - 1][1].p)
  }
  linePoints.sort((x, y) => x - y)
  const share = (m: Map<string, number>, id: string) => (m.get(id)! / runs) * 100
  return {
    top: (id: string) => share(top, id),
    first: (id: string) => share(first, id),
    last2: (id: string) => share(last2, id),
    line: { median: linePoints[Math.floor(runs / 2)], low: linePoints[Math.floor(runs * 0.25)], high: linePoints[Math.floor(runs * 0.75)] },
  }
}
/** "99 %", "<1 %", ">99 %" – a chance as a reader takes it */
/** 100 % and 0 % only when it is settled by the points, not just in every run */
const chance = (x: number, settled?: 'in' | 'out') => (settled === 'in' ? '100 %' : settled === 'out' ? '0 %' : x >= 99.5 ? '>99 %' : x < 0.5 ? '<1 %' : `${Math.round(x)} %`)

function top6(s: Season): SuperligaArticle | undefined {
  const cut = s.div.zones?.top ?? 6
  const left = s.regular - s.rounds
  if (left < 1) return undefined
  // The rest of the regular season: each club's next matches until it has played them all
  const need = new Map(s.table.map((r) => [r.club.id, Math.max(0, s.regular - r.played)]))
  const remaining = s.upcoming.filter((f) => {
    if (!(need.get(f.home.id)! > 0 && need.get(f.away.id)! > 0)) return false
    need.set(f.home.id, need.get(f.home.id)! - 1)
    need.set(f.away.id, need.get(f.away.id)! - 1)
    return true
  })
  const missing = [...need.values()].reduce((a, n) => a + n, 0) / 2
  const sim = simulate(s, remaining)
  const ppg = (c: Club) => {
    const r = s.table.find((x) => x.club.id === c.id)!
    return r.played ? r.points / r.played : 0
  }
  const sixth = s.table[cut - 1]
  const seventh = s.table[cut]
  const rows = s.table.map((r, i) => {
    const games = remaining.filter((f) => f.home.id === r.club.id || f.away.id === r.club.id)
    const opp = games.map((f) => (f.home.id === r.club.id ? f.away : f.home))
    return {
      r,
      pos: i + 1,
      games,
      oppPpg: opp.length ? opp.reduce((a, c) => a + ppg(c), 0) / opp.length : 0,
      vsTop: games.filter((f) => position(s, f.home.id === r.club.id ? f.away : f.home) <= cut).length,
      away: games.filter((f) => f.away.id === r.club.id).length,
      pace: r.played ? (r.points / r.played) * s.regular : 0,
      max: r.points + 3 * Math.max(0, s.regular - r.played),
      top: sim.top(r.club.id),
      first: sim.first(r.club.id),
      last2: sim.last2(r.club.id),
    }
  })
  const contenders = rows.filter((x) => x.games.length >= 2)
  const byDifficulty = [...contenders].sort((a, b) => b.oppPpg - a.oppPpg)
  const hardest = byDifficulty[0]
  const easiest = byDifficulty[byDifficulty.length - 1]
  const safe = rows.filter((x) => x.pos <= cut && x.r.points > Math.max(...rows.filter((y) => y.pos > cut).map((y) => y.max)))
  const out = rows.filter((x) => x.pos > cut && x.max < sixth.points)
  const settled = (x: { r: StandingRow }): 'in' | 'out' | undefined => (safe.some((y) => y.r === x.r) ? 'in' : out.some((y) => y.r === x.r) ? 'out' : undefined)
  const topChance = (x: (typeof rows)[number]) => chance(x.top, settled(x))
  // The runs only mean something when (nearly) the whole rest of the regular season is in the programme
  const simOk = missing <= 2
  const splitDate = remaining.length ? remaining[remaining.length - 1].kickoff : undefined
  const near = (x: { pos: number }) => x.pos >= cut - 2 && x.pos <= cut + 3
  const duels = remaining.filter((f) => near({ pos: position(s, f.home) }) && near({ pos: position(s, f.away) }))
  const bottomCut = s.table.length - 2
  const lowDuels = remaining.filter((f) => position(s, f.home) > bottomCut - 2 && position(s, f.away) > bottomCut - 2)
  const leader = rows[0]
  const parts: string[] = []

  parts.push(
    p(
      `Efter ${s.regular} runder deles Superligaen i to: de ${word(cut)} bedste spiller om mesterskabet og Europa, resten om at blive i ligaen. ` +
        `Der er ${plural(left, 'runde', 'runder')} tilbage af grundspillet${splitDate ? `, der efter kampprogrammet slutter ${dkDate(splitDate)}` : ''}, og stregen går lige nu mellem ${club(sixth.club)} på ${plural(sixth.points, 'point', 'point')} og ${club(seventh.club)} på ${plural(seventh.points, 'point', 'point')}. ` +
        (simOk ? `Vi har spillet resten af grundspillet 10.000 gange igennem ud fra holdenes mål for og imod indtil nu – og regnet på, hvem der har det sværeste program.` : 'Vi har regnet på, hvem der har det sværeste program frem mod delingen.'),
    ),
  )
  parts.push(h2(simOk ? `Chancen for top ${cut}` : 'Stillingen og programmet'))
  parts.push(
    table(
      simOk ? ['#', 'Klub', 'P', `Top ${cut}`, 'Program'] : ['#', 'Klub', 'P', 'Kampe', 'Program'],
      rows.map((x) => [x.pos, club(x.r.club), x.r.points, simOk ? topChance(x) : x.games.length, x.games.length ? num(x.oppPpg, 2) : '–']),
    ),
  )
  parts.push(
    p(
      (simOk ? `"Top ${cut}" er andelen af de 10.000 gennemspilninger, hvor klubben sluttede grundspillet blandt de ${word(cut)} bedste. ` : '') +
        `"Program" er modstandernes pointsnit pr. kamp i resten af grundspillet – jo højere tal, jo sværere program. ` +
        (simOk ? `Beregningen bygger kun på sæsonens resultater indtil nu og ved intet om skader, transfers eller form på dagen. Det er en beregning, ikke en forudsigelse.` : '') +
        (missing >= 1 ? ` ${plural(Math.round(missing), 'kamp', 'kampe')} i grundspillet står endnu ikke i kampprogrammet og er ikke med.` : ''),
    ),
  )
  const sure = rows.filter((x) => x.top >= 90)
  const coin = rows.filter((x) => x.top >= 25 && x.top < 90)
  if (simOk) parts.push(
    p(
      (sure.length ? `${sure.map((x) => club(x.r.club)).join(', ')} er næsten sikre (mindst 90 %). ` : '') +
        (coin.length ? `Om de sidste pladser kæmper ${coin.map((x) => `${club(x.r.club)} (${topChance(x)})`).join(', ')}. ` : '') +
        `I halvdelen af gennemspilningerne endte nr. ${cut} med mellem ${sim.line.low} og ${sim.line.high} point – typisk ${plural(sim.line.median, 'point', 'point')}.`,
    ),
  )
  parts.push(`<p>[tabel liga="${s.div.slug}"]</p>`)

  if (simOk && leader.first >= 1) {
    parts.push(h2('Hvem vinder grundspillet?'))
    const firsts = [...rows].sort((a, b) => b.first - a.first).filter((x) => x.first >= 1).slice(0, 3)
    parts.push(p(`${club(leader.r.club)} fører med ${plural(leader.r.points, 'point', 'point')} og et pointsnit, der over ${s.regular} kampe giver ${plural(Math.round(leader.pace), 'point', 'point')}. ${firsts.map((x) => `${club(x.r.club)} vandt grundspillet i ${chance(x.first)} af gennemspilningerne`).join(', ')}.`))
  }

  if (duels.length) {
    parts.push(h2('De afgørende kampe ved stregen'))
    parts.push(p(`Når holdene omkring ${cut}.-pladsen møder hinanden, er det kampe om seks point: vinderen tager tre, og konkurrenten får ingen.`))
    parts.push(list(duels.slice(0, 8).map((f) => `${fixtureLink(f)} (nr. ${position(s, f.home)} mod nr. ${position(s, f.away)}) – ${kickoffText(f)}`)))
  }

  if (hardest && easiest && hardest !== easiest) {
    parts.push(h2('Det sværeste og det letteste program'))
    parts.push(
      p(
        `${club(hardest.r.club)} har det sværeste program: modstanderne har i snit ${num(hardest.oppPpg, 2)} point pr. kamp, ${plural(hardest.vsTop, 'kamp er', 'kampe er')} mod de nuværende top ${cut}, og ${plural(hardest.away, 'kamp', 'kampe')} spilles ude. ` +
          `${club(easiest.r.club)} har det letteste med modstandere på ${num(easiest.oppPpg, 2)} point pr. kamp og ${plural(easiest.vsTop, 'kamp', 'kampe')} mod top ${cut}.`,
      ),
    )
  }

  parts.push(h2(`Holdene omkring ${cut}.-pladsen`))
  parts.push(
    list(
      rows.filter(near).map((x) => {
        const next = x.games[0]
        const target = simOk ? Math.max(0, sim.line.median - x.r.points) : 0
        return (
          `<strong>${club(x.r.club)}</strong> (nr. ${x.pos}, ${plural(x.r.points, 'point', 'point')}, form ${letters(s, x.r.club) || '–'})${simOk ? `: ${topChance(x)} for top ${word(cut)}` : ''}. ` +
          `${plural(x.games.length, 'kamp', 'kampe')} tilbage, ${plural(x.vsTop, 'mod top ' + cut, 'mod top ' + cut)}. ` +
          (target ? `Skal hente ca. ${plural(target, 'point', 'point')} for at nå det typiske niveau for ${cut}.-pladsen. ` : '') +
          (next ? `Næste kamp: ${fixtureLink(next)}, ${kickoffText(next)}.` : '')
        )
      }),
    ),
  )
  if (safe.length) parts.push(p(`Allerede sikre af top ${word(cut)}: ${safe.map((x) => club(x.r.club)).join(', ')} – ingen under stregen kan nå dem.`))
  if (out.length) parts.push(p(`Kan ikke længere nå top ${word(cut)}: ${out.map((x) => club(x.r.club)).join(', ')}.`))

  const bottom = rows.slice(-2)
  const above = rows[bottomCut - 1]
  parts.push(h2('I bunden'))
  parts.push(
    p(
      `${s.div.movement ?? ''} Lige nu ligger ${bottom.map((x) => `${club(x.r.club)} (${plural(x.r.points, 'point', 'point')}, form ${letters(s, x.r.club) || '–'})`).join(' og ')} sidst` +
        (above ? `, ${plural(above.r.points - bottom[0].r.points, 'point', 'point')} efter ${club(above.r.club)} på ${bottomCut}.-pladsen` : '') +
        `. Pointene tages med ind i slutspillet, så hvert point i grundspillet tæller. ` +
        (simOk ? `I gennemspilningerne sluttede ${bottom.map((x) => `${esc(x.r.club.name)} blandt de to sidste i ${chance(x.last2)}`).join(' og ')} af tilfældene.` : ''),
    ),
  )
  if (lowDuels.length) parts.push(list(lowDuels.slice(0, 5).map((f) => `${fixtureLink(f)} (nr. ${position(s, f.home)} mod nr. ${position(s, f.away)}) – ${kickoffText(f)}`)))

  parts.push(
    faq([
      [`Hvornår deles Superligaen?`, `Superligaen deles efter ${s.regular} runder${splitDate ? `. Efter kampprogrammet spilles sidste runde af grundspillet ${dkDate(splitDate)}` : ''}. Derefter spiller de ${word(cut)} bedste mesterskabsspil og resten nedrykningsspil.`],
      [`Hvem ligger nr. ${cut} i Superligaen?`, `${esc(sixth.club.name)} ligger nr. ${cut} med ${plural(sixth.points, 'point', 'point')}, ${plural(sixth.points - seventh.points, 'point', 'point')} foran ${esc(seventh.club.name)} på ${cut + 1}.-pladsen.`],
      ...(simOk ? ([[`Hvor mange point skal der til top ${cut} i Superligaen?`, `I vores 10.000 gennemspilninger af resten af grundspillet endte nr. ${cut} typisk på ${plural(sim.line.median, 'point', 'point')}, i halvdelen af tilfældene mellem ${sim.line.low} og ${sim.line.high}.`]] as [string, string][]) : []),
      ...(hardest ? ([[`Hvem har det sværeste program i Superligaen?`, `${esc(hardest.r.club.name)}: modstanderne i resten af grundspillet har i snit ${num(hardest.oppPpg, 2)} point pr. kamp.`]] as [string, string][]) : []),
    ]),
  )
  parts.push(p(`Kampprogrammet med tider og TV-kanaler står på <a href="${paths.league(s.div.slug)}/kampprogram">Superligaens kampprogram</a>, og stillingen opdateres live på <a href="${paths.league(s.div.slug)}">Superligaens side</a>.`))
  const hope = rows.find((x) => x.pos === cut + 1)
  return {
    kind: 'top6',
    slug: 'superligaen-kampen-om-top-6',
    title: `Superligaen ${SEASON}: Kampen om top ${word(cut)} efter ${s.rounds} runder`,
    excerpt: simOk
      ? `${plural(left, 'runde', 'runder')} tilbage af grundspillet. Vi har spillet resten 10.000 gange: ${sixth.club.name} har ${topChance(rows[cut - 1])} for top ${word(cut)}${hope ? `, ${hope.r.club.name} ${topChance(hope)}` : ''}.`
      : `${plural(left, 'runde', 'runder')} tilbage af grundspillet. Programmet, de afgørende kampe og bunden – alle 12 klubber gennemgået.`,
    content: parts.join(''),
    tags: ['Superliga', sixth.club.name, seventh.club.name],
    focusKeyword: 'superligaen top 6',
    seoTitle: `Superligaen top ${cut}: chancer og program efter ${s.rounds} runder`,
    metaDescription: `Hvem når Superligaens top ${cut}? ${plural(left, 'runde', 'runder')} tilbage. Chancen for hver klub, de afgørende kampe, programmet og hvor mange point der skal til.`.slice(0, 158),
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
