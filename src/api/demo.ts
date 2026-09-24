import type { Match, MatchState, SportId } from '../types'
import { toIsoDate } from '../dates'

// Offline demo data used when the API is unreachable or when ?demo is in the URL.

const FIXTURES: Record<SportId, { league: string; country: string; teams: string[] }[]> = {
  soccer: [
    { league: 'Superliga', country: 'Danmark', teams: ['FC København', 'Brøndby IF', 'FC Midtjylland', 'AGF', 'FC Nordsjælland', 'Randers FC'] },
    { league: 'Premier League', country: 'England', teams: ['Arsenal', 'Liverpool', 'Manchester City', 'Chelsea', 'Tottenham', 'Newcastle'] },
    { league: 'LaLiga', country: 'Spanien', teams: ['Real Madrid', 'Barcelona', 'Atlético Madrid', 'Sevilla'] },
    { league: 'Serie A', country: 'Italien', teams: ['Inter', 'Milan', 'Juventus', 'Napoli'] },
  ],
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
  tennis: [
    { league: 'ATP Tokyo', country: 'Japan', teams: ['H. Rune', 'C. Alcaraz', 'J. Sinner', 'T. Fritz'] },
  ],
}

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export function demoMatches(date: string, sport: SportId): Match[] {
  const rand = seeded(Number(date.replaceAll('-', '')) + sport.length * 17)
  const now = Date.now()
  const matches: Match[] = []

  for (const [li, lg] of FIXTURES[sport].entries()) {
    for (let i = 0; i + 1 < lg.teams.length; i += 2) {
      const hour = 12 + Math.floor(rand() * 10)
      const minute = [0, 15, 30, 45][Math.floor(rand() * 4)]
      let kickoff = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
      // Keep the first match of each league live today so the demo always has action
      if (i === 0 && date === toIsoDate(new Date())) kickoff = new Date(now - (18 + li * 29) * 60000)
      const elapsed = (now - kickoff.getTime()) / 60000

      let state: MatchState = 'upcoming'
      let statusLabel: string | undefined
      if (elapsed > 110) {
        state = 'finished'
        statusLabel = 'Slut'
      } else if (elapsed >= 0) {
        state = 'live'
        const minuteOfPlay = elapsed < 45 ? Math.floor(elapsed) + 1 : elapsed < 60 ? 45 : Math.floor(elapsed) - 14
        statusLabel = elapsed >= 45 && elapsed < 60 ? 'Pause' : `${Math.min(minuteOfPlay, 90)}'`
      }

      const hasScore = state !== 'upcoming'
      const progress = state === 'finished' ? 1 : Math.max(0, Math.min(1, elapsed / 105))
      const goals = () => Math.floor(rand() * 4 * progress)
      matches.push({
        id: `demo-${sport}-${li}-${i}`,
        league: lg.league,
        leagueId: `demo-${sport}-${li}`,
        country: lg.country,
        kickoff,
        state,
        statusLabel,
        home: { name: lg.teams[i], score: hasScore ? goals() : undefined },
        away: { name: lg.teams[i + 1], score: hasScore ? goals() : undefined },
      })
    }
  }
  return matches
}
