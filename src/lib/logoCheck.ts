import 'server-only'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// API-Sports gives every team and league a logo address, also when it has no
// logo: the address then shows a grey "image not available" picture. We can't
// tell from the address, so a background job downloads each logo once (a few a
// minute) and keeps a fingerprint of it. A picture that many different teams
// share is the placeholder, and those logos are left out, so the team gets our
// neutral badge instead. Kept in logo-check.json beside the other caches.

interface Entry {
  /** sha1 of the picture, or "missing" when the address gave no picture */
  hash: string
  checkedAt: number
}
interface CheckFile {
  entries: Record<string, Entry>
}

const file = (): string => process.env.LOGO_CHECK_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'logo-check.json')
/** The same picture at this many different addresses is a placeholder */
const SHARED = 3
const PER_MINUTE = 12
const RECHECK = 30 * 86_400_000

const holder = globalThis as typeof globalThis & {
  __scorelineLogoCheck?: { mtime: number; data: CheckFile; placeholders: Set<string>; running: boolean; checked: number; lastError?: string }
}
const mem = (holder.__scorelineLogoCheck ??= { mtime: -1, data: { entries: {} }, placeholders: new Set(), running: false, checked: 0 })

function load() {
  let mtime = 0
  try {
    mtime = statSync(file()).mtimeMs
  } catch {
    mtime = 0
  }
  if (mtime === mem.mtime) return
  mem.mtime = mtime
  try {
    mem.data = mtime ? (JSON.parse(readFileSync(file(), 'utf8')) as CheckFile) : { entries: {} }
  } catch {
    mem.data = { entries: {} }
  }
  const count = new Map<string, number>()
  for (const e of Object.values(mem.data.entries)) count.set(e.hash, (count.get(e.hash) ?? 0) + 1)
  mem.placeholders = new Set([...count].filter(([hash, n]) => hash === 'missing' || n >= SHARED).map(([hash]) => hash))
}

function save() {
  try {
    const f = file()
    mkdirSync(path.dirname(f), { recursive: true })
    writeFileSync(`${f}.tmp`, JSON.stringify(mem.data))
    renameSync(`${f}.tmp`, f)
  } catch (err) {
    mem.lastError = (err as Error).message
  }
}

/** Only API-Sports' pictures are checked; our own and uploaded logos are always real */
const checkable = (url: string) => /^https:\/\/media[\w.-]*\.api-sports\.io\//.test(url)

/** Whether a logo address is API-Sports' "image not available" picture */
export function isPlaceholderLogo(url: string | undefined): boolean {
  if (!url || !checkable(url)) return false
  load()
  const e = mem.data.entries[url]
  return !!e && mem.placeholders.has(e.hash)
}

/** The logo, or nothing when it is a placeholder */
export const realLogo = (url: string | undefined): string | undefined => (url && !isPlaceholderLogo(url) ? url : undefined)

/** Changes when a check changes which logos are placeholders */
export function logoCheckVersion(): string {
  load()
  return `${Object.keys(mem.data.entries).length}-${mem.placeholders.size}`
}

async function fingerprint(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (res.status === 404) return 'missing'
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  return bytes.length ? createHash('sha1').update(bytes).digest('hex') : 'missing'
}

/** Checks the logos given by `urls()` (most wanted first), a few a minute */
export function startLogoCheck(urls: () => string[]) {
  if (mem.running) return
  mem.running = true
  const tick = async () => {
    try {
      load()
      const now = Date.now()
      const next = urls().find((u) => checkable(u) && !(mem.data.entries[u] && now - mem.data.entries[u].checkedAt < RECHECK))
      if (!next) return
      try {
        mem.data.entries[next] = { hash: await fingerprint(next), checkedAt: now }
        mem.checked++
        save()
        mem.lastError = undefined
      } catch (err) {
        mem.lastError = `${next}: ${(err as Error).message}`
      }
    } catch (err) {
      mem.lastError = (err as Error).message
    }
  }
  setInterval(() => void tick(), 60_000 / PER_MINUTE)
}

export function logoCheckStatus() {
  load()
  const entries = Object.values(mem.data.entries)
  return {
    checked: entries.length,
    placeholders: entries.filter((e) => mem.placeholders.has(e.hash)).length,
    lastError: mem.lastError,
  }
}
