import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { dataDir } from './config.ts'
import type { Db } from './db.ts'

// The morning report: what the night brought (new photos per match, review queue,
// errors, deleted loans, loans running out within 7 days). Mailed at 06:15 with
// the SMTP settings from /admin/sociale/indstillinger, and shown in admin.

export interface Report {
  since: string
  newByMatch: { match: string; count: number; review: number }[]
  newTotal: number
  reviewQueue: number
  errors: { path: string; error: string }[]
  deleted: number
  expiringSoon: { path: string; credit: string; until: string }[]
  stoppedBecause?: string
}

export function buildReport(db: Db, since: string): Report {
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const newByMatch = db
    .prepare(
      `SELECT COALESCE(club, '?') || ' – ' || COALESCE(opponent, '?') || ' ' || COALESCE(match_date, '') m, COUNT(*) n, SUM(review) r
       FROM photos WHERE processed_at >= ? AND status IN ('tagget', 'godkendt') GROUP BY m ORDER BY n DESC`,
    )
    .all(since)
    .map((r) => ({ match: String(r.m), count: Number(r.n), review: Number(r.r ?? 0) }))
  const last = db.prepare(`SELECT value FROM meta WHERE key = 'last_run'`).get()?.value
  return {
    since,
    newByMatch,
    newTotal: newByMatch.reduce((a, m) => a + m.count, 0),
    reviewQueue: Number(db.prepare(`SELECT COUNT(*) n FROM photos WHERE review = 1 AND status = 'tagget'`).get()?.n ?? 0),
    errors: db
      .prepare(`SELECT path, error FROM photos WHERE status = 'fejl' AND created_at >= ? ORDER BY id DESC LIMIT 20`)
      .all(since)
      .map((r) => ({ path: String(r.path), error: String(r.error ?? '') })),
    deleted: Number(db.prepare(`SELECT COUNT(*) n FROM photos WHERE status = 'slettet' AND deleted_at >= ?`).get(since)?.n ?? 0),
    expiringSoon: db
      .prepare(`SELECT path, credit, license_until FROM photos WHERE license_until IS NOT NULL AND license_until <= ? AND status != 'slettet' ORDER BY license_until LIMIT 20`)
      .all(soon)
      .map((r) => ({ path: String(r.path), credit: String(r.credit ?? ''), until: String(r.license_until) })),
    stoppedBecause: last ? (JSON.parse(String(last)) as { stoppedBecause?: string }).stoppedBecause : undefined,
  }
}

/** Nothing new and nothing to act on: no mail */
export const reportWorthSending = (r: Report) => r.newTotal > 0 || r.errors.length > 0 || r.expiringSoon.length > 0 || r.deleted > 0

export function reportText(r: Report, adminUrl: string): { subject: string; text: string; html: string } {
  const lines: string[] = []
  if (r.newTotal) {
    lines.push(`${r.newTotal} nye billeder:`)
    for (const m of r.newByMatch) lines.push(`  ${m.match}: ${m.count}${m.review ? ` (${m.review} til gennemgang)` : ''}`)
  } else lines.push('Ingen nye billeder i nat.')
  lines.push(`Gennemgangskø: ${r.reviewQueue}`)
  if (r.errors.length) {
    lines.push('', `Fejl (${r.errors.length}):`)
    for (const e of r.errors) lines.push(`  ${e.path}: ${e.error}`)
  }
  if (r.deleted) lines.push('', `${r.deleted} lånte billeder slettet (låneperioden udløb).`)
  if (r.expiringSoon.length) {
    lines.push('', 'Lån der udløber inden for 7 dage:')
    for (const e of r.expiringSoon) lines.push(`  ${e.until}: ${e.path} (${e.credit})`)
  }
  if (r.stoppedBecause) lines.push('', `Seneste kørsel stoppede: ${r.stoppedBecause}`)
  lines.push('', `Admin: ${adminUrl}`)
  const text = lines.join('\n')
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.5"><pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre></div>`
  const subject = r.newTotal ? `Matchly billeder: ${r.newTotal} nye${r.reviewQueue ? `, ${r.reviewQueue} til gennemgang` : ''}` : r.errors.length ? `Matchly billeder: ${r.errors.length} fejl` : 'Matchly billeder: morgenrapport'
  return { subject, text, html }
}

/** The SMTP settings typed in on /admin/sociale/indstillinger (the job runs outside Next, so they are read here) */
export function mailSettings() {
  const dir = process.env.SOCIAL_DIR ?? path.join(dataDir(), 'social')
  const read = (f: string) => {
    try {
      return existsSync(path.join(dir, f)) ? (JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  const email = (read('config.json').email ?? {}) as { to?: string; from?: string; host?: string; port?: number; user?: string; secure?: boolean }
  const pass = ((read('secrets.json').smtp ?? {}) as { pass?: string }).pass
  const to = process.env.PHOTOS_REPORT_TO || email.to
  const ready = !!(email.host && to && (email.from || email.user))
  return { ready, to, email, pass }
}

export async function sendReportMail(subject: string, text: string, html: string) {
  const m = mailSettings()
  if (!m.ready) throw new Error('Mail er ikke sat op (Sociale medier → Indstillinger → Mail)')
  const nodemailer = (await import('nodemailer')).default
  const transport = nodemailer.createTransport({
    host: m.email.host,
    port: m.email.port || 587,
    secure: m.email.secure || m.email.port === 465,
    auth: m.email.user ? { user: m.email.user, pass: m.pass ?? '' } : undefined,
  })
  await transport.sendMail({ from: m.email.from || m.email.user, to: m.to, subject, text, html })
}
