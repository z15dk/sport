import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { clubNames } from '../data/aliases'
import { shownDivisions, type Division } from '../data/leagues'
import { NEW_CLUB_PAGE_DIVISIONS } from '../data/nyKlubside'
import { channelsFor } from '../data/channels'
import { getMatches } from '../data/matches'
import { standings } from '../data/season'
import { apiLeagueIdOf, apiStoredTable, apiTeamCoach, apiTeamIdOf, apiTeamStadium } from './apisports'
import { allArticles, plainText, type Article } from './articles'
import { articleApprovalLink } from './articleApproval'
import { qualityOf } from './articleQuality'
import { dbuHomeGround } from './channels'
import { dbuClubCoach, dbuClubCoachLatest } from './dbuSquad'
import { seoChecks } from './seoChecks'
import { addDays, isoDate } from './time'
import { autoPreviewStatus } from './autoPreviews'
import { mailReady, sendMail } from './mail'
import { confirmedCoach, knownCoach, readRettelser } from './rettelser'
import { SITE_URL } from './site'
import { samePerson } from './samePerson'
import { cacheDir } from './tsdb'

// The datavagt: every night the facts on the club pages are held up against each other, and what looks wrong
// is written to a list (data/datavagt.json) that Claude reads each morning (/api/admin/datavagt): it checks
// each point in two sources and fixes it through the corrections (src/lib/rettelser.ts), or leaves it for the
// owner. Danish clubs only: the coach and ground (DBU against API-Sports), the coming week's Superliga and
// 1. division matches without a TV channel, our table against API-Sports' (Superliga, 1. division), and
// matches still not finished hours after kickoff. A finding the owner has marked as fine (dismissed, with what
// it found as its sig) stays away until that changes. DATAVAGT=off stops the nightly run.

export interface Finding {
  id: string
  kind: 'coach-fix-done' | 'coach-acting-replaced' | 'coach-conflict' | 'coach-missing' | 'ground-conflict' | 'ground-missing' | 'tv-missing' | 'table-mismatch' | 'match-stuck'
  /** The club's (or for a match, the home club's) slug, or the league's */
  slug: string
  /** What the line is about: the club, or the match ("FCK – Brøndby") */
  club: string
  text: string
  /** What was found, so a finding marked as fine comes back when it changes */
  sig: string
  /** The page to look at */
  url?: string
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

type Base = Pick<Finding, 'slug' | 'club' | 'url'>

/** A ground's name for comparing: DBU's "Right to Dream Park" is API-Sports' "Right to Dream Park", "CASA Arena Horsens" its "CASA Arena" */
const groundWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'aa')
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['stadion', 'stadium', 'park', 'arena', 'idraetspark', 'idraetsanlaeg', 'the'].includes(w))
/** The same ground when one name's words are all in the other's */
export const sameGround = (a: string, b: string) => {
  const [x, y] = [groundWords(a), groundWords(b)]
  if (!x.length || !y.length) return a.trim().toLowerCase() === b.trim().toLowerCase()
  return x.every((w) => y.includes(w)) || y.every((w) => x.includes(w))
}

function groundFindings(base: Base, dbu: string | undefined, api: string | undefined): Finding[] {
  if (dbu && api && !sameGround(dbu, api))
    return [{ ...base, id: `ground-conflict:${base.slug}`, kind: 'ground-conflict', sig: `${dbu}|${api}`, text: `DBU nævner ${dbu}, API-Sports nævner ${api} som hjemmebane. Vi viser ${dbu}.` }]
  if (!dbu && !api) return [{ ...base, id: `ground-missing:${base.slug}`, kind: 'ground-missing', sig: '-', text: 'Intet stadion på klubsiden – hverken DBU eller API-Sports nævner et.' }]
  return []
}

const TV_LEAGUES = new Set(['superliga', '1div'])
const danishDate = (d: Date) => new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)

/** The coming week's Superliga and 1. division matches no channel is known for (the TV guide leaves them out) */
function tvFindings(now = Date.now()): Finding[] {
  const slugs = new Set(shownDivisions().filter((d) => TV_LEAGUES.has(d.id)).map((d) => d.slug))
  const today = isoDate(now)
  const out: Finding[] = []
  for (let i = 0; i < 7; i++)
    for (const m of getMatches(addDays(today, i), 'soccer', now)) {
      if (!m.leagueSlug || !slugs.has(m.leagueSlug) || m.state !== 'upcoming' || channelsFor(m).length) continue
      out.push({ slug: m.leagueSlug, club: `${m.home.name} – ${m.away.name}`, url: `${SITE_URL}/kamp/${m.slug}`, id: `tv-missing:${m.id}`, kind: 'tv-missing', sig: '-', text: `${m.league}, ${danishDate(m.kickoff)}: ingen TV-kanal. Kampen står ikke i TV-guiden.` })
    }
  return out
}

/**
 * Our table (counted from the matches) against API-Sports' for the same league. A team that has played more with
 * us than in their table is only news when their table was fetched after the league's latest match had ended.
 */
function tableFindings(d: Division, apiLeague: string, now = Date.now()): Finding[] {
  const official = apiStoredTable(apiLeague)
  if (!official) return []
  const rows = official.groups.flat()
  // The league's latest finished match (the last week), to tell an old table from a wrong one
  let latest = 0
  const today = isoDate(now)
  for (let i = 0; i < 7; i++)
    for (const m of getMatches(addDays(today, -i), 'soccer', now))
      if (m.leagueSlug === d.slug && m.state === 'finished') latest = Math.max(latest, m.kickoff.getTime())
  const fresh = official.fetchedAt > latest + 3 * 3600_000
  const out: Finding[] = []
  for (const r of standings(d, now)) {
    const teamId = apiTeamIdOf(apiLeague, clubNames(r.club))
    const o = teamId ? rows.find((x) => x.teamId === teamId) : undefined
    if (!o) continue
    const ours = `${r.played} kampe, ${r.won}-${r.drawn}-${r.lost}, ${r.goalsFor}-${r.goalsAgainst}, ${r.points} point`
    const theirs = `${o.played} kampe, ${o.won}-${o.drawn ?? 0}-${o.lost}, ${o.for ?? '?'}-${o.against ?? '?'}, ${o.points ?? '?'} point`
    if (o.played !== r.played && !fresh) continue
    const same = o.played === r.played && o.won === r.won && (o.drawn ?? 0) === r.drawn && o.lost === r.lost && (o.for === undefined || o.for === r.goalsFor) && (o.against === undefined || o.against === r.goalsAgainst)
    if (same && (o.points === undefined || o.points === r.points)) continue
    // The same results but other points: points taken away (or given) by the league, not our error
    const text = same ? `${d.name}: samme resultater, men API-Sports giver ${o.points} point og vi ${r.points}. Pointfradrag?` : `${d.name}: vores tabel siger ${ours}; API-Sports siger ${theirs}.`
    out.push({ slug: r.club.slug, club: r.club.name, url: `${SITE_URL}/turnering/${d.slug}`, id: `table-mismatch:${r.club.slug}`, kind: 'table-mismatch', sig: `${ours}|${theirs}`, text })
  }
  return out
}

/** Matches in a league with its own page that are still live or coming more than four hours after kickoff */
function stuckFindings(now = Date.now()): Finding[] {
  const today = isoDate(now)
  const out: Finding[] = []
  for (const date of [addDays(today, -1), today])
    for (const m of getMatches(date, 'all', now)) {
      if (!m.leagueSlug || (m.state !== 'live' && m.state !== 'upcoming') || now - m.kickoff.getTime() < 4 * 3600_000) continue
      const state = m.state === 'live' ? `står stadig som i gang${m.statusLabel ? ` (${m.statusLabel})` : ''}` : 'står stadig som ikke spillet'
      out.push({ slug: m.leagueSlug, club: `${m.home.name} – ${m.away.name}`, url: `${SITE_URL}/kamp/${m.slug}`, id: `match-stuck:${m.id}`, kind: 'match-stuck', sig: m.state, text: `${m.league}, ${danishDate(m.kickoff)}: ${state}, ${Math.floor((now - m.kickoff.getTime()) / 3600_000)} timer efter kampstart.` })
    }
  return out
}

export function runDatavagt(): Report {
  let findings: Finding[] = []
  for (const d of shownDivisions()) {
    if (!DANISH.has(d.id) || !NEW_CLUB_PAGE_DIVISIONS.has(d.id)) continue
    const apiLeague = apiLeagueIdOf(d.id)
    for (const c of d.clubs) {
      const apiTeam = apiLeague ? apiTeamIdOf(apiLeague, clubNames(c)) : undefined
      const api = apiLeague && apiTeam ? apiTeamCoach(apiLeague, apiTeam) : undefined
      const dbu = dbuClubCoach(clubNames(c), api)
      const fix = knownCoach(c.slug)
      let latest: { name: string; date: string } | undefined
      const base = { slug: c.slug, club: c.name, url: `${SITE_URL}/klub/${c.slug}` }
      if (fix && !fix.acting && dbu && samePerson(dbu, fix.name))
        findings.push({ ...base, id: `coach-fix-done:${c.slug}`, kind: 'coach-fix-done', sig: dbu, text: `DBU's kamprapporter nævner nu selv ${dbu} som træner – vores rettelse kan fjernes.`, suggestion: { action: 'removeCoach' } })
      // Only a report from a match after the correction was set can tell of a new coach
      else if (fix?.acting && (latest = dbuClubCoachLatest(clubNames(c))) && latest.date > new Date(fix.at).toISOString().slice(0, 10) && !samePerson(latest.name, fix.name))
        findings.push({ ...base, id: `coach-acting-replaced:${c.slug}`, kind: 'coach-acting-replaced', sig: latest.name, text: `Vi viser ${fix.name} som konstitueret, men DBU's kamprapport fra ${latest.date} nævner ${latest.name}. Er der en ny cheftræner?`, suggestion: { action: 'setCoach', name: latest.name } })
      else if (!fix && dbu && api && !samePerson(dbu, api) && !samePerson(dbu, confirmedCoach(c.slug)?.name ?? ''))
        findings.push({ ...base, id: `coach-conflict:${c.slug}`, kind: 'coach-conflict', sig: `${dbu}|${api}`, text: `DBU nævner ${dbu}, API-Sports nævner ${api} som træner. Vi viser ${dbu}.` })
      else if (!fix && !dbu && !api && !confirmedCoach(c.slug))
        findings.push({ ...base, id: `coach-missing:${c.slug}`, kind: 'coach-missing', sig: '-', text: 'Ingen træner på klubsiden – hverken DBU eller API-Sports nævner én.' })
      findings.push(...groundFindings(base, dbuHomeGround(clubNames(c)), apiLeague && apiTeam ? apiTeamStadium(apiLeague, apiTeam) : undefined))
    }
    if (apiLeague) findings.push(...tableFindings(d, apiLeague))
  }
  findings.push(...tvFindings(), ...stuckFindings())
  const dismissed = readRettelser().dismissed
  findings = findings.filter((f) => dismissed[f.id]?.sig !== f.sig)
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

/** The drafts the news scout (Claude's morning task, author "Matchly") has made in the last day, oldest first */
export function scoutDrafts(now = Date.now()): Article[] {
  return allArticles()
    // The automatic previews and reports have their own mail with a quality mark (src/lib/articleQuality.ts)
    .filter((a) => a.status === 'draft' && a.author === 'Matchly' && now - new Date(a.createdAt).getTime() < 26 * 3600_000 && !qualityOf(a.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** One draft for the mail: what it is about, the sources it names, and what the editor's checklist still marks red */
function draftSummary(a: Article) {
  const words = plainText(a.content).split(' ').filter(Boolean).length
  const sources = plainText(a.content.match(/<em>\s*Kilder?:[\s\S]*?<\/em>/i)?.[0] ?? '')
  const checks = seoChecks(a)
  const bad = checks.filter((c) => c.level === 'bad')
  const ok = checks.filter((c) => c.level === 'ok').length
  const meta = `${words} ord${a.focusKeyword ? ` · søgeord: ${a.focusKeyword}` : ''} · tjekliste: ${bad.length ? `${bad.length} røde` : 'ingen røde'}, ${ok} gule`
  return { words, sources, bad, meta }
}

/**
 * The morning mail (09.00, after Claude's run at 07): the news scout's drafts to check and publish, what Claude
 * fixed in the last day, what is still wrong (checked again just before), and background jobs that failed.
 * Nothing to tell, no mail.
 */
export async function sendDatavagtMail(force = false): Promise<'sent' | 'nothing' | 'no-mail'> {
  if (!mailReady()) return 'no-mail'
  const now = Date.now()
  const open = runDatavagt().findings.filter((f) => f.kind !== 'coach-missing')
  const fixed = readRettelser().log.filter((l) => now - l.at < 24 * 3600_000)
  const jobs: string[] = []
  const previews = autoPreviewStatus()
  if (previews.error && previews.at && now - previews.at < 24 * 3600_000) jobs.push(`Torsdagens optakter fejlede: ${previews.error}`)
  const drafts = scoutDrafts(now)
  if (!force && !open.length && !fixed.length && !jobs.length && !drafts.length) return 'nothing'
  const section = (title: string, color: string, items: string[]) =>
    items.length
      ? `<h3 style="margin:22px 0 8px;font-size:16px">${title}</h3><ul style="margin:0;padding:0;list-style:none">${items
          .map((t) => `<li style="margin:0 0 8px;padding:10px 12px;border-radius:8px;background:#f4f5f1;border-left:4px solid ${color}">${t}</li>`)
          .join('')}</ul>`
      : ''
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;color:#16181a">
<h2 style="margin:0 0 6px">Datavagten ${danishDay(now)}</h2>
<p style="margin:0 0 4px;color:#555">${drafts.length ? `${drafts.length} ${drafts.length === 1 ? 'kladde' : 'kladder'} · ` : ''}${fixed.length} rettet · ${open.length} venter på dig${jobs.length ? ` · ${jobs.length} job fejlede` : ''}</p>
${section(
  'Nyhedsspejderens kladder – læs og tjek',
  '#2b7de9',
  drafts.map((a) => {
    const d = draftSummary(a)
    return `<strong style="font-size:15px">${esc(a.title)}</strong>${a.excerpt ? `<br><span style="color:#444">${esc(a.excerpt)}</span>` : ''}<br><span style="color:#777;font-size:13px">${esc(d.meta)}</span>${d.sources ? `<br><span style="color:#777;font-size:13px">${esc(d.sources)}</span>` : ''}${d.bad.length ? `<br><span style="color:#c0341d;font-size:13px">${d.bad.map((c) => esc(c.text)).join(' · ')}</span>` : ''}<br><a href="${articleApprovalLink(a.id)}" style="display:inline-block;margin-top:8px;background:#16181a;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Læs og udgiv</a> <a href="${SITE_URL}/admin/artikler/${a.id}" style="margin-left:10px;color:#16181a;font-size:14px">Ret i admin</a>`
  }),
)}
${section('Rettet af Claude', '#7bb33a', fixed.map((l) => esc(l.text)))}
${section('Venter på dig', '#f5c518', open.map((f) => `<strong>${f.url ? `<a href="${f.url}" style="color:#16181a">${esc(f.club)}</a>` : esc(f.club)}</strong> – ${esc(f.text)}`))}
${section('Fejl i de automatiske job', '#c0341d', jobs.map(esc))}
<p style="margin:24px 0 0"><a href="${SITE_URL}/admin/datavagt" style="display:inline-block;background:#16181a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Åbn datavagten</a></p>
<p style="color:#777;font-size:12px;margin-top:20px">Claude tjekker listen hver morgen kl. 7 og retter det, to kilder er enige om. Resten står her.</p></div>`
  const text = [`Datavagten ${danishDay(now)}`, '', ...(drafts.length ? ['Nyhedsspejderens kladder:', ...drafts.map((a) => `- ${a.title} (${draftSummary(a).meta})\n  ${articleApprovalLink(a.id)}`), ''] : []), 'Rettet af Claude:', ...fixed.map((l) => `- ${l.text}`), '', 'Venter på dig:', ...open.map((f) => `- ${f.club}: ${f.text}`), ...(jobs.length ? ['', 'Fejl i job:', ...jobs.map((j) => `- ${j}`)] : []), '', `${SITE_URL}/admin/datavagt`].join('\n')
  await sendMail(`Matchly datavagt: ${drafts.length ? `${drafts.length} ${drafts.length === 1 ? 'kladde' : 'kladder'}, ` : ''}${fixed.length} rettet, ${open.length} venter på dig`, html, text)
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
