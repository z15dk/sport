import 'server-only'
import { Session } from 'node:inspector'
import { SourceMap } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// What the server was busy with when it could not answer. The lag monitor
// (src/lib/slow.ts) shows *that* the server stalled; `timed` only names the
// pieces we thought of. This samples the process all the time (every 10 ms,
// a minute at a time) and, for every stretch of more than half a second
// without a pause, notes which of our functions (file and line, found through
// the build's source maps) took the time. Shown on /admin/data. CPU_PROFILE=off
// switches it off.

export interface Stall {
  at: number
  ms: number
  /** Our functions on the stack, by the time they were on it (inclusive) */
  top: { fn: string; ms: number }[]
  /** Where the time itself went (the innermost frame: our code, a package, the garbage collector) */
  self: { fn: string; ms: number }[]
}

interface Node {
  id: number
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number }
  children?: number[]
}
interface Profile {
  nodes: Node[]
  startTime: number
  samples?: number[]
  timeDeltas?: number[]
}

const STALL_MS = Number(process.env.CPU_STALL_MS ?? 500)
const holder = globalThis as typeof globalThis & { __scorelineCpu?: { stalls: Stall[]; started?: boolean } }
const cpu = (holder.__scorelineCpu ??= { stalls: [] })

/** The stretches the server was blocked, newest last (the last 30) */
export const cpuStalls = (): Stall[] => cpu.stalls

export function startCpuWatch() {
  if (cpu.started || process.env.CPU_PROFILE === 'off') return
  cpu.started = true
  let session: Session
  try {
    session = new Session()
    session.connect()
  } catch {
    return
  }
  const post = (method: string, params?: object) =>
    new Promise<unknown>((resolve, reject) => session.post(method, params ?? {}, (err, res) => (err ? reject(err) : resolve(res))))
  const start = async () => {
    await post('Profiler.enable')
    await post('Profiler.setSamplingInterval', { interval: 10_000 })
    await post('Profiler.start')
  }
  start().catch(() => undefined)
  const timer = setInterval(async () => {
    try {
      const { profile } = (await post('Profiler.stop')) as { profile: Profile }
      await post('Profiler.start')
      // Worked out after the next start, and only when there was a stall
      setImmediate(() => {
        try {
          for (const s of stallsIn(profile)) cpu.stalls.push(s)
          if (cpu.stalls.length > 30) cpu.stalls.splice(0, cpu.stalls.length - 30)
        } catch {
          // A profile we cannot read: the next one
        }
      })
    } catch {
      start().catch(() => undefined)
    }
  }, 60_000)
  timer.unref?.()
}

const IDLE = new Set(['(idle)', '(root)'])

function stallsIn(p: Profile): Stall[] {
  const samples = p.samples ?? []
  const deltas = p.timeDeltas ?? []
  const byId = new Map(p.nodes.map((n) => [n.id, n]))
  const parent = new Map<number, number>()
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  // Runs of samples without a pause
  const runs: { from: number; to: number; ms: number; at: number }[] = []
  let t = p.startTime
  let run: (typeof runs)[number] | undefined
  for (let i = 0; i < samples.length; i++) {
    t += deltas[i] ?? 0
    const busy = !IDLE.has(byId.get(samples[i])?.callFrame.functionName ?? '(idle)')
    const d = (deltas[i + 1] ?? 0) / 1000
    if (busy) {
      if (!run) run = { from: i, to: i, ms: 0, at: t / 1000 }
      run.to = i
      run.ms += d
    } else if (run) {
      if (run.ms >= STALL_MS) runs.push(run)
      run = undefined
    }
  }
  if (run && run.ms >= STALL_MS) runs.push(run)
  if (!runs.length) return []
  // The profile's clock is the process's monotonic one: shifted to wall time by the last sample
  const shift = Date.now() - t / 1000
  const names = new Map<number, string | undefined>()
  const nameOf = (id: number) => {
    if (!names.has(id)) names.set(id, frameName(byId.get(id)!.callFrame))
    return names.get(id)
  }
  return runs.map((r) => {
    const incl = new Map<string, number>()
    const self = new Map<string, number>()
    for (let i = r.from; i <= r.to; i++) {
      const d = (deltas[i + 1] ?? 0) / 1000
      const leaf = samples[i]
      const leafFrame = byId.get(leaf)!.callFrame
      const own = nameOf(leaf) ?? (leafFrame.functionName ? `${leafFrame.functionName} (Node)` : '(Node)')
      self.set(own, (self.get(own) ?? 0) + d)
      const seen = new Set<string>()
      for (let id: number | undefined = leaf; id !== undefined; id = parent.get(id)) {
        const n = nameOf(id)
        if (!n || seen.has(n) || !n.includes('.ts')) continue
        seen.add(n)
        incl.set(n, (incl.get(n) ?? 0) + d)
      }
    }
    const top = (m: Map<string, number>, k: number) =>
      [...m]
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([fn, ms]) => ({ fn, ms: Math.round(ms) }))
    return { at: Math.round(r.at + shift), ms: Math.round(r.ms), top: top(incl, 8), self: top(self, 5) }
  })
}

// ---------------------------------------------------------------- source maps

const maps = new Map<string, { map: SourceMap; sources: Map<string, string[]> } | null>()
const resolved = new Map<string, string | undefined>()

/** "realdata.ts:277 fillFromApiSports", a package's name ("react-dom"), the garbage collector – or nothing for Node's own frames */
function frameName(f: Node['callFrame']): string | undefined {
  if (f.functionName.startsWith('(')) return f.functionName === '(garbage collector)' ? 'Garbage collector' : f.functionName === '(program)' ? '(program)' : undefined
  if (!f.url || f.url.startsWith('node:')) return undefined
  const key = `${f.url}:${f.lineNumber}:${f.columnNumber}`
  if (resolved.has(key)) return resolved.get(key)
  let name: string | undefined
  try {
    name = mapped(f)
  } catch {
    name = undefined
  }
  if (resolved.size > 20_000) resolved.clear()
  resolved.set(key, name)
  return name
}

function mapped(f: Node['callFrame']): string | undefined {
  const file = f.url.startsWith('file:') ? fileURLToPath(f.url) : f.url
  const pkg = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(file)
  if (pkg && !file.includes('/.next/')) return pkg[1]
  let m = maps.get(file)
  if (m === undefined) {
    m = null
    if (existsSync(`${file}.map`)) {
      const raw = JSON.parse(readFileSync(`${file}.map`, 'utf8')) as { sources?: string[]; sourcesContent?: (string | null)[] }
      const sources = new Map<string, string[]>()
      raw.sources?.forEach((s, i) => {
        const c = raw.sourcesContent?.[i]
        if (c && !s.includes('node_modules')) sources.set(s, c.split('\n'))
      })
      m = { map: new SourceMap(raw as ConstructorParameters<typeof SourceMap>[0]), sources }
    }
    // A handful of chunks at most are kept (each map is large)
    if (maps.size > 40) maps.delete(maps.keys().next().value!)
    maps.set(file, m)
  }
  if (!m) return f.functionName || undefined
  const e = m.map.findEntry(f.lineNumber, f.columnNumber) as { originalSource?: string; originalLine?: number }
  if (!e?.originalSource) return f.functionName || undefined
  const inPkg = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(e.originalSource)
  if (inPkg) return inPkg[1]
  if (e.originalSource.startsWith('turbopack:')) return 'next'
  const src = decodeURIComponent(e.originalSource.replace(/^(\.\.\/)+/, '').replace(/^\[project\]\//, ''))
  const line = m.sources.get(e.originalSource)?.[e.originalLine ?? 0] ?? ''
  const fn =
    /function\*?\s+([\w$]+)/.exec(line)?.[1] ??
    /(?:const|let|var)\s+([\w$]+)\s*=/.exec(line)?.[1] ??
    /([\w$]+)\s*[:=]\s*(?:async\s*)?(?:\(|function|[\w$]+\s*=>)/.exec(line)?.[1] ??
    /^\s*(?:async\s+)?([\w$]+)\s*\(/.exec(line)?.[1] ??
    /\.([\w$]+)\(/.exec(line)?.[1]
  return `${src.replace(/^src\//, '')}:${(e.originalLine ?? 0) + 1}${fn ? ` ${fn}` : ''}`
}
