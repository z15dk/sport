import type { LeagueStats } from './stats'
import { formPoints, type LeagueDeep, type LeagueRow } from './leagueDeep'
import { counted } from '../lib/words'

// "Kort fortalt" on the league page: the season in a few short sentences that stand on their own, each with its
// own numbers – for readers and for answer engines. Only facts the data shows.

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export function leagueBrief(input: { name: string; rows: LeagueRow[]; stats?: LeagueStats; deep: LeagueDeep; topScorer?: { name: string; club: string; goals: number }; bottom?: boolean }): string[] {
  const { name, rows, stats, deep } = input
  const out: string[] = []
  const [first, second] = rows
  if (!first || !second) return out
  const played = deep.round.played

  out.push(
    first.points === second.points
      ? `${first.name} og ${second.name} deler førstepladsen med ${counted(first.points, 'point', 'point')} efter ${counted(played, 'runde', 'runder')}.`
      : `${first.name} fører ${name} med ${counted(first.points, 'point', 'point')} efter ${counted(played, 'runde', 'runder')}, ${counted(first.points - second.points, 'point', 'point')} foran ${second.name}.`,
  )
  if (input.topScorer?.goals) out.push(`Topscorer er ${input.topScorer.name} (${input.topScorer.club}) med ${counted(input.topScorer.goals, 'mål', 'mål')}.`)

  // In form: the most points in the last five
  if (played >= 5) {
    const hot = [...rows].sort((a, b) => formPoints(b.form) - formPoints(a.form) || b.points - a.points)[0]
    if (hot && hot !== first) out.push(`${hot.name} er ligaens hold i form med ${counted(formPoints(hot.form), 'point', 'point')} i de seneste fem kampe.`)
  }

  // The best attack and the best defence
  const attack = [...rows].sort((a, b) => b.goalsFor - a.goalsFor)[0]
  const defence = [...rows].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0]
  if (attack && defence && played >= 3) {
    out.push(
      attack === defence
        ? `${attack.name} har både scoret flest mål (${attack.goalsFor}) og lukket færrest ind (${attack.goalsAgainst}).`
        : `${attack.name} har scoret flest mål (${attack.goalsFor}), og ${defence.name} har lukket færrest ind (${defence.goalsAgainst}).`,
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
  if (input.bottom !== false) out.push(`Nederst ligger ${last.name} med ${counted(last.points, 'point', 'point')}.`)

  // The next round after a break
  const s = deep.status
  if (s.kind === 'next' && s.breakUntil) out.push(`${s.breakUntil.international ? 'Ligaen holder landsholdspause' : 'Ligaen holder pause'}, og ${s.breakUntil.round ? `${s.breakUntil.round}. runde` : 'næste runde'} spilles fra ${new Date(s.breakUntil.from).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', timeZone: 'Europe/Copenhagen' })}.`)
  return out
}
