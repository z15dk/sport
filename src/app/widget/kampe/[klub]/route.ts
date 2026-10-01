import { teamBySlug } from '../../../../data/teams'
import { clubMatches } from '../../../../data/matches'
import { channelsFor } from '../../../../data/channels'
import { loadRealData } from '../../../../lib/realdata'
import { getBadges } from '../../../../lib/badges'
import { sizedImage } from '../../../../lib/imageSize'
import { paths } from '../../../../lib/site'
import { formatTime, formatWeekday, isoDate } from '../../../../lib/time'
import { noteWidgetView } from '../../../../lib/widgetStats'
import { accent, baseCss, esc, heightScript, initials, matchlyBar, widgetHeaders } from '../../../../lib/widgetHtml'
import type { Match, Team } from '../../../../types'

// A club's next matches for its own site (/widget: "Kommende kampe"): league and cup
// games with date, time, home or away, the competition and the TV channel, and the
// latest result on top. Embedded like the league table (public/widget.js).

export const dynamic = 'force-dynamic'

const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.']

export async function GET(request: Request, { params }: { params: Promise<{ klub: string }> }) {
  loadRealData()
  const slug = (await params).klub
  const team = teamBySlug(slug)
  if (!team?.season) return new Response('Ukendt klub', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } })
  const url = new URL(request.url)
  const a = accent(url.searchParams.get('farve'))
  const dark = url.searchParams.get('tema') === 'mork'
  const count = Math.min(10, Math.max(1, Number(url.searchParams.get('antal')) || 5))
  const showLast = url.searchParams.get('seneste') !== '0'
  const id = (url.searchParams.get('id') ?? '').replace(/[^\w-]/g, '').slice(0, 40)
  noteWidgetView({
    page: url.searchParams.get('side'),
    referer: request.headers.get('referer'),
    liga: 'kampe',
    hold: team.slug,
    link: url.searchParams.get('link'),
    ua: request.headers.get('user-agent'),
    preview: id === 'preview',
  })

  const now = Date.now()
  const all = [...new Map(clubMatches(team.name, now).map((m) => [m.id, m])).values()].sort((x, y) => x.kickoff.getTime() - y.kickoff.getTime())
  const upcoming = all.filter((m) => m.state === 'upcoming' || m.state === 'live').slice(0, count)
  const last = showLast ? all.filter((m) => m.state === 'finished').at(-1) : undefined
  const badges = await getBadges()
  const badge = (t: Team) => {
    const src = badges[t.name] ?? t.badge
    if (src) return `<img src="${esc(sizedImage(src, 24))}" alt="" width="24" height="24" loading="lazy">`
    const [bg, fg] = t.colors ?? ['#d9dcd2', '#0f110c']
    return `<span class="ini" style="background:${esc(bg)};color:${esc(fg)}">${esc(initials(t.name))}</span>`
  }
  const ours = (m: Match) => (m.home.name === team.name ? 'home' : 'away')
  const opponent = (m: Match) => (ours(m) === 'home' ? m.away : m.home)
  const tv = (m: Match) => channelsFor(m).map((c) => c.name).join(', ')

  const row = (m: Match) => {
    const day = isoDate(m.kickoff)
    const [, mo, d] = day.split('-').map(Number)
    const opp = opponent(m)
    const live = m.state === 'live'
    return `<a class="m${live ? ' live' : ''}" href="${paths.match(m.slug)}" target="_blank" rel="noopener">
<span class="date"><b>${Number(d)}</b><small>${MONTHS[mo - 1]}</small></span>
<span class="info"><span class="vs"><em>${ours(m) === 'home' ? 'Hjemme' : 'Ude'}</em>${badge(opp)}<strong>${esc(opp.name)}</strong></span>
<small>${esc(formatWeekday(day))} · ${live ? '<i class="pulse"></i>Live nu' : `kl. ${formatTime(m.kickoff)}`} · ${esc(m.league)}${tv(m) ? ` · ${esc(tv(m))}` : ''}</small></span>
${live && m.home.score !== undefined ? `<span class="score">${m.home.score}–${m.away.score}</span>` : ''}
</a>`
  }
  const result = (m: Match) => {
    const mine = ours(m) === 'home' ? m.home.score ?? 0 : m.away.score ?? 0
    const theirs = ours(m) === 'home' ? m.away.score ?? 0 : m.home.score ?? 0
    const res = mine > theirs ? 'V' : mine < theirs ? 'T' : 'U'
    return `<a class="last" href="${paths.match(m.slug)}" target="_blank" rel="noopener"><span class="lbl">Seneste</span>${badge(m.home)}<strong>${esc(m.home.name)}</strong><b class="res ${res}">${m.home.score ?? 0}–${m.away.score ?? 0}</b><strong>${esc(m.away.name)}</strong>${badge(m.away)}</a>`
  }

  const html = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(team.name)} kampprogram</title>
<style>
${baseCss(dark, a)}
.h .club{display:flex;align-items:center;gap:10px;min-width:0;color:var(--ink);font-size:inherit}.h .club img,.h .club .ini{width:30px;height:30px}
.list{display:flex;flex-direction:column;gap:4px;padding:4px 10px 12px}
.m{display:flex;align-items:center;gap:12px;padding:8px 12px 8px 8px;border-radius:14px;background:var(--row);color:inherit;text-decoration:none}
.m:hover strong{text-decoration:underline;text-underline-offset:3px}
.date{flex:none;width:50px;height:50px;border-radius:12px;background:var(--me);color:var(--me-ink);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
.date b{font:italic 800 24px/1 var(--d)}.date small{font-size:11px;font-weight:700;text-transform:uppercase;margin-top:2px}
.info{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.vs{display:flex;align-items:center;gap:8px;min-width:0}.vs strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.vs em{font-style:normal;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:3px 7px;border-radius:999px;background:var(--surface);color:var(--ink2);flex:none}
.info small{font-size:12px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.score{font:italic 800 22px/1 var(--d);color:var(--live)}
.pulse{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--live);margin-right:5px;vertical-align:1px}
.m.live .date{background:var(--live);color:#fff}
.last{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 10px 6px;padding:9px 12px;border-radius:14px;border:1.5px dashed var(--line);color:inherit;text-decoration:none;font-size:13px}
.last .lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin-right:auto}
.last strong{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.last img,.last .ini{width:20px;height:20px}
.res{font:italic 800 20px/1 var(--d);padding:3px 8px;border-radius:8px}.res.V{background:#2fa84f;color:#fff}.res.U{background:#a4a89c;color:#fff}.res.T{background:var(--live);color:#fff}
.empty{padding:14px 18px 18px;color:var(--ink3)}
@media (max-width:380px){.last .lbl{display:none}.list{padding:4px 6px 10px}.date{width:44px;height:44px}}
</style></head><body>
<div class="w">
<div class="h"><span class="club">${badge({ name: team.name, colors: team.colors })}<h1>${esc(team.name)}</h1></span><span>Kommende kampe</span></div>
${last ? result(last) : ''}
${upcoming.length ? `<div class="list">${upcoming.map(row).join('')}</div>` : '<p class="empty">Ingen kampe i kalenderen lige nu.</p>'}
${matchlyBar(paths.club(team.slug))}
</div>
${heightScript(id)}
</body></html>`
  return new Response(html, { headers: widgetHeaders })
}
