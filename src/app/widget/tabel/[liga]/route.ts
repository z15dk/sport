import { divisionBySlug, seasonOf, sportOf } from '../../../../data/leagues'
import { hasRealData } from '../../../../data/real'
import { standings, type StandingRow } from '../../../../data/season'
import { loadRealData } from '../../../../lib/realdata'
import { getBadges } from '../../../../lib/badges'
import { sizedImage } from '../../../../lib/imageSize'
import { paths } from '../../../../lib/site'

// The league table other sites embed (/widget: the code to copy; public/widget.js puts
// it on their page in an iframe and keeps its height). A page of its own without the
// site's layout, small and cached a few minutes; not for search engines (the link to
// us sits in the embedding page's own HTML, outside the iframe).

export const dynamic = 'force-dynamic'

/** "FC København" -> "FK", "AGF" -> "AGF": the letters on a badge without a logo */
const initials = (name: string) => {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}]/u.test(w) && !/^(fc|fk|bk|if|ik|ff|sv|sc|vfb|vfl)$/i.test(w))
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join('') : (words[0] ?? name).slice(0, 3)).toUpperCase()
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export async function GET(request: Request, { params }: { params: Promise<{ liga: string }> }) {
  loadRealData()
  const slug = (await params).liga
  const division = divisionBySlug(slug)
  if (!division || !hasRealData(division.id)) return new Response('Ukendt liga', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } })
  const url = new URL(request.url)
  const highlight = url.searchParams.get('hold') ?? ''
  const dark = url.searchParams.get('tema') === 'mork'
  const compact = url.searchParams.get('kompakt') === '1'
  const id = (url.searchParams.get('id') ?? '').replace(/[^\w-]/g, '').slice(0, 40)
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
    if (src) return `<img src="${esc(sizedImage(src, 20))}" alt="" width="20" height="20" loading="lazy">`
    const [bg, fg] = r.club.colors ?? ['#d9dcd2', '#0f110c']
    return `<span class="ini" style="background:${esc(bg)};color:${esc(fg)}">${esc(initials(r.club.name))}</span>`
  }
  const zone = (i: number) => (zones && i < zones.top ? ' top' : zones && i >= rows.length - zones.bottom ? ' bottom' : '')
  const body = rows
    .map(
      (r, i) => `<tr class="${zone(i)}${r.club.slug === highlight ? ' me' : ''}">
<td class="n pos">${i + 1}</td>
<td class="club"><a href="${paths.club(r.club.slug)}" target="_blank" rel="noopener">${badge(r)}<span>${esc(r.club.name)}</span></a></td>
<td class="n">${r.played}</td>
${compact ? '' : cols.map((c) => `<td class="n x">${c.value(r)}</td>`).join('')}
<td class="n">${r.goalsFor - r.goalsAgainst > 0 ? '+' : ''}${r.goalsFor - r.goalsAgainst}</td>
<td class="n p">${r.points}</td>
</tr>`,
    )
    .join('')
  const legend = zones ? `<span class="lg top">${esc(zones.topLabel ?? 'Top')}</span><span class="lg bottom">Nedrykning</span>` : ''
  const html = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&amp;text=MATCHLY.&amp;display=swap">
<title>${esc(division.name)} stilling</title>
<style>
:root{--bg:#fff;--ink:#0f110c;--muted:#6b7064;--line:#e6e8e0;--lime:#c6f135;--deep:#6f8f00;--me:#f4fbd9;--red:#d64545}
${dark ? ':root{--bg:#15170f;--ink:#f3f5ee;--muted:#9ea393;--line:#2a2d22;--me:#252c10;--deep:#c6f135}' : ''}
*{box-sizing:border-box}html,body{margin:0;background:transparent;color:var(--ink);font:14px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.w{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg)}
.h{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}
.h b{font-size:15px}.h small{color:var(--muted)}
table{width:100%;border-collapse:collapse}th,td{padding:6px 6px;border-bottom:1px solid var(--line);white-space:nowrap}
th{font-size:11px;font-weight:600;color:var(--muted);text-align:left;text-transform:uppercase}
.n{text-align:right;font-variant-numeric:tabular-nums;width:1%}.p{font-weight:700}
.pos{position:relative;padding-left:10px;color:var(--muted)}
tr.top .pos::before,tr.bottom .pos::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:3px;border-radius:2px;background:var(--deep)}
tr.bottom .pos::before{background:var(--red)}
tr.me td{background:var(--me);font-weight:700}
.club a{display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none;overflow:hidden}.club a:hover span{text-decoration:underline}
.club span{overflow:hidden;text-overflow:ellipsis}td.club{max-width:0;width:100%}
img,.ini{width:20px;height:20px;flex:none;object-fit:contain}
.ini{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-size:7px;font-weight:700}
.f{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:6px;padding:8px 12px;font-size:12px;color:var(--muted)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:#0f110c;color:#fff;text-decoration:none}
.logo{font:italic 800 22px/1 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:-.01em}.logo i{color:#ff4a1f;font-style:inherit}
.tag{font-size:11px;color:#b9bdb0;text-align:right}.bar:hover .tag{color:#c6f135}
.lg{margin-right:10px}.lg::before{content:"";display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;background:var(--deep)}.lg.bottom::before{background:var(--red)}
@media (max-width:360px){.x{display:none}}
</style></head><body>
<div class="w">
<div class="h"><b>${esc(division.name)}</b><small>Stilling ${esc(seasonOf(division))}</small></div>
<table><thead><tr><th class="n">#</th><th>Hold</th><th class="n" title="Kampe">K</th>${compact ? '' : cols.map((c) => `<th class="n x" title="${c.title}">${c.label}</th>`).join('')}<th class="n" title="Målforskel">+/-</th><th class="n" title="Point">P</th></tr></thead>
<tbody>${body}</tbody></table>
${legend ? `<div class="f">${legend}</div>` : ''}
<a class="bar" href="${paths.league(division.slug)}" target="_blank" rel="noopener"><span class="logo">Matchly<i>.</i></span><span class="tag">Live score og stats · matchly.dk</span></a>
</div>
<script>(function(){function s(){parent.postMessage({matchly:${JSON.stringify(id)},height:document.body.getBoundingClientRect().height},"*")}addEventListener("load",s);new ResizeObserver(s).observe(document.body);s();setTimeout(s,700);setTimeout(s,2000)})()</script>
</body></html>`
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      'X-Robots-Tag': 'noindex',
      // Any site may show it
      'Content-Security-Policy': 'frame-ancestors *',
    },
  })
}
