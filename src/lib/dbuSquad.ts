import 'server-only'
import { statSync } from 'node:fs'
import path from 'node:path'
import { alike, normalize } from '../data/aliases'
import type { SquadPlayer } from './apisports'
import type { Lineup, Substitution } from '../data/matchExtra'
import type { Incident } from '../types'
import { isoDate } from './time'
import { cacheDir } from './tsdb'

// A club's squad from the team sheets DBU's match pages give (read into billeder.db with the fixtures): every player in a
// starting eleven or on a bench this season, with shirt number, matches from the start, matches on the bench and goals.
// For the divisions API-Sports has no line-ups for (3. division: only the coach). No positions, no photos and no player
// pages: DBU's sheets have names and numbers only.

const photosDb = () => process.env.PHOTOS_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'billeder.db')

type Row = { key: string; club: string; name: string; number: number | null; reserve: number; date: string }
type Goal = { club: string; name: string }
type MatchRow = {
  key: string
  date: string
  hid: string
  aid: string
  hn: string
  an: string
  details: number
  referee: string | null
  assistants: string | null
  pitch: string | null
  venue: string | null
  address: string | null
  hc: string | null
  ac: string | null
  htr: string | null
  atr: string | null
}
type EventRow = { key: string; clubId: string; club: string; minute: number | null; kind: string; name: string; name2: string | null }
type Lib = { DatabaseSync: new (f: string, o?: { readOnly?: boolean }) => { prepare(s: string): { all(...p: unknown[]): unknown[] }; close(): void } }

interface Data {
  mtime: number
  rows: Row[]
  goals: Goal[]
  matches: MatchRow[]
  events: EventRow[]
}
let memo: Data | undefined
function read(): Data {
  let mtime = 0
  try {
    mtime = statSync(photosDb()).mtimeMs
  } catch {
    return { mtime: 0, rows: [], goals: [], matches: [], events: [] }
  }
  if (memo?.mtime === mtime) return memo
  let rows: Row[] = []
  let goals: Goal[] = []
  let matches: MatchRow[] = []
  let events: EventRow[] = []
  try {
    const lib = process.getBuiltinModule?.('node:sqlite') as Lib | undefined
    if (lib) {
      const db = new lib.DatabaseSync(photosDb(), { readOnly: true })
      try {
        rows = db.prepare(`SELECT l.match_key key, c.name club, l.name name, l.number number, l.reserve reserve, m.date date FROM lineups l JOIN clubs c ON c.id = l.club_id JOIN matches m ON m.match_key = l.match_key WHERE l.name <> ''`).all() as Row[]
        goals = db.prepare(`SELECT c.name club, g.name name FROM goals g JOIN clubs c ON c.id = g.club_id WHERE g.name <> ''`).all() as Goal[]
        // The details (cards, substitutions, referee ...) only exist once the job has read the match pages again; not before
        try {
          matches = db
            .prepare(
              `SELECT m.match_key key, m.date date, m.home_id hid, m.away_id aid, h.name hn, a.name an, m.has_details details, m.referee referee, m.assistants assistants, m.pitch pitch,
                      m.venue venue, m.venue_address address, m.home_coach hc, m.away_coach ac, m.home_trainers htr, m.away_trainers atr
               FROM matches m JOIN clubs h ON h.id = m.home_id JOIN clubs a ON a.id = m.away_id`,
            )
            .all() as MatchRow[]
          events = db.prepare(`SELECT e.match_key key, e.club_id clubId, c.name club, e.minute minute, e.kind kind, e.name name, e.name2 name2 FROM match_events e JOIN clubs c ON c.id = e.club_id ORDER BY e.match_key, e.seq`).all() as EventRow[]
        } catch {
          // an older database without the details
        }
      } finally {
        db.close()
      }
    }
  } catch {
    // no photo database on this server
  }
  memo = { mtime, rows, goals, matches, events }
  return memo
}

const isClub = (names: string[], club: string) => names.some((n) => normalize(n) === normalize(club))
const looselyClub = (names: string[], club: string) => alike(names, club)
/** Whether the DBU club is ours: the club's own name first (DBU writes "Frem" for BK Frem), the looser match only when no name is the same */
function clubTest(names: string[], clubs: string[]) {
  const exact = clubs.some((c) => isClub(names, c))
  return (club: string) => (exact ? isClub(names, club) : looselyClub(names, club))
}

const MATCH_MINUTES = 90

/**
 * The players a club has had in a match squad this season, from DBU's team sheets, with the cards and the time played
 * where the match pages have been read for them (substitutions give the minutes): shirt number, matches from the start,
 * matches come on in, goals, cards and minutes. Nothing where DBU has no sheets for the club.
 */
export function dbuClubSquad(names: string[]): SquadPlayer[] {
  const { rows, goals, matches, events } = read()
  const own = clubTest(names, rows.map((r) => r.club))
  const detailed = new Map(matches.filter((m) => m.details).map((m) => [m.key, m]))
  const subsOf = new Map<string, EventRow[]>()
  const cardsOf = new Map<string, EventRow[]>()
  for (const e of events) {
    if (!own(e.club)) continue
    const into = e.kind === 'sub' ? subsOf : cardsOf
    into.set(e.key, [...(into.get(e.key) ?? []), e])
  }
  const players = new Map<string, SquadPlayer & { last: string }>()
  const get = (name: string) => players.get(name) ?? players.set(name, { name, starts: 0, subbedOn: 0, bench: 0, goals: 0, dbu: true, last: '' }).get(name)!
  const byMatch = new Map<string, Row[]>()
  for (const r of rows) if (own(r.club)) byMatch.set(r.key, [...(byMatch.get(r.key) ?? []), r])
  for (const [key, list] of byMatch) {
    const subs = subsOf.get(key) ?? []
    const known = detailed.has(key)
    for (const r of list) {
      const p = get(r.name)
      if (r.reserve) p.bench = (p.bench ?? 0) + 1
      else p.starts++
      // The newest match's shirt number
      if (r.date >= p.last) {
        p.last = r.date
        if (r.number) p.number = r.number
      }
      if (!known) continue
      const on = subs.find((x) => x.name === r.name)
      const off = subs.find((x) => x.name2 === r.name)
      const from = r.reserve ? (on ? (on.minute ?? 0) : undefined) : 0
      if (r.reserve && on) p.subbedOn++
      if (from !== undefined) p.minutes = (p.minutes ?? 0) + Math.max(0, Math.min(MATCH_MINUTES, off?.minute ?? MATCH_MINUTES) - from)
      else p.minutes ??= 0
    }
    if (known) for (const c of cardsOf.get(key) ?? []) {
      const p = players.get(c.name)
      if (!p) continue
      if (c.kind === 'yellow') p.yellow = (p.yellow ?? 0) + 1
      else p.red = (p.red ?? 0) + 1
    }
  }
  for (const g of goals) {
    if (!own(g.club)) continue
    const p = players.get(g.name)
    if (p) p.goals++
  }
  const today = isoDate(Date.now())
  return [...players.values()].filter((p) => p.last <= today).map(({ last: _last, ...p }) => p)
}

const plain = (n: string) => n.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
/** "T. Jeppesen" and "Tommy Jeppesen": the same last name and first letter */
function sameCoach(short: string, full: string) {
  const [a, b] = [plain(short).split(' '), plain(full).split(' ')]
  return a.length > 1 && b.length > 1 && a[a.length - 1] === b[b.length - 1] && a[0][0] === b[0][0]
}

/**
 * A club's head coach, from DBU's match pages (the newest match that has one): the "Cheftræner" they name, or, where
 * they name none, the "Træner" that is the coach API-Sports names ("T. Jeppesen" is Tommy Jeppesen); the only "Træner"
 * where there is just one. Nothing when it cannot be told.
 */
export function dbuClubCoach(names: string[], apiCoach?: string): string | undefined {
  const { matches } = read()
  const own = clubTest(names, matches.flatMap((m) => [m.hn, m.an]))
  const mine = matches
    .filter((m) => m.details && (own(m.hn) || own(m.an)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((m) => (own(m.hn) ? { head: m.hc, trainers: m.htr } : { head: m.ac, trainers: m.atr }))
  const head = mine.find((x) => x.head)?.head
  if (head) return head
  for (const x of mine) {
    const trainers = x.trainers ? (JSON.parse(x.trainers) as string[]) : []
    const hit = apiCoach ? trainers.find((t) => sameCoach(apiCoach, t)) : trainers.length === 1 ? trainers[0] : undefined
    if (hit) return hit
  }
  return undefined
}

/** The head coach DBU's newest match report names for a club, with the day of that match (the datavagt) */
export function dbuClubCoachLatest(names: string[]): { name: string; date: string } | undefined {
  const { matches } = read()
  const own = clubTest(names, matches.flatMap((m) => [m.hn, m.an]))
  const m = matches
    .filter((x) => x.details && (own(x.hn) ? x.hc : own(x.an) ? x.ac : undefined))
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  const name = m ? (own(m.hn) ? m.hc : m.ac) : undefined
  return m && name ? { name, date: m.date } : undefined
}

export interface DbuMatchDetails {
  referee?: string
  assistants: string[]
  pitch?: string
  /** Postcode and town of the ground */
  address?: string
  cards: Incident[]
  subs: Substitution[]
}

/** A match's referee, pitch, cards and substitutions from DBU's match page, by the day and the two clubs; undefined where the page has not been read */
export function dbuMatchDetails(homeNames: string[], awayNames: string[], kickoff: Date): DbuMatchDetails | undefined {
  const { matches, events } = read()
  const day = isoDate(kickoff)
  const home = clubTest(homeNames, matches.map((m) => m.hn))
  const away = clubTest(awayNames, matches.map((m) => m.an))
  const m = matches.find((x) => x.details && x.date === day && home(x.hn) && away(x.an))
  if (!m) return undefined
  const mine = events.filter((e) => e.key === m.key)
  const side = (e: EventRow) => (e.clubId === m.hid ? ('home' as const) : ('away' as const))
  return {
    referee: m.referee ?? undefined,
    assistants: m.assistants ? (JSON.parse(m.assistants) as string[]) : [],
    pitch: m.pitch ?? undefined,
    address: m.address ?? undefined,
    cards: mine.filter((e) => e.kind === 'yellow' || e.kind === 'red').map((e): Incident => ({ minute: e.minute ?? 0, side: side(e), kind: e.kind as 'yellow' | 'red', player: e.name })),
    subs: mine.filter((e) => e.kind === 'sub' && e.name2).map((e): Substitution => ({ minute: e.minute ?? 0, side: side(e), on: e.name, off: e.name2! })),
  }
}

/**
 * A match's team sheets from DBU's match page as line-ups (home first), by the day and the two clubs: the starting eleven
 * and the bench by shirt number, with the head coach where DBU names one. For the matches the site's own short-lived copy
 * (dbuLineups) no longer has; undefined where DBU has no sheets for it.
 */
export function dbuMatchLineups(home: { names: string[]; team: string }, away: { names: string[]; team: string }, kickoff: Date): Lineup[] | undefined {
  const { matches, rows } = read()
  const day = isoDate(kickoff)
  const isHome = clubTest(home.names, matches.map((m) => m.hn))
  const isAway = clubTest(away.names, matches.map((m) => m.an))
  const m = matches.find((x) => x.date === day && isHome(x.hn) && isAway(x.an))
  if (!m) return undefined
  const side = (club: string, team: string, coach: string | null): Lineup => {
    const list = rows.filter((r) => r.key === m.key && r.club === club).sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
    const player = (r: Row) => ({ name: r.name, number: r.number ?? undefined })
    return { team, coach: coach ?? undefined, startXI: list.filter((r) => !r.reserve).map(player), substitutes: list.filter((r) => r.reserve).map(player) }
  }
  const lineups = [side(m.hn, home.team, m.hc), side(m.an, away.team, m.ac)]
  return lineups.some((l) => l.startXI.length || l.substitutes.length) ? lineups : undefined
}
