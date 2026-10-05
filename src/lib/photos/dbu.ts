import { nowIso, transaction, type Db, type Row } from './db.ts'
import { squadsFromSheets, type LineupPlayer, type SheetMatch } from './names.ts'
import { clubKey, clubSlug } from './paths.ts'

// Clubs, kits, team sheets, results and goals from dbu.dk's public pages (per pool):
//   /resultater/pulje/<pool>/holdoversigt     clubs, ground, shirt/shorts/socks
//   /resultater/pulje/<pool>/kampprogramFuld  every match with date and teams
//   /resultater/kamp/<match>_<pool>/kampinfo  team sheets with shirt numbers
// Only played matches without a stored sheet are fetched, one page at a time
// with a pause. Staff contact details on the pages are never stored.

const BASE = 'https://www.dbu.dk'
const UA = 'Mozilla/5.0 (compatible; Matchly-billeder; +https://matchly.dk)'

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
const text = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

export interface DbuClub {
  name: string
  colors: string[]
  kit: { shirt: string; shorts: string; socks: string }
  team: string
}

export function parseTeams(html: string): DbuClub[] {
  const out: DbuClub[] = []
  for (const block of html.split('class="sr--pool--team-list--team"').slice(1)) {
    const name = /<h3>([\s\S]*?)<\/h3>/.exec(block)
    if (!name) continue
    const kit: Record<string, string> = {}
    for (const m of block.matchAll(/<label>([\s\S]*?)<\/label>\s*<span>([\s\S]*?)<\/span>/g)) kit[text(m[1])] = text(m[2]).toLowerCase()
    const shirt = kit['Trøje'] ?? ''
    out.push({
      name: text(name[1]),
      colors: shirt.split('/').map((c) => c.trim()).filter(Boolean),
      kit: { shirt, shorts: kit['Shorts'] ?? '', socks: kit['Strømper'] ?? '' },
      team: /\/resultater\/hold\/(\d+_\d+)\//.exec(block)?.[1] ?? '',
    })
  }
  return out
}

export interface DbuFixture {
  key: string
  date: string
  /** hh:mm (Danish time), when DBU has it */
  time?: string
  home: string
  away: string
  url: string
  venue?: string
  tv?: string
}

export function parseProgram(html: string): DbuFixture[] {
  const out: DbuFixture[] = []
  for (const row of html.split(/<tr [^>]*onclick="MatchProgramMatchClick\('/).slice(1)) {
    const url = row.slice(0, row.indexOf("'"))
    const key = /\/kamp\/(\d+_\d+)\//.exec(url)?.[1]
    const date = /matchprogram-date"><span>[^<]*<\/span>\s*(\d{2})-(\d{2}) (\d{4})/.exec(row)
    const teams = [...row.matchAll(/href="\/resultater\/hold\/[^"]+">([\s\S]*?)<\/a>/g)].map((m) => text(m[1]))
    const time = /matchprogram-date">[\s\S]*?<\/td>\s*<td[^>]*>\s*(\d{1,2}[:.]\d{2})\s*</.exec(row)?.[1]?.replace('.', ':')
    const venue = /href="\/resultater\/stadium\/\d+">([\s\S]*?)<\/a>/.exec(row)?.[1]
    const tv = /tv-logo-text">([\s\S]*?)<\/div>/.exec(row)?.[1]
    if (key && date && teams.length >= 2)
      out.push({ key, date: `${date[3]}-${date[2]}-${date[1]}`, time: time?.padStart(5, '0'), home: teams[0], away: teams[1], url, venue: venue ? text(venue) : undefined, tv: tv ? text(tv) || undefined : undefined })
  }
  return out
}

/** Both teams' sheets (starting eleven and substitutes) from a match page; undefined before the match */
export function parseSheet(html: string): { home: LineupPlayer[]; away: LineupPlayer[] } | undefined {
  const at = html.indexOf('Holdopstillinger')
  if (at < 0) return undefined
  const part = html.slice(at)
  const sheet = { home: [] as LineupPlayer[], away: [] as LineupPlayer[] }
  for (const t of part.matchAll(/<table class="[^"]*\b(home|away)-team\b[^"]*">([\s\S]*?)<\/table>/g)) {
    const side = t[1] as 'home' | 'away'
    const reserve = /Reserver/.test(t[2].split('</thead>')[0])
    for (const r of t[2].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...r[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)]
      const nr = cells.find((c) => c[1].includes('shirt-number'))
      const name = cells.find((c) => !c[1].includes('shirt-number') && text(c[2]))
      const number = nr ? Number(text(nr[2])) : NaN
      if (Number.isInteger(number) && name) sheet[side].push({ number, name: text(name[2]), reserve })
    }
  }
  return sheet.home.length || sheet.away.length ? sheet : undefined
}

export interface DbuGoal {
  side: 'home' | 'away'
  minute: number | null
  name: string
}

/** The final score and the goals from a match page (the live-score block); undefined before the match */
export function parseResult(html: string): { home: number; away: number; goals: DbuGoal[] } | undefined {
  const score = (side: string) => {
    const m = new RegExp(`live-score--result--${side}[\\s\\S]*?scoreboard--content">\\s*(\\d+)\\s*<`).exec(html)
    return m ? Number(m[1]) : undefined
  }
  const home = score('home')
  const away = score('away')
  if (home === undefined || away === undefined) return undefined
  const goals: DbuGoal[] = []
  for (const ev of html.split('class="sr--match--live-score--event"').slice(1)) {
    if (!ev.includes('icon_sr_goal.svg')) continue
    const side = /live-score--event--(home|away)"/.exec(ev)?.[1] as 'home' | 'away' | undefined
    const minute = /event--minute">\s*(?:&#x27;|')?\s*(\d+)/.exec(ev)
    const player = /event--player">([\s\S]*?)<\/div>/.exec(ev)
    if (side && player && text(player[1])) goals.push({ side, minute: minute ? Number(minute[1]) : null, name: text(player[1]) })
  }
  // The page lists the newest event first
  return { home, away, goals: goals.reverse() }
}

export interface DbuCard {
  side: 'home' | 'away'
  minute: number | null
  kind: 'yellow' | 'red'
  name: string
}
export interface DbuSub {
  side: 'home' | 'away'
  minute: number | null
  /** The player who came on, and the one who went off */
  on: string
  off: string
}

/**
 * The cards and substitutions of a match page's event list (the live-score block), oldest first. A second yellow card
 * counts as red. In a substitution DBU writes the player coming on first and the one going off second.
 */
export function parseEvents(html: string): { cards: DbuCard[]; subs: DbuSub[] } {
  const cards: DbuCard[] = []
  const subs: DbuSub[] = []
  for (const ev of html.split('class="sr--match--live-score--event"').slice(1)) {
    const side = /live-score--event--(home|away)"/.exec(ev)?.[1] as 'home' | 'away' | undefined
    const icon = /icon_sr_(yellow|red|yellowred|secondyellow|sub(?:Home|Away))\.svg/i.exec(ev)?.[1]?.toLowerCase()
    if (!side || !icon) continue
    const minute = /event--minute">\s*(?:&#x27;|')?\s*(\d+)/.exec(ev)
    const at = minute ? Number(minute[1]) : null
    if (icon.startsWith('sub')) {
      const on = /event--sub">\s*([^<]*?)\s*<div/.exec(ev)?.[1]
      const off = /event--player2">([\s\S]*?)<\/div>/.exec(ev)?.[1]
      if (on && off && text(on) && text(off)) subs.push({ side, minute: at, on: text(on), off: text(off) })
    } else {
      const player = /event--player">([\s\S]*?)<\/div>/.exec(ev)
      if (player && text(player[1])) cards.push({ side, minute: at, kind: icon === 'yellow' ? 'yellow' : 'red', name: text(player[1]) })
    }
  }
  // The page lists the newest event first
  return { cards: cards.reverse(), subs: subs.reverse() }
}

export interface DbuInfo {
  referee?: string
  assistants: string[]
  /** The pitch ("Kunst 1 Holdsport Arena-ASA") and the ground with its address */
  pitch?: string
  venue?: string
  address?: string
  /** The head coach of each team ("Cheftræner" in the officials), where the page names one */
  homeCoach?: string
  awayCoach?: string
  /** Every "Træner" of each team: where there is no head coach, the coach is one of them */
  homeTrainers: string[]
  awayTrainers: string[]
}

/** The facts of a match page: referee and assistants, pitch and ground, and each team's head coach */
export function parseInfo(html: string): DbuInfo {
  const info: DbuInfo = { assistants: [], homeTrainers: [], awayTrainers: [] }
  const span = (label: string) => {
    const b = new RegExp(`<label>${label}</label>\\s*<span>([\\s\\S]*?)</span>`).exec(html)?.[1]
    return b ? text(b) || undefined : undefined
  }
  const referee = span('Dommer')
  if (referee) info.referee = referee
  for (const n of ['1', '2']) {
    const a = span(`Liniedommer ${n}`)
    if (a) info.assistants.push(a)
  }
  const pitch = /<label>Bane<\/label>\s*<div>([\s\S]*?)<\/div>/.exec(html)?.[1]
  if (pitch && text(pitch)) info.pitch = text(pitch)
  const venue = /<label>Spillested<\/label>([\s\S]*?)<\/div>\s*<div class="col-pad">/.exec(html)?.[1]
  if (venue) {
    const lines = [...venue.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)].map((m) => text(m[1])).filter(Boolean)
    // The first line is the ground, the next the postcode and town; the phone number is left out
    info.venue = lines[0]
    info.address = lines.find((l, i) => i > 0 && /^\d{4}\s/.test(l))
  }
  const officials = html.indexOf('Officials')
  if (officials >= 0) {
    for (const t of html.slice(officials - 600).matchAll(/<table class="[^"]*\b(home|away)-team\b[^"]*">([\s\S]*?)<\/table>/g)) {
      if (!/Officials/.test(t[2].split('</thead>')[0])) continue
      const roles = [...t[2].matchAll(/p-role">([\s\S]*?)<\/span>\s*<span class="p-name">([\s\S]*?)<\/span>/g)].map((m) => ({ role: text(m[1]).toLowerCase(), name: text(m[2]) }))
      const coach = roles.find((r) => r.role === 'cheftræner')?.name
      if (coach) info[t[1] === 'home' ? 'homeCoach' : 'awayCoach'] = coach
      info[t[1] === 'home' ? 'homeTrainers' : 'awayTrainers'] = roles.filter((r) => r.role === 'træner').map((r) => r.name)
    }
  }
  return info
}

async function get(path: string): Promise<string> {
  const res = await fetch(BASE + path, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`DBU ${path}: ${res.status}`)
  return res.text()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface DbuSyncResult {
  clubs: number
  fixtures: number
  sheetsFetched: number
  squadRows: number
  errors: string[]
}

export async function syncDbu(db: Db, pools: string[], pauseMs: number, log: (s: string) => void = () => {}): Promise<DbuSyncResult> {
  const res: DbuSyncResult = { clubs: 0, fixtures: 0, sheetsFetched: 0, squadRows: 0, errors: [] }
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
  const idOf = new Map<string, string>()
  for (const pool of pools) {
    try {
      const teams = parseTeams(await get(`/resultater/pulje/${pool}/holdoversigt`))
      await sleep(pauseMs)
      for (const c of teams) {
        const id = upsertClub(db, c)
        idOf.set(clubKey(c.name), id)
        res.clubs++
      }
      const fixtures = parseProgram(await get(`/resultater/pulje/${pool}/kampprogramFuld`))
      await sleep(pauseMs)
      for (const f of fixtures) {
        const home = idOf.get(clubKey(f.home)) ?? clubSlug(f.home)
        const away = idOf.get(clubKey(f.away)) ?? clubSlug(f.away)
        db.prepare(
          `INSERT INTO matches (match_key, date, home_id, away_id, source, url, kickoff, venue, tv) VALUES (?, ?, ?, ?, 'dbu', ?, ?, ?, ?)
           ON CONFLICT(match_key) DO UPDATE SET date = excluded.date, home_id = excluded.home_id, away_id = excluded.away_id, url = excluded.url,
             kickoff = excluded.kickoff, venue = excluded.venue, tv = excluded.tv`,
        ).run(`dbu:${f.key}`, f.date, home, away, f.url, f.time ?? null, f.venue ?? null, f.tv ?? null)
        res.fixtures++
      }
      // Played matches without a sheet or result, not tried in the last 12 hours
      const due = db
        .prepare(`SELECT match_key, url, home_id, away_id, has_lineups FROM matches WHERE source = 'dbu' AND (has_lineups = 0 OR has_events = 0 OR has_details = 0) AND date <= ? AND match_key LIKE ? AND (fetched_at IS NULL OR fetched_at < ?) ORDER BY date`)
        .all(today, `dbu:%_${pool}`, new Date(Date.now() - 12 * 3600_000).toISOString())
      for (const m of due) {
        try {
          if (await fetchMatch(db, m)) res.sheetsFetched++
        } catch (e) {
          res.errors.push(`${String(m.url)}: ${(e as Error).message}`)
        }
        await sleep(pauseMs)
      }
      log(`DBU pulje ${pool}: ${teams.length} klubber, ${fixtures.length} kampe, ${res.sheetsFetched} nye holdkort`)
    } catch (e) {
      res.errors.push(`pulje ${pool}: ${(e as Error).message}`)
    }
  }
  res.squadRows = rebuildDbuSquads(db)
  return res
}

/** One match page: team sheets, result and goals stored; true when the sheets were there */
async function fetchMatch(db: Db, m: Row): Promise<boolean> {
  const html = await get(String(m.url))
  const sheet = parseSheet(html)
  const result = parseResult(html)
  // Cards, substitutions, referee, pitch and coaches: only once the match has a result (the page says nothing before)
  const events = result ? parseEvents(html) : undefined
  const info = result ? parseInfo(html) : undefined
  transaction(db, () => {
    db.prepare('UPDATE matches SET fetched_at = ?, has_lineups = ?, has_events = ?, home_score = ?, away_score = ?, has_details = ? WHERE match_key = ?').run(
      nowIso(),
      sheet || m.has_lineups ? 1 : 0,
      result ? 1 : 0,
      result?.home ?? null,
      result?.away ?? null,
      result ? 1 : 0,
      m.match_key,
    )
    if (info && events) {
      db.prepare('UPDATE matches SET referee = ?, assistants = ?, pitch = ?, venue_address = ?, home_coach = ?, away_coach = ?, home_trainers = ?, away_trainers = ? WHERE match_key = ?').run(
        info.referee ?? null,
        info.assistants.length ? JSON.stringify(info.assistants) : null,
        info.pitch ?? null,
        info.address ?? null,
        info.homeCoach ?? null,
        info.awayCoach ?? null,
        info.homeTrainers.length ? JSON.stringify(info.homeTrainers) : null,
        info.awayTrainers.length ? JSON.stringify(info.awayTrainers) : null,
        m.match_key,
      )
      db.prepare('DELETE FROM match_events WHERE match_key = ?').run(m.match_key)
      const ev = db.prepare('INSERT INTO match_events (match_key, seq, club_id, minute, kind, name, name2) VALUES (?, ?, ?, ?, ?, ?, ?)')
      let seq = 0
      for (const c of events.cards) ev.run(m.match_key, seq++, c.side === 'home' ? m.home_id : m.away_id, c.minute, c.kind, c.name, null)
      for (const x of events.subs) ev.run(m.match_key, seq++, x.side === 'home' ? m.home_id : m.away_id, x.minute, 'sub', x.on, x.off)
    }
    if (sheet) {
      db.prepare('DELETE FROM lineups WHERE match_key = ?').run(m.match_key)
      const ins = db.prepare('INSERT OR IGNORE INTO lineups (match_key, club_id, number, name, reserve) VALUES (?, ?, ?, ?, ?)')
      for (const p of sheet.home) ins.run(m.match_key, m.home_id, p.number, p.name, p.reserve ? 1 : 0)
      for (const p of sheet.away) ins.run(m.match_key, m.away_id, p.number, p.name, p.reserve ? 1 : 0)
    }
    if (result) {
      db.prepare('DELETE FROM goals WHERE match_key = ?').run(m.match_key)
      const g = db.prepare('INSERT INTO goals (match_key, club_id, minute, name, seq) VALUES (?, ?, ?, ?, ?)')
      result.goals.forEach((x, i) => g.run(m.match_key, x.side === 'home' ? m.home_id : m.away_id, x.minute, x.name, i))
    }
  })
  return !!sheet
}

/**
 * Between the full fetches (every 3rd night): the page of each match that new photos come from, when its
 * sheet or result is missing (one request per match, at most every 6 hours). Squads are
 * rebuilt when a sheet arrives.
 */
export async function fetchMatchesForQueue(db: Db, pauseMs: number, log: (s: string) => void = () => {}): Promise<number> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
  const due = db
    .prepare(
      `SELECT DISTINCT m.match_key, m.url, m.home_id, m.away_id, m.has_lineups FROM photos p
       JOIN matches m ON m.date = p.match_date AND ((m.home_id = p.club_id AND m.away_id = p.opponent_id) OR (m.away_id = p.club_id AND m.home_id = p.opponent_id))
       WHERE p.status = 'ny' AND m.source = 'dbu' AND (m.has_lineups = 0 OR m.has_events = 0) AND m.date <= ? AND (m.fetched_at IS NULL OR m.fetched_at < ?)`,
    )
    .all(today, new Date(Date.now() - 6 * 3600_000).toISOString())
  let sheets = 0
  for (const m of due) {
    try {
      if (await fetchMatch(db, m)) sheets++
    } catch (e) {
      log(`DBU ${String(m.url)}: ${(e as Error).message}`)
    }
    await sleep(pauseMs)
  }
  if (sheets) rebuildDbuSquads(db)
  if (due.length) log(`DBU: ${due.length} kampside${due.length === 1 ? '' : 'r'} hentet til nye billeder (${sheets} med holdkort)`)
  return due.length
}

function upsertClub(db: Db, c: DbuClub): string {
  // An existing club with the same name keeps its id, aliases and extra kits (edited in admin)
  const existing = db.prepare('SELECT id, name FROM clubs').all().find((r) => clubKey(String(r.name)) === clubKey(c.name))
  const id = existing ? String(existing.id) : clubSlug(c.name)
  db.prepare(
    `INSERT INTO clubs (id, name, colors, kit, dbu_team, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET colors = excluded.colors, kit = excluded.kit, dbu_team = excluded.dbu_team, updated_at = excluded.updated_at`,
  ).run(id, c.name, JSON.stringify(c.colors), JSON.stringify(c.kit), c.team, nowIso())
  return id
}

/** The squad list from all stored DBU sheets; rows added by hand stay */
export function rebuildDbuSquads(db: Db): number {
  const byMatch = new Map<string, SheetMatch>()
  for (const r of db.prepare(`SELECT l.match_key, m.date, l.club_id, l.number, l.name, l.reserve FROM lineups l JOIN matches m ON m.match_key = l.match_key WHERE m.source = 'dbu'`).all()) {
    const key = String(r.match_key)
    if (!byMatch.has(key)) byMatch.set(key, { date: String(r.date), players: {} })
    const players = byMatch.get(key)!.players
    const club = String(r.club_id)
    ;(players[club] ??= []).push({ number: Number(r.number), name: String(r.name), reserve: !!r.reserve })
  }
  const rows = squadsFromSheets([...byMatch.values()])
  transaction(db, () => {
    db.prepare(`DELETE FROM squads WHERE source = 'dbu'`).run()
    const ins = db.prepare(`INSERT INTO squads (club_id, number, name, valid_from, valid_to, uncertain, source) VALUES (?, ?, ?, ?, ?, ?, 'dbu')`)
    for (const r of rows) ins.run(r.clubId, r.number, r.name, r.validFrom ?? null, r.validTo ?? null, r.uncertain ? 1 : 0)
  })
  return rows.length
}
