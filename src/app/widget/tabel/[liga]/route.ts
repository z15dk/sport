import { divisionBySlug, seasonOf, sportOf } from '../../../../data/leagues'
import { hasRealData } from '../../../../data/real'
import { standings, type StandingRow } from '../../../../data/season'
import { loadRealData } from '../../../../lib/realdata'
import { getBadges } from '../../../../lib/badges'
import { sizedImage } from '../../../../lib/imageSize'
import { paths } from '../../../../lib/site'
import { noteWidgetView } from '../../../../lib/widgetStats'
import { accent, baseCss, esc, heightScript, initials, matchlyBar, widgetHeaders } from '../../../../lib/widgetHtml'

// The league table other sites embed (/widget: the code to copy; public/widget.js puts
// it on their page in an iframe and keeps its height). A page of its own without the
// site's layout, small and cached a few minutes; not for search engines (the link to
// us sits in the embedding page's own HTML, outside the iframe).

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ liga: string }> }) {
  loadRealData()
  const slug = (await params).liga
  const division = divisionBySlug(slug)
  if (!division || !hasRealData(division.id)) return new Response('Ukendt liga', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } })
  const url = new URL(request.url)
  const highlight = url.searchParams.get('hold') ?? ''
  // The highlighted club's colour (?farve=1d4ed8), so the table fits the club's own site
  const { color, ink: colorInk } = accent(url.searchParams.get('farve'))
  const dark = url.searchParams.get('tema') === 'mork'
  const compact = url.searchParams.get('kompakt') === '1'
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
  const rows = standings(division, Date.now())
  const badges = await getBadges()
  const sport = sportOf(division)
  const zones = division.zones
  const cols: { label: string; title: string; value: (r: StandingRow) => number }[] =
    sport === 'basketball'
      ? [
          { label: 'V', title: 'Sejre', value: (r) => r.won },
          { label: 'T', title: 'Nederlag', value: (r) => r.lost },
        ]
      : sport === 'ice_hockey'
        ? [
            { label: 'V', title: 'Sejre', value: (r) => r.won },
            { label: 'T', title: 'Nederlag', value: (r) => r.lost },
          ]
        : [
            { label: 'V', title: 'Sejre', value: (r) => r.won },
            { label: 'U', title: 'Uafgjorte', value: (r) => r.drawn },
            { label: 'T', title: 'Nederlag', value: (r) => r.lost },
          ]
  const badge = (r: StandingRow) => {
    const src = badges[r.club.name]
    if (src) return `<img src="${esc(sizedImage(src, 24))}" alt="" width="24" height="24" loading="lazy">`
    const [bg, fg] = r.club.colors ?? ['#d9dcd2', '#0f110c']
    return `<span class="ini" style="background:${esc(bg)};color:${esc(fg)}">${esc(initials(r.club.name))}</span>`
  }
  const zone = (i: number) => (zones && i < zones.top ? ' up' : zones && zones.bottom > 0 && i >= rows.length - zones.bottom ? ' down' : '')
  const WORD = { V: 'Sejr', U: 'Uafgjort', T: 'Tab' } as const
  const chips = (r: StandingRow) => {
    const last = r.form.slice(-5)
    return `<span class="form" title="Seneste ${last.length}: ${last.map((f) => WORD[f]).join(', ')}">${last.map((f, k) => `<i class="${f}${k === last.length - 1 ? ' last' : ''}"></i>`).join('')}</span>`
  }
  const body = rows
    .map((r, i) => {
      const gd = r.goalsFor - r.goalsAgainst
      return `<tr class="${zone(i)}${r.club.slug === highlight ? ' me' : ''}">
<td class="n pos">${i + 1}</td>
<td class="club"><a href="${paths.club(r.club.slug)}" target="_blank" rel="noopener">${badge(r)}<strong>${esc(r.club.name)}</strong></a></td>
<td class="n">${r.played}</td>
${compact ? '' : cols.map((c) => `<td class="n x">${c.value(r)}</td>`).join('')}
<td class="n">${gd > 0 ? '+' : ''}${gd}</td>
<td class="n pts">${r.points}</td>
${compact ? '' : `<td class="fm">${chips(r)}</td>`}
</tr>`
    })
    .join('')
  const legend = zones
    ? `<div class="legend"><span><i class="dot up"></i>${esc(zones.topLabel ?? 'Top')}</span>${zones.bottom > 0 ? '<span><i class="dot down"></i>Nedrykning</span>' : ''}</div>`
    : ''
  const html = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(division.name)} stilling</title>
<style>
${baseCss(dark, { color, ink: colorInk })}
.tw{padding:0 10px}
table{width:100%;border-collapse:separate;border-spacing:0 4px;font-variant-numeric:tabular-nums}
th{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);text-align:left;padding:6px 8px}
td{background:var(--row);padding:7px 8px;white-space:nowrap}
td:first-child{border-radius:14px 0 0 14px;box-shadow:inset 4px 0 0 transparent}td:last-child{border-radius:0 14px 14px 0}
.n{text-align:center;width:1%}
.pos{font:italic 800 18px/1 var(--d)}.pts{font:italic 800 20px/1 var(--d)}
tr.up td:first-child{box-shadow:inset 4px 0 0 var(--deep)}tr.down td:first-child{box-shadow:inset 4px 0 0 var(--live)}
tr.me td{background:var(--me);color:var(--me-ink)}
td.club{max-width:0;width:100%}
.club a{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;min-width:0}
.club strong{overflow:hidden;text-overflow:ellipsis;font-weight:700}.club a:hover strong{text-decoration:underline;text-underline-offset:3px}
.form{display:inline-flex;align-items:center;gap:5px}.form i{width:12px;height:12px;border-radius:50%;display:inline-block}
.form .V{background:#2fa84f;color:#2fa84f}.form .U{background:#a4a89c;color:#a4a89c}.form .T{background:var(--live);color:var(--live)}
.form i.last{width:14px;height:14px;box-shadow:0 0 0 2px var(--row),0 0 0 3.5px currentColor}tr.me .form i.last{box-shadow:0 0 0 2px var(--me),0 0 0 3.5px currentColor}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;padding:8px 18px 14px;font-size:12px;color:var(--ink2)}
.legend span{display:inline-flex;align-items:center;gap:6px}.dot{width:10px;height:10px;border-radius:3px;display:inline-block}.dot.up{background:var(--deep)}.dot.down{background:var(--live)}
@media (max-width:520px){.fm,th.fm{display:none}}
@media (max-width:380px){.x{display:none}.tw{padding:0 6px}td{padding:6px 6px}.h{padding:14px 14px 6px}}
</style></head><body>
<div class="w">
<div class="h"><h1>${esc(division.name)}</h1><span>Stilling ${esc(seasonOf(division))}</span></div>
<div class="tw"><table><thead><tr><th class="n">#</th><th>Klub</th><th class="n" title="Kampe">K</th>${compact ? '' : cols.map((c) => `<th class="n x" title="${c.title}">${c.label}</th>`).join('')}<th class="n" title="Målforskel">+/-</th><th class="n" title="Point">P</th>${compact ? '' : '<th class="fm">Form</th>'}</tr></thead>
<tbody>${body}</tbody></table></div>
${legend}
${matchlyBar(paths.league(division.slug))}
</div>
${heightScript(id)}
</body></html>`
  return new Response(html, { headers: widgetHeaders })
}
