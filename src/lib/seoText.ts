import 'server-only'
import { DIVISIONS, danishTier, seasonOf, sportOf, type Club, type Division } from '../data/leagues'
import { clubSeasonStats, leagueStats } from '../data/stats'
import { allFixtures, standings } from '../data/season'
import { formatLong } from './time'
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

/** A top scorer from another source than the season's own statistics (1.–3. division: counted from the DBU match pages) */
export interface AboutExtra {
  topScorer?: { player: string; club?: string; goals: number }
}

/**
 * "Om <liga>": written so that search engines and answer engines get the facts in plain, self-contained sentences –
 * what the league is (level, the leagues above and below, the official name), who plays in it this season, how the
 * season works, the season in numbers, the history we have, and what the page offers. Every sentence needs its data.
 */
export function leagueAbout(division: Division, now: number, extra?: AboutExtra): string[] {
  const sport = sportOf(division)
  const goals = sport === 'basketball' ? 'point' : 'mål'
  const season = seasonOf(division)
  const rows = standings(division, now)
  const out: string[] = []
  const ladder = sport === 'soccer' ? danishTier(division) : undefined
  const official = division.originalName && division.originalName !== division.name ? division.originalName : undefined

  // What the league is, and who plays in it
  const intro: string[] = []
  if (ladder) {
    const below = ladder.below?.name ?? (ladder.tier === 4 ? 'Danmarksserien' : undefined)
    intro.push(
      `${division.name} er Danmarks ${ladder.words} fodboldrække${ladder.tier === 1 ? '' : ` – niveau ${ladder.tier} i dansk fodbold, lige under ${ladder.above?.name}${below ? ` og over ${below}` : ''}`}.`,
    )
    if (official) intro.push(`Rækken hedder officielt ${division.name} efter sin sponsor, men kaldes i daglig tale ${official}.`)
  } else if (official) {
    intro.push(`${division.name} er det officielle navn på ${official}.`)
  }
  const clubs = (rows.length ? rows.map((r) => r.club) : division.clubs).map((c) => (c.city && !c.name.includes(c.city) ? `${c.name} (${c.city})` : c.name)).sort((a, b) => a.localeCompare(b, 'da'))
  intro.push(`I sæsonen ${season} deltager ${clubs.length} hold: ${list(clubs)}.`)
  const fixtures = allFixtures().filter((f) => f.division?.id === division.id)
  const first = fixtures.reduce<Date | undefined>((d, f) => (!d || f.kickoff < d ? f.kickoff : d), undefined)
  const last = fixtures.reduce<Date | undefined>((d, f) => (!d || f.kickoff > d ? f.kickoff : d), undefined)
  if (first && last && last.getTime() - first.getTime() > 30 * 86_400_000)
    intro.push(`Sæsonen ${first.getTime() <= now ? 'begyndte' : 'begynder'} ${formatLong(first)} og ${last.getTime() <= now ? 'sluttede' : 'slutter efter planen'} ${formatLong(last)}.`)
  out.push(intro.join(' '))

  // How the season works
  const meetings = division.meetings ?? 2
  const TIMES: Record<number, string> = { 1: 'én gang', 2: 'to gange', 3: 'tre gange', 4: 'fire gange' }
  out.push(`Holdene møder hinanden ${TIMES[meetings] ?? `${meetings} gange`}${ladder && ladder.tier >= 3 ? ' i grundspillet' : ''}. ${division.movement}`)

  // The season in numbers
  const st = leagueStats(division)
  if (st?.played) {
    const nums = [`Der er spillet ${st.played} kampe i ${division.name} ${season} med ${st.goals.toLocaleString('da-DK')} ${goals} – ${num(st.goalsPerMatch, 2)} pr. kamp.`]
    nums.push(
      sport === 'soccer'
        ? `Hjemmeholdet har vundet ${pct(st.homeWinPct)} af kampene, ${pct(st.drawPct)} er endt uafgjort, og ${pct(st.over25Pct)} har haft mere end 2,5 mål.`
        : `Hjemmeholdet har vundet ${pct(st.homeWinPct)} af kampene.`,
    )
    const top = st.scorers[0] ? { player: st.scorers[0].player, club: st.scorers[0].club.name, goals: st.scorers[0].goals } : extra?.topScorer
    if (top) nums.push(`${top.player}${top.club ? ` (${top.club})` : ''} fører topscorerlisten i ${division.name} med ${top.goals} mål.`)
    const crowd = st.attendance[0]
    if (crowd) nums.push(`Flest tilskuere har ${crowd.club.name} med ${crowd.average.toLocaleString('da-DK')} i gennemsnit.`)
    if (rows[0]) nums.push(`${rows[0].club.name} fører rækken med ${rows[0].points} point efter ${rows[0].played} kampe.`)
    out.push(nums.join(' '))
  }

  // The history we have
  const past = pastSeasons(division.id)
  if (past.length) {
    const [latest] = past
    const lines = [`Sidste afsluttede sæson i vores data, ${latest.label}, vandt ${latest.table[0].name}${latest.hasDraws ? ` med ${latest.table[0].points} point` : ''}.`]
    const wins = new Map<string, string[]>()
    for (const s of past) wins.set(s.table[0].name, [...(wins.get(s.table[0].name) ?? []), s.label])
    const most = [...wins].sort((a, b) => b[1].length - a[1].length)[0]
    if (past.length >= 3 && most[1].length > 1) lines.push(`${most[0]} har vundet flest af de ${past.length} sæsoner, vi har (${most[1].length}).`)
    lines.push(`Se slutstilling, topscorere og alle kampe for ${past.length === 1 ? 'den sæson' : `hver af de ${past.length} sæsoner`} under "Tidligere sæsoner".`)
    out.push(lines.join(' '))
  }

  // What the page offers
  out.push(
    `På Matchly finder du stillingen i ${division.name} opdateret efter hver kamp, kampprogrammet med tidspunkt og TV-kanal, resultater runde for runde, topscorerlisten og en side for hver kamp og hver klub med live-stilling, statistik og indbyrdes opgør.`,
  )
  return out.filter(Boolean)
}
