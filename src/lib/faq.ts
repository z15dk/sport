import type { Match } from '../types'
import type { Club, Division } from '../data/leagues'
import type { StandingRow } from '../data/season'
import type { ClubStats, PastMatch } from '../data/matchInsights'
import type { TeamEntry } from '../data/teams'
import { formatLong, formatTime } from './time'

// Short questions and answers for each page type. They are written as the
// direct answers people (and AI search) look for.

export interface FaqItem {
  q: string
  a: string
}

/** Danish genitive: "AGF's", "Boston Celtics'", "FC Københavns" */
export function genitive(name: string) {
  if (/[sxz]$/i.test(name)) return `${name}'`
  if (/[A-ZÆØÅ]$/.test(name)) return `${name}'s`
  return `${name}s`
}

const when = (d: Date) => `${formatLong(d)} kl. ${formatTime(d)}`

export function matchFaq(match: Match, h2h: PastMatch[], home?: ClubStats, away?: ClubStats): FaqItem[] {
  const { home: h, away: a } = match
  const items: FaqItem[] = []

  if (match.state === 'finished') {
    const hs = h.score ?? 0
    const as = a.score ?? 0
    items.push({
      q: `Hvad endte ${h.name} – ${a.name}?`,
      a:
        hs === as
          ? `Kampen endte uafgjort ${hs}-${as}.`
          : `${hs > as ? h.name : a.name} vandt ${Math.max(hs, as)}-${Math.min(hs, as)}.`,
    })
  } else if (match.state === 'live') {
    items.push({
      q: `Hvad står det i ${h.name} – ${a.name}?`,
      a: `Stillingen er ${h.score ?? 0}-${a.score ?? 0} (${match.statusLabel}).`,
    })
  }
  items.push({
    q: `Hvornår spilles ${h.name} – ${a.name}?`,
    a: `Kampen ${match.state === 'upcoming' ? 'spilles' : 'blev sparket i gang'} ${when(match.kickoff)} i ${match.league}.`,
  })
  if (match.venue) items.push({ q: 'Hvor spilles kampen?', a: `Kampen spilles i ${match.venue} med ${h.name} på hjemmebane.` })

  if (h2h.length) {
    let hw = 0
    let aw = 0
    for (const m of h2h) {
      const hg = m.home === h.name ? m.homeScore : m.awayScore
      const ag = m.home === h.name ? m.awayScore : m.homeScore
      if (hg > ag) hw++
      else if (hg < ag) aw++
    }
    const draws = h2h.length - hw - aw
    const last = h2h[0]
    items.push({
      q: `Hvem har vundet flest af de seneste indbyrdes opgør?`,
      a:
        hw === aw
          ? `De seneste ${h2h.length} opgør står lige: ${hw} sejre til hver og ${draws} uafgjorte.`
          : `${hw > aw ? h.name : a.name} har vundet ${Math.max(hw, aw)} af de seneste ${h2h.length} opgør, ${hw > aw ? a.name : h.name} ${Math.min(hw, aw)}, og ${draws} er endt uafgjort.`,
    })
    items.push({
      q: `Hvordan endte det seneste opgør mellem ${h.name} og ${a.name}?`,
      a: `${last.home} – ${last.away} endte ${last.homeScore}-${last.awayScore} (${formatLong(last.date)}, ${last.competition}).`,
    })
  }
  if (home && away) {
    items.push({
      q: `Hvor ligger ${h.name} og ${a.name} i tabellen?`,
      a: `${h.name} ligger nr. ${home.position} med ${home.row.points} point, og ${a.name} ligger nr. ${away.position} med ${away.row.points} point.`,
    })
  }
  return items
}

export function clubFaq(
  club: Club,
  division: Division,
  stats: ClubStats,
  next?: Match,
  last?: Match,
): FaqItem[] {
  const r = stats.row
  const items: FaqItem[] = [
    {
      q: `Hvor ligger ${club.name} i ${division.name}?`,
      a: `${club.name} ligger nr. ${stats.position} med ${r.points} point efter ${r.played} kampe.`,
    },
    { q: `Hvilken række spiller ${club.name} i?`, a: `${club.name} spiller i ${division.name} og hører hjemme i ${club.city}.` },
  ]
  if (next) {
    const opponent = next.home.name === club.name ? next.away.name : next.home.name
    items.push({
      q: `Hvornår spiller ${club.name} næste gang?`,
      a: `${club.name} møder ${opponent} ${when(next.kickoff)} (${next.home.name === club.name ? 'hjemme' : 'ude'}).`,
    })
  }
  if (last) {
    const hs = last.home.score ?? 0
    const as = last.away.score ?? 0
    const own = last.home.name === club.name ? hs : as
    const other = last.home.name === club.name ? as : hs
    const opponent = last.home.name === club.name ? last.away.name : last.home.name
    items.push({
      q: `Hvad blev ${genitive(club.name)} seneste resultat?`,
      a: `${own > other ? 'Sejr' : own < other ? 'Nederlag' : 'Uafgjort'} ${own}-${other} mod ${opponent} ${formatLong(last.kickoff)}.`,
    })
  }
  items.push({
    q: `Hvordan er ${genitive(club.name)} form?`,
    a: `De seneste fem kampe: ${r.form
      .slice(-5)
      .map((f) => (f === 'V' ? 'sejr' : f === 'U' ? 'uafgjort' : 'nederlag'))
      .join(', ')}.`,
  })
  return items
}


export function leagueFaq(division: Division, rows: StandingRow[]): FaqItem[] {
  const [first] = rows
  const bottom = rows.at(-1)!
  return [
    { q: `Hvem fører ${division.name}?`, a: `${first.club.name} fører med ${first.points} point efter ${first.played} kampe.` },
    { q: `Hvem ligger sidst i ${division.name}?`, a: `${bottom.club.name} ligger sidst med ${bottom.points} point.` },
    {
      q: `Hvor mange hold er der i ${division.name}?`,
      a: `Der er ${division.clubs.length} hold, som møder hinanden to gange ${division.countryCode === 'DK' ? 'i grundspillet' : 'i løbet af sæsonen'}.`,
    },
    { q: `Hvor mange rykker op og ned i ${division.name}?`, a: division.movement },
  ]
}

export function teamFaq(team: TeamEntry, next?: Match, last?: Match): FaqItem[] {
  const items: FaqItem[] = [{ q: `Hvilken turnering spiller ${team.name} i?`, a: `${team.name} spiller i ${team.league}.` }]
  if (next) {
    const opponent = next.home.name === team.name ? next.away.name : next.home.name
    items.push({ q: `Hvornår spiller ${team.name} næste gang?`, a: `${team.name} møder ${opponent} ${when(next.kickoff)}.` })
  }
  if (last) {
    const own = last.home.name === team.name ? (last.home.score ?? 0) : (last.away.score ?? 0)
    const other = last.home.name === team.name ? (last.away.score ?? 0) : (last.home.score ?? 0)
    const opponent = last.home.name === team.name ? last.away.name : last.home.name
    items.push({
      q: `Hvad blev ${genitive(team.name)} seneste resultat?`,
      a: `${own > other ? 'Sejr' : own < other ? 'Nederlag' : 'Uafgjort'} ${own}-${other} mod ${opponent} ${formatLong(last.kickoff)}.`,
    })
  }
  return items
}
