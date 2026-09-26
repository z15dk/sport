import type { Match } from '../types'
import { hashString, seeded } from './fixtures'
import { teamByName } from './teams'
import { getRealData } from './real'

// Fictional pre-match odds from the clubs' strength, with a bookmaker margin.

export interface Odds {
  home: number
  draw?: number
  away: number
}

const MARGIN = 1.06

function strength(name: string) {
  const team = teamByName(name)
  const clubs = team?.season?.division.clubs
  if (!team?.season || !clubs) return 0.5
  return 1 - clubs.indexOf(team.season.club) / Math.max(1, clubs.length - 1)
}

const toOdds = (p: number) => Math.max(1.03, Math.round((1 / (p * MARGIN)) * 100) / 100)

/** Whether odds are shown at all (switched on in the admin pages; off by default) */
export const oddsEnabled = () => getRealData()?.settings?.odds === true

/** 1X2 odds for football and ice hockey (regular time), home/away for basketball */
export function oddsFor(match: Match): Odds | undefined {
  if (match.state !== 'upcoming' || !oddsEnabled()) return undefined
  const rand = seeded(hashString(`odds-${match.id}`))
  const diff = strength(match.home.name) - strength(match.away.name) + (rand() - 0.5) * 0.15
  if (match.sport === 'basketball' || match.sport === 'tennis') {
    const pHome = Math.min(0.9, Math.max(0.1, 0.56 + diff * 0.35))
    return { home: toOdds(pHome), away: toOdds(1 - pHome) }
  }
  const pDraw = match.sport === 'ice_hockey' ? 0.22 : 0.26 - Math.abs(diff) * 0.08
  const pHome = Math.min(0.85, Math.max(0.08, (1 - pDraw) * (0.56 + diff * 0.4)))
  const pAway = Math.max(0.05, 1 - pDraw - pHome)
  return { home: toOdds(pHome), draw: toOdds(pDraw), away: toOdds(pAway) }
}

export const formatOdds = (n: number) => n.toFixed(2).replace('.', ',')
