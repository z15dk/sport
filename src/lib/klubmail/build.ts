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
  /** The two teams' logos as absolute PNG addresses (mail apps show neither WebP nor SVG) */
  clubLogo?: string
  opponentLogo?: string
}

export interface DigestRow {
  rank: number
  name: string
  played: number
  points?: number
  /** Goals for minus against, when known */
  goalDiff?: number
  /** The last five results, oldest first, as on the site's table */
  form?: ('V' | 'U' | 'T')[]
  /** The club's logo as an absolute PNG/JPG address (mail apps show neither WebP nor SVG) */
  logo?: string
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
/** The site's headline font where the mail app loads web fonts (Apple Mail, iOS); others fall back to Arial */
const DISPLAY = "'Barlow Condensed','Arial Narrow',Arial,sans-serif"

/**
 * The mails' <head>: always the light Matchly design. Mail apps in dark mode (Apple Mail, Outlook) otherwise turn the
 * light grey and white into dark grey (the owner saw the confirmation mail dark, 12/10-2026); "light only" asks them not to,
 * and the classes hold the colours where an app still tries.
 */
const head = (title: string) => `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&display=swap');:root{color-scheme:light only;supported-color-schemes:light}
@media (prefers-color-scheme:dark){.m-bg{background:${C.bg}!important}.m-card{background:${C.surface}!important}.m-lime{background:${C.lime}!important}.m-ink{color:${C.ink}!important}.m-ink2{color:${C.ink2}!important}}
[data-ogsc] .m-bg{background:${C.bg}!important}[data-ogsc] .m-card{background:${C.surface}!important}[data-ogsc] .m-lime{background:${C.lime}!important}[data-ogsc] .m-ink{color:${C.ink}!important}
@media (max-width:420px){.m-hide{display:none!important}}</style></head>`

/** The top of every mail: the lime band with the logo (public/mailgrafik/matchly-logo.png, the site's Barlow Condensed 800 italic drawn as PNG, since mail apps can't load the font) and the big outlined M cut off at the bottom, as the site's own top (public/mailgrafik/m-outline.png; not under /mail/, which nginx sends elsewhere – mail apps don't show SVG) */
const logoBand = (site: string, label: string, line?: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="m-lime" style="border-collapse:separate;background:${C.lime};border-radius:16px"><tr><td style="padding:20px 0 20px 22px;vertical-align:top">
<a href="${esc(tracked(`${site}/`))}" style="text-decoration:none"><img src="${esc(`${site}/mailgrafik/matchly-logo.png`)}" width="144" height="32" alt="MATCHLY." style="display:block;border:0;width:144px;height:32px;font-family:${FONT};font-size:24px;font-weight:900;font-style:italic;color:${C.ink}"></a>
<p class="m-ink" style="margin:10px 0 0;font-family:${FONT};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${C.ink}">${esc(label)}</p>${line ? `
<p class="m-ink" style="margin:10px 0 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${C.ink}">${line}</p>` : ''}
</td>
<td width="150" style="padding:0 6px 0 0;vertical-align:bottom;text-align:right"><img src="${esc(`${site}/mailgrafik/m-outline.png`)}" width="150" height="100" alt="" style="display:block;border:0;width:150px;height:100px"></td>
</tr></table>`

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

const dayFmt = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'short', day: 'numeric', month: 'short' })

/**
 * A match as a row of the site's match list: the day and time (or "Slut") on the left, the two teams under each other
 * with their logos, and the score (or the TV channel) on the right. Plain lines, no coloured boxes.
 */
function matchHtml(m: DigestMatch, club: string, site: string) {
  const done = m.goalsFor !== undefined && m.goalsAgainst !== undefined
  const href = m.slug ? tracked(`${site}/kamp/${m.slug}`) : undefined
  const sides = [
    { name: club, logo: m.clubLogo, goals: m.goalsFor },
    { name: m.opponent, logo: m.opponentLogo, goals: m.goalsAgainst },
  ]
  const [home, away] = m.home ? sides : [sides[1], sides[0]]
  const won = (a: typeof home, b: typeof home) => done && (a.goals ?? 0) > (b.goals ?? 0)
  const badge = (logo?: string) =>
    logo
      ? `<img src="${esc(logo)}" width="20" height="20" alt="" style="display:block;border:0;width:20px;height:20px">`
      : `<span style="display:block;width:20px;height:20px;border-radius:999px;background:${C.line}"></span>`
  const team = (t: typeof home, other: typeof home) =>
    `<tr><td width="28" style="padding:3px 0;vertical-align:middle">${badge(t.logo)}</td><td class="m-ink" style="padding:3px 0;font-family:${FONT};font-size:15px;line-height:1.3;color:${C.ink};${won(t, other) ? 'font-weight:bold;' : ''}vertical-align:middle">${esc(t.name)}</td>${done ? `<td align="right" class="m-ink" style="padding:3px 0 3px 10px;font-family:${FONT};font-size:16px;font-weight:bold;color:${C.ink};vertical-align:middle">${t.goals ?? ''}</td>` : ''}</tr>`
  const when = `${esc(dayFmt.format(new Date(m.kickoff)).replace(/\.$/, ''))}<br>${done ? 'Slut' : esc(formatTime(new Date(m.kickoff)))}`
  const tv = !done && m.tv ? `<td align="right" style="padding:12px 0 12px 10px;vertical-align:middle;white-space:nowrap"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${C.soft};font-family:${FONT};font-size:12px;font-weight:bold;color:${C.ink}">${esc(m.tv)}</span></td>` : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line}"><tr>
<td width="74" class="m-ink2" style="padding:12px 10px 12px 0;vertical-align:middle;font-family:${FONT};font-size:12px;line-height:1.4;color:${C.ink2}">${when}</td>
<td style="padding:9px 0;vertical-align:middle"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${team(home, away)}${team(away, home)}</table></td>
${tv}</tr></table>
<p style="margin:6px 0 0;font-family:${FONT};font-size:12px;color:${C.ink2}">${esc(m.league)}${href ? ` · ${link(href, done ? 'Se kampen' : 'Til kampen', 'font-size:12px')}` : ''}</p>`
}

function lastHtml(d: ClubDigest, site: string) {
  if (!played(d.last)) return ''
  return `${label('Seneste resultat')}
${matchHtml(d.last, d.name, site)}`
}

function nextHtml(d: ClubDigest, site: string) {
  if (!d.next) return ''
  return `${label('Næste kamp')}
${matchHtml(d.next, d.name, site)}`
}

/** The table as on the site (src/components/StandingsTable.tsx): #, logo and club, K, +/-, P and the form as small coloured
 * squares; the club's own row on lime. A table for the mail: no flexbox, inline styles only */
function tableHtml(d: ClubDigest) {
  const rows = d.table
  if (!rows?.length) return ''
  const me = rows.find((r) => r.me)
  const pts = rows.some((r) => r.points !== undefined)
  const diff = rows.some((r) => r.goalDiff !== undefined)
  const form = rows.some((r) => r.form?.length)
  const cell = `font-family:${FONT};font-size:14px;padding:9px 6px;border-bottom:1px solid ${C.line};vertical-align:middle`
  const head = `font-family:${FONT};font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:${C.ink2};padding:6px;border-bottom:1px solid ${C.line}`
  const chip = (r: 'V' | 'U' | 'T') =>
    `<span style="display:inline-block;width:16px;height:16px;margin-left:2px;border-radius:4px;background:${r === 'V' ? C.win : r === 'T' ? C.loss : C.draw};color:#ffffff;font-family:${FONT};font-size:10px;font-weight:bold;line-height:16px;text-align:center">${r}</span>`
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n))
  return `${label(me ? `Stillingen · nr. ${me.rank}${me.points !== undefined ? ` med ${me.points} point` : ''}` : 'Stillingen')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0">
<tr><td style="${head};width:22px">#</td><td style="${head}">Klub</td><td style="${head};text-align:center;width:26px">K</td>${diff ? `<td style="${head};text-align:center;width:34px">+/-</td>` : ''}${pts ? `<td style="${head};text-align:center;width:28px">P</td>` : ''}${form ? `<td style="${head};text-align:right;width:96px" class="m-hide">Form</td>` : ''}</tr>
${rows
  .map((r) => {
    const bg = r.me ? `background:${C.lime};` : ''
    const strong = r.me ? 'font-weight:bold;' : ''
    const edge = (side: 'left' | 'right') => (r.me ? `border-top-${side}-radius:10px;border-bottom-${side}-radius:10px;` : '')
    const badge = r.logo
      ? `<img src="${esc(r.logo)}" width="20" height="20" alt="" style="display:inline-block;vertical-align:middle;border:0;width:20px;height:20px;margin-right:8px">`
      : ''
    return `<tr class="${r.me ? 'm-lime' : ''}"><td style="${cell};${bg}${edge('left')}font-weight:bold;color:${C.ink}">${r.rank}</td><td style="${cell};${bg}${strong}color:${C.ink}">${badge}${esc(r.name)}</td><td style="${cell};${bg}text-align:center;color:${C.ink2}">${r.played}</td>${diff ? `<td style="${cell};${bg}text-align:center;color:${C.ink2}">${r.goalDiff === undefined ? '' : sign(r.goalDiff)}</td>` : ''}${pts ? `<td style="${cell};${bg}text-align:center;font-weight:bold;color:${C.ink}${form ? '' : `;${edge('right')}`}">${r.points ?? ''}</td>` : ''}${form ? `<td class="m-hide" style="${cell};${bg}${edge('right')}text-align:right;white-space:nowrap">${(r.form ?? []).slice(-5).map(chip).join('')}</td>` : ''}</tr>`
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="m-card" style="border-collapse:separate;background:${C.surface};border-radius:16px"><tr><td class="m-ink" style="padding:20px 20px 22px">
<h2 class="m-ink" style="margin:0;font-family:${DISPLAY};font-size:28px;line-height:1.15;font-style:italic;font-weight:900;text-transform:uppercase;color:${C.ink}">${esc(d.name)}</h2>
${d.league ? `<p style="margin:4px 0 0;font-family:${FONT};font-size:13px;color:${C.ink2}">${esc(d.league)}</p>` : ''}
${empty ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:15px;color:${C.ink}">Ingen kampe i kalenderen lige nu. Vi skriver igen, når der er nyt.</p>` : ''}
${lastHtml(d, site)}
${nextHtml(d, site)}
${tableHtml(d)}
${articlesHtml(d, site)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px"><tr><td class="m-lime" style="background:${C.lime};border-radius:999px"><a href="${esc(tracked(`${site}/klub/${d.slug}`))}" style="display:inline-block;padding:11px 20px;font-family:${FONT};font-size:14px;font-weight:bold;color:${C.ink};text-decoration:none">Alt om ${esc(d.name)} →</a></td></tr></table>
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
<html lang="da">${head(subject)}
<body class="m-bg" style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="m-bg" style="background:${C.bg}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="m-bg" style="max-width:600px;background:${C.bg}">
<tr><td style="padding:0 16px 16px">
${logoBand(o.site, `Din klub i indbakken · uge ${weekNo}`, `Godmorgen. Her er ugens overblik over ${esc(who)}.`)}
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
  const perk = (title: string, text: string) => `<tr><td width="34" style="padding:6px 0;vertical-align:top"><span class="m-lime" style="display:inline-block;width:24px;height:24px;border-radius:999px;background:${C.lime};font-family:${FONT};font-size:14px;font-weight:bold;line-height:24px;text-align:center;color:${C.ink}">✓</span></td><td class="m-ink" style="padding:6px 0;font-family:${FONT};font-size:15px;line-height:1.45;color:${C.ink}"><strong>${title}</strong><br><span class="m-ink2" style="font-size:13px;color:${C.ink2}">${text}</span></td></tr>`
  const html = `<!doctype html>
<html lang="da">${head(subject)}
<body class="m-bg" style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Ét klik, så får du ${esc(who)} hver mandag morgen.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="m-bg" style="background:${C.bg}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="m-bg" style="max-width:560px;background:${C.bg}">
<tr><td style="padding:0 0 12px">${logoBand(o.site, 'Din klub i indbakken')}</td></tr>
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="m-card" style="border-collapse:separate;background:${C.surface};border-radius:16px"><tr><td class="m-ink" style="padding:26px 24px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.ink}">
<h1 class="m-ink" style="margin:0 0 12px;font-family:${DISPLAY};font-size:30px;line-height:1.1;font-weight:900;font-style:italic;text-transform:uppercase;color:${C.ink}">${esc(who)} i din indbakke</h1>
<p style="margin:0 0 16px">Tak fordi du vil følge med. Bekræft med ét klik, så kommer den første mail næste mandag morgen.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
${perk('Sidste resultat', 'resultatet og et link til kampen')}
${perk('Næste kamp', 'dag, tid og TV-kanal')}
${perk('Stillingen', 'din klub og holdene lige omkring den')}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td class="m-lime" style="background:${C.lime};border-radius:999px"><a href="${esc(o.confirmUrl)}" class="m-ink" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:bold;color:${C.ink};text-decoration:none">Ja tak, bekræft min tilmelding →</a></td></tr></table>
<p class="m-ink2" style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${C.ink2}">Virker knappen ikke, så kopier linket:<br><a href="${esc(o.confirmUrl)}" style="color:${C.ink2};text-decoration:underline;word-break:break-all">${esc(o.confirmUrl)}</a></p>
<p class="m-ink2" style="margin:0 0 18px;font-size:13px;line-height:1.5;color:${C.ink2}">Har du ikke selv bedt om det, så gør ingenting. Uden bekræftelse sletter vi adressen igen efter 7 dage.</p>
<p style="margin:0">Hilsen<br><strong>James, Matchly</strong></p>
</td></tr></table>
</td></tr>
</table>
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
