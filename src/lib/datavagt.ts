import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { clubNames } from '../data/aliases'
import { shownDivisions } from '../data/leagues'
import { NEW_CLUB_PAGE_DIVISIONS } from '../data/nyKlubside'
import { apiLeagueIdOf, apiTeamCoach, apiTeamIdOf } from './apisports'
import { dbuClubCoach, dbuClubCoachLatest } from './dbuSquad'
import { autoPreviewStatus } from './autoPreviews'
import { mailReady, sendMail } from './mail'
import { knownCoach, readRettelser } from './rettelser'
import { SITE_URL } from './site'
import { samePerson } from './samePerson'
import { cacheDir } from './tsdb'

// The datavagt: every night the facts on the club pages are held up against each other, and what looks wrong
// is written to a list (data/datavagt.json) that Claude reads each morning (/api/admin/datavagt): it checks
// each point in two sources and fixes it through the corrections (src/lib/rettelser.ts), or leaves it for the
// owner. Danish clubs only (DBU's match reports). DATAVAGT=off stops the nightly run.

export interface Finding {
  id: string
  kind: 'coach-fix-done' | 'coach-acting-replaced' | 'coach-conflict' | 'coach-missing'
  slug: string
  club: string
  text: string
  /** What would fix it, for Claude to check first */
  suggestion?: { action: 'removeCoach' } | { action: 'setCoach'; name: string }
}

interface Report {
  at: number
  findings: Finding[]
  /** The Danish day the morning mail went out */
  mailedOn?: string
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'datavagt.json')

export function readDatavagt(): Report {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Report
  } catch {
    return { at: 0, findings: [] }
  }
}

const DANISH = new Set(['superliga', '1div', '2div', '3div'])

export function runDatavagt(): Report {
  const findings: Finding[] = []
  for (const d of shownDivisions()) {
    if (!DANISH.has(d.id) || !NEW_CLUB_PAGE_DIVISIONS.has(d.id)) continue
    const apiLeague = apiLeagueIdOf(d.id)
    for (const c of d.clubs) {
      const apiTeam = apiLeague ? apiTeamIdOf(apiLeague, clubNames(c)) : undefined
      const api = apiLeague && apiTeam ? apiTeamCoach(apiLeague, apiTeam) : undefined
      const dbu = dbuClubCoach(clubNames(c), api)
      const fix = knownCoach(c.slug)
      let latest: { name: string; date: string } | undefined
      const base = { slug: c.slug, club: c.name }
      if (fix && !fix.acting && dbu && samePerson(dbu, fix.name))
        findings.push({ ...base, id: `coach-fix-done:${c.slug}`, kind: 'coach-fix-done', text: `DBU's kamprapporter nævner nu selv ${dbu} som træner – vores rettelse kan fjernes.`, suggestion: { action: 'removeCoach' } })
      // Only a report from a match after the correction was set can tell of a new coach
      else if (fix?.acting && (latest = dbuClubCoachLatest(clubNames(c))) && latest.date > new Date(fix.at).toISOString().slice(0, 10) && !samePerson(latest.name, fix.name))
        findings.push({ ...base, id: `coach-acting-replaced:${c.slug}`, kind: 'coach-acting-replaced', text: `Vi viser ${fix.name} som konstitueret, men DBU's kamprapport fra ${latest.date} nævner ${latest.name}. Er der en ny cheftræner?`, suggestion: { action: 'setCoach', name: latest.name } })
      else if (!fix && dbu && api && !samePerson(dbu, api))
        findings.push({ ...base, id: `coach-conflict:${c.slug}`, kind: 'coach-conflict', text: `DBU nævner ${dbu}, API-Sports nævner ${api} som træner. Vi viser ${dbu}.` })
      else if (!fix && !dbu && !api)
        findings.push({ ...base, id: `coach-missing:${c.slug}`, kind: 'coach-missing', text: 'Ingen træner på klubsiden – hverken DBU eller API-Sports nævner én.' })
    }
  }
  const report: Report = { at: Date.now(), findings, mailedOn: readDatavagt().mailedOn }
  writeReport(report)
  return report
}

function writeReport(r: Report) {
  try {
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify(r, null, 2))
  } catch {
    // shown from memory until next time
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const danishDay = (ms = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(ms))

/**
 * The morning mail (09.00, after Claude's run at 07): what Claude fixed in the last day, what is still wrong
 * (checked again just before), and background jobs that failed. Nothing to tell, no mail.
 */
export async function sendDatavagtMail(force = false): Promise<'sent' | 'nothing' | 'no-mail'> {
  if (!mailReady()) return 'no-mail'
  const now = Date.now()
  const open = runDatavagt().findings.filter((f) => f.kind !== 'coach-missing')
  const fixed = readRettelser().log.filter((l) => now - l.at < 24 * 3600_000)
  const jobs: string[] = []
  const previews = autoPreviewStatus()
  if (previews.error && previews.at && now - previews.at < 24 * 3600_000) jobs.push(`Torsdagens optakter fejlede: ${previews.error}`)
  if (!force && !open.length && !fixed.length && !jobs.length) return 'nothing'
  const section = (title: string, color: string, items: string[]) =>
    items.length
      ? `<h3 style="margin:22px 0 8px;font-size:16px">${title}</h3><ul style="margin:0;padding:0;list-style:none">${items
          .map((t) => `<li style="margin:0 0 8px;padding:10px 12px;border-radius:8px;background:#f4f5f1;border-left:4px solid ${color}">${t}</li>`)
          .join('')}</ul>`
      : ''
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;color:#16181a">
<h2 style="margin:0 0 6px">Datavagten ${danishDay(now)}</h2>
<p style="margin:0 0 4px;color:#555">${fixed.length} rettet · ${open.length} venter på dig${jobs.length ? ` · ${jobs.length} job fejlede` : ''}</p>
${section('Rettet af Claude', '#7bb33a', fixed.map((l) => esc(l.text)))}
${section('Venter på dig', '#f5c518', open.map((f) => `<strong>${esc(f.club)}</strong> – ${esc(f.text)}`))}
${section('Fejl i de automatiske job', '#c0341d', jobs.map(esc))}
<p style="margin:24px 0 0"><a href="${SITE_URL}/admin/datavagt" style="display:inline-block;background:#16181a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Åbn datavagten</a></p>
<p style="color:#777;font-size:12px;margin-top:20px">Claude tjekker listen hver morgen kl. 7 og retter det, to kilder er enige om. Resten står her.</p></div>`
  const text = [`Datavagten ${danishDay(now)}`, '', 'Rettet af Claude:', ...fixed.map((l) => `- ${l.text}`), '', 'Venter på dig:', ...open.map((f) => `- ${f.club}: ${f.text}`), ...(jobs.length ? ['', 'Fejl i job:', ...jobs.map((j) => `- ${j}`)] : []), '', `${SITE_URL}/admin/datavagt`].join('\n')
  await sendMail(`Matchly datavagt: ${fixed.length} rettet, ${open.length} venter på dig`, html, text)
  return 'sent'
}

let started = false

/** Once a night (and an hour after start) */
export function startDatavagt() {
  if (started || process.env.DATAVAGT === 'off') return
  started = true
  const tick = async () => {
    const last = readDatavagt().at
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
    if (Date.now() - last > 20 * 3600_000 && (hour >= 3 || !last)) {
      try {
        runDatavagt()
      } catch {
        // next hour
      }
    }
    // The mail at 09.00, once a day
    const today = danishDay()
    if (hour >= 9 && readDatavagt().mailedOn !== today) {
      writeReport({ ...readDatavagt(), mailedOn: today })
      try {
        await sendDatavagtMail()
      } catch {
        // tomorrow
      }
    }
  }
  setTimeout(() => void tick(), 60 * 60_000).unref?.()
  setInterval(() => void tick(), 30 * 60_000).unref?.()
}
