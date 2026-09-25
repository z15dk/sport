import type { Match, MatchState, SportId } from '../types'
import { matchSlug } from '../lib/slug'
import { isoDate } from '../lib/time'

// Free public test key is "3". Set NEXT_PUBLIC_THESPORTSDB_KEY for a premium key.
// "3" was the old free key; the free key is now "123"
const configuredKey = process.env.NEXT_PUBLIC_THESPORTSDB_KEY || '123'
const API_KEY = configuredKey === '3' ? '123' : configuredKey
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`

interface ApiEvent {
  idEvent: string
  idLeague: string
  strLeague: string
  strLeagueBadge?: string | null
  strCountry?: string | null
  strHomeTeam: string
  strAwayTeam: string
  strHomeTeamBadge?: string | null
  strAwayTeamBadge?: string | null
  intHomeScore?: string | null
  intAwayScore?: string | null
  strTimestamp?: string | null
  dateEvent: string
  strTime?: string | null
  strStatus?: string | null
  strProgress?: string | null
  strPostponed?: string | null
  strVenue?: string | null
}

const FINISHED = new Set(['FT', 'AET', 'PEN', 'AP', 'Match Finished', 'Finished'])
const UPCOMING = new Set(['', 'NS', 'Not Started', 'TBD', 'Time to be defined'])
const POSTPONED = new Set(['PST', 'CANC', 'ABD', 'Postponed', 'Cancelled', 'Abandoned'])

function toState(e: ApiEvent): MatchState {
  const status = (e.strStatus ?? '').trim()
  if (e.strPostponed === 'yes' || POSTPONED.has(status)) return 'postponed'
  if (FINISHED.has(status)) return 'finished'
  if (UPCOMING.has(status)) return 'upcoming'
  return 'live'
}

function toScore(v?: string | null): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function toKickoff(e: ApiEvent): Date {
  if (e.strTimestamp) {
    // Timestamps are UTC but come without a zone suffix
    const ts = /[zZ]|[+-]\d\d:?\d\d$/.test(e.strTimestamp) ? e.strTimestamp : `${e.strTimestamp}Z`
    const d = new Date(ts)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date(`${e.dateEvent}T${e.strTime || '00:00:00'}Z`)
}

function toStatusLabel(e: ApiEvent, state: MatchState): string | undefined {
  if (state === 'finished') return 'Slut'
  if (state === 'postponed') return 'Udsat'
  if (state === 'live') {
    if (e.strStatus === 'HT') return 'Pause'
    if (e.strProgress) return `${e.strProgress}'`
    return e.strStatus || 'Live'
  }
  return undefined
}

function mapEvent(e: ApiEvent, sport: SportId): Match {
  const state = toState(e)
  const kickoff = toKickoff(e)
  return {
    id: e.idEvent,
    slug: matchSlug(e.strHomeTeam, e.strAwayTeam, isoDate(kickoff)),
    sport,
    league: e.strLeague,
    leagueId: e.idLeague,
    leagueBadge: e.strLeagueBadge ?? undefined,
    country: e.strCountry ?? undefined,
    kickoff,
    state,
    statusLabel: toStatusLabel(e, state),
    home: { name: e.strHomeTeam, badge: e.strHomeTeamBadge ? `${e.strHomeTeamBadge}/tiny` : undefined, score: toScore(e.intHomeScore) },
    away: { name: e.strAwayTeam, badge: e.strAwayTeamBadge ? `${e.strAwayTeamBadge}/tiny` : undefined, score: toScore(e.intAwayScore) },
    venue: e.strVenue ?? undefined,
  }
}

/** Fetch all events for a given date (YYYY-MM-DD) and sport name. */
export async function fetchEventsByDay(
  date: string,
  sport: SportId,
  apiName: string,
  signal?: AbortSignal,
): Promise<Match[]> {
  const url = `${BASE_URL}/eventsday.php?d=${encodeURIComponent(date)}&s=${encodeURIComponent(apiName)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`API svarede ${res.status}`)
  const data: { events: ApiEvent[] | null } = await res.json()
  return (data.events ?? []).map((e) => mapEvent(e, sport))
}
