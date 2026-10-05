import type { Match } from '../types'
import type { ClubStats, PastMatch } from './matchInsights'
import type { MatchDeep, SeasonPlayer } from './matchDeep'
import type { Periods } from './teamStats'
import { counted } from '../lib/words'
import { alike } from './aliases'

// "Kort fortalt": the few things a reader (and an answer engine) should know before the match, each a short
// sentence that stands on its own and carries its own numbers. Only facts the data really shows; a fact
// without data is left out. Pure, so the server and the browser write the same.

const pct = (part: number, whole: number) => Math.round((part / whole) * 100)

/** The share of a team's goals scored (or let in) in the last quarter of an hour */
function lateShare(periods: Periods | undefined): { late: number; total: number } | undefined {
  if (!periods?.length) return undefined
  const total = periods.reduce((t, p) => t + p.value, 0)
  const late = periods.filter((p) => p.period === '76-90' || p.period === '91-105').reduce((t, p) => t + p.value, 0)
  return total >= 6 ? { late, total } : undefined
}

/** "4 sejre og 1 uafgjort", "1 sejr, 2 uafgjorte og 2 nederlag" */
function record(wins: number, draws: number, losses?: number): string {
  // A part that is 0 is left out ("4 sejre i 4 hjemmekampe"), though never all of them
  const all = [
    [wins, counted(wins, 'sejr', 'sejre')],
    [draws, counted(draws, 'uafgjort', 'uafgjorte')],
    ...(losses !== undefined ? [[losses, counted(losses, 'nederlag', 'nederlag')] as const] : []),
  ] as const
  const parts = all.filter(([n]) => n > 0).map(([, t]) => t)
  if (!parts.length) parts.push(all[0][1])
  if (parts.length === 1) return parts[0]
  return parts.length === 2 ? parts.join(' og ') : `${parts.slice(0, -1).join(', ')} og ${parts[parts.length - 1]}`
}

const best = (players: SeasonPlayer[] | undefined, by: (p: SeasonPlayer) => number) =>
  [...(players ?? [])].sort((a, b) => by(b) - by(a) || b.minutes - a.minutes)[0]

export function matchBrief(input: {
  match: Match
  homeStats?: ClubStats
  awayStats?: ClubStats
  h2h: PastMatch[]
  deep?: MatchDeep
  channels: string[]
  absent?: { home: number; away: number }
}): string[] {
  const { match, homeStats: hs, awayStats: as, h2h, deep } = input
  const home = match.home.name
  const away = match.away.name
  const out: string[] = []

  // The table
  if (hs && as && hs.division.id === as.division.id) {
    const gap = Math.abs(hs.row.points - as.row.points)
    const ahead = hs.row.points >= as.row.points ? hs : as
    out.push(
      gap === 0
        ? `${home} (nr. ${hs.position}) og ${away} (nr. ${as.position}) har begge ${counted(hs.row.points, 'point', 'point')} i ${match.league}.`
        : `${ahead.row.club.name} ligger nr. ${ahead.position} og er ${counted(gap, 'point', 'point')} foran ${ahead === hs ? away : home} (nr. ${ahead === hs ? as.position : hs.position}).`,
    )
  }

  // At home and away this season
  const th = deep?.teamStats?.home
  const ta = deep?.teamStats?.away
  if (th && th.played.home >= 2) {
    out.push(
      th.loses.home === 0
        ? `${home} er ubesejret hjemme: ${record(th.wins.home, th.draws.home)} i ${counted(th.played.home, 'hjemmekamp', 'hjemmekampe')} (${th.goalsFor.home}-${th.goalsAgainst.home} i mål).`
        : `${home} har ${record(th.wins.home, th.draws.home, th.loses.home)} hjemme (${th.goalsFor.home}-${th.goalsAgainst.home} i mål).`,
    )
  }
  if (ta && ta.played.away >= 2) {
    out.push(
      ta.wins.away === 0
        ? `${away} har ikke vundet ude i sæsonen: ${record(0, ta.draws.away, ta.loses.away).replace(/^0 sejre, /, '')} i ${counted(ta.played.away, 'udekamp', 'udekampe')}.`
        : `${away} har ${record(ta.wins.away, ta.draws.away, ta.loses.away)} på udebane (${ta.goalsFor.away}-${ta.goalsAgainst.away} i mål).`,
    )
  }

  // Late goals: the most telling quarter of an hour
  const lateHome = lateShare(th?.goalsFor.periods)
  const lateAwayAgainst = lateShare(ta?.goalsAgainst.periods)
  if (lateHome && lateHome.late / lateHome.total >= 0.35) {
    out.push(`${home} har scoret ${lateHome.late} af sine ${lateHome.total} mål efter det 75. minut (${pct(lateHome.late, lateHome.total)} %).`)
  } else if (lateAwayAgainst && lateAwayAgainst.late / lateAwayAgainst.total >= 0.35) {
    out.push(`${away} har lukket ${lateAwayAgainst.late} af sine ${lateAwayAgainst.total} mål imod ind efter det 75. minut.`)
  }

  // The top scorers
  const sh = best(deep?.players?.home, (p) => p.goals)
  const sa = best(deep?.players?.away, (p) => p.goals)
  if (sh?.goals && sa?.goals) {
    out.push(`Topscorere: ${sh.name} med ${counted(sh.goals, 'mål', 'mål')} for ${home} og ${sa.name} med ${counted(sa.goals, 'mål', 'mål')} for ${away}.`)
  }

  // The meetings (a meeting may carry the source's name for a club: "Odense" for OB)
  const isHome = (n: string) => n === home || (n !== away && alike([home], n))
  if (h2h.length >= 2) {
    let w = 0
    let d = 0
    let l = 0
    for (const m of h2h) {
      const hg = isHome(m.home) ? m.homeScore : m.awayScore
      const ag = isHome(m.home) ? m.awayScore : m.homeScore
      if (hg > ag) w++
      else if (hg < ag) l++
      else d++
    }
    const last = h2h[0]
    const named = (n: string) => (isHome(n) ? home : alike([away], n) ? away : n)
    out.push(
      `I de seneste ${h2h.length} indbyrdes opgør har ${home} vundet ${w}, ${away} ${l}, og ${d} er endt uafgjort. Sidst endte det ${named(last.home)} – ${named(last.away)} ${last.homeScore}-${last.awayScore}.`,
    )
  }

  // Who is out
  if (input.absent && input.absent.home + input.absent.away > 0) {
    out.push(`${counted(input.absent.home, 'spiller', 'spillere')} hos ${home} og ${counted(input.absent.away, 'spiller', 'spillere')} hos ${away} er meldt ude med skade eller karantæne.`)
  }

  // Matchly's calculation (marked as one)
  const c = deep?.chance
  if (c && match.state === 'upcoming') {
    const fav = c.home >= c.away ? { name: home, p: c.home } : { name: away, p: c.away }
    out.push(`Matchlys beregning ud fra sæsonens mål giver ${fav.name} ${fav.p} % chance for sejr (uafgjort: ${c.draw} %).`)
  }

  // Where to watch
  if (input.channels.length && match.state === 'upcoming') out.push(`Kampen vises på ${input.channels.join(' og ')}.`)
  return out
}
