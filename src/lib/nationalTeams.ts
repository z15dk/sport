import 'server-only'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getRealData } from '../data/real'
import { isWomenGame } from '../data/external'
import { danishCountry } from '../data/countries'
import { cacheDir } from './tsdb'
import { proxyImage } from './imageProxy'

// National teams with their flags, for the VS graphic maker: the men's national teams seen in the
// international games we fetch (Nations League, World Cup and Euro qualifiers, friendlies), by their
// Danish names ("Danmark", "Wales"). Kept in a file, so a team stays pickable when it has not played lately.

/** International competitions for national teams (not club friendlies, not youth or women) */
const INTERNATIONAL = /nations league|world cup|euro championship|^euro\b|friendlies$|qualification|copa america|africa cup|asian cup|gold cup/i
/** Youth teams ("Denmark U21") and women's teams ("Denmark W") */
const NOT_SENIOR = /\b(u\d{2}|w)$/i

const file = () => process.env.NATIONAL_TEAMS_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'national-teams.json')

let memo: { version?: string; teams: Record<string, string> } | undefined

/** Danish name -> flag (our own image address) for every national team we know */
export function nationalTeams(): Record<string, string> {
  const real = getRealData()
  if (memo && memo.version === real?.version) return memo.teams
  let saved: Record<string, string> = {}
  try {
    saved = JSON.parse(readFileSync(file(), 'utf8')) as Record<string, string>
  } catch {
    // none saved yet
  }
  // Names saved before the Danish list covered every country ("FYR Macedonia") go by their Danish names too
  const teams = Object.fromEntries(Object.entries(saved).map(([name, logo]) => [danishCountry(name), logo]))
  for (const g of real?.external ?? []) {
    if (g.sport !== 'soccer' || g.league.country !== 'World' || !INTERNATIONAL.test(g.league.name) || isWomenGame(g)) continue
    for (const t of [g.home, g.away]) if (t.logo && !NOT_SENIOR.test(t.name)) teams[danishCountry(t.name)] = t.logo
  }
  if (Object.keys(teams).length !== Object.keys(saved).length || Object.keys(teams).some((name) => !(name in saved))) {
    try {
      writeFileSync(`${file()}.tmp`, JSON.stringify(teams))
      renameSync(`${file()}.tmp`, file())
    } catch {
      // found again next time
    }
  }
  const out = Object.fromEntries(Object.entries(teams).map(([name, logo]) => [name, proxyImage(logo)]))
  memo = { version: real?.version, teams: out }
  return out
}
