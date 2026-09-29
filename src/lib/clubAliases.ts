import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// Other names for our clubs, set in /admin/data ("Ukendte hold"): a name a
// data source writes that our register did not recognise ("Hamburger SV" for
// Hamburg). By club id; kept in /opt/scoreline/data/club-aliases.json.
// They reach every name lookup through clubNames() (src/data/aliases.ts).

const file = (): string => process.env.CLUB_ALIASES_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'club-aliases.json')

let cache: { mtime: number; aliases: Record<string, string[]> } = { mtime: -1, aliases: {} }

/** The names and a version that changes with them */
export function clubAliasList(): { version: string; aliases: Record<string, string[]> } {
  let mtime = 0
  try {
    mtime = statSync(file()).mtimeMs
  } catch {
    // none yet
  }
  if (mtime !== cache.mtime) {
    let aliases: Record<string, string[]> = {}
    try {
      aliases = mtime ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, string[]>) : {}
    } catch {
      aliases = {}
    }
    cache = { mtime, aliases }
  }
  return { version: String(Math.round(cache.mtime)), aliases: cache.aliases }
}

/** Adds a name to a club, or takes it away (remove); a name belongs to one club only */
export function setClubAlias(clubId: string, name: string, remove = false): { error?: string } {
  if (!/^[a-z0-9-]{1,60}$/.test(clubId)) return { error: 'Ukendt klub' }
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  if (!clean || clean.length > 80) return { error: 'Navnet mangler eller er for langt' }
  const aliases: Record<string, string[]> = {}
  for (const [id, names] of Object.entries(clubAliasList().aliases)) {
    const kept = names.filter((n) => n.toLowerCase() !== clean.toLowerCase())
    if (kept.length) aliases[id] = kept
  }
  if (!remove) aliases[clubId] = [...(aliases[clubId] ?? []), clean]
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(aliases, null, 2))
  renameSync(`${file()}.tmp`, file())
  return {}
}
