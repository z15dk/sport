import 'server-only'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

// The site process starts the background process itself (src/lib/role.ts):
// the same app started once more on a local port, with SCORELINE_ROLE=worker,
// so the VPS needs no new service. Started again if it stops (after 5 seconds,
// then longer when it keeps stopping), and stopped with the site.

const holder = globalThis as typeof globalThis & { __scorelineWorker?: { child?: ChildProcess; starts: number[] } }

export function startWorker() {
  const state = (holder.__scorelineWorker ??= { starts: [] })
  if (state.child) return
  const port = process.env.SCORELINE_WORKER_PORT ?? String(Number(process.env.PORT ?? 3000) + 1)
  const next = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
  const start = () => {
    state.starts = [...state.starts.filter((t) => Date.now() - t < 10 * 60_000), Date.now()]
    const child = spawn(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', port], {
      cwd: process.cwd(),
      env: { ...process.env, SCORELINE_ROLE: 'worker', SCORELINE_WORKER: 'child', PORT: port },
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    state.child = child
    child.on('exit', (code, signal) => {
      state.child = undefined
      console.error(`Baggrundsprocessen stoppede (${signal ?? code}) – startes igen`)
      // Stopping again and again: wait longer, so a broken start never takes the machine's time
      const wait = state.starts.length > 3 ? 60_000 : 5_000
      setTimeout(start, wait).unref?.()
    })
  }
  start()
  // The background process goes with the site (systemd also stops every process of the service)
  process.once('exit', () => state.child?.kill('SIGTERM'))
}
