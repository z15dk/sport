import 'server-only'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { slowStatus } from './slow'

// The background process's own numbers (src/lib/role.ts), written every 30
// seconds for /admin/data in the site process: that it is alive, its memory
// and what takes time in it.

export interface WorkerStatus {
  at: number
  startedAt: number
  rss: number
  heap: number
  slow: ReturnType<typeof slowStatus>
  /** The fetching job's state (it lives in this process's memory) */
  realData?: { running: boolean; lastFull: string | null; lastHot: string | null; requests: number; lastError: string | null }
  archive?: { lastRun: string | null; lastError: string | null; file?: string; total?: number; byDivision?: { division: string; matches: number; incidents: number }[] }
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'worker-status.json')
const mb = (n: number) => Math.round(n / 1_048_576)

export function startWorkerStatus(extra: () => Pick<WorkerStatus, 'realData' | 'archive'>) {
  const startedAt = Date.now()
  const write = () => {
    try {
      const m = process.memoryUsage()
      const status: WorkerStatus = { at: Date.now(), startedAt, rss: mb(m.rss), heap: mb(m.heapUsed), slow: slowStatus(), ...extra() }
      mkdirSync(path.dirname(file()), { recursive: true })
      writeFileSync(`${file()}.tmp`, JSON.stringify(status))
      renameSync(`${file()}.tmp`, file())
    } catch {
      // Written again in 30 seconds
    }
  }
  write()
  setInterval(write, 30_000).unref()
}

/** The background process's numbers, or undefined when there is none (or it has not written for two minutes) */
export function workerStatus(): (WorkerStatus & { stale: boolean }) | undefined {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as WorkerStatus
    return { ...s, stale: Date.now() - s.at > 2 * 60_000 }
  } catch {
    return undefined
  }
}
