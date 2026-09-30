import 'server-only'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { cacheDir } from './tsdb'

// Logos, player photos and flags from our data sources, served from our own
// domain: the pages only ever show "/billede/<id>" (the sources can't be seen
// in the page), and the server fetches each picture once, keeps the original
// and makes small WebP copies in the sizes shown (src/lib/imageSize.ts), with
// a year's cache. Kept in /opt/scoreline/data/billeder (or IMAGE_DIR).

const HOSTS = /^(media(-\d+)?\.api-sports\.io|([a-z0-9-]+\.)?thesportsdb\.com|flagcdn\.com)$/
const WIDTHS = new Set([32, 64, 128, 256, 512])
const MAX_BYTES = 5_000_000

const dir = () => process.env.IMAGE_DIR ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'billeder')
const indexFile = () => path.join(dir(), 'index.json')

type Holder = { __matchlyImages?: { byId: Map<string, string>; dirty: boolean; timer?: ReturnType<typeof setTimeout> } }
const holder = globalThis as Holder
function registry() {
  if (!holder.__matchlyImages) {
    let entries: Record<string, string> = {}
    try {
      entries = JSON.parse(readFileSync(indexFile(), 'utf8'))
    } catch {
      // First run
    }
    holder.__matchlyImages = { byId: new Map(Object.entries(entries)), dirty: false }
  }
  return holder.__matchlyImages
}
function saveSoon() {
  const r = registry()
  r.dirty = true
  if (r.timer) return
  r.timer = setTimeout(() => {
    r.timer = undefined
    if (!r.dirty) return
    r.dirty = false
    try {
      mkdirSync(dir(), { recursive: true })
      writeFileSync(`${indexFile()}.tmp`, JSON.stringify(Object.fromEntries(r.byId)))
      renameSync(`${indexFile()}.tmp`, indexFile())
    } catch {
      // Tried again with the next new picture
    }
  }, 2_000)
  r.timer.unref?.()
}

const allowed = (url: string) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && HOSTS.test(u.hostname)
  } catch {
    return false
  }
}

/** A source's picture address as our own ("/billede/<id>"); other addresses are left as they are */
const idOf = new Map<string, string>()
export function proxyImage(url: string): string
export function proxyImage(url: string | undefined): string | undefined
export function proxyImage(url: string | undefined): string | undefined {
  if (!url || !allowed(url)) return url
  // The same addresses come again and again (every logo of every game): each one's id worked out once
  let id = idOf.get(url)
  if (!id) {
    id = createHash('sha256').update(url).digest('hex').slice(0, 20)
    if (idOf.size > 100_000) idOf.clear()
    idOf.set(url, id)
  }
  const r = registry()
  if (r.byId.get(id) !== url) {
    r.byId.set(id, url)
    saveSoon()
    // Made ready in the background, so no visitor waits for the source
    warm(id)
  }
  return `/billede/${id}`
}

const fetching = new Map<string, Promise<Buffer | undefined>>()
/** The original picture: from disk, else fetched once from the source */
async function original(id: string): Promise<Buffer | undefined> {
  const file = path.join(dir(), `${id}.src`)
  try {
    return readFileSync(file)
  } catch {
    // Not fetched yet
  }
  const url = registry().byId.get(id)
  if (!url || !allowed(url)) return undefined
  if (!fetching.has(id)) {
    fetching.set(
      id,
      (async () => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; Matchly/1.0)' } })
          if (!res.ok) return undefined
          const bytes = Buffer.from(await res.arrayBuffer())
          if (!bytes.length || bytes.length > MAX_BYTES) return undefined
          // Only real pictures (sharp reads the content, not the name)
          await sharp(bytes).metadata()
          mkdirSync(dir(), { recursive: true })
          writeFileSync(file, bytes)
          return bytes
        } catch {
          return undefined
        } finally {
          fetching.delete(id)
        }
      })(),
    )
  }
  return fetching.get(id)
}

/** A picture as WebP in a width we serve (32–512 px), made once and kept */
export async function proxiedPicture(id: string, width: number): Promise<Buffer | undefined> {
  if (!/^[a-f0-9]{20}$/.test(id) || !WIDTHS.has(width)) return undefined
  const file = path.join(dir(), `${id}-${width}.webp`)
  try {
    return readFileSync(file)
  } catch {
    // Not made yet
  }
  const src = await original(id)
  if (!src) return undefined
  try {
    const out = await sharp(src, { density: 300 }).resize({ width, height: width, fit: 'inside', withoutEnlargement: false }).webp({ quality: 82, alphaQuality: 90 }).toBuffer()
    writeFileSync(file, out)
    return out
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- made ready ahead

/** The sizes pages use most (logos in lists and headers) */
const WARM_WIDTHS = [64, 128]
const queue: string[] = []
let active = 0
function warm(id: string) {
  queue.push(id)
  pump()
}
function pump() {
  while (active < 4 && queue.length) {
    const id = queue.shift()!
    active++
    void (async () => {
      try {
        for (const w of WARM_WIDTHS) await proxiedPicture(id, w)
      } catch {
        // Made when first asked for instead
      } finally {
        active--
        pump()
      }
    })()
  }
}

/** Pictures known but not made yet (after a restart or a new server): made in the background */
export function warmKnownPictures() {
  for (const id of registry().byId.keys()) warm(id)
}
