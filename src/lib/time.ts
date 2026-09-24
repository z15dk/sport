// All dates and times are handled in Danish time, so the server and the
// browser render the same thing regardless of where they run.

export const TZ = 'Europe/Copenhagen'

const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** YYYY-MM-DD in Danish time */
export function isoDate(d: Date | number): string {
  return isoFmt.format(d)
}

export function isValidIsoDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))
}

/** Adds days to a YYYY-MM-DD string */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function offsetMs(instant: number): number {
  const p = Object.fromEntries(partsFmt.formatToParts(instant).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** The instant a Danish wall-clock time ("HH:MM" on YYYY-MM-DD) happens */
export function danishTime(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, min)
  return new Date(guess - offsetMs(guess - offsetMs(guess)))
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('da-DK', { timeZone: TZ, ...opts })
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit' })
const weekdayFmt = fmt({ weekday: 'short' })
const dayMonthFmt = fmt({ day: 'numeric', month: 'short' })
const longFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const fullFmt = fmt({ day: 'numeric', month: 'long', year: 'numeric' })
const shortYearFmt = fmt({ day: 'numeric', month: 'short', year: 'numeric' })
const numericFmt = fmt({ day: 'numeric', month: 'numeric', year: '2-digit' })
const monthFmt = fmt({ month: 'long', year: 'numeric' })

const noon = (date: string) => new Date(`${date}T12:00:00Z`)

export const formatTime = (d: Date) => timeFmt.format(d)
export const formatWeekday = (date: string) => weekdayFmt.format(noon(date)).replace('.', '')
export const formatDayMonth = (date: string) => dayMonthFmt.format(noon(date))
export const formatLong = (d: Date | string) => longFmt.format(typeof d === 'string' ? noon(d) : d)
export const formatFull = (d: Date | string) => fullFmt.format(typeof d === 'string' ? noon(d) : d)
export const formatShortYear = (d: Date) => shortYearFmt.format(d)
export const formatNumeric = (d: Date) => numericFmt.format(d).replace(/\//g, '.')
export const formatMonth = (date: string) => monthFmt.format(noon(date))
