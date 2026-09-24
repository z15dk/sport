import type { Match, MatchState, SportId } from '../types'
import { danishTime, isoDate } from '../lib/time'
import { matchSlug } from '../lib/slug'
import { DIVISIONS } from './danishClubs'
import { hashString, pairClubs, playMatch, seeded } from './fixtures'

// Fictional match data. Football uses the Danish divisions; other sports use
// a small set of well-known teams. Everything is deterministic for a given
// date and moment, so the server and the browser produce the same matches.

export const OTHER: Record<Exclude<SportId, 'soccer'>, { league: string; country: string; teams: string[] }[]> = {
  basketball: [
    { league: 'NBA', country: 'USA', teams: ['Boston Celtics', 'LA Lakers', 'Denver Nuggets', 'Golden State Warriors'] },
    { league: 'Basketligaen', country: 'Danmark', teams: ['Bakken Bears', 'Svendborg Rabbits', 'Horsens IC', 'Randers Cimbria'] },
  ],
  ice_hockey: [
    { league: 'Metal Ligaen', country: 'Danmark', teams: ['Herning Blue Fox', 'Aalborg Pirates', 'Rungsted Seier Capital', 'Frederikshavn White Hawks'] },
    { league: 'NHL', country: 'USA', teams: ['Edmonton Oilers', 'Florida Panthers', 'NY Rangers', 'Colorado Avalanche'] },
  ],
  handball: [
    { league: 'Herreligaen', country: 'Danmark', teams: ['Aalborg Håndbold', 'GOG', 'Bjerringbro-Silkeborg', 'Skjern Håndbold'] },
    { league: 'Champions League', country: 'Europa', teams: ['Barça', 'Veszprém', 'Kiel', 'Magdeburg'] },
  ],
  tennis: [{ league: 'ATP Tokyo', country: 'Japan', teams: ['H. Rune', 'C. Alcaraz', 'J. Sinner', 'T. Fritz'] }],
}

// Typical kickoff slots per division (Danish time)
const SLOTS: Record<string, string[]> = {
  superliga: ['14:00', '16:00', '16:00', '18:00', '19:00', '20:00'],
  '1div': ['13:00', '14:00', '15:00', '15:00', '17:00', '18:30'],
  '2div': ['13:00', '13:00', '14:00', '15:00', '15:00', '16:00'],
  '3div': ['12:00', '13:00', '13:00', '14:00', '14:00', '15:00'],
}

// Minutes after kickoff at which a match is over (incl. half time)
const FULL_TIME = 110

function stateAt(kickoff: Date, now: number) {
  const elapsed = (now - kickoff.getTime()) / 60000
  let state: MatchState = 'upcoming'
  let statusLabel: string | undefined
  let progress = 0
  if (elapsed > FULL_TIME) {
    state = 'finished'
    statusLabel = 'Slut'
    progress = 1
  } else if (elapsed >= 0) {
    state = 'live'
    if (elapsed >= 45 && elapsed < 60) statusLabel = 'Pause'
    else statusLabel = `${Math.min(elapsed < 45 ? Math.floor(elapsed) + 1 : Math.floor(elapsed) - 14, 90)}'`
    progress = Math.min(1, elapsed / FULL_TIME)
  }
  return { state, statusLabel, progress }
}

/**
 * Kickoff for the match kept live today. It is anchored to the start of the
 * current hour, so it stays put while the page ticks and the match is always
 * between `offsetMin` and `offsetMin + 60` minutes in.
 */
function liveKickoff(now: number, offsetMin: number) {
  return new Date(Math.floor(now / 3_600_000) * 3_600_000 - offsetMin * 60000)
}

function danishFootball(date: string, now: number): Match[] {
  const isToday = date === isoDate(now)
  const matches: Match[] = []

  for (const [di, div] of DIVISIONS.entries()) {
    const rand = seeded(hashString(`${div.id}-${date}`))
    const pairs = pairClubs(div.clubs, rand)
    const slots = SLOTS[div.id]

    for (const [pi, [home, away]] of pairs.entries()) {
      let kickoff = danishTime(date, slots[pi % slots.length])
      // Keep one match per division live today so the page always has action
      if (isToday && pi === 0) kickoff = liveKickoff(now, 12 + di * 23)

      const [hg, ag] = playMatch(div, home, away, rand)
      const { state, statusLabel, progress } = stateAt(kickoff, now)
      const hasScore = state !== 'upcoming'
      // A live score is the final score scaled down to how far the match has come
      const partial = (g: number) => (state === 'finished' ? g : Math.floor(g * progress))

      matches.push({
        id: `dk-${div.id}-${date}-${pi}`,
        slug: matchSlug(home.name, away.name, date),
        sport: 'soccer',
        league: div.name,
        leagueId: `dk-${div.id}`,
        leagueSlug: div.slug,
        leagueOrder: di,
        country: 'Danmark',
        kickoff,
        state,
        statusLabel,
        venue: home.city,
        home: { name: home.name, colors: home.colors, score: hasScore ? partial(hg) : undefined },
        away: { name: away.name, colors: away.colors, score: hasScore ? partial(ag) : undefined },
      })
    }
  }
  return matches
}

function otherSport(date: string, sport: Exclude<SportId, 'soccer'>, now: number): Match[] {
  const rand = seeded(hashString(`${sport}-${date}`))
  const isToday = date === isoDate(now)
  const matches: Match[] = []

  for (const [li, lg] of OTHER[sport].entries()) {
    for (let i = 0; i + 1 < lg.teams.length; i += 2) {
      const hour = 12 + Math.floor(rand() * 10)
      const minute = [0, 15, 30, 45][Math.floor(rand() * 4)]
      let kickoff = danishTime(date, `${hour}:${minute}`)
      if (i === 0 && isToday) kickoff = liveKickoff(now, 18 + li * 29)

      const { state, statusLabel, progress } = stateAt(kickoff, now)
      const hasScore = state !== 'upcoming'
      const scale = sport === 'basketball' ? 110 : sport === 'handball' ? 30 : 4
      const finalScore = () => Math.floor((sport === 'basketball' ? 0.8 + rand() * 0.3 : rand()) * scale)
      const [hs, as] = [finalScore(), finalScore()]
      matches.push({
        id: `demo-${sport}-${date}-${li}-${i}`,
        slug: matchSlug(lg.teams[i], lg.teams[i + 1], date),
        sport,
        league: lg.league,
        leagueId: `demo-${sport}-${li}`,
        country: lg.country,
        kickoff,
        state,
        statusLabel,
        home: { name: lg.teams[i], score: hasScore ? Math.floor(hs * progress) : undefined },
        away: { name: lg.teams[i + 1], score: hasScore ? Math.floor(as * progress) : undefined },
      })
    }
  }
  return matches
}

export function getMatches(date: string, sport: SportId, now: number): Match[] {
  return sport === 'soccer' ? danishFootball(date, now) : otherSport(date, sport, now)
}

const ALL_SPORTS: SportId[] = ['soccer', 'basketball', 'ice_hockey', 'handball', 'tennis']

export function findMatch(slug: string, date: string, now: number): Match | undefined {
  for (const sport of ALL_SPORTS) {
    const m = getMatches(date, sport, now).find((x) => x.slug === slug)
    if (m) return m
  }
  return undefined
}

/** Fictional matches for one club over a range of days around `date` */
export function clubMatches(clubName: string, fromDate: string, days: number, now: number): Match[] {
  const out: Match[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(`${fromDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const date = d.toISOString().slice(0, 10)
    const m = danishFootball(date, now).find((x) => x.home.name === clubName || x.away.name === clubName)
    if (m) out.push(m)
  }
  return out
}

/** Fictional matches for any team (any sport) over a range of days from `fromDate` */
export function teamMatches(teamName: string, sport: SportId, fromDate: string, days: number, now: number): Match[] {
  const out: Match[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(`${fromDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const date = d.toISOString().slice(0, 10)
    for (const m of getMatches(date, sport, now)) {
      if (m.home.name === teamName || m.away.name === teamName) out.push(m)
    }
  }
  return out
}
