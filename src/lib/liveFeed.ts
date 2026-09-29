import 'server-only'
import type { RealData } from '../data/real'
import type { ExternalGame } from '../data/external'
import { hashString } from '../data/fixtures'

// Live scores for open pages without building the page again. The server
// numbers every change in the games (score, state, minute, goals and cards);
// a page asks "what changed since number X?" (/api/live) and gets only those
// games, which it puts into its own data. One answer per number is worked out
// once and given to every page that asks for it, so a thousand open pages cost
// about as much as one. When anything else changes (our leagues' fixtures, the
// admin's names, channels or settings) the answer says so, and the page then
// fetches itself anew (spread out in time, RealDataProvider).

interface Feed {
  /** This server process: a cursor from another (a restart) is unknown */
  epoch: string
  seq: number
  /** The data version last looked at */
  version?: string
  games: Map<string, { fp: string; seq: number; game: ExternalGame }>
  /** The last change of anything besides the games (the page must then fetch itself) */
  otherKey?: string
  otherSeq: number
  answers: Map<string, string>
}
const holder = globalThis as typeof globalThis & { __scorelineLive?: Feed }
const feed: Feed = (holder.__scorelineLive ??= { epoch: Date.now().toString(36), seq: 0, games: new Map(), otherSeq: 0, answers: new Map() })

/** What a page shows of a game: when it changes, open pages get the game */
const fingerprint = (g: ExternalGame) =>
  `${g.state}|${g.homeScore ?? ''}-${g.awayScore ?? ''}|${g.label ?? ''}|${g.kickoff}|${g.incidents?.length ?? 0}|${g.ht?.join('-') ?? ''}`

/** Everything besides the games' own state, as one short string */
function otherKey(real: RealData): string {
  const { leagues, clubNames, leagueNames, channels, settings } = real
  return hashString(JSON.stringify([leagues, clubNames, leagueNames, channels, settings])).toString(36)
}

/** Brings the numbering up to date with the data */
function sync(real: RealData | undefined) {
  if (!real || real.version === feed.version) return
  feed.version = real.version
  const next = feed.seq + 1
  let changed = false
  for (const g of real.external ?? []) {
    const fp = fingerprint(g)
    const had = feed.games.get(g.id)
    if (had?.fp === fp) {
      had.game = g
      continue
    }
    feed.games.set(g.id, { fp, seq: next, game: g })
    changed = true
  }
  // Games that left the data (days out of the window) are forgotten
  if (feed.games.size > (real.external?.length ?? 0) * 1.5 + 1000) {
    const ids = new Set((real.external ?? []).map((g) => g.id))
    for (const id of feed.games.keys()) if (!ids.has(id)) feed.games.delete(id)
  }
  const other = otherKey(real)
  if (other !== feed.otherKey) {
    // Not on the first look: the pages open now were built from this data
    if (feed.otherKey !== undefined) {
      feed.otherSeq = next
      changed = true
    }
    feed.otherKey = other
  }
  if (changed) {
    feed.seq = next
    feed.answers.clear()
  }
}

/** Where a page built from this data starts asking from */
export function liveCursor(real: RealData | undefined): string {
  sync(real)
  return `${feed.epoch}.${feed.seq}`
}

/** The answer to "what changed since `cursor`?", as JSON text (the same text for every page that asks) */
export function liveSince(real: RealData | undefined, cursor: string | null): string {
  sync(real)
  const now = `${feed.epoch}.${feed.seq}`
  const [epoch, n] = (cursor ?? '').split('.')
  const since = Number(n)
  // Unknown (another server process, or from the future): the page fetches itself
  if (epoch !== feed.epoch || !Number.isFinite(since) || since > feed.seq) return JSON.stringify({ cursor: now, version: real?.version ?? null, refresh: true, games: [] })
  if (since === feed.seq) return JSON.stringify({ cursor: now, version: real?.version ?? null, games: [] })
  const have = feed.answers.get(cursor!)
  if (have) return have
  const games: ExternalGame[] = []
  for (const e of feed.games.values()) if (e.seq > since) games.push(e.game)
  const answer = JSON.stringify({ cursor: now, version: real?.version ?? null, refresh: feed.otherSeq > since, games })
  if (feed.answers.size > 50) feed.answers.clear()
  feed.answers.set(cursor!, answer)
  return answer
}
