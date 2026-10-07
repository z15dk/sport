import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { allArticles, articleById, saveArticle } from './articles'
import { qualityOf, readQuality, saveQuality } from './articleQuality'
import { SITE_URL } from './site'
import { sendArticleApprovalMail } from './articleApproval'
import { mailReady, sendMail } from './mail'
import { dataDir } from './photos/config'
import { dkDate } from './previews/build'
import { ourClubName, previewBatch, previewLeagues, savePreviewDraft, upcomingFixtures } from './previews/data'
import { TZ } from './time'
import { scorerLines } from './reports/build'
import { findReportKey, finishedWithoutReport, reportBatch, reportFor, reportLeagues, saveReportDraft, type ReportItem } from './reports/data'
import { makeResultGraphic, makeVsGraphic } from './vsGraphic'

// The weekend's previews by themselves: every Thursday from 10.00 the matches from Friday to Monday in every
// preview league (1. division, 3. division – src/lib/previews/data.ts) get a preview draft, checked by the
// quality gate (src/lib/previews/quality.ts), with a VS graphic (logos only – never a photo), and one mail lists
// them with their quality mark, "Læs og udgiv" each and "Udgiv alle i morgen kl. 07.00" for the green ones
// (src/lib/articleApproval.ts).
// Nothing is published by itself. Once a week (state in data/auto-previews.json); AUTO_PREVIEWS=off stops it.

const STATE = () => path.join(dataDir(), 'auto-previews.json')

interface PendingMail {
  ids: number[]
  green: number[]
  notes: string[]
  /** Not before this time (ms) */
  after: number
}

/** How long a batch waits for the Claude editor (its timer runs 40 minutes after the jobs) before the mail goes */
const EDITOR_WAIT_MS = 90 * 60_000

function queueMail(m: Omit<PendingMail, 'after'>, now = Date.now()) {
  if (!m.ids.length) return
  const s = readState()
  writeState({ ...s, pending: [...(s.pending ?? []), { ...m, after: now + EDITOR_WAIT_MS }] })
}

/** Sends the waiting mails whose time has come (one mail per batch) */
async function sendDueMails(now = Date.now()) {
  const s = readState()
  const due = (s.pending ?? []).filter((m) => m.after <= now)
  if (!due.length || !mailReady()) return
  writeState({ ...s, pending: (s.pending ?? []).filter((m) => m.after > now) })
  for (const m of due) {
    try {
      await sendArticleApprovalMail(m.ids, { notes: m.notes, publishAll: m.green })
    } catch {
      // the drafts are in admin either way
    }
  }
}

interface State {
  /** The Thursday (YYYY-MM-DD) the last round was made for */
  done?: string
  /** The day (YYYY-MM-DD) the waiting previews were last checked before going live */
  checked?: string
  /** The day (YYYY-MM-DD) the match reports were last made */
  reported?: string
  /** Mails waiting for the Claude editor to read their drafts first (deploy/claude-editor): sent after `after` */
  pending?: PendingMail[]
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

/** A league's batch is held back from "Udgiv alle" when more than this share of its previews is yellow */
const MAX_YELLOW = 0.2

/**
 * The weekend's previews in every preview league as drafts with a VS graphic, and one mail; returns the drafts'
 * ids. A fixture without enough data gets no preview (said in the mail); a league with more than a fifth of
 * its previews yellow gets no "Udgiv alle" this week – the owner reads them first.
 */
export async function makeWeekendPreviews(now = Date.now()): Promise<number[]> {
  const { date } = danishNow(now)
  const until = new Date(Date.parse(`${date}T12:00:00Z`) + 4 * 86_400_000).toISOString().slice(0, 10)
  const ids: number[] = []
  const green: number[] = []
  const notes: string[] = []
  for (const league of previewLeagues()) {
    const fixtures = upcomingFixtures(5, league).filter((f) => f.date > date && f.date <= until && f.draft?.status !== 'published')
    if (!fixtures.length) continue
    const made: { id: number; level: string }[] = []
    const skipped: string[] = []
    for (const item of previewBatch(fixtures.map((f) => f.key))) {
      const fx = item.fixture
      const r = savePreviewDraft(fx.key, item)
      if (!r.id) {
        if (r.skipped && item.quality.level === 'blocked') skipped.push(`${fx.home.name} – ${fx.away.name}`)
        continue
      }
      if (r.skipped) continue
      made.push({ id: r.id, level: item.quality.level })
      const a = articleById(r.id)
      if (a && !a.featuredImage) {
        try {
          const home = ourClubName(fx.home.name)
          const away = ourClubName(fx.away.name)
          const top = `${league.graphic} · ${dkDate(fx.date, true, false)}${fx.time ? ` kl. ${fx.time.slice(0, 5).replace(':', '.')}` : ''}`
          const { url } = await makeVsGraphic({ home, away, top })
          saveArticle({ ...a, featuredImage: url, featuredAlt: `${home} mod ${away} i ${league.graphic}` })
        } catch {
          // the draft without a picture; the owner picks one
        }
      }
    }
    ids.push(...made.map((m) => m.id))
    const yellow = made.filter((m) => m.level !== 'green').length
    if (made.length && yellow / made.length > MAX_YELLOW) notes.push(`${league.name}: ${yellow} af ${made.length} optakter er gule – "Udgiv alle" er holdt tilbage for rækken i denne uge. Læs dem først.`)
    else green.push(...made.filter((m) => m.level === 'green').map((m) => m.id))
    if (skipped.length) notes.push(`${league.name}: ingen optakt til ${skipped.join(', ')} – for lidt data endnu.`)
  }
  // The mail waits for the Claude editor's verdicts (deploy/claude-editor)
  queueMail({ ids, green, notes })
  return ids
}

/**
 * The last check before the morning's previews go live (06.30, before 07.00): every preview waiting to go live or
 * still a draft is made again from the newest data, so a moved kickoff, ground or TV channel is right when it goes
 * out. A preview whose match is no longer among the coming ones (postponed, moved to another day) is held back as
 * a draft. Live previews are never changed; what changed is mailed. Returns the lines of the mail.
 */
export async function checkWaitingPreviews(now = Date.now()): Promise<string[]> {
  const lines: string[] = []
  const today = danishNow(now).date
  const waiting = allArticles().filter((a) => a.slug.startsWith('optakt-') && (a.status === 'draft' || (a.status === 'published' && !!a.publishedAt && Date.parse(a.publishedAt) > now)))
  const fixtures = upcomingFixtures(30)
  for (const a of waiting) {
    const date = a.slug.slice(-10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) continue
    const fx = fixtures.find((f) => f.draft?.id === a.id)
    if (!fx) {
      if (a.status === 'published') {
        saveArticle({ ...a, status: 'draft', publishedAt: undefined })
        lines.push(`Holdt tilbage: "${a.title}" – kampen står ikke længere i programmet den dag (udsat eller flyttet).`)
      }
      continue
    }
    // Written by the Claude writer: never put back to the template. When the match's time, ground or TV moved
    // since it wrote, a waiting preview is held back for the owner (or the writer's next run) to fix
    const mark = qualityOf(a.id)
    if (mark?.rewritten) {
      const was = (mark.facts?.data as { kamp?: { tid?: string | null; stadion?: string | null; tv?: string | null } } | undefined)?.kamp
      if (was && (was.tid !== (fx.time ?? null) || was.stadion !== (fx.venue ?? null) || was.tv !== (fx.tv ?? null))) {
        if (a.status === 'published') saveArticle({ ...a, status: 'draft', publishedAt: undefined })
        lines.push(`Holdt tilbage: "${a.title}" – tidspunkt, stadion eller TV er ændret, efter Claude skrev den (nu: ${[fx.time, fx.venue, fx.tv].filter(Boolean).join(', ')}). Ret den, før den udgives.`)
      }
      continue
    }
    // Edited by hand after the automatic version: never overwritten, only pointed out when the facts moved
    const edited = !mark || Date.parse(a.updatedAt) > mark.at + 60_000
    const item = previewBatch([fx.key])[0]
    if (!item) continue
    if (item.quality.level === 'blocked') continue
    const changed = item.preview.content !== a.content
    const factsBefore = /<li><strong>(?:Tidspunkt|Stadion|TV):<\/strong>[^<]*<\/li>/g
    const facts = (html: string) => (html.match(factsBefore) ?? []).join(' ')
    if (!changed) continue
    if (edited) {
      if (facts(item.preview.content) !== facts(a.content)) lines.push(`Tjek selv: "${a.title}" er rettet i hånden, og tidspunkt, stadion eller TV er ændret siden – den er ikke opdateret.`)
      continue
    }
    saveArticle({ ...a, content: item.preview.content, excerpt: item.preview.excerpt, metaDescription: item.preview.metaDescription, status: a.status, publishedAt: a.publishedAt })
    saveQuality(a.id, { ...item.quality, kind: 'preview', league: fx.league.id })
    if (facts(item.preview.content) !== facts(a.content)) lines.push(`Opdateret før udgivelse: "${a.title}" – tidspunkt, stadion eller TV er ændret siden torsdag.`)
  }
  if (lines.length && mailReady()) {
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    await sendMail(`Matchly: ${lines.length} optakt${lines.length === 1 ? '' : 'er'} ændret før udgivelse`, `<div style="font-family:Arial,sans-serif;max-width:600px">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<p><a href="${SITE_URL}/admin/artikler">Åbn artiklerne</a></p></div>`, lines.join('\n'))
  }
  return lines
}

/**
 * The match reports of the last days, once DBU's match pages have been read (the nightly job): every finished
 * match in a report league with complete data gets a draft, checked by the quality gate, and one mail with
 * their marks and "Udgiv alle" for the green ones. A match whose goals don't add up yet waits for the next day.
 */
/** The match's own result graphic as a report's picture: both logos, the score and the scorers (not when it has one) */
async function addResultGraphic(id: number, item: ReportItem) {
  const a = articleById(id)
  if (!a || a.featuredImage) return
  const m = item.input.match
  const goals = (clubId: string) => scorerLines(item.input.goals.filter((g) => g.clubId === clubId), item.input.goals)
  try {
    const { url } = await makeResultGraphic({ home: m.home.name, away: m.away.name, hs: m.hs, as: m.as, top: `${item.league.graphic} · ${dkDate(m.date, true, false)}`, homeGoals: goals(m.home.id), awayGoals: goals(m.away.id) })
    saveArticle({ ...a, featuredImage: url, featuredAlt: `${m.home.name} – ${m.away.name} ${m.hs}-${m.as} i ${item.league.graphic}` })
  } catch {
    // the draft without a picture; the owner picks one
  }
}

/** Report drafts of the last week without a picture (made before the graphic existed) get their result graphic */
async function addMissingResultGraphics() {
  const marks = readQuality()
  const week = Date.now() - 7 * 24 * 3600_000
  for (const a of allArticles()) {
    if (a.status !== 'draft' || a.featuredImage || marks[String(a.id)]?.kind !== 'report' || Date.parse(a.createdAt) < week) continue
    const key = findReportKey(a.slug)
    const item = key && reportFor(key)
    if (item) await addResultGraphic(a.id, { ...item, quality: { level: 'green', reasons: [] } })
  }
}

export async function makeMatchReports(): Promise<number[]> {
  const ids: number[] = []
  const green: number[] = []
  const notes: string[] = []
  for (const league of reportLeagues()) {
    const made: { id: number; level: string }[] = []
    for (const item of reportBatch(finishedWithoutReport(league))) {
      const r = saveReportDraft(item)
      if (!r.id || r.skipped) continue
      made.push({ id: r.id, level: item.quality.level })
      await addResultGraphic(r.id, item)
    }
    ids.push(...made.map((m) => m.id))
    const yellow = made.filter((m) => m.level !== 'green').length
    if (made.length && yellow / made.length > MAX_YELLOW) notes.push(`${league.name}: ${yellow} af ${made.length} referater er gule – "Udgiv alle" er holdt tilbage for rækken i dag. Læs dem først.`)
    else green.push(...made.filter((m) => m.level === 'green').map((m) => m.id))
  }
  // The mail waits for the Claude editor's verdicts (deploy/claude-editor)
  queueMail({ ids, green, notes })
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
    // Every morning between 06 and 07: the last check of the previews waiting to go live
    if (hour === 6 && readState().checked !== date) {
      writeState({ ...readState(), checked: date })
      try {
        await checkWaitingPreviews(now)
      } catch {
        // tomorrow
      }
    }
    await addMissingResultGraphics()
    await sendDueMails(now)
    // Every morning from 07: the match reports of matches whose details came in the night (the editor reads them at 07.40, the mail goes at 08.30)
    if (hour >= 7 && readState().reported !== date) {
      writeState({ ...readState(), reported: date })
      try {
        await makeMatchReports()
      } catch {
        // tomorrow
      }
    }
    if (weekday !== 4 || hour < 10 || readState().done === date) return
    const keep = { checked: readState().checked, reported: readState().reported, pending: readState().pending }
    writeState({ ...keep, done: date, at: now })
    try {
      const ids = await makeWeekendPreviews(now)
      writeState({ ...readState(), done: date, at: now, ids })
    } catch (e) {
      writeState({ ...readState(), done: date, at: now, error: e instanceof Error ? e.message : String(e) })
    }
  }
  setTimeout(() => void tick(), 60_000).unref?.()
  setInterval(() => void tick(), 15 * 60_000).unref?.()
}
