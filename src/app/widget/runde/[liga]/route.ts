import { divisionBySlug } from '../../../../data/leagues'
import { hasRealData } from '../../../../data/real'
import { allFixtures, toMatch } from '../../../../data/season'
import { channelsFor } from '../../../../data/channels'
import { loadRealData } from '../../../../lib/realdata'
import { getBadges } from '../../../../lib/badges'
import { sizedImage } from '../../../../lib/imageSize'
import { paths } from '../../../../lib/site'
import { formatTime, isoDate } from '../../../../lib/time'
import { noteWidgetView } from '../../../../lib/widgetStats'
import { accent, baseCss, esc, heightScript, initials, matchlyBar, widgetHeaders } from '../../../../lib/widgetHtml'
import type { Match, Team } from '../../../../types'

// A league's round as cards side by side (/widget: "Kommende kampe" → "Runde"): time and
// date, both clubs' badges and short names, and the TV channel, live score or result
// below; arrows to the round before and after. Embedded like the league table.

export const dynamic = 'force-dynamic'

const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.']

/** "Brøndby IF" -> "BRØ", "FC København" -> "KØB", "AGF" -> "AGF", "B.93" -> "B.93" */
function code(name: string) {
  if (name.length <= 4 && !name.includes(' ')) return name.toUpperCase()
  const word = name.split(/\s+/).find((w) => /^[\p{L}]/u.test(w) && !/^(fc|fk|bk|if|ik|ff|sv|sc|vfb|vfl|ac|sk|boldklub|club)$/i.test(w)) ?? name
  return word.slice(0, 3).toUpperCase()
}

export async function GET(request: Request, { params }: { params: Promise<{ liga: string }> }) {
  loadRealData()
  const slug = (await params).liga
  const division = divisionBySlug(slug)
  if (!division || !hasRealData(division.id)) return new Response('Ukendt liga', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } })
  const url = new URL(request.url)
  const a = accent(url.searchParams.get('farve'))
  // The cards' own colour (?kort=1d4ed8, else our near-black); text and the top strip follow it
  const card0 = /^[0-9a-f]{6}$/i.test(url.searchParams.get('kort') ?? '') ? accent(url.searchParams.get('kort')) : { color: '#15170f', ink: '#fff' }
  const dark = url.searchParams.get('tema') === 'mork'
  const highlight = url.searchParams.get('hold') ?? ''
  const showTv = url.searchParams.get('tv') !== '0'
  const id = (url.searchParams.get('id') ?? '').replace(/[^\w-]/g, '').slice(0, 40)
  noteWidgetView({
    page: url.searchParams.get('side'),
    referer: request.headers.get('referer'),
    liga: division.slug,
    hold: highlight,
    link: url.searchParams.get('link'),
    ua: request.headers.get('user-agent'),
    preview: id === 'preview',
  })

  const now = Date.now()
  const fixtures = allFixtures().filter((f) => f.division?.id === division.id && f.round > 0)
  const rounds = [...new Set(fixtures.map((f) => f.round))].sort((x, y) => x - y)
  // The round being played or next up (else the last one)
  const current =
    rounds.find((r) => fixtures.some((f) => f.round === r && f.real.state !== 'finished' && f.kickoff.getTime() > now - 3 * 3_600_000)) ?? rounds.at(-1) ?? 0
  const asked = Number(url.searchParams.get('runde'))
  const round = rounds.includes(asked) ? asked : current
  const at = rounds.indexOf(round)
  const matches = fixtures
    .filter((f) => f.round === round)
    .map((f) => toMatch(f, now))
    .sort((x, y) => x.kickoff.getTime() - y.kickoff.getTime())

  const badges = await getBadges()
  const badge = (t: Team) => {
    const src = badges[t.name] ?? t.badge
    if (src) return `<img src="${esc(sizedImage(src, 44))}" alt="" width="44" height="44" loading="lazy">`
    const [bg, fg] = t.colors ?? ['#d9dcd2', '#0f110c']
    return `<span class="ini" style="background:${esc(bg)};color:${esc(fg)}">${esc(initials(t.name))}</span>`
  }
  const clubSlug = (t: Team) => fixtures.find((f) => f.home.name === t.name)?.home.slug ?? fixtures.find((f) => f.away.name === t.name)?.away.slug
  const foot = (m: Match) => {
    if (m.state === 'live') return `<span class="live"><i></i>Live${m.statusLabel ? ` · ${esc(m.statusLabel)}` : ''}</span>`
    if (m.state === 'finished') return '<span>Slut</span>'
    const tv = showTv ? channelsFor(m).map((c) => c.name).join(', ') : ''
    return tv ? `<span>${esc(tv)}</span>` : '<span>Se kampen</span>'
  }
  const card = (m: Match) => {
    const day = isoDate(m.kickoff)
    const [, mo, d] = day.split('-').map(Number)
    const mine = highlight && (clubSlug(m.home) === highlight || clubSlug(m.away) === highlight)
    return `<a class="c${mine ? ' me' : ''}${m.state === 'live' ? ' is-live' : ''}" href="${paths.match(m.slug)}" target="_blank" rel="noopener">
<span class="when">${formatTime(m.kickoff)} | ${d}. ${MONTHS[mo - 1]}</span>
<span class="teams"><span class="t">${badge(m.home)}<b title="${esc(m.home.name)}">${esc(code(m.home.name))}</b></span><span class="mid">${m.state === 'upcoming' ? '<i>–</i>' : `<strong>${m.home.score ?? 0}–${m.away.score ?? 0}</strong>`}</span><span class="t">${badge(m.away)}<b title="${esc(m.away.name)}">${esc(code(m.away.name))}</b></span></span>
<span class="foot">${foot(m)}</span>
</a>`
  }
  const nav = (r: number | undefined, dir: string, label: string) => {
    if (r === undefined) return `<span class="arrow off" aria-hidden="true">${dir}</span>`
    const q = new URLSearchParams(url.searchParams)
    q.set('runde', String(r))
    q.delete('side')
    return `<a class="arrow" href="?${esc(q.toString())}" aria-label="${label}">${dir}</a>`
  }

  const html = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(division.name)} ${round}. runde</title>
<style>
${baseCss(dark, a)}
:root{--card:${card0.color};--card-ink:${card0.ink}}
.h{align-items:center}.h .r{display:flex;align-items:center;gap:10px}
.h .r strong{font:italic 800 22px/1 var(--d);text-transform:uppercase;color:var(--ink)}
.arrow{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--me);color:var(--me-ink);text-decoration:none;font-weight:800;font-size:18px}
.arrow:hover{filter:brightness(.92)}.arrow.off{opacity:.3}
.cards{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(170px,1fr);gap:8px;overflow-x:auto;padding:6px 14px 16px;scroll-snap-type:x mandatory;scrollbar-width:thin}
.c{scroll-snap-align:start;min-width:170px;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;background:var(--card);color:var(--card-ink);text-decoration:none;transition:transform .15s}
.c:hover{transform:translateY(-2px)}
.c.me{box-shadow:0 0 0 3px var(--me)}
.when{padding:10px 12px;font-size:12px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;background:color-mix(in srgb,var(--card) 78%,#000);color:var(--card-ink);opacity:.92}
.teams{display:grid;grid-template-columns:1fr auto 1fr;align-items:start;padding:14px 8px 12px;gap:4px}
.mid{height:44px;display:grid;place-items:center;min-width:34px}.mid strong{font:italic 800 26px/1 var(--d);white-space:nowrap}.mid i{font-style:normal;opacity:.4;font-weight:800}
.c.is-live .mid strong{color:var(--live)}
.t{display:flex;flex-direction:column;align-items:center;gap:8px}
.t img,.t .ini{width:44px;height:44px}.t .ini{font-size:12px}
.t b{font:italic 800 22px/1 var(--d);letter-spacing:.01em}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:9px 12px;background:var(--me);color:var(--me-ink);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;min-height:36px}
.foot span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.foot b{font:italic 800 20px/1 var(--d)}
.c.is-live .foot{background:var(--live);color:#fff}
.live i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#fff;margin-right:5px;vertical-align:1px}
.empty{padding:14px 18px 18px;color:var(--ink3)}
</style></head><body>
<div class="w">
<div class="h"><h1>${esc(division.name)}</h1><span class="r">${nav(rounds[at - 1], '←', 'Forrige runde')}<strong>${round}. runde</strong>${nav(rounds[at + 1], '→', 'Næste runde')}</span></div>
${matches.length ? `<div class="cards">${matches.map(card).join('')}</div>` : '<p class="empty">Ingen kampe i runden.</p>'}
${matchlyBar(paths.league(division.slug))}
</div>
${heightScript(id)}
</body></html>`
  return new Response(html, { headers: widgetHeaders })
}
