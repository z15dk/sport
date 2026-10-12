import 'server-only'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { clubMatches, teamGames } from '../../data/matches'
import { channelsFor } from '../../data/channels'
import { sportOf } from '../../data/leagues'
import { standings } from '../../data/season'
import { teamBySlug, type TeamEntry } from '../../data/teams'
import { normalize } from '../../data/aliases'
import { BASELINES, sameLeagueKeys } from '../../data/baselines'
import { cupOfGame } from '../../data/cups'
import { isNationalTeam, shownTeam } from '../../data/countries'
import { WOMEN_TEAM, isWomenLeague } from '../../data/external'
import { apiLeagueTable, externalLeague } from '../apisports'
import { archiveLeagueTable } from '../history'
import { articlesAbout } from '../articleTopics'
import { mailReady, sendMail } from '../mail'
import { loadRealData } from '../realdata'
import { SITE_URL, paths } from '../site'
import { genitive } from '../words'
import { isoDate } from '../time'
import { cacheDir } from '../tsdb'
import type { Match } from '../../types'
import { buildConfirmMail, buildWeeklyMail, hasNews, type ClubDigest, type DigestMatch, type DigestRow, type MailParts } from './build'
import { getBadges } from '../badges'
import { proxyImage } from '../imageProxy'
import { KlubmailStore, isoWeek, maskEmail, runWeekly, sendWindow, validEmail, type Db, type RunResult, type Subscriber } from './core'

// "Din klub i indbakken", the server side: the subscribers in SQLite klubmail.db (KLUBMAIL_DB; shared by the site
// process, which takes the sign-ups, and the job process, which sends), the mails through the site's SMTP (sendMail),
// and the weekly run: every 5 minutes from Monday 07.00 Danish time (to Wednesday, for what the daily cap held back)
// this week's mail goes to everyone who has not had it, 20 a minute, at most KLUBMAIL_DAILY_CAP (400) mails a day with
// the confirmation mails. KLUBMAIL=off stops the run. The pure part (store, queue, mail text) is in core.ts and build.ts.

const holder = globalThis as typeof globalThis & { __scorelineKlubmail?: KlubmailStore | null }
const file = () => process.env.KLUBMAIL_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'klubmail.db')

/** Mails a day in all (Gmail allows about 500 for a normal account) */
export const dailyCap = () => Math.max(10, Number(process.env.KLUBMAIL_DAILY_CAP) || 400)
/** Kept free under the cap for the day's confirmation mails while the weekly mail goes out */
const RESERVE = 40
/** 3 seconds between two weekly mails: 20 a minute */
const GAP_MS = 3_000

export function klubmailStore(): KlubmailStore | undefined {
  if (holder.__scorelineKlubmail !== undefined) return holder.__scorelineKlubmail ?? undefined
  try {
    const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string) => Db } | undefined
    if (!sqlite) throw new Error('no sqlite')
    mkdirSync(path.dirname(file()), { recursive: true })
    const d = new sqlite.DatabaseSync(file())
    d.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000')
    holder.__scorelineKlubmail = new KlubmailStore(d)
  } catch (e) {
    console.error('[klubmail] database kunne ikke åbnes:', e instanceof Error ? e.message : e)
    holder.__scorelineKlubmail = null
  }
  return holder.__scorelineKlubmail ?? undefined
}

// ---- The clubs ----

/** A men's senior national team ("Danmark"), not a youth or women's one */
const seniorNational = (t: TeamEntry) => t.sport === 'soccer' && isNationalTeam(t.name) && !/\b(u\d{2}|w)$|\(k\)$/i.test(t.name.trim())

/** The team when it can have the mail: football only (not ice hockey, basketball or handball) */
export function klubmailTeam(slug: string): TeamEntry | undefined {
  const t = teamBySlug(slug)
  if (!t) return undefined
  const sport = t.season ? sportOf(t.season.division) : t.sport
  return sport === 'soccer' ? t : undefined
}

/** The name as the club page shows it: "Danmarks landshold", "Brøndby IF (K)" in a women's league */
export function klubmailName(t: TeamEntry): string {
  if (!t.season && seniorNational(t)) return `${genitive(t.name)} landshold`
  if (!t.season && isWomenLeague(t.league, t.country) && !WOMEN_TEAM.test(t.name) && !/\sQ$/.test(t.name)) return `${t.name} (K)`
  return t.name
}

const asDigestMatch = (m: Match, isOwn: (name: string) => boolean): DigestMatch => {
  const home = isOwn(m.home.name)
  return {
    slug: m.slug || undefined,
    kickoff: m.kickoff.getTime(),
    league: m.league,
    home,
    opponent: home ? m.away.name : m.home.name,
    goalsFor: m.state === 'finished' ? ((home ? m.home.score : m.away.score) ?? 0) : undefined,
    goalsAgainst: m.state === 'finished' ? ((home ? m.away.score : m.home.score) ?? 0) : undefined,
    tv: m.state === 'finished' ? undefined : channelsFor(m).map((c) => c.name).join(', ') || undefined,
  }
}

/** The two teams' logos on a match in the mail */
async function withMatchLogos(d: DigestMatch, m: Match, isOwn: (name: string) => boolean): Promise<DigestMatch> {
  const [mine, theirs] = isOwn(m.home.name) ? [m.home, m.away] : [m.away, m.home]
  const [clubLogo, opponentLogo] = await Promise.all([logoOf(mine.name, mine.badge), logoOf(theirs.name, theirs.badge)])
  return { ...d, clubLogo, opponentLogo }
}

/** The club's row and the two above and below (five rows; at the top or bottom the five nearest) */
function around<T>(rows: T[], i: number): T[] {
  if (i < 0) return []
  const start = Math.max(0, Math.min(i - 2, rows.length - 5))
  return rows.slice(start, start + 5)
}

/**
 * A logo for the mail: an absolute PNG address. Our own logos (/api/logo/…) are asked for as a small PNG (the site serves
 * WebP or SVG, which many mail apps don't show); a source's own address is used when it already is a PNG or JPG.
 */
function mailLogo(url?: string): string | undefined {
  if (!url) return undefined
  if (url.startsWith('/api/logo/')) {
    const u = new URL(url, SITE_URL)
    u.searchParams.set('w', '64')
    u.searchParams.set('format', 'png')
    return u.toString()
  }
  // Another source's logo through our own domain (/billede/<id>), as a small PNG
  const own = url.startsWith('http') ? proxyImage(url) : url
  const id = /^\/billede\/([a-f0-9]{20})/.exec(own)?.[1]
  if (id) return `${SITE_URL}/billede/${id}-64.png`
  if (own.startsWith('/')) return /\.(png|jpe?g)(\?|$)/i.test(own) ? `${SITE_URL}${own}` : undefined
  return undefined
}

/** A team's logo for the mail, by the name the site shows (the logos the site's own badges use) */
async function logoOf(name: string, fallback?: string): Promise<string | undefined> {
  const badges = await getBadges().catch(() => ({}) as Record<string, string>)
  return mailLogo(badges[name] ?? fallback)
}

/** Our clubs' logos (the admin's, as on the site's table) on the mail's table rows */
async function withLogos(rows: DigestRow[]): Promise<DigestRow[]> {
  const badges = await getBadges().catch(() => ({}) as Record<string, string>)
  return rows.map((r) => ({ ...r, logo: mailLogo(badges[r.name]) }))
}

/** A team outside our leagues: its league's table as the club page has it (the source's own, else ours from the saved games) */
async function externalTable(t: TeamEntry, own: (name: string) => boolean): Promise<DigestRow[] | undefined> {
  if (!t.leagueSlug) return undefined
  if (cupOfGame({ sport: t.sport, league: { id: '', name: t.league, country: t.country } })) return undefined
  const keys = sameLeagueKeys(t.leagueSlug)
  const league = keys.map(externalLeague).find(Boolean)
  const divisionIds = [...new Set(keys.map(externalLeague).filter((l): l is NonNullable<typeof l> => !!l).map((l) => `ext-${l.api.split('-')[0]}-${l.id}`))]
  const baseline = BASELINES[t.leagueSlug]
  const fromApi = league ? await apiLeagueTable(league) : undefined
  const table = fromApi?.find((g) => g.some((r) => own(r.name))) ?? (divisionIds.length || baseline ? archiveLeagueTable(divisionIds, baseline).rows : [])
  const women = (n: string) => normalize(n.replace(/\b(w|women|q)\b\.?|\(k\)/gi, '').trim())
  const names = new Set((t.names ?? [t.name]).map(women))
  const i = table.findIndex((r) => own(r.name) || names.has(women(r.name)))
  if (i < 0 || table.length < 2) return undefined
  return around(table, i).map((r) => ({
    rank: r.rank,
    name: shownTeam(r.name, t.country),
    played: r.played,
    points: r.points,
    goalDiff: r.for !== undefined && r.against !== undefined ? r.for - r.against : undefined,
    logo: mailLogo(r.logo),
    me: r === table[i],
  }))
}

/** One club's part of the mail, from the site's own data */
export async function clubDigest(slug: string, now = Date.now()): Promise<ClubDigest | undefined> {
  const t = klubmailTeam(slug)
  if (!t) return undefined
  loadRealData()
  const name = klubmailName(t)
  if (t.season) {
    const { club, division } = t.season
    const own = (n: string) => n === club.name
    const all = [...new Map(clubMatches(club.name, now).map((m) => [m.id, m])).values()].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    const last = all.filter((m) => m.state === 'finished').at(-1)
    const next = all.find((m) => m.state === 'upcoming' && m.kickoff.getTime() > now)
    const rows = standings(division, now)
    const i = rows.findIndex((r) => r.club.id === club.id)
    const played = rows.some((r) => r.played > 0)
    return {
      slug: t.slug,
      name,
      league: division.name,
      last: last && (await withMatchLogos(asDigestMatch(last, own), last, own)),
      next: next && (await withMatchLogos(asDigestMatch(next, own), next, own)),
      table: played
        ? await withLogos(around(rows.map((r, k) => ({ rank: k + 1, name: r.club.name, played: r.played, points: r.points, goalDiff: r.goalsFor - r.goalsAgainst, form: r.form.slice(-5), me: r.club.id === club.id })), i))
        : undefined,
      articles: articlesAbout({ club }, 2).map((a) => ({ title: a.title, slug: a.slug })),
    }
  }
  const keys = new Set((t.names ?? [t.name]).map(normalize))
  const own = (n: string) => keys.has(normalize(n))
  const games = teamGames(t, now)
  const last = games.filter((m) => m.state === 'finished').at(-1)
  const next = games.find((m) => m.state === 'upcoming' && m.kickoff.getTime() > now)
  return {
    slug: t.slug,
    name,
    league: t.league,
    last: last && (await withMatchLogos(asDigestMatch(last, own), last, own)),
    next: next && (await withMatchLogos(asDigestMatch(next, own), next, own)),
    table: await externalTable(t, own).catch(() => undefined),
    articles: [],
  }
}

// ---- Sign-up, confirmation, unsubscribe ----

const confirmUrl = (token: string) => `${SITE_URL}/klubmail/bekraeft?t=${token}`
const unsubscribePage = (sub: Subscriber) => `${SITE_URL}/klubmail/afmeld?t=${sub.unsub}`
const unsubscribePost = (sub: Subscriber) => `${SITE_URL}/api/klubmail/afmeld?t=${sub.unsub}`

/** The form on the club pages and in Mine hold: stores the sign-up as pending and sends the confirmation mail */
export async function klubmailSignUp(email: string, slugs: string[], now = Date.now()): Promise<{ ok: true; already?: boolean } | { error: string; status: number }> {
  if (!validEmail(email)) return { error: 'Mailadressen ser forkert ud – tjek den lige.', status: 400 }
  const teams = [...new Set(slugs)].map(klubmailTeam).filter((t): t is TeamEntry => !!t)
  if (!teams.length) return { error: 'Mailen findes kun for fodboldklubber.', status: 400 }
  const store = klubmailStore()
  if (!store || !mailReady()) return { error: 'Tilmeldingen virker ikke lige nu – prøv igen senere.', status: 503 }
  store.expire(now)
  if (store.sentToday(now) >= dailyCap()) return { error: 'Vi har sendt rigtig mange mails i dag. Prøv igen i morgen.', status: 429 }
  const r = store.signUp(email, teams.map((t) => t.slug), now)
  // The same answer as a new sign-up: the form does not tell who is signed up already
  if (r.kind === 'already') return { ok: true, already: true }
  if (r.kind === 'limited') return { error: 'Vi har allerede sendt en bekræftelse til adressen i dag. Tjek din indbakke (og spam-mappen).', status: 429 }
  const names = r.sub.pending.map((s) => teamBySlug(s)).filter((t): t is TeamEntry => !!t).map(klubmailName)
  const mail = buildConfirmMail(names.length ? names : teams.map(klubmailName), { confirmUrl: confirmUrl(r.token), site: SITE_URL })
  try {
    const sent = await sendMail(mail.subject, mail.html, mail.text, { to: r.sub.email })
    store.noteConfirmMail(r.sub.email, now)
    if (!sent.accepted.length) return { error: 'Mailserveren afviste adressen – tjek den lige.', status: 400 }
  } catch (e) {
    console.error(`[klubmail] bekræftelse til ${maskEmail(r.sub.email)} kunne ikke sendes:`, e instanceof Error ? e.message : e)
    return { error: 'Mailen kunne ikke sendes lige nu – prøv igen om lidt.', status: 502 }
  }
  return { ok: true }
}

/** The confirmation link: the clubs it confirmed (by the names the site shows), or undefined for a wrong or expired link */
export function klubmailConfirm(token: string, now = Date.now()): { clubs: { slug: string; name: string }[] } | undefined {
  const store = klubmailStore()
  store?.expire(now)
  const s = store?.confirm(token, now)
  if (!s) return undefined
  const clubs = s.clubs.map((slug) => teamBySlug(slug)).filter((t): t is TeamEntry => !!t).map((t) => ({ slug: t.slug, name: klubmailName(t) }))
  // The very first confirmed subscriber: a mail to the owner (their wish 12/10-2026), once
  if (store && !store.getMeta<number>('firstConfirmedMailed') && mailReady()) {
    store.setMeta('firstConfirmedMailed', now)
    const names = clubs.map((c) => c.name).join(', ') || 'en klub'
    const text = `Den første har tilmeldt sig og bekræftet "Din klub i indbakken": ${maskEmail(s.email)} følger ${names}.\n\nSe tallene: ${SITE_URL}/admin/klubmail\n\nJames, Matchly`
    const html = `<p>Den første har tilmeldt sig og bekræftet <b>Din klub i indbakken</b>: ${maskEmail(s.email)} følger <b>${names.replace(/[<>&]/g, '')}</b>.</p><p><a href="${SITE_URL}/admin/klubmail">Se tallene på /admin/klubmail</a></p><p>James, Matchly</p>`
    sendMail('Matchly: den første har tilmeldt sig klubmailen', html, text).catch((e) => console.log(`[klubmail] mail om første tilmelding fejlede: ${e instanceof Error ? e.message : e}`))
  }
  return { clubs }
}

/** The unsubscribe link: the address is deleted; the clubs it had, or undefined when the link is unknown */
export function klubmailUnsubscribe(token: string, now = Date.now()): { clubs: string[] } | undefined {
  const s = klubmailStore()?.unsubscribe(token, now)
  if (!s) return undefined
  return { clubs: s.clubs.map((slug) => teamBySlug(slug)).filter((t): t is TeamEntry => !!t).map(klubmailName) }
}

// ---- The weekly mail ----

/** The mail for a list of clubs (the subscriber's own unsubscribe link, or the page's when it is a preview) */
export async function klubmailMail(slugs: string[], unsubscribeUrl: string, now = Date.now(), digests = new Map<string, Promise<ClubDigest | undefined>>()): Promise<MailParts | undefined> {
  const list = (await Promise.all(slugs.map((s) => digests.get(s) ?? digests.set(s, clubDigest(s, now)).get(s)!))).filter((d): d is ClubDigest => !!d)
  if (!list.length || !list.some(hasNews)) return undefined
  const week = sendWindow(now)?.week ?? isoWeek(isoDate(now))
  return buildWeeklyMail(list, { site: SITE_URL, unsubscribeUrl, week, now })
}

/** A refused address (the server said no to the recipient) as opposed to a server that could not be reached */
const refusedAddress = (e: unknown) => {
  const x = e as { code?: string; command?: string; responseCode?: number }
  return x.code === 'EENVELOPE' || (x.command === 'RCPT TO' && (x.responseCode ?? 0) >= 500)
}

export interface KlubmailRun extends RunResult {
  at: number
}

let running = false

/** One run of the weekly queue (does nothing outside Monday 07.00 – Wednesday, or when it is already running) */
export async function runKlubmail(now = Date.now): Promise<KlubmailRun | undefined> {
  const store = klubmailStore()
  if (!store || running || !mailReady()) return undefined
  running = true
  try {
    store.expire(now())
    const digests = new Map<string, Promise<ClubDigest | undefined>>()
    const res = await runWeekly(store, {
      now,
      cap: dailyCap(),
      reserve: RESERVE,
      gapMs: GAP_MS,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      send: async (sub) => {
        const mail = await klubmailMail(sub.clubs, unsubscribePage(sub), now(), digests)
        if (!mail) return 'skip'
        try {
          const r = await sendMail(mail.subject, mail.html, mail.text, {
            to: sub.email,
            headers: { 'List-Unsubscribe': `<${unsubscribePost(sub)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          })
          return r.accepted.length ? 'ok' : 'refused'
        } catch (e) {
          if (refusedAddress(e)) {
            console.error(`[klubmail] ${maskEmail(sub.email)} afvist af mailserveren`)
            return 'refused'
          }
          throw e
        }
      },
    })
    if (res.stopped === 'outside') return undefined
    const run: KlubmailRun = { ...res, at: now() }
    // Only a run that did something (or stopped for a reason) replaces the last one shown in admin
    if (res.sent || res.refused || res.skipped || res.stopped !== 'done') {
      store.setMeta('lastRun', run)
      console.log(`[klubmail] ${res.week}: ${res.sent} sendt, ${res.refused} afvist, ${res.skipped} uden nyt, ${res.left} venter${res.stopped === 'cap' ? ' (dagens loft)' : ''}${res.error ? ` – fejl: ${res.error}` : ''}`)
    }
    return run
  } finally {
    running = false
  }
}

let started = false

/** The weekly mail's clock (in the process with the jobs): every 5 minutes, sending only from Monday 07.00 */
export function startKlubmail() {
  if (started || process.env.KLUBMAIL === 'off') return
  started = true
  const tick = () => void runKlubmail().catch((e) => console.error('[klubmail]', e instanceof Error ? e.message : e))
  setTimeout(tick, 2 * 60_000).unref?.()
  setInterval(tick, 5 * 60_000).unref?.()
}

// ---- Admin ----

/** "Send testmail til mig": the mail for a club to the owner's own address (no subscriber gets anything) */
export async function klubmailTestMail(slug: string) {
  const mail = await klubmailMail([slug], `${SITE_URL}/klubmail/afmeld`)
  if (!mail) throw new Error('Klubben har ingen kampe eller stilling at skrive om lige nu')
  return sendMail(`[Test] ${mail.subject}`, mail.html, mail.text)
}

/** For /admin/klubmail */
export function klubmailStatus(now = Date.now()) {
  const store = klubmailStore()
  if (!store) return undefined
  const stats = store.stats(now)
  const lastRun = store.getMeta<KlubmailRun>('lastRun')
  const week = sendWindow(now)?.week ?? lastRun?.week
  return {
    ...stats,
    lastRun,
    week,
    sentThisWeek: week ? store.sentInWeek(week) : 0,
    sentToday: store.sentToday(now),
    cap: dailyCap(),
    clubs: Object.entries(stats.perClub)
      .map(([slug, n]) => {
        const t = teamBySlug(slug)
        return { slug, name: t ? klubmailName(t) : slug, href: paths.club(slug), ...n }
      })
      .sort((a, b) => b.confirmed - a.confirmed || b.pending - a.pending || a.name.localeCompare(b.name, 'da')),
  }
}
