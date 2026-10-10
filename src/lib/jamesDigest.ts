import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { addCategory, allArticles } from './articles'
import { sendMail } from './mail'
import { SITE_URL, paths } from './site'
import { cacheDir } from './tsdb'

// The owner's daily spot check (the owner's word 10/10-2026): every morning from 08.00 one mail lists the previews and
// reports James published himself the day before, with a link each – to read a few and fix or take one down. State
// (the last day sent) in data/james-digest.json; JAMES_DIGEST=off stops it.

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'james-digest.json')
const CATS: Record<string, string> = { kampoptakter: 'Kampoptakter', referater: 'Referater', guides: 'Søgeartikler' }
const dayOf = (t: number) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
const hourOf = (t: number) => Number(new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hour12: false }))
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Sends the mail when it is past 08.00 and today's has not gone; returns how many articles it listed */
export async function sendJamesDigest(now = Date.now(), force = false): Promise<number> {
  const today = dayOf(now)
  let last: string | undefined
  try {
    last = (JSON.parse(readFileSync(file(), 'utf8')) as { day?: string }).day
  } catch {
    // never sent
  }
  if (!force && (last === today || hourOf(now) < 8)) return 0
  const since = now - 24 * 3_600_000
  const items = allArticles().filter((a) => a.status === 'published' && a.author === 'Matchly' && CATS[(a.category ?? '').toLowerCase()] && Date.parse(a.publishedAt ?? a.createdAt) >= since && Date.parse(a.publishedAt ?? a.createdAt) <= now)
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify({ day: today, count: items.length }))
  if (!items.length) return 0
  const groups = Object.entries(CATS)
    .map(([key, label]) => ({ label, list: items.filter((a) => (a.category ?? '').toLowerCase() === key) }))
    .filter((g) => g.list.length)
  const html = [
    `<p>James udgav ${items.length} ${items.length === 1 ? 'artikel' : 'artikler'} det sidste døgn. Læs et par stykker – ret dem i admin, eller tag en af, hvis den ikke holder.</p>`,
    ...groups.map((g) => `<h3>${g.label} (${g.list.length})</h3><ul>${g.list.map((a) => `<li><a href="${SITE_URL}${paths.article(a.slug)}">${esc(a.title)}</a> · <a href="${SITE_URL}/admin/artikler/${a.id}">ret</a></li>`).join('')}</ul>`),
  ].join('')
  const text = groups.map((g) => `${g.label}:\n${g.list.map((a) => `- ${a.title}: ${SITE_URL}${paths.article(a.slug)}`).join('\n')}`).join('\n\n')
  await sendMail(`Matchly: James udgav ${items.length} ${items.length === 1 ? 'artikel' : 'artikler'} i går – stikprøver`, html, text)
  return items.length
}

let started = false

export function startJamesDigest() {
  if (started || process.env.JAMES_DIGEST === 'off') return
  started = true
  // James' own categories (hidden from the article lists, src/lib/articles.ts HIDDEN_CATEGORIES)
  addCategory('Kampoptakter')
  addCategory('Guides')
  const tick = () => void sendJamesDigest().catch(() => undefined)
  setTimeout(tick, 3 * 60_000).unref?.()
  setInterval(tick, 15 * 60_000).unref?.()
}
