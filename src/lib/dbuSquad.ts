import 'server-only'
import { statSync } from 'node:fs'
import path from 'node:path'
import { alike, normalize } from '../data/aliases'
import type { SquadPlayer } from './apisports'
import { isoDate } from './time'
import { cacheDir } from './tsdb'

// A club's squad from the team sheets DBU's match pages give (read into billeder.db with the fixtures): every player in a
// starting eleven or on a bench this season, with shirt number, matches from the start, matches on the bench and goals.
// For the divisions API-Sports has no line-ups for (3. division: only the coach). No positions, no photos and no player
// pages: DBU's sheets have names and numbers only.

const photosDb = () => process.env.PHOTOS_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'billeder.db')

type Row = { club: string; name: string; number: number | null; reserve: number; date: string }
type Goal = { club: string; name: string }
type Lib = { DatabaseSync: new (f: string, o?: { readOnly?: boolean }) => { prepare(s: string): { all(...p: unknown[]): unknown[] }; close(): void } }

let memo: { mtime: number; rows: Row[]; goals: Goal[] } | undefined
function read() {
  let mtime = 0
  try {
    mtime = statSync(photosDb()).mtimeMs
  } catch {
    return { rows: [], goals: [] }
  }
  if (memo?.mtime === mtime) return memo
  let rows: Row[] = []
  let goals: Goal[] = []
  try {
    const lib = process.getBuiltinModule?.('node:sqlite') as Lib | undefined
    if (lib) {
      const db = new lib.DatabaseSync(photosDb(), { readOnly: true })
      try {
        rows = db.prepare(`SELECT c.name club, l.name name, l.number number, l.reserve reserve, m.date date FROM lineups l JOIN clubs c ON c.id = l.club_id JOIN matches m ON m.match_key = l.match_key WHERE l.name <> ''`).all() as Row[]
        goals = db.prepare(`SELECT c.name club, g.name name FROM goals g JOIN clubs c ON c.id = g.club_id WHERE g.name <> ''`).all() as Goal[]
      } finally {
        db.close()
      }
    }
  } catch {
    // no photo database on this server
  }
  memo = { mtime, rows, goals }
  return memo
}

const isClub = (names: string[], club: string) => names.some((n) => normalize(n) === normalize(club))
const looselyClub = (names: string[], club: string) => alike(names, club)

/** The players a club has had in a match squad this season, from DBU's team sheets; nothing where DBU has none for the club */
export function dbuClubSquad(names: string[]): SquadPlayer[] {
  const { rows, goals } = read()
  // The club's own name first (DBU writes "Frem" for BK Frem), the looser match only when no name is the same
  const exact = rows.some((r) => isClub(names, r.club))
  const own = (club: string) => (exact ? isClub(names, club) : looselyClub(names, club))
  const players = new Map<string, SquadPlayer & { last: string }>()
  for (const r of rows) {
    if (!own(r.club)) continue
    const p = players.get(r.name) ?? players.set(r.name, { name: r.name, starts: 0, subbedOn: 0, bench: 0, goals: 0, dbu: true, last: '' }).get(r.name)!
    if (r.reserve) p.bench = (p.bench ?? 0) + 1
    else p.starts++
    // The newest match's shirt number
    if (r.date >= p.last) {
      p.last = r.date
      if (r.number) p.number = r.number
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
