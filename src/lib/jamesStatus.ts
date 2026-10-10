import 'server-only'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// What James (the Claude writers on the server, deploy/claude-editor) is doing: his jobs' systemd units – running now,
// when each last ran and how it ended, when it runs next – for the status on /admin/indstillinger. Read with
// `systemctl show` (the site's user may read the units' state, never their logs). Kept a few seconds.

const exec = promisify(execFile)

export interface JamesJob {
  id: string
  label: string
  what: string
  running: boolean
  startedAt?: number
  endedAt?: number
  ok?: boolean
  nextAt?: number
}

const JOBS: { id: string; label: string; what: string }[] = [
  { id: 'matchly-referat', label: 'Hurtige referater', what: 'skriver referatet 15 minutter efter hver dansk kamp' },
  { id: 'matchly-optakt', label: 'Optakter', what: 'skriver optakter med research til alle danske kampe de næste 36 timer' },
  { id: 'matchly-nyhedsspejder', label: 'Nyhedsspejder', what: 'finder nyheder og skriver kladder til dig' },
  { id: 'matchly-editor', label: 'Skribent', what: 'skriver de automatiske kladder om' },
  { id: 'matchly-vaekst', label: 'Vækstrunden', what: 'læser tallene, sætter bedre titler og skriver dagbog' },
  { id: 'matchly-quiz', label: 'Gæt klubben', what: 'laver quiz-afsnit, så der altid ligger to uger klar' },
]

/** A systemd time: "@1791583351" (--timestamp=unix) or, for a timer's next run, "Sun 2026-10-11 07:00:00 CEST" */
const at = (v?: string) => {
  const unix = /^@(\d+)$/.exec(v ?? '')
  if (unix) return Number(unix[1]) > 0 ? Number(unix[1]) * 1000 : undefined
  const m = /(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (CEST|CET|UTC)/.exec(v ?? '')
  if (!m) return undefined
  const t = Date.parse(`${m[1]}T${m[2]}${m[3] === 'CEST' ? '+02:00' : m[3] === 'CET' ? '+01:00' : 'Z'}`)
  return Number.isFinite(t) ? t : undefined
}

/** systemctl show's blocks (one per unit, separated by a blank line) as key → value */
const blocks = (out: string) =>
  out
    .trim()
    .split(/\n\s*\n/)
    .map((b) => Object.fromEntries(b.split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])))

let cache: { at: number; jobs: JamesJob[] | null } | undefined

/** James' jobs now, or null when the server's units cannot be read (the Mac, a server without them) */
export async function jamesStatus(): Promise<JamesJob[] | null> {
  if (cache && Date.now() - cache.at < 5_000) return cache.jobs
  let jobs: JamesJob[] | null = null
  try {
    const services = await exec('systemctl', ['show', ...JOBS.map((j) => `${j.id}.service`), '-p', 'Id', '-p', 'ActiveState', '-p', 'LoadState', '-p', 'ExecMainStartTimestamp', '-p', 'ExecMainExitTimestamp', '-p', 'Result', '--timestamp=unix', '--no-pager'], { timeout: 3_000 })
    const timers = await exec('systemctl', ['show', ...JOBS.map((j) => `${j.id}.timer`), '-p', 'Id', '-p', 'LoadState', '-p', 'NextElapseUSecRealtime', '--timestamp=unix', '--no-pager'], { timeout: 3_000 })
    const units = new Map(blocks(services.stdout).map((b) => [b.Id, b]))
    const next = new Map(blocks(timers.stdout).map((b) => [b.Id, b]))
    if (![...units.values()].some((u) => u.LoadState === 'loaded')) throw new Error('ingen af James’ jobs findes her')
    jobs = JOBS.map((j) => {
      const u = units.get(`${j.id}.service`) ?? {}
      const t = next.get(`${j.id}.timer`) ?? {}
      const running = u.ActiveState === 'active' || u.ActiveState === 'activating'
      return {
        ...j,
        running,
        startedAt: at(u.ExecMainStartTimestamp),
        endedAt: running ? undefined : at(u.ExecMainExitTimestamp),
        ok: running || !u.Result ? undefined : u.Result === 'success',
        nextAt: t.LoadState === 'loaded' ? at(t.NextElapseUSecRealtime) : undefined,
      }
    })
  } catch {
    jobs = null
  }
  cache = { at: Date.now(), jobs }
  return jobs
}
