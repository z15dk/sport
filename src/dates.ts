/** Local date as YYYY-MM-DD */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function isSameDay(a: Date, b: Date): boolean {
  return toIsoDate(a) === toIsoDate(b)
}

const timeFmt = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat('da-DK', { weekday: 'short' })
const dayMonthFmt = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short' })
const longFmt = new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })

export const formatTime = (d: Date) => timeFmt.format(d)
export const formatWeekday = (d: Date) => weekdayFmt.format(d).replace('.', '')
export const formatDayMonth = (d: Date) => dayMonthFmt.format(d)
export const formatLong = (d: Date) => longFmt.format(d)
