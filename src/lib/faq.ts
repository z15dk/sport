import { genitive } from './words'
import type { Match } from '../types'
import { danishTier, seasonOf, type Club, type Division } from '../data/leagues'
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

export { genitive }

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
        hs === as && !match.statusLabel?.includes('e.')
          ? `Kampen endte uafgjort ${hs}-${as}.`
          : `${match.winner === 'away' ? a.name : h.name} vandt ${Math.max(hs, as)}-${Math.min(hs, as)}${
              match.statusLabel === 'Slut e.f.' ? ' efter forlænget spil' : match.statusLabel === 'Slut e.str.' ? ' efter straffeslag' : ''
            }.`,
    })
  } else if (match.state === 'live') {
    items.push({
      q: `Hvad står det i ${h.name} – ${a.name}?`,
      a: `Stillingen er ${h.score ?? 0}-${a.score ?? 0} (${match.statusLabel}).`,
    })
  }
  // In the past tense once the match is over
  const over = match.state === 'finished'
  items.push({
    q: over ? `Hvornår blev ${h.name} – ${a.name} spillet?` : `Hvornår spilles ${h.name} – ${a.name}?`,
    a: over
      ? `Kampen blev spillet ${when(match.kickoff)} i ${match.league}.`
      : `Kampen ${match.state === 'upcoming' ? 'spilles' : match.sport === 'soccer' ? 'blev sparket i gang' : 'startede'} ${when(match.kickoff)} i ${match.league}.`,
  })
  if (match.venue)
    items.push(
      over
        ? { q: 'Hvor blev kampen spillet?', a: `Kampen blev spillet i ${match.venue} med ${h.name} på hjemmebane.` }
        : { q: 'Hvor spilles kampen?', a: `Kampen spilles i ${match.venue} med ${h.name} på hjemmebane.` },
    )

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
          ? `De seneste ${h2h.length} opgør står lige: ${hw} sejre til hver${draws ? ` og ${draws} uafgjorte` : ''}.`
          : `${hw > aw ? h.name : a.name} har vundet ${Math.max(hw, aw)} af de seneste ${h2h.length} opgør og ${hw > aw ? a.name : h.name} ${Math.min(hw, aw)}${draws ? `, mens ${draws} er endt uafgjort` : ''}.`,
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

/** What the club page knows beyond the table (the pages with the new header): asked for as people search for it */
export interface ClubFaqExtra {
  /** The channel showing the next match */
  channel?: string
  /** The club's scorers this season, most goals first */
  scorers?: { name: string; goals: number; matches: number }[]
  /** The ground the club plays its home matches at */
  stadium?: string
  /** The club sells tickets through a link on the page */
  tickets?: boolean
}

export function clubFaq(
  club: Club,
  division: Division,
  stats: ClubStats,
  next?: Match,
  last?: Match,
  extra?: ClubFaqExtra,
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
    if (extra?.channel)
      items.push({
        q: `Hvilken kanal viser ${genitive(club.name)} næste kamp?`,
        a: `Kampen mod ${opponent} ${when(next.kickoff)} vises på ${extra.channel}.`,
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
  const top = extra?.scorers?.[0]
  if (top) {
    const level = extra!.scorers!.filter((s) => s.goals === top.goals)
    items.push({
      q: `Hvem er ${genitive(club.name)} topscorer?`,
      a:
        level.length === 1
          ? `${top.name} er topscorer for ${club.name} i ${division.name} ${seasonOf(division)} med ${top.goals} mål i ${top.matches} ${top.matches === 1 ? 'kamp' : 'kampe'}.`
          : level.length <= 3
            ? `${level.map((s) => s.name).join(', ').replace(/, ([^,]*)$/, ' og $1')} deler førstepladsen med ${top.goals} mål hver i ${division.name} ${seasonOf(division)}.`
            : `${level.length} spillere deler førstepladsen med ${top.goals} mål hver i ${division.name} ${seasonOf(division)}.`,
    })
  }
  if (extra && r.played > 0)
    items.push({
      q: `Hvor mange mål har ${club.name} scoret?`,
      a: `${club.name} har scoret ${r.goalsFor} mål og lukket ${r.goalsAgainst} ind i ${r.played} ${r.played === 1 ? 'kamp' : 'kampe'} i ${division.name} ${seasonOf(division)}.`,
    })
  if (extra?.stadium)
    items.push({
      q: `Hvor spiller ${club.name} hjemmekampe?`,
      a: `${club.name} spiller sine hjemmekampe på ${extra.stadium}${club.city && !extra.stadium.includes(',') && !extra.stadium.includes(club.city) ? ` i ${club.city}` : ''}.`,
    })
  if (extra?.tickets)
    items.push({
      q: `Hvor køber jeg billetter til ${club.name}?`,
      a: `Billetter til ${genitive(club.name)} hjemmekampe købes hos klubben. Du finder linket under Billetter her på siden.`,
    })
  items.push({
    q: `Hvordan er ${genitive(club.name)} form?`,
    a: `De seneste fem kampe: ${r.form
      .slice(-5)
      .map((f) => (f === 'V' ? 'sejr' : f === 'U' ? 'uafgjort' : 'nederlag'))
      .join(', ')}.`,
  })
  return items
}


const TIMES: Record<number, string> = { 2: 'to', 3: 'tre', 4: 'fire', 6: 'seks' }

export function leagueFaq(division: Division, rows: StandingRow[]): FaqItem[] {
  const [first] = rows
  const bottom = rows.at(-1)!
  const ladder = (division.sport ?? 'soccer') === 'soccer' ? danishTier(division) : undefined
  const official = division.originalName && division.originalName !== division.name ? division.originalName : undefined
  const extra: FaqItem[] = []
  if (ladder) {
    const below = ladder.below?.name ?? (ladder.tier === 4 ? 'Danmarksserien' : undefined)
    extra.push({
      q: `Hvilket niveau er ${division.name}?`,
      a: `${division.name} er Danmarks ${ladder.words} fodboldrække${ladder.tier === 1 ? '.' : ` – niveau ${ladder.tier} i dansk fodbold, lige under ${ladder.above?.name}${below ? ` og over ${below}` : ''}.`}`,
    })
  }
  if (official) extra.push({ q: `Hvad hedder ${official} officielt?`, a: `${official} hedder officielt ${division.name} efter rækkens sponsor. Navnet skifter, når sponsoren gør.` })
  extra.push({
    q: `Hvilke hold spiller i ${division.name} ${seasonOf(division)}?`,
    a: `${rows.length} hold: ${rows.map((r) => r.club.name).sort((a, b) => a.localeCompare(b, 'da')).join(', ')}.`,
  })
  return [
    ...extra,
    { q: `Hvem fører ${division.name}?`, a: `${first.club.name} fører med ${first.points} point efter ${first.played} kampe.` },
    { q: `Hvem ligger sidst i ${division.name}?`, a: `${bottom.club.name} ligger sidst med ${bottom.points} point.` },
    {
      q: `Hvor mange hold er der i ${division.name}?`,
      a: `Der er ${division.clubs.length} hold, som møder hinanden ${TIMES[division.meetings ?? 2] ?? division.meetings} gange ${division.countryCode === 'DK' || division.sport ? 'i grundspillet' : 'i løbet af sæsonen'}.`,
    },
    { q: `Hvor mange rykker op og ned i ${division.name}?`, a: division.movement },
  ]
}

export function teamFaq(team: TeamEntry, next?: Match, last?: Match, extra?: ClubFaqExtra): FaqItem[] {
  // API-Sports' teams go by more than one name ("Brøndby IF" / "Brondby W")
  const names = team.names ?? [team.name]
  const home = (m: Match) => names.includes(m.home.name)
  const items: FaqItem[] = [{ q: `Hvilken turnering spiller ${team.name} i?`, a: `${team.name} spiller i ${team.league}.` }]
  if (next) {
    const opponent = home(next) ? next.away.name : next.home.name
    items.push({ q: `Hvornår spiller ${team.name} næste gang?`, a: `${team.name} møder ${opponent} ${when(next.kickoff)}.` })
    if (extra?.channel)
      items.push({ q: `Hvilken kanal viser ${genitive(team.name)} næste kamp?`, a: `Kampen mod ${opponent} ${when(next.kickoff)} vises på ${extra.channel}.` })
  }
  if (last) {
    const own = home(last) ? (last.home.score ?? 0) : (last.away.score ?? 0)
    const other = home(last) ? (last.away.score ?? 0) : (last.home.score ?? 0)
    const opponent = home(last) ? last.away.name : last.home.name
    items.push({
      q: `Hvad blev ${genitive(team.name)} seneste resultat?`,
      a: `${own > other ? 'Sejr' : own < other ? 'Nederlag' : 'Uafgjort'} ${own}-${other} mod ${opponent} ${formatLong(last.kickoff)}.`,
    })
  }
  // What the page with the new design knows more of: the top scorer and the ground
  const top = extra?.scorers?.[0]
  if (top) {
    const level = extra!.scorers!.filter((s) => s.goals === top.goals)
    items.push({
      q: `Hvem er ${genitive(team.name)} topscorer?`,
      a:
        level.length === 1
          ? `${top.name} er topscorer for ${team.name} i ${team.league} med ${top.goals} mål i ${top.matches} ${top.matches === 1 ? 'kamp' : 'kampe'}.`
          : level.length <= 3
            ? `${level.map((s) => s.name).join(', ').replace(/, ([^,]*)$/, ' og $1')} deler førstepladsen med ${top.goals} mål hver i ${team.league}.`
            : `${level.length} spillere deler førstepladsen med ${top.goals} mål hver i ${team.league}.`,
    })
  }
  if (extra?.stadium) items.push({ q: `Hvor spiller ${team.name} hjemmekampe?`, a: `${team.name} spiller sine hjemmekampe på ${extra.stadium}.` })
  return items
}
