import 'server-only'
import { monitorEventLoopDelay } from 'node:perf_hooks'

// What keeps the server busy. The site runs in one Node process: while a
// piece of work runs without pausing, every page waits ("the page does not
// load"). `timed` notes the named pieces that take long, and a monitor notes
// how long the server was unable to answer, minute by minute. Shown on
// /admin/data ("Serverens svartid").

interface Slow {
  /** The slowest recent runs of each named piece of work */
  tasks: { label: string; ms: number; at: number }[]
  /** Per minute: the longest time the server could not answer (ms) */
  minutes: { at: number; max: number; p99: number }[]
  started?: boolean
}
const holder = globalThis as typeof globalThis & { __scorelineSlow?: Slow }
const slow = (holder.__scorelineSlow ??= { tasks: [], minutes: [] })

const NOTE_MS = Number(process.env.SLOW_NOTE_MS ?? 200)

function note(label: string, ms: number) {
  if (ms < NOTE_MS) return
  slow.tasks.push({ label, ms: Math.round(ms), at: Date.now() })
  if (slow.tasks.length > 200) slow.tasks.splice(0, slow.tasks.length - 200)
}

/** Runs `fn` and notes it when it takes long */
export function timed<T>(label: string, fn: () => T): T {
  const t = performance.now()
  try {
    return fn()
  } finally {
    note(label, performance.now() - t)
  }
}

/** Starts the monitor of how long the server cannot answer (once) */
export function startLagMonitor() {
  if (slow.started) return
  slow.started = true
  const h = monitorEventLoopDelay({ resolution: 20 })
  h.enable()
  const timer = setInterval(() => {
    slow.minutes.push({ at: Date.now(), max: Math.round(h.max / 1e6), p99: Math.round(h.percentile(99) / 1e6) })
    if (slow.minutes.length > 180) slow.minutes.splice(0, slow.minutes.length - 180)
    h.reset()
  }, 60_000)
  timer.unref?.()
}

/** Every minute's longest wait (the last three hours), for the capacity watch (src/lib/capacity.ts) */
export const lagMinutes = () => slow.minutes

/** For /admin/data: the last three hours, and the slowest pieces of work (by label) */
export function slowStatus() {
  const byLabel = new Map<string, { label: string; count: number; max: number; total: number; last: number }>()
  for (const t of slow.tasks) {
    const e = byLabel.get(t.label) ?? byLabel.set(t.label, { label: t.label, count: 0, max: 0, total: 0, last: 0 }).get(t.label)!
    e.count++
    e.total += t.ms
    e.max = Math.max(e.max, t.ms)
    e.last = Math.max(e.last, t.at)
  }
  const minutes = slow.minutes
  return {
    worst: minutes.reduce((m, x) => Math.max(m, x.max), 0),
    stalls: minutes.filter((x) => x.max >= 1000).length,
    minutes: minutes.length,
    recent: minutes.slice(-15),
    tasks: [...byLabel.values()].sort((a, b) => b.max - a.max),
  }
}
