import { nowIso, transaction, type Db } from './db.ts'
import { squadsFromSheets, type LineupPlayer, type SheetMatch } from './names.ts'
import { clubKey, clubSlug } from './paths.ts'

// Clubs, kits and team sheets from dbu.dk's public pages (per pool):
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
  home: string
  away: string
  url: string
}

export function parseProgram(html: string): DbuFixture[] {
  const out: DbuFixture[] = []
  for (const row of html.split(/<tr [^>]*onclick="MatchProgramMatchClick\('/).slice(1)) {
    const url = row.slice(0, row.indexOf("'"))
    const key = /\/kamp\/(\d+_\d+)\//.exec(url)?.[1]
    const date = /matchprogram-date"><span>[^<]*<\/span>\s*(\d{2})-(\d{2}) (\d{4})/.exec(row)
    const teams = [...row.matchAll(/href="\/resultater\/hold\/[^"]+">([\s\S]*?)<\/a>/g)].map((m) => text(m[1]))
    if (key && date && teams.length >= 2) out.push({ key, date: `${date[3]}-${date[2]}-${date[1]}`, home: teams[0], away: teams[1], url })
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
          `INSERT INTO matches (match_key, date, home_id, away_id, source, url) VALUES (?, ?, ?, ?, 'dbu', ?)
           ON CONFLICT(match_key) DO UPDATE SET date = excluded.date, home_id = excluded.home_id, away_id = excluded.away_id, url = excluded.url`,
        ).run(`dbu:${f.key}`, f.date, home, away, f.url)
        res.fixtures++
      }
      // Played matches without a sheet or result, not tried in the last 12 hours
      const due = db
        .prepare(`SELECT match_key, url, home_id, away_id, has_lineups FROM matches WHERE source = 'dbu' AND (has_lineups = 0 OR has_events = 0) AND date <= ? AND match_key LIKE ? AND (fetched_at IS NULL OR fetched_at < ?) ORDER BY date`)
        .all(today, `dbu:%_${pool}`, new Date(Date.now() - 12 * 3600_000).toISOString())
      for (const m of due) {
        try {
          const html = await get(String(m.url))
          const sheet = parseSheet(html)
          const result = parseResult(html)
          transaction(db, () => {
            db.prepare('UPDATE matches SET fetched_at = ?, has_lineups = ?, has_events = ?, home_score = ?, away_score = ? WHERE match_key = ?').run(
              nowIso(),
              sheet || m.has_lineups ? 1 : 0,
              result ? 1 : 0,
              result?.home ?? null,
              result?.away ?? null,
              m.match_key,
            )
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
          if (sheet) res.sheetsFetched++
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
