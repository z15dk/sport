'use client'

import { addRealExtras } from '../data/real'
import type { ExternalGame } from '../data/external'

/**
 * Adds the games this page shows beyond the few days the browser gets (see
 * src/lib/clientData.ts). Rendered before the page's own components, so they
 * find the games when they render in the browser.
 */
export function RealDataExtra({ games, leagueTeamIndex }: { games?: ExternalGame[]; leagueTeamIndex?: Record<string, string> }) {
  addRealExtras({ games, leagueTeamIndex })
  return null
}
