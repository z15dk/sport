// The club mail's text, from the site's own data (no LLM): per club the last result, the next match with day, time and
// TV channel, the place in the table with the two clubs above and below, and up to two of our newest articles about
// the club. HTML for Gmail and phones (tables and inline styles only, 600 px, Matchly's dark and lime) and a plain-text
// version; every link back to the site carries ?utm_source=klubmail&utm_medium=email. Signed by James.
// Also the confirmation mail of the double opt-in. Pure (tests/klubmail); the data comes from src/lib/klubmail/server.ts.

import { formatTime } from '../time.ts'

export interface DigestMatch {
  /** The match page (`/kamp/<slug>`), when the match has one */
  slug?: string
  kickoff: number
  league: string
  /** Seen from the club: home or away, the opponent, and the score (own goals first) when played */
  home: boolean
  opponent: string
  goalsFor?: number
  goalsAgainst?: number
  tv?: string
}

export interface DigestRow {
  rank: number
  name: string
  played: number
  points?: number
  /** The club itself */
  me: boolean
}

export interface DigestArticle {
  title: string
  slug: string
}

export interface ClubDigest {
  slug: string
  /** As the site shows it ("Brøndby IF (K)", "Danmarks landshold") */
  name: string
  league?: string
  last?: DigestMatch
  next?: DigestMatch
  /** The club's row and the two above and below */
  table?: DigestRow[]
  articles: DigestArticle[]
}

/** Whether a club has anything to tell this week */
export const hasNews = (d: ClubDigest) => !!(d.last || d.next || d.table?.length)

const C = { bg: '#eceee7', ink: '#0f110c', ink2: '#5a5f55', line: '#e1e4da', lime: '#c6f135', limeDeep: '#5d7800', surface: '#ffffff', soft: '#f4f5f0', win: '#2fa84f', draw: '#8a8f82', loss: '#e0401a' }
const FONT = "Arial,'Helvetica Neue',Helvetica,sans-serif"

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A link back to the site, marked as coming from the mail */
export function tracked(url: string): string {
  const [base, hash] = url.split('#')
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}utm_source=klubmail&utm_medium=email${hash ? `#${hash}` : ''}`
}

const weekdayFmt = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'long' })
const dayMonthFmt = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short' })
const longFmt = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'long', day: 'numeric', month: 'long' })

/** "15" for 15.00, "15.30" otherwise */
const hourText = (d: Date) => formatTime(d).replace(/\.00$/, '')

/** "lørdag kl. 15" within the coming week, "lørdag 24. okt. kl. 15" after */
export function whenShort(kickoff: number, now: number): string {
  const d = new Date(kickoff)
  const soon = kickoff - now < 6 * 86_400_000
  return `${weekdayFmt.format(d)}${soon ? '' : ` ${dayMonthFmt.format(d)}`} kl. ${hourText(d)}`
}

/** "lørdag 17. oktober kl. 15.00" */
export const whenLong = (kickoff: number) => `${longFmt.format(new Date(kickoff))} kl. ${formatTime(new Date(kickoff))}`

const outcome = (m: DigestMatch) => (m.goalsFor! > m.goalsAgainst! ? 'V' : m.goalsFor! < m.goalsAgainst! ? 'T' : 'U')
const score = (m: DigestMatch) => `${m.goalsFor}-${m.goalsAgainst}`
const played = (m?: DigestMatch): m is DigestMatch => !!m && m.goalsFor !== undefined && m.goalsAgainst !== undefined

/** "FC København: 2-1 mod Brøndby IF – næste kamp lørdag kl. 15 på TV3+", with the other clubs after it */
export function mailSubject(digests: ClubDigest[], now: number): string {
  const first = digests.find(hasNews) ?? digests[0]
  if (!first) return 'Din klub i indbakken'
  const others = digests.filter((d) => d !== first)
  const tail = others.length === 1 ? ` · og ${others[0].name}` : others.length > 1 ? ` · og ${others.length} hold mere` : ''
  const last = played(first.last) ? `${score(first.last)} mod ${first.last.opponent}` : ''
  const next = first.next ? `næste kamp ${whenShort(first.next.kickoff, now)}` : ''
  // The first channel only ("TV3+", not "TV3+, Viaplay"): the subject has to stay short
  const tv = first.next?.tv ? ` på ${first.next.tv.split(', ')[0]}` : ''
  const tries = [
    last && next ? `${first.name}: ${last} – ${next}${tv}${tail}` : '',
    last && next ? `${first.name}: ${last} – ${next}${tv}` : '',
    last && next ? `${first.name}: ${last} – ${next}` : '',
    !last && next ? `${first.name}: ${next} mod ${first.next!.opponent}${tv}${tail}` : '',
    !last && next ? `${first.name}: ${next} mod ${first.next!.opponent}${tv}` : '',
    last && !next ? `${first.name}: ${last} – og stillingen${tail}` : '',
    last && !next ? `${first.name}: ${last} – og stillingen` : '',
  ].filter(Boolean)
  return tries.find((t) => t.length <= 110) ?? tries.at(-1) ?? `${first.name}: ugens overblik${tail}`
}

// ---- HTML ----

const link = (href: string, text: string, style = '') => `<a href="${esc(href)}" style="color:${C.ink};font-weight:bold;text-decoration:underline;${style}">${text}</a>`

function label(text: string) {
  return `<p style="margin:18px 0 6px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${C.ink2}">${esc(text)}</p>`
}

function lastHtml(d: ClubDigest, site: string) {
  const m = d.last
  if (!played(m)) return ''
  const o = outcome(m)
  const color = o === 'V' ? C.win : o === 'T' ? C.loss : C.draw
  const word = o === 'V' ? 'Sejr' : o === 'T' ? 'Nederlag' : 'Uafgjort'
  const href = m.slug ? tracked(`${site}/kamp/${m.slug}`) : undefined
  return `${label('Seneste resultat')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${C.soft};border-radius:12px"><tr>
<td width="64" style="padding:12px 0 12px 12px;vertical-align:middle"><span style="display:inline-block;min-width:44px;padding:8px 6px;border-radius:10px;background:${color};color:#ffffff;font-family:${FONT};font-size:20px;font-weight:bold;font-style:italic;text-align:center">${esc(score(m))}</span></td>
<td style="padding:12px;vertical-align:middle;font-family:${FONT};font-size:15px;line-height:1.4;color:${C.ink}"><strong>${word} ${m.home ? 'hjemme' : 'ude'} mod ${esc(m.opponent)}</strong><br><span style="font-size:13px;color:${C.ink2}">${esc(longFmt.format(new Date(m.kickoff)))} · ${esc(m.league)}</span>${href ? `<br>${link(href, 'Se kampen →', 'font-size:13px')}` : ''}</td>
</tr></table>`
}

function nextHtml(d: ClubDigest, site: string) {
  const m = d.next
  if (!m) return ''
  const href = m.slug ? tracked(`${site}/kamp/${m.slug}`) : undefined
  return `${label('Næste kamp')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${C.ink};border-radius:12px"><tr>
<td style="padding:14px 16px;font-family:${FONT};font-size:15px;line-height:1.45;color:#ffffff">
<span style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${C.lime}">${esc(whenLong(m.kickoff))}</span><br>
<strong style="font-size:17px">${m.home ? 'Hjemme' : 'Ude'} mod ${esc(m.opponent)}</strong><br>
<span style="font-size:13px;color:#c9cdbd">${esc(m.league)}${m.tv ? ` · TV: <strong style="color:#ffffff">${esc(m.tv)}</strong>` : ''}</span>${href ? `<br><a href="${esc(href)}" style="font-size:13px;font-weight:bold;color:${C.lime};text-decoration:underline">Til kampen →</a>` : ''}
</td></tr></table>`
}

function tableHtml(d: ClubDigest) {
  const rows = d.table
  if (!rows?.length) return ''
  const me = rows.find((r) => r.me)
  const pts = rows.some((r) => r.points !== undefined)
  const cell = `font-family:${FONT};font-size:14px;padding:7px 8px;border-bottom:1px solid ${C.line}`
  return `${label(me ? `Stillingen · nr. ${me.rank}${me.points !== undefined ? ` med ${me.points} point` : ''}` : 'Stillingen')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
<tr><td style="${cell};font-size:11px;color:${C.ink2};width:28px">#</td><td style="${cell};font-size:11px;color:${C.ink2}">Hold</td><td style="${cell};font-size:11px;color:${C.ink2};text-align:right;width:32px">K</td>${pts ? `<td style="${cell};font-size:11px;color:${C.ink2};text-align:right;width:36px">P</td>` : ''}</tr>
${rows
  .map((r) => {
    const bg = r.me ? `background:${C.lime};font-weight:bold;` : ''
    return `<tr><td style="${cell};${bg}">${r.rank}</td><td style="${cell};${bg}">${esc(r.name)}</td><td style="${cell};${bg}text-align:right">${r.played}</td>${pts ? `<td style="${cell};${bg}text-align:right;font-weight:bold">${r.points ?? ''}</td>` : ''}</tr>`
  })
  .join('\n')}
</table>`
}

function articlesHtml(d: ClubDigest, site: string) {
  if (!d.articles.length) return ''
  return `${label('Nyt på Matchly')}
${d.articles.map((a) => `<p style="margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:1.4">${link(tracked(`${site}/artikler/${a.slug}`), esc(a.title))}</p>`).join('\n')}`
}

function clubHtml(d: ClubDigest, site: string) {
  const empty = !hasNews(d)
  return `<tr><td style="padding:0 16px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${C.surface};border-radius:16px"><tr><td style="padding:20px 20px 22px">
<h2 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.15;font-style:italic;font-weight:bold;text-transform:uppercase;color:${C.ink}">${esc(d.name)}</h2>
${d.league ? `<p style="margin:4px 0 0;font-family:${FONT};font-size:13px;color:${C.ink2}">${esc(d.league)}</p>` : ''}
${empty ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:15px;color:${C.ink}">Ingen kampe i kalenderen lige nu. Vi skriver igen, når der er nyt.</p>` : ''}
${lastHtml(d, site)}
${nextHtml(d, site)}
${tableHtml(d)}
${articlesHtml(d, site)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px"><tr><td style="background:${C.lime};border-radius:999px"><a href="${esc(tracked(`${site}/klub/${d.slug}`))}" style="display:inline-block;padding:11px 20px;font-family:${FONT};font-size:14px;font-weight:bold;color:${C.ink};text-decoration:none">Alt om ${esc(d.name)} →</a></td></tr></table>
</td></tr></table>
</td></tr>`
}

export interface MailParts {
  subject: string
  html: string
  text: string
}

/** The weekly mail for one subscriber: all their clubs in one mail */
export function buildWeeklyMail(digests: ClubDigest[], o: { site: string; unsubscribeUrl: string; week: string; now: number }): MailParts {
  const subject = mailSubject(digests, o.now)
  const names = digests.map((d) => d.name)
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} og ${names[1]}` : 'dine hold'
  const weekNo = Number(o.week.split('-W')[1])
  const pre = `Ugens overblik over ${who}: resultat, næste kamp og stillingen.`
  const html = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${C.bg}">
<tr><td style="padding:0 16px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${C.ink};border-radius:16px"><tr><td style="padding:22px 20px">
<a href="${esc(tracked(`${o.site}/`))}" style="font-family:${FONT};font-size:26px;font-weight:bold;font-style:italic;letter-spacing:-0.5px;color:#ffffff;text-decoration:none">MATCHLY<span style="color:${C.lime}">.</span></a>
<p style="margin:8px 0 0;font-family:${FONT};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${C.lime}">Din klub i indbakken · uge ${weekNo}</p>
<p style="margin:10px 0 0;font-family:${FONT};font-size:15px;line-height:1.5;color:#ffffff">Godmorgen. Her er ugens overblik over ${esc(who)}.</p>
</td></tr></table>
</td></tr>
${digests.map((d) => clubHtml(d, o.site)).join('\n')}
<tr><td style="padding:4px 28px 28px;font-family:${FONT};font-size:15px;line-height:1.5;color:${C.ink}">
<p style="margin:0 0 14px">Hav en god fodbolduge.</p>
<p style="margin:0 0 22px">Hilsen<br><strong>James, Matchly</strong></p>
<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${C.ink2}">Du får mailen hver mandag, fordi du har tilmeldt dig på matchly.dk. Live-stilling og alle kampe: ${link(tracked(`${o.site}/`), 'matchly.dk', 'font-weight:normal;color:#5a5f55')}.</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${C.ink2}"><a href="${esc(o.unsubscribeUrl)}" style="color:${C.ink2};text-decoration:underline">Afmeld med ét klik</a> · <a href="${esc(`${o.site}/privatliv`)}" style="color:${C.ink2};text-decoration:underline">Privatliv</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
  return { subject, html, text: buildWeeklyText(digests, o, who) }
}

function buildWeeklyText(digests: ClubDigest[], o: { site: string; unsubscribeUrl: string; week: string; now: number }, who: string) {
  const parts = [`MATCHLY · Din klub i indbakken · uge ${Number(o.week.split('-W')[1])}`, '', `Godmorgen. Her er ugens overblik over ${who}.`]
  for (const d of digests) {
    parts.push('', `== ${d.name.toUpperCase()} ==${d.league ? `\n${d.league}` : ''}`)
    if (!hasNews(d)) parts.push('Ingen kampe i kalenderen lige nu. Vi skriver igen, når der er nyt.')
    if (played(d.last)) {
      const m = d.last
      const word = outcome(m) === 'V' ? 'Sejr' : outcome(m) === 'T' ? 'Nederlag' : 'Uafgjort'
      parts.push('', `Seneste resultat: ${word} ${score(m)} ${m.home ? 'hjemme' : 'ude'} mod ${m.opponent} (${longFmt.format(new Date(m.kickoff))}, ${m.league})`)
      if (m.slug) parts.push(tracked(`${o.site}/kamp/${m.slug}`))
    }
    if (d.next) {
      const m = d.next
      parts.push('', `Næste kamp: ${m.home ? 'hjemme' : 'ude'} mod ${m.opponent} ${whenLong(m.kickoff)} (${m.league}${m.tv ? `, TV: ${m.tv}` : ''})`)
      if (m.slug) parts.push(tracked(`${o.site}/kamp/${m.slug}`))
    }
    if (d.table?.length) {
      parts.push('', 'Stillingen:')
      for (const r of d.table) parts.push(`${r.me ? '>' : ' '} ${String(r.rank).padStart(2)}. ${r.name} – ${r.played} kampe${r.points !== undefined ? `, ${r.points} point` : ''}`)
    }
    if (d.articles.length) {
      parts.push('', 'Nyt på Matchly:')
      for (const a of d.articles) parts.push(`- ${a.title}: ${tracked(`${o.site}/artikler/${a.slug}`)}`)
    }
    parts.push('', `Alt om ${d.name}: ${tracked(`${o.site}/klub/${d.slug}`)}`)
  }
  parts.push('', 'Hav en god fodbolduge.', '', 'Hilsen', 'James, Matchly', '', 'Du får mailen hver mandag, fordi du har tilmeldt dig på matchly.dk.', `Afmeld med ét klik: ${o.unsubscribeUrl}`)
  return parts.join('\n')
}

/** The confirmation mail of the double opt-in */
export function buildConfirmMail(names: string[], o: { confirmUrl: string; site: string }): MailParts {
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`
  const subject = `Bekræft: ${who} i din indbakke hver mandag`
  const html = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border-collapse:separate;background:${C.surface};border-radius:16px"><tr><td style="padding:26px 24px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.ink}">
<p style="margin:0 0 16px;font-size:24px;font-weight:bold;font-style:italic">MATCHLY<span style="color:${C.limeDeep}">.</span></p>
<p style="margin:0 0 14px">Hej</p>
<p style="margin:0 0 14px">Tak fordi du vil have <strong>${esc(who)}</strong> i din indbakke. Tryk på knappen for at bekræfte, så får du den første mail næste mandag morgen: sidste resultat, næste kamp med TV-kanal og stillingen.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px"><tr><td style="background:${C.ink};border-radius:999px"><a href="${esc(o.confirmUrl)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.lime};text-decoration:none">Ja tak, bekræft min tilmelding</a></td></tr></table>
<p style="margin:0 0 14px;font-size:13px;color:${C.ink2}">Virker knappen ikke, så kopier linket: ${esc(o.confirmUrl)}</p>
<p style="margin:0 0 14px;font-size:13px;color:${C.ink2}">Har du ikke selv bedt om det, så gør ingenting. Uden bekræftelse sletter vi adressen igen efter 7 dage.</p>
<p style="margin:0">Hilsen<br><strong>James, Matchly</strong></p>
</td></tr></table>
</td></tr></table>
</body></html>`
  const text = `Hej

Tak fordi du vil have ${who} i din indbakke. Bekræft din tilmelding her, så får du den første mail næste mandag morgen: sidste resultat, næste kamp med TV-kanal og stillingen.

${o.confirmUrl}

Har du ikke selv bedt om det, så gør ingenting. Uden bekræftelse sletter vi adressen igen efter 7 dage.

Hilsen
James, Matchly`
  return { subject, html, text }
}
