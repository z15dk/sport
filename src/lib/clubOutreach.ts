import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CLUB_CONTACTS, type ClubContact } from '../data/clubContacts'
import { mailReady, sendMail } from './mail'
import { SITE_URL } from './site'
import { socialConfig } from './socialStore'
import { cacheDir } from './tsdb'

// The mail to the clubs of 1.–3. division about their Matchly page and the free table widget, sent by the owner
// from /admin/klubkontakt through the site's own mail set-up: the text filled in per club (and editable before
// sending), what was sent to whom, the club's answer as a note, and at most 10 a day so it never looks like spam.

export const DAILY_LIMIT = 10

interface Sent {
  at: number
  to: string
  subject: string
}

interface State {
  sent: Record<string, Sent[]>
  notes: Record<string, string>
  /** An address the owner changed for a club */
  emails: Record<string, string>
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'klubkontakt.json')

export function readOutreach(): State {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Partial<State>
    return { sent: s.sent ?? {}, notes: s.notes ?? {}, emails: s.emails ?? {} }
  } catch {
    return { sent: {}, notes: {}, emails: {} }
  }
}

function save(s: State) {
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(s, null, 2))
}

const danishDay = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(ms))

export function sentToday(s = readOutreach(), now = Date.now()) {
  const today = danishDay(now)
  return Object.values(s.sent)
    .flat()
    .filter((x) => danishDay(x.at) === today).length
}

export const contactEmail = (c: ClubContact, s = readOutreach()) => s.emails[c.slug] ?? c.email

/** The mail for one club, as the page shows it to be read and changed */
export function outreachMail(c: ClubContact): { subject: string; body: string } {
  return {
    subject: `Gratis live-tabel til ${c.name}s hjemmeside`,
    body: `Hej ${c.name}

Jeg hedder Rune og står bag Matchly.dk – en dansk side med livescore, stillinger og artikler, hvor de danske rækker får lige så meget plads som Superligaen.

${c.name} har sin egen side hos os med kampprogram, resultater, stilling, statistik og trup:
${SITE_URL}/klub/${c.slug}

Vi har lavet en gratis live-tabel, som I kan sætte på jeres hjemmeside. Den opdaterer sig selv efter hver kamp, kan fremhæve ${c.name} og kan sættes til jeres farver. Det tager to minutter at sætte den ind:
${SITE_URL}/widget

Vi skriver også optakter og kampreferater fra rækken, og I er meget velkomne til at dele dem med jeres fans.

Sig endelig til, hvis noget om klubben er forkert hos os, fx træner eller stadion. Så retter vi det med det samme.

Sportslige hilsner
Rune
Matchly.dk`,
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Plain text as a simple mail: paragraphs, line breaks and the links clickable */
const asHtml = (text: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#16181a;max-width:600px">${text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>')}</p>`)
    .join('')}</div>`

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i

export async function sendOutreach(slug: string, to: string, subject: string, body: string, again = false) {
  const c = CLUB_CONTACTS.find((x) => x.slug === slug)
  if (!c) throw new Error('Ukendt klub')
  if (!EMAIL.test(to.trim())) throw new Error('Mailadressen ser forkert ud')
  if (!subject.trim() || body.trim().length < 40) throw new Error('Emne og tekst skal udfyldes')
  if (!mailReady()) throw new Error('Mail er ikke sat op (Sociale medier → Indstillinger)')
  const s = readOutreach()
  if (s.sent[slug]?.length && !again) throw new Error(`${c.name} har allerede fået mailen`)
  if (sentToday(s) >= DAILY_LIMIT) throw new Error(`Der er sendt ${DAILY_LIMIT} i dag – resten i morgen, så det ikke ligner spam`)
  const { email } = socialConfig()
  const r = await sendMail(subject.trim(), asHtml(body.trim()), body.trim(), { to: to.trim(), replyTo: email.from || email.user })
  if (!r.accepted.length) throw new Error(`Mailserveren afviste ${to}`)
  s.sent[slug] = [...(s.sent[slug] ?? []), { at: Date.now(), to: to.trim(), subject: subject.trim() }]
  if (to.trim() !== c.email) s.emails[slug] = to.trim()
  save(s)
  return r
}

export function setOutreachNote(slug: string, note: string) {
  const s = readOutreach()
  if (note.trim()) s.notes[slug] = note.trim().slice(0, 500)
  else delete s.notes[slug]
  save(s)
}
