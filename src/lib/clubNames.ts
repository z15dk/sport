import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// Club names changed in the admin pages, by club slug. Kept in
// /opt/scoreline/data/club-names.json so they survive deploys. The data
// sources still know the clubs by their original names.

const file = (): string => process.env.CLUB_NAMES_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'club-names.json')

let cache: { mtime: number; names: Record<string, string> } = { mtime: -1, names: {} }

/** The changed names and a version that changes with them */
export function clubNameOverrides(): { version: string; names: Record<string, string> } {
  let mtime = 0
  try {
    mtime = statSync(file()).mtimeMs
  } catch {
    // no changes yet
  }
  if (mtime !== cache.mtime) {
    let names: Record<string, string> = {}
    try {
      names = mtime ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, string>) : {}
    } catch {
      names = {}
    }
    cache = { mtime, names }
  }
  return { version: String(Math.round(cache.mtime)), names: cache.names }
}

/** Sets a club's name; an empty name goes back to the original */
export function setClubName(slug: string, name: string): { error?: string } {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return { error: 'Ukendt klub' }
  // Control characters out (they have no place in a name), whitespace collapsed
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  if (clean.length > 60) return { error: 'Navnet må højst være 60 tegn' }
  const names = { ...clubNameOverrides().names }
  if (clean) names[slug] = clean
  else delete names[slug]
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(names, null, 2))
  renameSync(`${file()}.tmp`, file())
  return {}
}
