import 'server-only'
import path from 'node:path'

// Shared access to TheSportsDB for the background jobs (logos, real results).
// All requests go through one queue so together they stay under the free
// key's limit of about 30 requests a minute.

// "3" was TheSportsDB's old free key; the free key is now "123"
const configuredKey = process.env.THESPORTSDB_KEY || process.env.VITE_THESPORTSDB_KEY || '123'
export const API_KEY = configuredKey === '3' ? '123' : configuredKey
const API = `${process.env.THESPORTSDB_BASE ?? 'https://www.thesportsdb.com/api/v1/json'}/${API_KEY}`
const REQUEST_GAP_MS = Number(process.env.LOGO_REQUEST_GAP_MS ?? 2_200)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface ApiResult<T> {
  data?: T
  error?: string
}

let queue: Promise<unknown> = Promise.resolve()
export let requestCount = 0

async function request<T>(query: string): Promise<ApiResult<T>> {
  await sleep(REQUEST_GAP_MS)
  requestCount++
  try {
    const res = await fetch(`${API}/${query}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (res.status === 429) {
      // Rate limited: hold the whole queue for a minute
      await sleep(60_000)
      return { error: 'TheSportsDB: for mange forespørgsler (429)' }
    }
    if (!res.ok) return { error: `TheSportsDB svarede ${res.status}` }
    return { data: (await res.json()) as T }
  } catch (err) {
    return { error: `TheSportsDB kunne ikke nås: ${(err as Error).message}` }
  }
}

/** One request to TheSportsDB, queued behind every other request from this server */
export function tsdb<T>(query: string): Promise<ApiResult<T>> {
  const next = queue.then(() => request<T>(query))
  queue = next.catch(() => undefined)
  return next
}

/** Folder for the jobs' cache files; on the VPS beside the release folders so they survive deploys */
export function cacheDir() {
  const cwd = process.cwd()
  // turbopackIgnore: the cache lives outside the project and must not be traced into the build
  const releases = `${path.sep}releases${path.sep}`
  return cwd.includes(releases) ? cwd.slice(0, cwd.indexOf(releases)) : path.join(/*turbopackIgnore: true*/ cwd, '.cache')
}
