import type { ClubStats } from '../data/matchInsights'
import type { Match } from '../types'
import { formatLong, formatTime } from './time'

/** A plain-language summary of the match; also what search engines and AI answers quote. */
export function summary(match: Match, home?: ClubStats, away?: ClubStats) {
  const { home: h, away: a } = match
  const when = `${formatLong(match.kickoff)} kl. ${formatTime(match.kickoff)}`
  const where = match.venue ? ` i ${match.venue}` : ''
  const table =
    home && away ? ` ${h.name} ligger nr. ${home.position} og ${a.name} nr. ${away.position} i ${match.league}.` : ''
  if (match.state === 'finished') {
    const hs = h.score ?? 0
    const as = a.score ?? 0
    const result =
      hs === as
        ? `${h.name} og ${a.name} spillede ${hs}-${as}`
        : hs > as
          ? `${h.name} vandt ${hs}-${as} over ${a.name}`
          : `${a.name} vandt ${as}-${hs} på udebane mod ${h.name}`
    return `${result} i ${match.league} ${when}${where}.${table}`
  }
  if (match.state === 'live') {
    return `${h.name} og ${a.name} spiller lige nu i ${match.league}${where}. Stillingen er ${h.score ?? 0}-${a.score ?? 0} (${match.statusLabel}).${table}`
  }
  return `${h.name} møder ${a.name} i ${match.league} ${when}${where}.${table}`
}
