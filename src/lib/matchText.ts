import type { ClubStats } from '../data/matchInsights'
import type { Match } from '../types'
import { alike } from '../data/aliases'
import type { TableRow } from '../data/matchExtra'
import { formatLong, formatTime } from './time'

/**
 * A plain-language summary of the match; also what search engines and AI
 * answers quote. `rows` is the table the match page shows (API-Sports' own
 * where they have it): the positions then come from it, so the summary, the
 * table and the report agree.
 */
export function summary(match: Match, home?: ClubStats, away?: ClubStats, rows?: TableRow[]) {
  const { home: h, away: a } = match
  const when = `${formatLong(match.kickoff)} kl. ${formatTime(match.kickoff)}`
  const where = match.venue ? ` i ${match.venue}` : ''
  const rank = (name: string, stats?: ClubStats) =>
    rows ? (rows.find((r) => r.name === name) ?? rows.find((r) => alike([r.name], name)))?.rank : stats?.position
  const [hp, ap] = [rank(h.name, home), rank(a.name, away)]
  const table = hp && ap ? ` ${h.name} ligger nr. ${hp} og ${a.name} nr. ${ap} i ${match.league}.` : ''
  if (match.state === 'finished') {
    const hs = h.score ?? 0
    const as = a.score ?? 0
    const result =
      hs === as
        ? `${h.name} og ${a.name} spillede ${hs}-${as}`
        : hs > as
          ? `${h.name} vandt ${hs}-${as} over ${a.name}`
          : `${a.name} vandt ${as}-${hs} på udebane mod ${h.name}`
    const extra = match.statusLabel === 'Slut e.f.' ? ' efter forlænget spil' : match.statusLabel === 'Slut e.str.' ? ' efter straffeslag' : ''
    return `${result}${extra} i ${match.league} ${when}${where}.${table}`
  }
  if (match.state === 'live') {
    return `${h.name} og ${a.name} spiller lige nu i ${match.league}${where}. Stillingen er ${h.score ?? 0}-${a.score ?? 0} (${match.statusLabel}).${table}`
  }
  return `${h.name} møder ${a.name} i ${match.league} ${when}${where}.${table}`
}
