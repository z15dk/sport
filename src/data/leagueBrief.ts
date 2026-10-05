import type { Division } from './club'
import type { StandingRow } from './season'
import type { LeagueStats } from './stats'
import type { LeagueDeep } from './leagueDeep'
import { counted } from '../lib/words'

// "Kort fortalt" on the league page: the season in a few short sentences that stand on their own, each with its
// own numbers – for readers and for answer engines. Only facts the data shows.

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const formPoints = (form: ('V' | 'U' | 'T')[]) => form.slice(-5).reduce((t, f) => t + (f === 'V' ? 3 : f === 'U' ? 1 : 0), 0)

export function leagueBrief(input: { division: Division; rows: StandingRow[]; stats?: LeagueStats; deep: LeagueDeep; topScorer?: { name: string; club: string; goals: number } }): string[] {
  const { division, rows, stats, deep } = input
  const out: string[] = []
  const [first, second] = rows
  if (!first || !second) return out
  const played = deep.round.played

  out.push(
    first.points === second.points
      ? `${first.club.name} og ${second.club.name} deler førstepladsen med ${counted(first.points, 'point', 'point')} efter ${counted(played, 'runde', 'runder')}.`
      : `${first.club.name} fører ${division.name} med ${counted(first.points, 'point', 'point')} efter ${counted(played, 'runde', 'runder')}, ${counted(first.points - second.points, 'point', 'point')} foran ${second.club.name}.`,
  )
  if (input.topScorer?.goals) out.push(`Topscorer er ${input.topScorer.name} (${input.topScorer.club}) med ${counted(input.topScorer.goals, 'mål', 'mål')}.`)

  // In form: the most points in the last five
  if (played >= 5) {
    const hot = [...rows].sort((a, b) => formPoints(b.form) - formPoints(a.form) || b.points - a.points)[0]
    if (hot && hot !== first) out.push(`${hot.club.name} er ligaens hold i form med ${counted(formPoints(hot.form), 'point', 'point')} i de seneste fem kampe.`)
  }

  // The best attack and the best defence
  const attack = [...rows].sort((a, b) => b.goalsFor - a.goalsFor)[0]
  const defence = [...rows].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0]
  if (attack && defence && played >= 3) {
    out.push(
      attack === defence
        ? `${attack.club.name} har både scoret flest mål (${attack.goalsFor}) og lukket færrest ind (${attack.goalsAgainst}).`
        : `${attack.club.name} har scoret flest mål (${attack.goalsFor}), og ${defence.club.name} har lukket færrest ind (${defence.goalsAgainst}).`,
    )
  }

  if (stats && stats.played >= 6) {
    out.push(`Der er scoret ${one(stats.goalsPerMatch)} mål pr. kamp i sæsonen, og hjemmeholdet har vundet ${stats.homeWinPct} % af kampene.`)
    if (stats.biggestWin) {
      const b = stats.biggestWin
      out.push(`Sæsonens største sejr: ${b.home.name} – ${b.away.name} ${b.score[0]}-${b.score[1]}.`)
    }
  }

  // At the bottom
  const last = rows.at(-1)!
  if (division.zones.bottom > 0) out.push(`Nederst ligger ${last.club.name} med ${counted(last.points, 'point', 'point')}.`)

  // The next round after a break
  const s = deep.status
  if (s.kind === 'next' && s.breakUntil) out.push(`${s.breakUntil.international ? 'Ligaen holder landsholdspause' : 'Ligaen holder pause'}, og ${s.breakUntil.round ? `${s.breakUntil.round}. runde` : 'næste runde'} spilles fra ${new Date(s.breakUntil.from).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', timeZone: 'Europe/Copenhagen' })}.`)
  return out
}
