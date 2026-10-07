import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { articleById, saveArticle } from './articles'
import { sendArticleApprovalMail } from './articleApproval'
import { mailReady } from './mail'
import { dataDir } from './photos/config'
import { dkDate } from './previews/build'
import { ourClubName, savePreviewDraft, upcomingFixtures } from './previews/data'
import { TZ } from './time'
import { makeVsGraphic } from './vsGraphic'

// The weekend's previews by themselves: every Thursday from 10.00 the 1. division matches from Friday to
// Monday get a preview draft (src/lib/previews/) with a VS graphic (logos only – never a photo), and one
// mail lists them with "Læs og udgiv" each and "Udgiv alle i morgen kl. 07.00" (src/lib/articleApproval.ts).
// Nothing is published by itself. Once a week (state in data/auto-previews.json); AUTO_PREVIEWS=off stops it.

const STATE = () => path.join(dataDir(), 'auto-previews.json')

interface State {
  /** The Thursday (YYYY-MM-DD) the last round was made for */
  done?: string
  ids?: number[]
  at?: number
  error?: string
}

function readState(): State {
  try {
    return JSON.parse(readFileSync(STATE(), 'utf8')) as State
  } catch {
    return {}
  }
}

function writeState(s: State) {
  try {
    mkdirSync(path.dirname(STATE()), { recursive: true })
    writeFileSync(STATE(), JSON.stringify(s, null, 2))
  } catch {
    // tried again next time
  }
}

export const autoPreviewStatus = readState

/** Danish weekday (0 = Sunday), hour and date now */
function danishNow(now: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(now))
      .map((p) => [p.type, p.value]),
  )
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  return { weekday, hour: Number(parts.hour), date: `${parts.year}-${parts.month}-${parts.day}` }
}

/** The weekend's previews as drafts with a VS graphic, and the mail; returns the drafts' ids */
export async function makeWeekendPreviews(now = Date.now()): Promise<number[]> {
  const { date } = danishNow(now)
  const until = new Date(Date.parse(`${date}T12:00:00Z`) + 4 * 86_400_000).toISOString().slice(0, 10)
  const fixtures = upcomingFixtures(5).filter((f) => f.date > date && f.date <= until && f.draft?.status !== 'published')
  const ids: number[] = []
  for (const fx of fixtures) {
    const r = savePreviewDraft(fx.key)
    if (!r.id || r.skipped) continue
    ids.push(r.id)
    const a = articleById(r.id)
    if (a && !a.featuredImage) {
      try {
        const home = ourClubName(fx.home.name)
        const away = ourClubName(fx.away.name)
        const top = `Betinia Liga · ${dkDate(fx.date, true, false)}${fx.time ? ` kl. ${fx.time.slice(0, 5).replace(':', '.')}` : ''}`
        const { url } = await makeVsGraphic({ home, away, top })
        saveArticle({ ...a, featuredImage: url, featuredAlt: `${home} mod ${away} i Betinia Liga` })
      } catch {
        // the draft without a picture; the owner picks one
      }
    }
  }
  if (ids.length && mailReady()) await sendArticleApprovalMail(ids)
  return ids
}

let started = false

/** Checks every half hour whether it is Thursday after 10.00 and this week's previews are not made yet */
export function startAutoPreviews() {
  if (started || process.env.AUTO_PREVIEWS === 'off') return
  started = true
  const tick = async () => {
    const now = Date.now()
    const { weekday, hour, date } = danishNow(now)
    if (weekday !== 4 || hour < 10 || readState().done === date) return
    writeState({ done: date, at: now })
    try {
      writeState({ done: date, at: now, ids: await makeWeekendPreviews(now) })
    } catch (e) {
      writeState({ done: date, at: now, error: e instanceof Error ? e.message : String(e) })
    }
  }
  setTimeout(() => void tick(), 60_000).unref?.()
  setInterval(() => void tick(), 30 * 60_000).unref?.()
}
