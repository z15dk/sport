import 'server-only'
import { DIVISIONS, SEASON, type Club, type Division } from '../data/leagues'
import { channelsFor } from '../data/channels'
import { hashString, seeded } from '../data/fixtures'
import { allFixtures, isFinished, standings, toMatch, type Fixture, type StandingRow } from '../data/season'
import { gameStats, type StatGame } from '../data/stats'
import { findExternalGame } from '../data/matches'
import { alike, clubNames } from '../data/aliases'
import { pastSeasons } from './history'
import { addCategory, allArticles, saveArticle } from './articles'
import { SITE_URL, paths } from './site'
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

/** The quarter-hours (INTERVALS) as they are said */
const QUARTERS = ['i de første 15 minutter', 'mellem minut 16 og 30', 'fra minut 31 til pausen', 'i de første 15 minutter efter pausen', 'mellem minut 61 og 75', 'i de sidste 15 minutter']

/** One of a sentence's wordings, fixed per article and place (the same data reads the same) */
const pick = (key: string, ...options: string[]) => options[hashString(key) % options.length]

/**
 * This season's finished matches as the statistics need them, with the scorers, cards and half-time
 * scores from the source that has them (the match pages' events) where our fixture lacks them
 */
function richGames(s: Season): StatGame[] {
  const now = Date.now()
  return s.finished.map((f) => {
    if (f.incidents?.length && f.ht) return f
    const g = findExternalGame(toMatch(f, now))
    return { ...f, incidents: f.incidents?.length ? f.incidents : g?.incidents, ht: f.ht ?? g?.ht }
  })
}

/** The same point of earlier seasons (the first N matches of each club), from the seasons with a page of their own */
function sameTimeBefore(s: Season) {
  const out: { label: string; goalsPerMatch: number; leader: { name: string; points: number }; points: Map<string, number> }[] = []
  for (const ps of pastSeasons(s.div.id)) {
    const games = [...ps.games].sort((x, y) => x.date.getTime() - y.date.getTime())
    const count = new Map<string, number>()
    const points = new Map<string, number>()
    let goals = 0
    let matches = 0
    for (const g of games) {
      const h = count.get(g.home) ?? 0
      const a = count.get(g.away) ?? 0
      if (h >= s.rounds || a >= s.rounds) continue
      count.set(g.home, h + 1)
      count.set(g.away, a + 1)
      goals += g.homeScore + g.awayScore
      matches++
      const [ph, pa] = g.homeScore > g.awayScore ? [3, 0] : g.homeScore < g.awayScore ? [0, 3] : [1, 1]
      points.set(g.home, (points.get(g.home) ?? 0) + ph)
      points.set(g.away, (points.get(g.away) ?? 0) + pa)
    }
    if (matches < s.finished.length * 0.8) continue
    const [name, pts] = [...points.entries()].sort((x, y) => y[1] - x[1])[0] ?? ['', 0]
    out.push({ label: ps.label, goalsPerMatch: goals / matches, leader: { name, points: pts }, points })
  }
  return out
}
const pointsThen = (season: { points: Map<string, number> }, c: Club) => {
  const names = clubNames(c)
  for (const [n, p] of season.points) if (alike(names, n)) return p
  return undefined
}

function numbers(s: Season): SuperligaArticle | undefined {
  const games = richGames(s)
  const st = gameStats(games)
  if (!st) return undefined
  const key = `${s.rounds}`
  const after = `efter ${s.rounds} runder`
  const leader = s.table[0]
  const second = s.table[1]
  const gap = leader.points - second.points
  const before = sameTimeBefore(s)
  const lastYear = before[0]
  const goalRank = before.filter((b) => b.goalsPerMatch >= st.goalsPerMatch).length
  const leaderRank = before.filter((b) => b.leader.points >= leader.points).length
  const homeT = venueTable(s, true)
  const awayT = venueTable(s, false)
  const leaderHome = homeT.find((x) => x.club.id === leader.club.id)
  const leaderAway = awayT.find((x) => x.club.id === leader.club.id)
  const tight = [...s.table].sort((a, b) => a.goalsAgainst / Math.max(1, a.played) - b.goalsAgainst / Math.max(1, b.played))[0]
  const attack = [...s.table].sort((a, b) => b.goalsFor / Math.max(1, b.played) - a.goalsFor / Math.max(1, a.played))[0]
  const leaderIsBest = [tight, attack].every((x) => x.club.id === leader.club.id)
  // The best of the rest, when the leader tops every list
  const restBest = (rows: StandingRow[], by: (r: StandingRow) => number) => [...rows].filter((r) => r.club.id !== leader.club.id).sort((a, b) => by(a) - by(b))[0]
  const parts: string[] = []

  // The lead: the story first
  const dominance = leaderIsBest && gap >= 3
  parts.push(
    p(
      `<strong>` +
        (dominance
          ? pick(key + 'lead', `${esc(leader.club.name)} er ved at løbe fra resten af Superligaen.`, `Der er ét hold, der skiller sig ud i Superligaen lige nu: ${esc(leader.club.name)}.`)
          : gap === 0
            ? pick(key + 'lead', `Der er hård kamp om førstepladsen i Superligaen.`, `Toppen af Superligaen kunne ikke være tættere.`)
            : pick(key + 'lead', `${esc(leader.club.name)} sidder på førstepladsen – men forspringet er lille.`, `Superligaen har fået en ny frontløber.`)) +
        `</strong> ` +
        `${club(leader.club)} topper ${after} med ${plural(leader.points, 'point', 'point')}` +
        (gap > 0 ? `, ${plural(gap, 'point', 'point')} foran ${club(second.club)}` : `, lige så mange som ${club(second.club)}`) +
        (leaderRank === 0 && before.length >= 3 ? ` – flere point end nogen førende hold på samme tidspunkt i de ${word(before.length)} seneste sæsoner, vi har tal for` : '') +
        `. Og der bliver scoret: ${plural(st.goals, 'mål', 'mål')} på ${plural(st.played, 'kamp', 'kampe')}, ${num(st.goalsPerMatch, 2)} i snit` +
        (before.length >= 3 && goalRank === 0 ? `, det højeste på dette tidspunkt i de seneste ${word(before.length)} sæsoner` : lastYear ? ` mod ${num(lastYear.goalsPerMatch, 2)} på samme tid i ${lastYear.label}` : '') +
        `.`,
    ),
  )

  // The leader
  parts.push(h2(dominance ? `${leader.club.name}: et hold i sin egen liga` : `${leader.club.name} fører an`))
  parts.push(
    p(
      `${club(leader.club)} har vundet ${plural(leader.won, 'kamp', 'kampe')}, spillet ${plural(leader.drawn, 'uafgjort', 'uafgjort')} og tabt ${plural(leader.lost, 'gang', 'gange')}. ` +
        (leaderHome && leaderAway ? `Holdet har hentet ${plural(leaderHome.points, 'point', 'point')} på ${plural(leaderHome.played, 'hjemmekamp', 'hjemmekampe')} og ${plural(leaderAway.points, 'point', 'point')} på ${plural(leaderAway.played, 'udekamp', 'udekampe')} – ` + (leaderAway.points / leaderAway.played >= leaderHome.points / leaderHome.played ? 'det er lige meget, hvor der spilles. ' : 'og er svære at slå på egen bane. ') : '') +
        (leaderIsBest
          ? `Det er ligaens bedste angreb med ${plural(leader.goalsFor, 'mål', 'mål')} og samtidig det bedste forsvar med kun ${plural(leader.goalsAgainst, 'mål', 'mål')} imod. `
          : attack.club.id === leader.club.id
            ? `Ingen har scoret flere mål (${num(leader.goalsFor)}). `
            : tight.club.id === leader.club.id
              ? `Ingen har lukket færre mål ind (${num(leader.goalsAgainst)}). `
              : '') +
        (lastYear && pointsThen(lastYear, leader.club) !== undefined ? `På samme tid sidste sæson havde holdet ${plural(pointsThen(lastYear, leader.club)!, 'point', 'point')}.` : ''),
    ),
  )
  if (leaderIsBest) {
    const a2 = restBest(s.table, (r) => -r.goalsFor / Math.max(1, r.played))
    const d2 = restBest(s.table, (r) => r.goalsAgainst / Math.max(1, r.played))
    parts.push(p(`Bag ${esc(leader.club.name)} er ${club(a2.club)} det mest målfarlige hold med ${plural(a2.goalsFor, 'mål', 'mål')}, mens ${club(d2.club)} har det næstbedste forsvar med ${plural(d2.goalsAgainst, 'mål', 'mål')} imod.`))
  }

  // Goals
  parts.push(
    h2(
      st.goalsPerMatch >= 2.9
        ? pick(key + 'goals', 'Målene fosser ind', 'Der bliver scoret på stribe', 'Ingen grund til at gå tidligt hjem')
        : st.goalsPerMatch >= 2.5
          ? pick(key + 'goals', 'Målene', 'Hvor kommer målene fra?')
          : 'Få mål og tætte kampe',
    ),
  )
  parts.push(
    p(
      `${st.over25Pct} % af kampene har haft mindst tre mål, og i ${st.bttsPct} % har begge hold scoret. ` +
        (st.mostGoals ? `Den vildeste kamp indtil nu er ${game(st.mostGoals as Fixture)} – ${plural(st.mostGoals.score[0] + st.mostGoals.score[1], 'mål', 'mål')} på 90 minutter. ` : '') +
        (st.biggestWin ? `Den største sejr står ${game(st.biggestWin as Fixture)} for.` : ''),
    ),
  )
  if (st.byInterval) {
    const g = st.byInterval.goals
    const total = g.reduce((x, y) => x + y, 0)
    const top = g.indexOf(Math.max(...g))
    parts.push(
      p(
        `Flest mål falder ${QUARTERS[top]} (${plural(g[top], 'mål', 'mål')}), og ${pct(g[5], total)} % af alle mål kommer i de sidste 15 minutter` +
          (st.firstHalfPct !== undefined ? `. ${100 - st.firstHalfPct} % af målene falder efter pausen.` : '.'),
      ),
    )
  }
  const comebacks = games.filter((f) => f.ht && f.ht[0] !== f.ht[1] && Math.sign(f.score[0] - f.score[1]) !== Math.sign(f.ht[0] - f.ht[1]))
  if (games.filter((f) => f.ht).length >= 10 && comebacks.length) {
    const last = comebacks[comebacks.length - 1] as Fixture
    parts.push(p(`${plural(comebacks.length, 'gang', 'gange')} har holdet, der førte ved pausen, ikke vundet. Senest i ${game(last)}.`))
  }

  // Home and away
  parts.push(h2(st.homeWinPct >= st.awayWinPct + 10 ? 'Hjemmebanen tæller' : st.awayWinPct >= st.homeWinPct ? 'Udeholdene tager for sig' : 'Hjemmebanen er ingen garanti'))
  const h2nd = homeT.find((x) => x.club.id !== leader.club.id)
  const a2nd = awayT.find((x) => x.club.id !== leader.club.id)
  parts.push(
    p(
      `Hjemmeholdet har vundet ${st.homeWinPct} % af kampene, udeholdet ${st.awayWinPct} %, og ${st.drawPct} % er endt uafgjort. ` +
        (h2nd ? `${homeT[0].club.id === leader.club.id ? `Efter ${esc(leader.club.name)} er ` : ''}${club(h2nd.club)} ${homeT[0].club.id === leader.club.id ? 'stærkest hjemme' : 'er stærkest hjemme'} med ${plural(h2nd.points, 'point', 'point')} på ${plural(h2nd.played, 'kamp', 'kampe')}` : '') +
        (a2nd ? `, og ${club(a2nd.club)} henter flest point ude blandt resten (${plural(a2nd.points, 'point', 'point')} på ${plural(a2nd.played, 'kamp', 'kampe')}).` : '.'),
    ),
  )

  // Scorers
  if (st.scorers.length) {
    const s1 = st.scorers[0]
    parts.push(h2(`${s1.player} sætter tempoet`))
    parts.push(
      p(
        `${esc(s1.player)} fra ${esc(s1.club.name)} topper skytteligaen med ${plural(s1.goals, 'mål', 'mål')}` +
          (s1.penalties ? `, heraf ${plural(s1.penalties, 'straffespark', 'straffespark')}` : '') +
          (st.scorers[1] ? `. Nærmest er ${esc(st.scorers[1].player)} (${esc(st.scorers[1].club.name)}) med ${plural(st.scorers[1].goals, 'mål', 'mål')}.` : '.') +
          ` Hele listen står på <a href="${paths.league(s.div.slug)}/topscorere">Superligaens topscorerliste</a>.`,
      ),
    )
    parts.push(table(['#', 'Spiller', 'Klub', 'Mål'], st.scorers.slice(0, 5).map((r, i) => [i + 1, esc(r.player), esc(r.club.name), r.goals])))
  }

  // The surprise: the biggest win by a team in the bottom half over one in the top
  const half = Math.ceil(s.table.length / 2)
  const upsets = s.finished
    .map((f) => {
      const [w, l] = f.score[0] > f.score[1] ? [f.home, f.away] : f.score[0] < f.score[1] ? [f.away, f.home] : [undefined, undefined]
      return w && l ? { f, w, l, gapPos: position(s, w) - position(s, l) } : undefined
    })
    .filter((x): x is NonNullable<typeof x> => !!x && position(s, x.w) > half && position(s, x.l) <= 3)
    .sort((a, b) => b.gapPos - a.gapPos)
  if (upsets[0]) {
    const u = upsets[0]
    parts.push(h2('Sæsonens overraskelse'))
    parts.push(p(`${club(u.w)} ligger nr. ${position(s, u.w)}, men har slået ${club(u.l)}, der ligger nr. ${position(s, u.l)}: ${game(u.f)}. Det viser, at alle kan slå alle i denne liga.`))
  }

  // Up and down since last season
  if (lastYear) {
    const moves = s.table
      .map((r) => ({ r, then: pointsThen(lastYear, r.club) }))
      .filter((x): x is { r: StandingRow; then: number } => x.then !== undefined)
      .map((x) => ({ ...x, diff: x.r.points - x.then }))
      .sort((a, b) => b.diff - a.diff)
    if (moves.length >= 4) {
      const up = moves[0]
      const down = moves[moves.length - 1]
      parts.push(h2('Op og ned siden sidste sæson'))
      parts.push(
        p(
          `Sammenlignet med samme tidspunkt i ${lastYear.label} er ${club(up.r.club)} den store fremgang: ${plural(up.r.points, 'point', 'point')} nu mod ${plural(up.then, 'point', 'point')} dengang. ` +
            (down.diff < 0 ? `Den modsatte vej er det gået for ${club(down.r.club)}, der har ${plural(-down.diff, 'point', 'point')} færre end sidste år.` : ''),
        ),
      )
    }
  }

  // The middle
  if (s.table.length >= 10) {
    const third = s.table[2]
    const tenth = s.table[9]
    parts.push(h2(third.points - tenth.points <= 6 ? 'Et tæt midterfelt' : 'Et langt felt'))
    parts.push(p(`Der er ${plural(third.points - tenth.points, 'point', 'point')} mellem ${club(third.club)} på tredjepladsen og ${club(tenth.club)} på tiendepladsen. ${third.points - tenth.points <= 6 ? 'En god weekend kan flytte et hold fire-fem pladser.' : 'Feltet er ved at trække sig fra hinanden.'}`))
  }

  // Draws
  const draws = [...s.table].sort((x, y) => y.drawn - x.drawn)[0]
  if (draws.drawn >= 3) {
    parts.push(h2(`${draws.club.name} deler point`))
    parts.push(p(`${club(draws.club)} har spillet ${plural(draws.drawn, 'uafgjort kamp', 'uafgjorte kampe')} af ${num(draws.played)} – flest i ligaen. Uafgjort er endt i ${st.drawPct} % af alle kampe.`))
  }

  // Bottom
  const last = s.table[s.table.length - 1]
  const prev = s.table[s.table.length - 2]
  parts.push(h2('Bunden'))
  parts.push(
    p(
      `I bunden ligger ${club(last.club)} med ${plural(last.points, 'point', 'point')} og ${club(prev.club)} med ${plural(prev.points, 'point', 'point')}. ` +
        `${club(last.club)} har ${last.won ? `kun vundet ${plural(last.won, 'kamp', 'kampe')}` : 'endnu ikke vundet en kamp'} og har lukket ${plural(last.goalsAgainst, 'mål', 'mål')} ind.`,
    ),
  )

  // Attendance and cards when there are numbers
  if (st.attendance.length >= 3) {
    const top = st.attendance[0]
    parts.push(h2('Tilskuerne'))
    parts.push(p(`Flest kommer der hos ${esc(top.club.name)}: ${num(top.average)} i snit på ${plural(top.matches, 'hjemmekamp', 'hjemmekampe')}. Færrest har ${esc(st.attendance[st.attendance.length - 1].club.name)} med ${num(st.attendance[st.attendance.length - 1].average)}.`))
  }

  // Fact box
  parts.push(h2(`Superligaen ${after} – fakta`))
  parts.push(
    list([
      `Kampe spillet: ${num(st.played)}`,
      `Mål: ${num(st.goals)} (${num(st.goalsPerMatch, 2)} pr. kamp)`,
      `Hjemmesejre / uafgjort / udesejre: ${st.homeWinPct} / ${st.drawPct} / ${st.awayWinPct} %`,
      `Fører: ${club(leader.club)}, ${plural(leader.points, 'point', 'point')}`,
      ...(st.scorers[0] ? [`Topscorer: ${esc(st.scorers[0].player)}, ${plural(st.scorers[0].goals, 'mål', 'mål')}`] : []),
      `Bedste angreb: ${club(attack.club)} (${num(attack.goalsFor)} mål)`,
      `Bedste forsvar: ${club(tight.club)} (${num(tight.goalsAgainst)} mål imod)`,
    ]),
  )

  parts.push(
    faq([
      [`Hvem fører Superligaen?`, `${esc(leader.club.name)} fører ${after} med ${plural(leader.points, 'point', 'point')} og en målforskel på ${signed(gd(leader))}.`],
      [`Hvor mange mål bliver der scoret i Superligaen?`, `Der er scoret ${plural(st.goals, 'mål', 'mål')} i sæsonens første ${plural(st.played, 'kamp', 'kampe')}, ${num(st.goalsPerMatch, 2)} mål pr. kamp.`],
      ...(st.scorers[0] ? ([[`Hvem er topscorer i Superligaen?`, `${esc(st.scorers[0].player)} (${esc(st.scorers[0].club.name)}) fører med ${plural(st.scorers[0].goals, 'mål', 'mål')}.`]] as [string, string][]) : []),
    ]),
  )
  parts.push(p(`Følg stillingen, kampene og topscorerne live på <a href="${paths.league(s.div.slug)}">Superligaens side på Matchly</a>.`))

  const goalsBit = st.goalsPerMatch >= 2.9 ? 'og målene fosser ind' : st.goalsPerMatch < 2.5 ? 'og forsvarene har styr på det' : `${num(st.goalsPerMatch, 2)} mål pr. kamp`
  const title = dominance
    ? `${leader.club.name} løber fra Superligaen ${after} – ${goalsBit}`
    : gap === 0
      ? `Point-lige i toppen af Superligaen ${after} – ${goalsBit}`
      : `${leader.club.name} fører Superligaen ${after} med ${plural(gap, 'point', 'point')} – ${goalsBit}`
  return {
    kind: 'tal',
    slug: 'superligaen-i-tal',
    title,
    excerpt: `${leader.club.name} fører med ${leader.points} point ${after}, og der er scoret ${num(st.goalsPerMatch, 2)} mål pr. kamp. Vi har gennemgået alle sæsonens kampe: målene, overraskelserne, hjemmebanen og bunden.`,
    content: parts.join(''),
    tags: ['Superliga', 'Statistik', leader.club.name],
    focusKeyword: 'superligaen statistik',
    seoTitle: `Superligaen ${SEASON} ${after}: statistik, topscorere og stilling`,
    metaDescription: `${leader.club.name} fører Superligaen ${after} med ${leader.points} point. ${num(st.goalsPerMatch, 2)} mål pr. kamp, ${st.homeWinPct} % hjemmesejre – alle tallene bag sæsonen.`.slice(0, 158),
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

/** A club's result in a match, from its own side: "3-0 over AGF", "1-2 mod Brøndby IF", with the match page */
function resultLine(f: Fixture, c: Club) {
  const home = f.home.id === c.id
  const [m, o] = home ? f.score : [f.score[1], f.score[0]]
  const opp = home ? f.away : f.home
  return `<a href="${paths.match(f.slug)}">${m}-${o} ${m > o ? 'over' : 'mod'} ${esc(opp.name)}</a>${home ? '' : ' (ude)'}`
}
const runOf = (games: Fixture[], c: Club, ok: (pts: number) => boolean) => {
  let n = 0
  for (let i = games.length - 1; i >= 0 && ok(pointsOf(games[i], c)); i--) n++
  return n
}

function form(s: Season): SuperligaArticle | undefined {
  const N = 5
  const rows = s.table.map((r) => {
    const all = playedBy(s, r.club)
    const last = all.slice(-N)
    const gf = last.reduce((a, f) => a + (f.home.id === r.club.id ? f.score[0] : f.score[1]), 0)
    const ga = last.reduce((a, f) => a + (f.home.id === r.club.id ? f.score[1] : f.score[0]), 0)
    const lastWin = [...all].reverse().find((f) => pointsOf(f, r.club) === 3)
    return {
      r,
      all,
      last,
      pts: last.reduce((a, f) => a + pointsOf(f, r.club), 0),
      gf,
      ga,
      clean: last.filter((f) => (f.home.id === r.club.id ? f.score[1] : f.score[0]) === 0).length,
      letters: last.map((f) => ['T', 'U', '', 'V'][pointsOf(f, r.club)]).join(''),
      wins: runOf(all, r.club, (x) => x === 3),
      unbeaten: runOf(all, r.club, (x) => x > 0),
      winless: runOf(all, r.club, (x) => x < 3),
      losses: runOf(all, r.club, (x) => x === 0),
      lastWin,
      next: s.upcoming.find((f) => f.home.id === r.club.id || f.away.id === r.club.id),
      pos: position(s, r.club),
    }
  })
  if (rows.some((x) => x.last.length < 3)) return undefined
  const formTable = [...rows].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf)
  const formPos = (x: (typeof rows)[number]) => formTable.indexOf(x) + 1
  const hot = formTable[0]
  const cold = formTable[formTable.length - 1]
  const climber = formTable.filter((x) => x !== hot && x.pos - formPos(x) >= 2).sort((a, b) => b.pos - formPos(b) - (a.pos - formPos(a)))[0]
  const faller = formTable.filter((x) => x !== cold && formPos(x) - x.pos >= 3).sort((a, b) => formPos(b) - b.pos - (formPos(a) - a.pos))[0]
  const unbeaten = [...rows].filter((x) => x !== hot).sort((a, b) => b.unbeaten - a.unbeaten)[0]
  const key = `form${s.rounds}`
  const nextLine = (x: (typeof rows)[number]) => (x.next ? `Næste opgave er ${fixtureLink(x.next)} ${kickoffText(x.next)}.` : '')
  const parts: string[] = []

  // Lead
  const hotPerfect = hot.pts === N * 3
  parts.push(
    p(
      `<strong>` +
        (hotPerfect
          ? pick(key, `${plural(N, 'kamp', 'kampe')}, ${plural(N, 'sejr', 'sejre')}: ${esc(hot.r.club.name)} er i en klasse for sig lige nu.`, `${esc(hot.r.club.name)} kan ikke stoppes.`)
          : pick(key, `${esc(hot.r.club.name)} er Superligaens varmeste hold.`, `Formen peger ét sted hen: ${esc(hot.r.club.name)}.`)) +
        `</strong> ` +
        `Holdet har hentet ${plural(hot.pts, 'point', 'point')} af ${N * 3} mulige i de seneste ${plural(N, 'kamp', 'kampe')} med en målscore på ${hot.gf}-${hot.ga}. ` +
        `I den anden ende står ${club(cold.r.club)} med ${plural(cold.pts, 'point', 'point')} og ${cold.winless >= 3 ? `${plural(cold.winless, 'kamp', 'kampe')} i træk uden sejr` : `formen ${cold.letters}`}. ` +
        `Matchly har gennemgået alle klubbernes seneste kampe – her er, hvem der er på vej op, og hvem der er på vej ned.`,
    ),
  )

  // The hot team
  parts.push(h2(hot.wins >= 3 ? `${plural(hot.wins, 'sejr', 'sejre')} i træk for ${hot.r.club.name}` : `${hot.r.club.name} i topform`))
  parts.push(
    p(
      (hotPerfect ? `${club(hot.r.club)} har vundet ${hot.last.map((f) => resultLine(f, hot.r.club)).join(', ')}. ` : `${pick(key + 'res', 'Resultaterne taler for sig selv', 'Sådan er det gået')}: ${hot.last.map((f) => resultLine(f, hot.r.club)).join(', ')}. `) +
        (hot.clean >= 2 ? `${pick(key + 'clean', 'Bagkæden står solidt', 'Forsvaret er låst af')}: ${plural(hot.clean, 'kamp', 'kampe')} uden mål imod i perioden. ` : '') +
        (hot.pos === 1 ? `Det har sendt holdet til tops med ${plural(hot.r.points, 'point', 'point')}${s.table[1] ? `, ${plural(hot.r.points - s.table[1].points, 'point', 'point')} foran ${club(s.table[1].club)}` : ''}. ` : `Holdet ligger nr. ${hot.pos} med ${plural(hot.r.points, 'point', 'point')}, ${plural(s.table[0].points - hot.r.points, 'point', 'point')} fra førstepladsen. `) +
        nextLine(hot),
    ),
  )

  // On the way up
  if (climber) {
    parts.push(h2(pick(key + 'up', `${climber.r.club.name} er på vej op`, `${climber.r.club.name} har fundet formen`)))
    parts.push(
      p(
        `${club(climber.r.club)} ligger nr. ${climber.pos} i tabellen, men nr. ${formPos(climber)} på formen. ` +
          `De seneste resultater: ${climber.last.map((f) => resultLine(f, climber.r.club)).join(', ')}. ` +
          nextLine(climber),
      ),
    )
  }

  // The unbeaten run
  if (unbeaten && unbeaten.unbeaten >= 4) {
    const allGames = unbeaten.unbeaten === unbeaten.all.length
    parts.push(h2(allGames ? `${unbeaten.r.club.name} har endnu ikke tabt` : `${unbeaten.r.club.name} er svære at slå`))
    parts.push(
      p(
        `${club(unbeaten.r.club)} er ubesejret i ${plural(unbeaten.unbeaten, 'kamp', 'kampe')} i træk${allGames ? ' – hele sæsonen' : ''}. ` +
          (unbeaten.r.drawn >= 3 ? `Men ${plural(unbeaten.r.drawn, 'uafgjort', 'uafgjorte')} betyder, at holdet ligger nr. ${unbeaten.pos} med ${plural(unbeaten.r.points, 'point', 'point')}. ` : `Holdet ligger nr. ${unbeaten.pos} med ${plural(unbeaten.r.points, 'point', 'point')}. `) + nextLine(unbeaten),
      ),
    )
  }

  // On the way down
  if (faller) {
    parts.push(h2(faller.losses >= 3 ? `${plural(faller.losses, 'nederlag', 'nederlag')} i træk: ${faller.r.club.name} er gået i stå` : `${faller.r.club.name} mister pusten`))
    parts.push(
      p(
        `${club(faller.r.club)} ligger stadig nr. ${faller.pos}, men er kun nr. ${formPos(faller)} på formen. ` +
          `Placeringen er hentet tidligere i sæsonen – de seneste kampe er endt ${faller.last.map((f) => resultLine(f, faller.r.club)).join(', ')}. ` +
          nextLine(faller),
      ),
    )
  }

  // The crisis
  const zone = s.table.length - 2
  parts.push(h2(cold.winless >= 5 ? `Krisen kradser i ${cold.r.club.name}` : `${cold.r.club.name} har svært ved at vinde`))
  parts.push(
    p(
      `${club(cold.r.club)} har hentet ${plural(cold.pts, 'point', 'point')} i de seneste ${plural(N, 'kamp', 'kampe')} og lukket ${plural(cold.ga, 'mål', 'mål')} ind. ` +
        (cold.lastWin ? `Sidste sejr kom ${dkDate(cold.lastWin.kickoff)}: ${resultLine(cold.lastWin, cold.r.club)}. ` : `Holdet har endnu ikke vundet en kamp i denne sæson. `) +
        (cold.pos > zone ? `Holdet ligger under nedrykningsstregen som nr. ${cold.pos}. ` : `Holdet ligger nr. ${cold.pos}, ${plural(cold.r.points - s.table[zone].points, 'point', 'point')} over nedrykningsstregen. `) +
        nextLine(cold),
    ),
  )

  // The form clash of the next round
  const clash = s.upcoming
    .slice(0, s.table.length)
    .map((f) => {
      const h = rows.find((x) => x.r.club.id === f.home.id)
      const a = rows.find((x) => x.r.club.id === f.away.id)
      return h && a ? { f, h, a, score: h.pts + a.pts } : undefined
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((x, y) => y.score - x.score)[0]
  if (clash && clash.score >= 14) {
    parts.push(h2('Formkampen'))
    parts.push(
      p(
        `Næste runde byder på et møde mellem to hold i form: ${fixtureLink(clash.f)} ${kickoffText(clash.f)}. ` +
          `${esc(clash.h.r.club.name)} har formen ${clash.h.letters}, ${esc(clash.a.r.club.name)} ${clash.a.letters}.`,
      ),
    )
  }

  // Home and away, the rest after the best
  const home = venueTable(s, true)
  const away = venueTable(s, false)
  parts.push(h2('Hjemme og ude'))
  parts.push(
    p(
      `${home[0].club.id === away[0].club.id ? `${club(home[0].club)} er bedst både hjemme (${num(home[0].points / home[0].played, 2)} point pr. kamp) og ude (${num(away[0].points / away[0].played, 2)}). ` : `Bedst hjemme er ${club(home[0].club)} (${num(home[0].points / home[0].played, 2)} point pr. kamp), bedst ude ${club(away[0].club)} (${num(away[0].points / away[0].played, 2)}). `}` +
        (away[away.length - 1].points === 0
          ? `${club(away[away.length - 1].club)} har endnu ikke hentet et point på udebane`
          : `Sværest har ${club(away[away.length - 1].club)} på udebane med ${num(away[away.length - 1].points / away[away.length - 1].played, 2)} point pr. kamp`) +
        `, mens ${club(home[home.length - 1].club)} kun henter ${num(home[home.length - 1].points / home[home.length - 1].played, 2)} point pr. kamp hjemme.`,
    ),
  )

  // The form table, short enough for a phone
  parts.push(h2(`Formtabellen: de seneste ${plural(N, 'kamp', 'kampe')}`))
  parts.push(table(['#', 'Klub', 'Form', 'P', 'Nu'], formTable.map((x, i) => [i + 1, club(x.r.club), x.letters, x.pts, `nr. ${x.pos}`])))
  parts.push(p('Formen læses fra venstre mod højre med den nyeste kamp til sidst: V = sejr, U = uafgjort, T = nederlag. "Nu" er placeringen i den rigtige tabel.'))

  parts.push(h2('Fakta'))
  parts.push(
    list([
      `Bedst i form: ${club(hot.r.club)}, ${plural(hot.pts, 'point', 'point')} (${hot.letters})`,
      `Dårligst i form: ${club(cold.r.club)}, ${plural(cold.pts, 'point', 'point')} (${cold.letters})`,
      ...(unbeaten && unbeaten.unbeaten >= 3 ? [`Længste stime uden nederlag: ${club(unbeaten.r.club)}, ${plural(unbeaten.unbeaten, 'kamp', 'kampe')}`] : []),
      `Længste stime uden sejr: ${(() => {
        const w = [...rows].sort((a, b) => b.winless - a.winless)[0]
        return `${club(w.r.club)}, ${plural(w.winless, 'kamp', 'kampe')}`
      })()}`,
    ]),
  )
  parts.push(
    faq([
      [`Hvilket hold er i bedst form i Superligaen?`, `${esc(hot.r.club.name)} har hentet ${plural(hot.pts, 'point', 'point')} i de seneste ${N} kampe (${hot.letters}) og er ligaens formstærkeste hold.`],
      [`Hvilket hold er i dårligst form i Superligaen?`, `${esc(cold.r.club.name)} har kun hentet ${plural(cold.pts, 'point', 'point')} i de seneste ${N} kampe (${cold.letters}).`],
    ]),
  )
  parts.push(p(`Se stillingen og holdenes form live på <a href="${paths.league(s.div.slug)}">Superligaens side på Matchly</a>.`))
  const title = hotPerfect
    ? `${plural(N, 'sejr', 'sejre')} i træk: ${hot.r.club.name} er i en klasse for sig – krisen kradser i ${cold.r.club.name}`
    : `${hot.r.club.name} er Superligaens varmeste hold – ${cold.r.club.name} leder efter formen`
  return {
    kind: 'form',
    slug: 'superligaen-formtabel',
    title,
    excerpt: `${hot.r.club.name} har hentet ${hot.pts} af ${N * 3} mulige point, mens ${cold.r.club.name} kun har ${cold.pts}. Formtabellen over de seneste ${N} kampe viser, hvem der er på vej op og ned i Superligaen.`,
    content: parts.join(''),
    tags: ['Superliga', 'Statistik', hot.r.club.name, cold.r.club.name],
    focusKeyword: 'superligaen form',
    seoTitle: `Superligaen formtabel efter ${s.rounds} runder – hvem er i form?`,
    metaDescription: `Superligaens formtabel over de seneste ${N} kampe: ${hot.r.club.name} er varmest med ${hot.pts} point, ${cold.r.club.name} koldest med ${cold.pts}. Stimer, kriser og formkampen.`.slice(0, 158),
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

// ---------------------------------------------------------------- the fact sheet

/**
 * Every number an article needs, as plain text to paste into a chat with a writer (Claude): the table
 * with home/away and form, the last two rounds with scorers, half-time and attendance, the top
 * scorers, the coming rounds with time and TV, earlier seasons at the same point and the calculation
 * of the rest of the regular season. Links are absolute, so the writer can put them in the text.
 */
export function superligaFacts(): { text?: string; error?: string } {
  const s = season()
  if (!s) return { error: 'For få spillede kampe i Superligaen endnu (mindst 18).' }
  const url = (path: string) => `${SITE_URL}${path}`
  const games = richGames(s)
  const st = gameStats(games)
  const cut = s.div.zones?.top ?? 6
  const out: string[] = []
  const line = (t = '') => out.push(t)
  const head = (t: string) => {
    line()
    line(`## ${t}`)
  }
  const goalsText = (f: StatGame) =>
    (f.incidents ?? [])
      .filter((i) => i.kind === 'goal' || i.kind === 'penalty' || i.kind === 'own-goal')
      .sort((a, b) => a.minute - b.minute)
      .map((i) => `${i.approx ? 'ca. ' : ''}${i.minute}' ${i.player ?? '(ukendt)'}${i.kind === 'penalty' ? ' (str.)' : i.kind === 'own-goal' ? ' (selvmål)' : ''} [${i.side === 'home' ? f.home.name : f.away.name}]`)
      .join(', ')
  const reds = (f: StatGame) =>
    (f.incidents ?? [])
      .filter((i) => i.kind === 'red')
      .map((i) => `${i.minute}' ${i.player ?? ''} [${i.side === 'home' ? f.home.name : f.away.name}]`)
      .join(', ')

  line(`# Faktaark: Superligaen ${SEASON} efter ${s.rounds} runder`)
  line(`Lavet ${dkDate(new Date())} kl. ${formatTime(new Date())}. Kun rigtige data fra sæsonens kampe. Ligaside: ${url(paths.league(s.div.slug))}`)
  line(`Levende tabel i artiklen: [tabel liga="${s.div.slug}"]`)
  line(`Grundspillet: ${s.regular} runder, derefter deles ligaen (top ${cut} om mesterskabet).`)

  head('Stillingen')
  line('Nr. Klub – K V-U-T, mål, MF, point | hjemme V-U-T | ude V-U-T | form (seneste 5, nyeste sidst) | klubside')
  const vt = (home: boolean, c: Club) => {
    const pts = s.finished.filter((f) => (home ? f.home.id : f.away.id) === c.id).map((f) => pointsOf(f, c))
    return `${pts.filter((p) => p === 3).length}-${pts.filter((p) => p === 1).length}-${pts.filter((p) => p === 0).length}`
  }
  s.table.forEach((r, i) =>
    line(`${i + 1}. ${r.club.name} – ${r.played} ${r.won}-${r.drawn}-${r.lost}, ${r.goalsFor}-${r.goalsAgainst}, ${signed(gd(r))}, ${r.points} p | hjemme ${vt(true, r.club)} | ude ${vt(false, r.club)} | ${r.form.slice(-5).join('')} | ${url(paths.club(r.club.slug))}`),
  )

  if (st) {
    head('Sæsonen i tal')
    line(`Kampe: ${st.played}, mål: ${st.goals} (${num(st.goalsPerMatch, 2)} pr. kamp)`)
    line(`Hjemmesejre ${Math.round(st.homeWinPct)} %, uafgjort ${Math.round(st.drawPct)} %, udesejre ${Math.round(st.awayWinPct)} %`)
    line(`Over 2,5 mål ${Math.round(st.over25Pct)} %, begge hold scorer ${Math.round(st.bttsPct)} %${st.firstHalfPct !== undefined ? `, mål i 1. halvleg ${Math.round(st.firstHalfPct)} %` : ''}`)
    if (st.byInterval) line(`Mål pr. kvarter (${st.byInterval.matches} kampe med målminutter): ${st.byInterval.goals.map((g, i) => `${['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'][i]}: ${g}`).join(', ')}`)
    if (st.biggestWin) line(`Største sejr: ${st.biggestWin.home.name} – ${st.biggestWin.away.name} ${st.biggestWin.score[0]}-${st.biggestWin.score[1]}`)
    if (st.mostGoals) line(`Flest mål i én kamp: ${st.mostGoals.home.name} – ${st.mostGoals.away.name} ${st.mostGoals.score[0]}-${st.mostGoals.score[1]}`)
    if (st.scorers.length) {
      head('Topscorere')
      st.scorers.slice(0, 12).forEach((r, i) => line(`${i + 1}. ${r.player} (${r.club.name}) ${r.goals} mål${r.penalties ? `, heraf ${r.penalties} straffe` : ''}`))
    }
    if (st.cards.length) {
      head('Kort pr. klub')
      st.cards.forEach((r) => line(`${r.club.name}: ${r.yellow} gule, ${r.red} røde`))
    }
    if (st.attendance.length) {
      head('Tilskuere (snit på hjemmebane)')
      st.attendance.forEach((r) => line(`${r.club.name}: ${num(Math.round(r.average))} (${r.matches} kampe)`))
    }
  }

  // Comebacks: won or drew from behind at half-time
  const comebacks = games.filter((f) => f.ht && ((f.ht[0] < f.ht[1] && f.score[0] >= f.score[1]) || (f.ht[0] > f.ht[1] && f.score[0] <= f.score[1])))
  if (comebacks.length) {
    head('Vendte kampe (bagud ved pausen, ikke tabt)')
    comebacks.forEach((f) => line(`${dkDate(f.kickoff)}: ${f.home.name} – ${f.away.name} ${f.score[0]}-${f.score[1]} (pause ${f.ht![0]}-${f.ht![1]})`))
  }

  const rounds = [...new Set(games.map((f) => (f as Fixture).round))].sort((a, b) => b - a).slice(0, 2)
  for (const round of rounds.reverse()) {
    head(`Runde ${round}: resultater`)
    for (const f of games.filter((g) => (g as Fixture).round === round)) {
      const fx = f as Fixture
      line(
        `${dkDate(fx.kickoff)}: ${fx.home.name} – ${fx.away.name} ${fx.score[0]}-${fx.score[1]}${fx.ht ? ` (pause ${fx.ht[0]}-${fx.ht[1]})` : ''}${fx.spectators ? `, ${num(fx.spectators)} tilskuere` : ''} | ${url(paths.match(fx.slug))}`,
      )
      const g = goalsText(f)
      if (g) line(`   Mål: ${g}`)
      const r = reds(f)
      if (r) line(`   Røde kort: ${r}`)
    }
  }

  head('Alle sæsonens resultater')
  s.finished.forEach((f) => line(`R${f.round} ${dkDate(f.kickoff)}: ${f.home.name} – ${f.away.name} ${f.score[0]}-${f.score[1]}`))

  const nextRounds = [...new Set(s.upcoming.map((f) => f.round))].slice(0, 2)
  for (const round of nextRounds) {
    head(`Runde ${round}: kommende kampe`)
    s.upcoming
      .filter((f) => f.round === round)
      .forEach((f) => line(`${kickoffText(f)}: ${f.home.name} (nr. ${position(s, f.home)}) – ${f.away.name} (nr. ${position(s, f.away)}) | ${url(paths.match(f.slug))}`))
  }

  const before = sameTimeBefore(s)
  if (before.length) {
    head(`Tidligere sæsoner efter ${s.rounds} runder`)
    for (const b of before) {
      const clubs = s.table
        .map((r) => [r.club.name, pointsThen(b, r.club)] as const)
        .filter(([, p]) => p !== undefined)
        .map(([n, p]) => `${n} ${p}`)
        .join(', ')
      line(`${b.label}: ${num(b.goalsPerMatch, 2)} mål pr. kamp, fører ${b.leader.name} med ${b.leader.points} point. Point dengang: ${clubs || '–'}`)
    }
  }

  // The rest of the regular season, as in the top-six article
  const left = s.regular - s.rounds
  if (left >= 1) {
    const need = new Map(s.table.map((r) => [r.club.id, Math.max(0, s.regular - r.played)]))
    const remaining = s.upcoming.filter((f) => {
      if (!(need.get(f.home.id)! > 0 && need.get(f.away.id)! > 0)) return false
      need.set(f.home.id, need.get(f.home.id)! - 1)
      need.set(f.away.id, need.get(f.away.id)! - 1)
      return true
    })
    const missing = [...need.values()].reduce((a, n) => a + n, 0) / 2
    head(`Resten af grundspillet (${left} runder${remaining.length ? `, sidste kamp ${dkDate(remaining[remaining.length - 1].kickoff)}` : ''})`)
    const ppg = (c: Club) => {
      const r = s.table.find((x) => x.club.id === c.id)!
      return r.played ? r.points / r.played : 0
    }
    if (missing <= 2) {
      const sim = simulate(s, remaining)
      line(`BEREGNING (ikke forudsigelse): resten spillet 10.000 gange ud fra holdenes mål for/imod indtil nu og hjemmebanefordelen.`)
      line(`Nr. ${cut} endte typisk på ${sim.line.median} point (halvdelen af gangene ${sim.line.low}-${sim.line.high}).`)
      s.table.forEach((r, i) => {
        const opp = remaining.filter((f) => f.home.id === r.club.id || f.away.id === r.club.id).map((f) => (f.home.id === r.club.id ? f.away : f.home))
        const max = r.points + 3 * Math.max(0, s.regular - r.played)
        line(
          `${i + 1}. ${r.club.name}: top ${cut} ${chance(sim.top(r.club.id))}, vinder grundspillet ${chance(sim.first(r.club.id))}, to sidste ${chance(sim.last2(r.club.id))} | kan max nå ${max} p | modstandernes pointsnit ${opp.length ? num(opp.reduce((a, c) => a + ppg(c), 0) / opp.length, 2) : '–'} | resten: ${opp.map((c) => c.name).join(', ')}`,
        )
      })
    } else line(`${Math.round(missing)} kampe i grundspillet står endnu ikke i kampprogrammet, så der er ingen beregning.`)
  }

  line()
  line('## Krav til artiklen')
  line('Nyhedsartikel: fængende rubrik med sæson og runde, fed indledning med det vigtigste først, korte mellemrubrikker uden numre, faktaboks, spørgsmål og svar til sidst. Menneskeligt sportssprog, ingen gentagelser, kun tallene herover, tal til og med tolv med bogstaver, tabeller med højst 5 kolonner, links til klub- og kampsider, næste kamp med tid og TV. Beregninger mærkes som beregning.')
  line('Søg gerne efter seneste nyt om klubberne (skader, karantæner, trænerskifter, transfers, udtalelser), hvis det er relevant for artiklen – kun nyheder fra troværdige medier, der kan bekræftes, og aldrig i stedet for tallene herover.')
  return { text: out.join('\n') }
}
