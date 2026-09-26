import 'server-only'
import type { Match } from '../types'
import { channelsFor } from '../data/channels'
import { SITE_NAME, SITE_URL, paths } from './site'

// Calendar subscriptions (iCalendar): a club's or a tournament's matches with
// kick-off, TV channel and a link back to the match page. Phones fetch the
// file again by themselves, so new times and results come along.

/** How long a match takes, for the calendar entry */
const DURATION_MIN: Record<string, number> = { soccer: 115, ice_hockey: 150, basketball: 120, handball: 90, volleyball: 120, american_football: 210 }

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Long lines are folded, as the format asks (75 bytes; 60 characters leaves room for æ, ø and å) */
function fold(line: string): string {
  if (line.length <= 60) return line
  const parts: string[] = []
  for (let i = 0; i < line.length; i += 60) parts.push((i ? ' ' : '') + line.slice(i, i + 60))
  return parts.join('\r\n')
}

export function calendar(name: string, description: string, matches: Match[]): string {
  const now = stamp(new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${SITE_NAME}//Kampprogram//DA`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
    `X-WR-CALDESC:${escape(description)}`,
    'X-WR-TIMEZONE:Europe/Copenhagen',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]
  for (const m of matches) {
    if (m.state === 'postponed') continue
    const end = new Date(m.kickoff.getTime() + (DURATION_MIN[m.sport] ?? 120) * 60_000)
    const score = m.state === 'finished' && m.home.score !== undefined ? ` ${m.home.score}-${m.away.score}` : ''
    const channels = channelsFor(m).map((c) => c.name)
    const url = `${SITE_URL}${paths.match(m.slug)}`
    const about = [m.league, channels.length ? `Vises på: ${channels.join(', ')}` : '', url].filter(Boolean).join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.id}@${SITE_NAME.toLowerCase()}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(m.kickoff)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escape(`${m.home.name} – ${m.away.name}${score}`)}`,
      `DESCRIPTION:${escape(about)}`,
      ...(m.venue ? [`LOCATION:${escape(m.venue)}`] : []),
      `URL:${url}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** The calendar file's address, and the links to add it on phones and in Google Calendar */
export function calendarLinks(kind: 'klub' | 'turnering', slug: string) {
  const path = `/kalender/${kind}/${slug}.ics`
  const https = `${SITE_URL}${path}`
  const webcal = https.replace(/^https?:/, 'webcal:')
  return { file: https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` }
}
