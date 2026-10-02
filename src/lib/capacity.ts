import 'server-only'
import os from 'node:os'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { lagMinutes } from './slow'
import { workerStatus } from './workerStatus'
import { role } from './role'
import { mailReady, sendMail } from './mail'
import { socialConfig } from './socialStore'
import { SITE_URL } from './site'
import { isoDate, TZ } from './time'

// When is the server too small? The site does not get slow from more
// visitors but from running out of memory and from stretches where one
// process blocks. This watches the machine (not just our processes: Chromium,
// the photo job and the OS count too) every minute from the site process,
// keeps one row per hour for 31 days in data/capacity.json, judges each day
// against the limits below, and mails the owner (the SMTP typed in under
// /admin/sociale/indstillinger) once a signal has been over its limit on
// three of the last seven days – at most one mail a week while it lasts.
// Shown as "Serverens kapacitet" on /admin/data.

export interface Hour {
  /** Start of the hour (ms) */
  at: number
  /** Highest share of the machine's memory in use (percent) */
  mem: number
  /** Most swap in use (MB) */
  swap: number
  /** Highest 5-minute load per core (percent: 100 = every core busy) */
  load: number
  /** Longest wait of the site process (ms) */
  lag: number
  /** Minutes where the site could not answer for a second or more */
  stalls: number
  /** Most memory of our own processes, site plus background (MB) */
  procs: number
  /** Samples in the hour */
  n: number
}

interface Store {
  hours: Hour[]
  /** When the owner was last mailed about an upgrade, and about what */
  mailedAt?: number
  mailedLevel?: Level
  /** The last lag minute folded in */
  lagUntil?: number
}

export type Level = 'ok' | 'watch' | 'upgrade'
export type SignalId = 'mem' | 'load' | 'lag'

/** The limits: an hour is "over" when it passes one, a day when two of its hours are over */
export const LIMITS = {
  /** Share of the machine's memory in use */
  memPct: 85,
  /** Swap in use (MB): swapping makes every page slow at once */
  swapMb: 512,
  /** 5-minute load per core: work queues up above 100 % */
  loadPct: 100,
  /** Minutes in an hour where the site could not answer for a second */
  stallMin: 10,
  /** Hours over the limit before a day counts */
  hoursPerDay: 2,
  /** Days over the limit (of the last seven) before it is time to upgrade */
  daysOfSeven: 3,
}

const KEEP_HOURS = 31 * 24
const holder = globalThis as typeof globalThis & { __scorelineCapacity?: { store: Store; started?: boolean; loaded?: boolean; dirty?: boolean } }
const state = (holder.__scorelineCapacity ??= { store: { hours: [] } })

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'capacity.json')
const mb = (n: number) => Math.round(n / 1_048_576)
const hourOf = (at: number) => at - (at % 3_600_000)

function load() {
  if (state.loaded) return
  state.loaded = true
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Store
    if (Array.isArray(s.hours)) state.store = { ...s, hours: s.hours.filter((h) => typeof h.at === 'number') }
  } catch {
    // Starts empty
  }
}

function save() {
  if (!state.dirty) return
  state.dirty = false
  try {
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(`${file()}.tmp`, JSON.stringify(state.store))
    renameSync(`${file()}.tmp`, file())
  } catch {
    state.dirty = true
  }
}

/** The machine's memory from /proc/meminfo (what Linux can actually give out), else Node's view of it */
export function machineMemory() {
  const total = os.totalmem()
  let available = os.freemem()
  let swapTotal = 0
  let swapFree = 0
  try {
    const info = readFileSync('/proc/meminfo', 'utf8')
    const kb = (key: string) => {
      const m = info.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
      return m ? Number(m[1]) * 1024 : undefined
    }
    available = kb('MemAvailable') ?? available
    swapTotal = kb('SwapTotal') ?? 0
    swapFree = kb('SwapFree') ?? 0
  } catch {
    // Not Linux
  }
  return { totalMb: mb(total), usedMb: mb(total - available), pct: Math.round(((total - available) / total) * 100), swapMb: mb(swapTotal - swapFree), swapTotalMb: mb(swapTotal) }
}

function hourRow(at: number): Hour {
  const key = hourOf(at)
  let h = state.store.hours.find((x) => x.at === key)
  if (!h) {
    h = { at: key, mem: 0, swap: 0, load: 0, lag: 0, stalls: 0, procs: 0, n: 0 }
    state.store.hours.push(h)
    state.store.hours.sort((a, b) => a.at - b.at)
    if (state.store.hours.length > KEEP_HOURS) state.store.hours.splice(0, state.store.hours.length - KEEP_HOURS)
  }
  return h
}

/** One sample: the machine now, and the site's lag minutes since the last one */
function sample() {
  load()
  const now = Date.now()
  const h = hourRow(now)
  const m = machineMemory()
  const cores = Math.max(1, os.cpus().length)
  const load5 = Math.round((os.loadavg()[1] / cores) * 100)
  const worker = role() === 'web' ? workerStatus() : undefined
  const procs = mb(process.memoryUsage().rss) + (worker && !worker.stale ? worker.rss : 0)
  h.mem = Math.max(h.mem, m.pct)
  h.swap = Math.max(h.swap, m.swapMb)
  h.load = Math.max(h.load, load5)
  h.procs = Math.max(h.procs, procs)
  h.n++
  // The lag monitor's minutes (src/lib/slow.ts), each folded into its own hour once
  const since = state.store.lagUntil ?? 0
  for (const minute of lagMinutes()) {
    if (minute.at <= since) continue
    const row = hourRow(minute.at)
    row.lag = Math.max(row.lag, minute.max)
    if (minute.max >= 1000) row.stalls++
    state.store.lagUntil = Math.max(state.store.lagUntil ?? 0, minute.at)
  }
  state.dirty = true
}

const SIGNALS: { id: SignalId; name: string; over: (h: Hour) => boolean; limit: string }[] = [
  { id: 'mem', name: 'Hukommelse', over: (h) => h.mem >= LIMITS.memPct || h.swap >= LIMITS.swapMb, limit: `${LIMITS.memPct} % af maskinen eller ${LIMITS.swapMb} MB swap` },
  { id: 'load', name: 'CPU (load)', over: (h) => h.load >= LIMITS.loadPct, limit: `${LIMITS.loadPct} % af kernerne i 5 min.` },
  { id: 'lag', name: 'Ventetid', over: (h) => h.stalls >= LIMITS.stallMin, limit: `${LIMITS.stallMin} min. i timen over 1 sek.` },
]

export interface SignalStatus {
  id: SignalId
  name: string
  level: Level
  /** Now (this hour) and the worst of the last 24 hours, as shown text */
  now: string
  worst24: string
  limit: string
  /** The last seven days: over the limit or not, oldest first */
  days: { date: string; over: boolean; hours: number }[]
  badDays: number
}

export interface CapacityStatus {
  level: Level
  signals: SignalStatus[]
  machine: ReturnType<typeof machineMemory> & { cores: number; load5: number }
  /** The last 48 hours, oldest first */
  recent: Hour[]
  mail: { ready: boolean; to: string; sentAt?: number; sentLevel?: Level }
  /** How many days of measurements there are */
  measuredDays: number
  advice: string
}

const levelOf = (badDays: number): Level => (badDays >= LIMITS.daysOfSeven ? 'upgrade' : badDays >= 1 ? 'watch' : 'ok')
const worst = (a: Level, b: Level): Level => (a === 'upgrade' || b === 'upgrade' ? 'upgrade' : a === 'watch' || b === 'watch' ? 'watch' : 'ok')
const dayKey = (at: number) => isoDate(at)

/** What to buy, by which signal is over: more memory, or dedicated cores */
export function adviceFor(signals: Pick<SignalStatus, 'id' | 'level'>[]): string {
  const bad = (id: SignalId) => signals.find((s) => s.id === id)?.level === 'upgrade'
  if (bad('mem') && !bad('load') && !bad('lag')) return 'Mere hukommelse: næste trin op i samme serie (fx Hetzner CPX52, 24 GB).'
  if ((bad('load') || bad('lag')) && !bad('mem')) return 'Flere og roligere kerner: dedikerede vCPU\'er (fx Hetzner CCX33, 8 kerner, 32 GB) – delte kerner svinger ved spidsbelastning.'
  if (bad('mem')) return 'Både hukommelse og CPU: dedikerede kerner med mere hukommelse (fx Hetzner CCX33, 8 kerner, 32 GB).'
  return 'Ingen opgradering nødvendig nu.'
}

/** The state for /admin/data and the mail */
export function capacityStatus(): CapacityStatus {
  load()
  const now = Date.now()
  const hours = state.store.hours
  const dates: string[] = []
  for (let i = 6; i >= 0; i--) dates.push(dayKey(now - i * 86_400_000))
  const byDay = new Map<string, Hour[]>()
  for (const h of hours) {
    const k = dayKey(h.at)
    byDay.set(k, [...(byDay.get(k) ?? []), h])
  }
  const current = hours.find((h) => h.at === hourOf(now))
  const last24 = hours.filter((h) => h.at >= now - 24 * 3_600_000)
  const show = (id: SignalId, h?: Hour) => {
    if (!h) return '–'
    if (id === 'mem') return `${h.mem} %${h.swap ? ` · swap ${h.swap} MB` : ''}`
    if (id === 'load') return `${h.load} %`
    return `${h.stalls} min. · længste ${h.lag} ms`
  }
  const peak = (id: SignalId, rows: Hour[]) => {
    if (!rows.length) return undefined
    const key = id === 'mem' ? 'mem' : id === 'load' ? 'load' : 'stalls'
    return rows.reduce((m, h) => (h[key] > m[key] ? h : m), rows[0])
  }
  const signals: SignalStatus[] = SIGNALS.map((s) => {
    const days = dates.map((date) => {
      const n = (byDay.get(date) ?? []).filter(s.over).length
      return { date, over: n >= LIMITS.hoursPerDay, hours: n }
    })
    const badDays = days.filter((d) => d.over).length
    return { id: s.id, name: s.name, level: levelOf(badDays), now: show(s.id, current), worst24: show(s.id, peak(s.id, last24)), limit: s.limit, days, badDays }
  })
  const level = signals.reduce((l, s) => worst(l, s.level), 'ok' as Level)
  const m = machineMemory()
  const cores = Math.max(1, os.cpus().length)
  return {
    level,
    signals,
    machine: { ...m, cores, load5: Math.round((os.loadavg()[1] / cores) * 100) },
    recent: hours.filter((h) => h.at >= now - 48 * 3_600_000),
    mail: { ready: mailReady(), to: socialConfig().email.to, sentAt: state.store.mailedAt, sentLevel: state.store.mailedLevel },
    measuredDays: byDay.size,
    advice: adviceFor(signals),
  }
}

const LEVEL_TEXT: Record<Level, string> = { ok: 'Serveren har plads nok.', watch: 'Hold øje: et signal har været over grænsen en enkelt dag.', upgrade: 'Det er tid til at opgradere serveren.' }

/** The mail's text, from the status (used for the real mail and the test mail) */
export function capacityMail(s: CapacityStatus, test = false) {
  const subject = `${test ? 'Prøve: ' : ''}Matchly – ${s.level === 'upgrade' ? 'serveren er ved at være for lille' : s.level === 'watch' ? 'hold øje med serveren' : 'serveren har plads nok'}`
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('da-DK', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
  const lines = s.signals.map((x) => `${x.level === 'upgrade' ? '✕' : x.level === 'watch' ? '!' : '✓'} ${x.name}: over grænsen ${x.badDays} af 7 dage (${x.limit}). Nu ${x.now}, værst sidste døgn ${x.worst24}.${
    x.badDays ? ` Dage: ${x.days.filter((d) => d.over).map((d) => fmt(d.date)).join(', ')}.` : ''
  }`)
  const machine = `Maskinen: ${s.machine.cores} kerner, ${s.machine.totalMb} MB hukommelse (${s.machine.pct} % i brug nu${s.machine.swapMb ? `, ${s.machine.swapMb} MB swap` : ''}), load ${s.machine.load5} %.`
  const text = [LEVEL_TEXT[s.level], '', ...lines, '', machine, '', `Anbefaling: ${s.advice}`, '', `Se detaljerne på ${SITE_URL}/admin/data.`, '', 'Reglen: et signal tæller en dag, når det er over grænsen i mindst 2 timer, og der mailes, når det sker 3 af de sidste 7 dage – højst én mail om ugen.'].join('\n')
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;max-width:640px"><p><strong>${esc(LEVEL_TEXT[s.level])}</strong></p><ul>${lines
    .map((l) => `<li>${esc(l)}</li>`)
    .join('')}</ul><p>${esc(machine)}</p><p><strong>Anbefaling:</strong> ${esc(s.advice)}</p><p><a href="${SITE_URL}/admin/data">Se detaljerne på /admin/data</a></p><p style="color:#666;font-size:13px">Reglen: et signal tæller en dag, når det er over grænsen i mindst 2 timer, og der mailes, når det sker 3 af de sidste 7 dage – højst én mail om ugen.</p></div>`
  return { subject, text, html }
}

/** Mails the owner when it is time, at most once a week while it lasts; again at once if it was fine in between */
async function maybeMail() {
  const s = capacityStatus()
  if (s.level === 'ok') {
    if (state.store.mailedAt) {
      state.store.mailedAt = undefined
      state.store.mailedLevel = undefined
      state.dirty = true
    }
    return
  }
  if (s.level !== 'upgrade' || !s.mail.ready) return
  if (state.store.mailedAt && Date.now() - state.store.mailedAt < 7 * 86_400_000) return
  const { subject, html, text } = capacityMail(s)
  await sendMail(subject, html, text)
  state.store.mailedAt = Date.now()
  state.store.mailedLevel = s.level
  state.dirty = true
  save()
}

/** Sends the current report now (the "Send prøvemail" button on /admin/data) */
export async function sendCapacityTestMail() {
  const s = capacityStatus()
  const { subject, html, text } = capacityMail(s, true)
  await sendMail(subject, html, text)
}

/** Starts the watch (once, in the site process: it is the one whose waits matter) */
export function startCapacityWatch() {
  if (state.started || role() === 'worker') return
  state.started = true
  load()
  let ticks = 0
  const tick = () => {
    try {
      sample()
      ticks++
      // Written every five minutes; judged (and the owner mailed) once an hour
      if (ticks % 5 === 0) save()
      if (ticks % 60 === 0) maybeMail().catch((err) => console.error('Kapacitetsmail fejlede:', err))
    } catch (err) {
      console.error('Kapacitetsmåling fejlede:', err)
    }
  }
  const timer = setInterval(tick, 60_000)
  timer.unref?.()
  // The first sample right away, so /admin/data has a number at once
  setTimeout(tick, 5_000).unref?.()
}
