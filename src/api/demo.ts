import type { Match, MatchState, SportId } from '../types'
import { toIsoDate } from '../dates'
import { DIVISIONS } from '../data/danishClubs'
import { hashString, pairClubs, playMatch, seeded } from '../data/fixtures'

// Fictional match data. Football uses the Danish divisions; other sports use
// a small set of well-known teams.

const OTHER: Record<Exclude<SportId, 'soccer'>, { league: string; country: string; teams: string[] }[]> = {
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

// Typical kickoff slots per division (local time)
const SLOTS: Record<string, string[]> = {
  superliga: ['14:00', '16:00', '16:00', '18:00', '19:00', '20:00'],
  '1div': ['13:00', '14:00', '15:00', '15:00', '17:00', '18:30'],
  '2div': ['13:00', '13:00', '14:00', '15:00', '15:00', '16:00'],
  '3div': ['12:00', '13:00', '13:00', '14:00', '14:00', '15:00'],
}

function stateAt(kickoff: Date, now: number, fullTimeMin: number) {
  const elapsed = (now - kickoff.getTime()) / 60000
  let state: MatchState = 'upcoming'
  let statusLabel: string | undefined
  let progress = 0
  if (elapsed > fullTimeMin) {
    state = 'finished'
    statusLabel = 'Slut'
    progress = 1
  } else if (elapsed >= 0) {
    state = 'live'
    const half = fullTimeMin <= 60 ? 30 : 45
    const pause = 15
    if (elapsed >= half && elapsed < half + pause) statusLabel = 'Pause'
    else {
      const minute = elapsed < half ? Math.floor(elapsed) + 1 : Math.floor(elapsed) - pause + 1
      statusLabel = `${Math.min(minute, half * 2)}'`
    }
    progress = Math.min(1, elapsed / fullTimeMin)
  }
  return { state, statusLabel, progress }
}

function danishFootball(date: string, now: number): Match[] {
  const isToday = date === toIsoDate(new Date(now))
  const matches: Match[] = []

  for (const [di, div] of DIVISIONS.entries()) {
    const rand = seeded(hashString(`${div.id}-${date}`))
    const pairs = pairClubs(div.clubs, rand)
    const slots = SLOTS[div.id]

    for (const [pi, [home, away]] of pairs.entries()) {
      let kickoff = new Date(`${date}T${slots[pi % slots.length]}:00`)
      // Keep one match per division live today so the page always has action
      if (isToday && pi === 0) kickoff = new Date(now - (12 + di * 23) * 60000)

      const [hg, ag] = playMatch(div, home, away, rand)
      const { state, statusLabel, progress } = stateAt(kickoff, now, 110)
      const hasScore = state !== 'upcoming'
      // A live score is the final score scaled down to how far the match has come
      const partial = (g: number) => (state === 'finished' ? g : Math.floor(g * progress))

      matches.push({
        id: `dk-${div.id}-${date}-${pi}`,
        league: div.name,
        leagueId: `dk-${div.id}`,
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
  const isToday = date === toIsoDate(new Date(now))
  const matches: Match[] = []

  for (const [li, lg] of OTHER[sport].entries()) {
    for (let i = 0; i + 1 < lg.teams.length; i += 2) {
      const hour = 12 + Math.floor(rand() * 10)
      const minute = [0, 15, 30, 45][Math.floor(rand() * 4)]
      let kickoff = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
      if (i === 0 && isToday) kickoff = new Date(now - (18 + li * 29) * 60000)

      const { state, statusLabel, progress } = stateAt(kickoff, now, 110)
      const hasScore = state !== 'upcoming'
      const scale = sport === 'basketball' ? 110 : sport === 'handball' ? 30 : 4
      const points = () => Math.floor((sport === 'basketball' ? 0.8 + rand() * 0.3 : rand()) * scale * progress)
      matches.push({
        id: `demo-${sport}-${li}-${i}`,
        league: lg.league,
        leagueId: `demo-${sport}-${li}`,
        country: lg.country,
        kickoff,
        state,
        statusLabel,
        home: { name: lg.teams[i], score: hasScore ? points() : undefined },
        away: { name: lg.teams[i + 1], score: hasScore ? points() : undefined },
      })
    }
  }
  return matches
}

export function demoMatches(date: string, sport: SportId): Match[] {
  const now = Date.now()
  return sport === 'soccer' ? danishFootball(date, now) : otherSport(date, sport, now)
}
