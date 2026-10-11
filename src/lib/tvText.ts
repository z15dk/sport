import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { channelsFor } from '../data/channels'
import { cleanHtml } from './articles'
import { tvMatches, TV_DAYS } from './tv'
import { addDays, isoDate } from './time'
import { cacheDir } from './tsdb'

// James' text on the TV guide (the owner's word 11/10-2026): every morning a short, journalistic intro to the day's
// football on TV – the big match, why it matters, where to watch – on /tv (today) and /tv/i-morgen (tomorrow), so the
// page answers "fodbold i tv i dag" with more than a list. Written in the preview round (deploy/claude-editor/OPTAKT.md,
// /api/redaktor/tv). State in data/tv-tekst.json, kept for a week.

interface DayText {
  html: string
  at: number
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'tv-tekst.json')

function readDays(): Record<string, DayText> {
  try {
    return (JSON.parse(readFileSync(file(), 'utf8')) as { days?: Record<string, DayText> }).days ?? {}
  } catch {
    return {}
  }
}

/** James' text for a day's football on TV (YYYY-MM-DD), as safe HTML */
export const tvText = (date: string): string | undefined => readDays()[date]?.html

/** The text's length in letters (without the tags) */
const textLength = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length

/** Saves James' text for a day: 2–4 short paragraphs, links only to Matchly */
export function setTvText(date: string, html: string, now = Date.now()): { error?: string } {
  const today = isoDate(now)
  if (date !== today && date !== addDays(today, 1)) return { error: 'Kun i dag eller i morgen' }
  const clean = cleanHtml(html)
  const n = textLength(clean)
  if (n < 250 || n > 1400) return { error: `Teksten skal være 250–1.400 tegn (den er ${n})` }
  if (/<h[1-6]|<table|<img/i.test(clean)) return { error: 'Kun afsnit (p), fed, kursiv, lister og links' }
  const days = readDays()
  days[date] = { html: clean, at: now }
  // A week is enough
  const old = addDays(today, -7)
  const kept = Object.fromEntries(Object.entries(days).filter(([d]) => d >= old))
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify({ days: kept }, null, 2))
  return {}
}

/** Today and tomorrow: which still miss James' text, with the day's football on TV for him to write from */
export function tvTextsDue(now = Date.now()) {
  const today = isoDate(now)
  const days = readDays()
  const football = tvMatches(TV_DAYS, now).filter((m) => m.sport === 'soccer')
  return [today, addDays(today, 1)].map((date) => ({
    date,
    page: date === today ? '/tv' : '/tv/i-morgen',
    written: !!days[date],
    matches: football
      .filter((m) => isoDate(m.kickoff) === date)
      .map((m) => ({ kickoff: m.kickoff.toISOString(), league: m.league, home: m.home.name, away: m.away.name, channels: channelsFor(m).map((c) => c.name), matchPage: `/kamp/${m.slug}` })),
  }))
}
