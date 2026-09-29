import 'server-only'
import { DIVISIONS, seasonOf, sportOf, type Club, type Division } from '../data/leagues'
import { clubSeasonStats, leagueStats } from '../data/stats'
import { standings } from '../data/season'
import { pastSeasons } from './history'

// Text for the club and league pages ("Om FC København", "Om Superligaen"),
// written from the season's matches and the earlier seasons we have. Every
// sentence needs its own numbers and is left out without them.

const num = (n: number, digits = 1) => n.toLocaleString('da-DK', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const pct = (n: number) => `${Math.round(n)} %`
const list = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} og ${items.at(-1)}`)
const STREAK = { V: 'sejre', U: 'uafgjorte', T: 'nederlag' } as const

/** A club's place in each earlier season we have a page for (any of our leagues in its sport), newest first */
export function clubSeasons(club: Club, sport = 'soccer') {
  return DIVISIONS.filter((d) => sportOf(d) === sport)
    .flatMap((d) =>
      pastSeasons(d.id).flatMap((s) => {
        const row = s.table.find((r) => r.slug === club.slug)
        return row ? [{ division: d, season: s, row }] : []
      }),
    )
    .sort((a, b) => b.season.season.localeCompare(a.season.season))
}

export function clubAbout(club: Club, division: Division, now: number): string[] {
  const sport = sportOf(division)
  const goals = sport === 'basketball' ? 'point' : 'mål'
  const table = standings(division, now)
  const position = table.findIndex((r) => r.club.id === club.id) + 1
  const s = clubSeasonStats(club, division)
  const out: string[] = []

  const first = [`${club.name}${club.city ? ` fra ${club.city}` : ''} spiller i ${division.name} ${seasonOf(division)}.`]
  if (s && position) {
    const h = s.home
    const a = s.away
    // "1 sejr", "2 sejre"; "1 uafgjort", "2 uafgjorte"
    const wins = (n: number) => `${n} ${n === 1 ? 'sejr' : 'sejre'}`
    const draws = (r: typeof h) => (sport === 'soccer' ? `, ${r.drawn} ${r.drawn === 1 ? 'uafgjort' : 'uafgjorte'}` : '')
    first.push(`Hjemme har holdet ${wins(h.won)}${draws(h)} og ${h.lost} nederlag, ude ${wins(a.won)}${draws(a)} og ${a.lost} nederlag.`)
    first.push(`Det giver ${num(s.goalsForPerMatch)} ${goals} scoret og ${num(s.goalsAgainstPerMatch)} lukket ind pr. kamp.`)
    if (sport === 'soccer' && s.cleanSheets) first.push(`${club.name} har holdt buret rent i ${s.cleanSheets} af ${s.played} kampe.`)
    if (s.streak && s.streak.length >= 3) first.push(`Lige nu har holdet ${s.streak.length} ${STREAK[s.streak.kind]} i træk.`)
    if (s.scorers[0]) first.push(`${s.scorers[0].player} er klubbens topscorer med ${s.scorers[0].goals} mål.`)
    if (s.biggestWin) first.push(`Største sejr i sæsonen er ${s.biggestWin.gf}-${s.biggestWin.ga} over ${s.biggestWin.opponent}.`)
    if (s.homeAttendance) first.push(`I gennemsnit kommer ${s.homeAttendance.toLocaleString('da-DK')} tilskuere til hjemmekampene.`)
  }
  out.push(first.join(' '))

  const past = clubSeasons(club, sport)
  if (past.length) {
    const last = past[0]
    const lines = [
      `I ${last.season.label} sluttede ${club.name} som nr. ${last.row.rank} i ${last.division.name}${last.season.hasDraws ? ` med ${last.row.points} point` : ''}.`,
    ]
    const titles = past.filter((p) => p.row.rank === 1 && p.division.id === division.id).map((p) => p.season.label)
    if (titles.length) lines.push(`Klubben vandt ${division.name} i ${list(titles.reverse())}.`)
    const best = [...past].filter((p) => p.division.id === division.id).sort((x, y) => x.row.rank - y.row.rank)[0]
    if (best && !titles.length && best !== last) lines.push(`Bedste placering i de sæsoner, vi har, er nr. ${best.row.rank} i ${best.season.label}.`)
    const leagues = [...new Set(past.map((p) => p.division.name))]
    if (leagues.length > 1) lines.push(`I perioden har holdet spillet i ${list(leagues)}.`)
    out.push(lines.join(' '))
  }
  return out.filter(Boolean)
}

export function leagueAbout(division: Division, now: number): string[] {
  const sport = sportOf(division)
  const goals = sport === 'basketball' ? 'point' : 'mål'
  const rows = standings(division, now)
  const out: string[] = []
  const st = leagueStats(division)
  const first = [`${division.name} ${seasonOf(division)} har ${rows.length} hold.`]
  if (st?.played) {
    first.push(`Der er spillet ${st.played} kampe med ${st.goals.toLocaleString('da-DK')} ${goals} – ${num(st.goalsPerMatch, 2)} pr. kamp.`)
    first.push(
      sport === 'soccer'
        ? `Hjemmeholdet har vundet ${pct(st.homeWinPct)} af kampene, ${pct(st.drawPct)} er endt uafgjort, og ${pct(st.over25Pct)} har haft mere end 2,5 mål.`
        : `Hjemmeholdet har vundet ${pct(st.homeWinPct)} af kampene.`,
    )
    const top = st.scorers[0]
    if (top) first.push(`${top.player} (${top.club.name}) fører topscorerlisten med ${top.goals} mål.`)
    const crowd = st.attendance[0]
    if (crowd) first.push(`Flest tilskuere har ${crowd.club.name} med ${crowd.average.toLocaleString('da-DK')} i gennemsnit.`)
  }
  out.push(first.join(' '))

  const past = pastSeasons(division.id)
  if (past.length) {
    const [last] = past
    const lines = [`Sidste afsluttede sæson i vores data, ${last.label}, vandt ${last.table[0].name}${last.hasDraws ? ` med ${last.table[0].points} point` : ''}.`]
    const wins = new Map<string, string[]>()
    for (const s of past) wins.set(s.table[0].name, [...(wins.get(s.table[0].name) ?? []), s.label])
    const most = [...wins].sort((a, b) => b[1].length - a[1].length)[0]
    if (past.length >= 3 && most[1].length > 1) lines.push(`${most[0]} har vundet flest af de ${past.length} sæsoner, vi har (${most[1].length}).`)
    lines.push(`Se slutstilling, topscorere og alle kampe for ${past.length === 1 ? 'den sæson' : `hver af de ${past.length} sæsoner`} under "Tidligere sæsoner".`)
    out.push(lines.join(' '))
  }
  return out.filter(Boolean)
}
