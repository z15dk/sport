import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { clubNames } from '../data/aliases'
import { shownDivisions } from '../data/leagues'
import { NEW_CLUB_PAGE_DIVISIONS } from '../data/nyKlubside'
import { apiLeagueIdOf, apiTeamCoach, apiTeamIdOf } from './apisports'
import { dbuClubCoach } from './dbuSquad'
import { knownCoach } from './rettelser'
import { samePerson } from './samePerson'
import { cacheDir } from './tsdb'

// The datavagt: every night the facts on the club pages are held up against each other, and what looks wrong
// is written to a list (data/datavagt.json) that Claude reads each morning (/api/admin/datavagt): it checks
// each point in two sources and fixes it through the corrections (src/lib/rettelser.ts), or leaves it for the
// owner. Danish clubs only (DBU's match reports). DATAVAGT=off stops the nightly run.

export interface Finding {
  id: string
  kind: 'coach-fix-done' | 'coach-acting-replaced' | 'coach-conflict' | 'coach-missing'
  slug: string
  club: string
  text: string
  /** What would fix it, for Claude to check first */
  suggestion?: { action: 'removeCoach' } | { action: 'setCoach'; name: string }
}

interface Report {
  at: number
  findings: Finding[]
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'datavagt.json')

export function readDatavagt(): Report {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Report
  } catch {
    return { at: 0, findings: [] }
  }
}

const DANISH = new Set(['superliga', '1div', '2div', '3div'])

export function runDatavagt(): Report {
  const findings: Finding[] = []
  for (const d of shownDivisions()) {
    if (!DANISH.has(d.id) || !NEW_CLUB_PAGE_DIVISIONS.has(d.id)) continue
    const apiLeague = apiLeagueIdOf(d.id)
    for (const c of d.clubs) {
      const apiTeam = apiLeague ? apiTeamIdOf(apiLeague, clubNames(c)) : undefined
      const api = apiLeague && apiTeam ? apiTeamCoach(apiLeague, apiTeam) : undefined
      const dbu = dbuClubCoach(clubNames(c), api)
      const fix = knownCoach(c.slug)
      const base = { slug: c.slug, club: c.name }
      if (fix && !fix.acting && dbu && samePerson(dbu, fix.name))
        findings.push({ ...base, id: `coach-fix-done:${c.slug}`, kind: 'coach-fix-done', text: `DBU's kamprapporter nævner nu selv ${dbu} som træner – vores rettelse kan fjernes.`, suggestion: { action: 'removeCoach' } })
      else if (fix?.acting && dbu && !samePerson(dbu, fix.name))
        findings.push({ ...base, id: `coach-acting-replaced:${c.slug}`, kind: 'coach-acting-replaced', text: `Vi viser ${fix.name} som konstitueret, men DBU's seneste kamprapport nævner ${dbu}. Er der en ny cheftræner?`, suggestion: { action: 'setCoach', name: dbu } })
      else if (!fix && dbu && api && !samePerson(dbu, api))
        findings.push({ ...base, id: `coach-conflict:${c.slug}`, kind: 'coach-conflict', text: `DBU nævner ${dbu}, API-Sports nævner ${api} som træner. Vi viser ${dbu}.` })
      else if (!fix && !dbu && !api)
        findings.push({ ...base, id: `coach-missing:${c.slug}`, kind: 'coach-missing', text: 'Ingen træner på klubsiden – hverken DBU eller API-Sports nævner én.' })
    }
  }
  const report = { at: Date.now(), findings }
  try {
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify(report, null, 2))
  } catch {
    // shown from memory until next time
  }
  return report
}

let started = false

/** Once a night (and an hour after start) */
export function startDatavagt() {
  if (started || process.env.DATAVAGT === 'off') return
  started = true
  const tick = () => {
    const last = readDatavagt().at
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
    if (Date.now() - last > 20 * 3600_000 && (hour >= 3 || !last)) {
      try {
        runDatavagt()
      } catch {
        // next hour
      }
    }
  }
  setTimeout(tick, 60 * 60_000).unref?.()
  setInterval(tick, 60 * 60_000).unref?.()
}
