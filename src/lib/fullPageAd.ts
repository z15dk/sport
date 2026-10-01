import 'server-only'
import { COUNTRIES, DIVISIONS, sportOf } from '../data/leagues'
import { getMatches, upcomingMatches } from '../data/matches'
import { channelsFor } from '../data/channels'
import { getBadges } from './badges'
import { sizedImage } from './imageSize'
import { paths } from './site'
import { addDays, formatTime, formatWeekday, isoDate } from './time'
import { esc } from './widgetHtml'
import { campaignKey } from './adStats'
import type { Match } from '../types'

// Matchly's own full-page ad for other sites (/annonce/helside, put on their page by
// public/annonce.js in an iframe the height of the screen): the site's dark design with
// the green M, what Matchly offers, real numbers from the club register, and a living
// panel with the matches in play right now (else today's, else the next ones), refreshed
// every half minute. Every link goes through /annonce/klik, which counts the click per
// site and campaign (src/lib/adStats.ts) and sends the visitor on to the page.

const LIME = '#c6f135'
const LIVE = '#ff4a1f'

/** The M as a lime outline, slanted like the logo (the same path as the share pictures) */
const M_SVG = `<svg viewBox="-10 -4 150 108" aria-hidden="true"><g transform="skewX(-12) translate(22 0)"><polygon points="0,100 0,0 26,0 50,46 74,0 100,0 100,100 76,100 76,42 57,78 43,78 24,42 24,100" fill="none" stroke="${LIME}" stroke-width="1.6" stroke-linejoin="round"/></g></svg>`

const SPORT_NAMES: Record<string, string> = { soccer: 'fodbold', ice_hockey: 'ishockey', basketball: 'basketball', handball: 'håndbold', volleyball: 'volleyball', american_football: 'amerikansk fodbold', tennis: 'tennis' }

/** Real numbers from the league files: leagues, clubs, countries and sports we cover */
export function adNumbers() {
  const clubs = new Set(DIVISIONS.flatMap((d) => d.clubs.map((c) => c.id))).size
  const sports = [...new Set(DIVISIONS.map(sportOf))]
  return { leagues: DIVISIONS.length, clubs, countries: COUNTRIES.length, sports: sports.length, sportNames: sports.map((s) => SPORT_NAMES[s] ?? s) }
}

/** The features the ad names, each linking to the page that shows it */
const FEATURES = [
  { title: 'Live-stillinger', text: 'Mål, kort og minut, mens kampen spilles.', path: '/' },
  { title: 'Stillinger og form', text: 'Tabeller, formkurver og topscorere i alle rækker.', path: paths.league('superliga') },
  { title: 'Kampprogram og TV', text: 'Hvornår der spilles – og hvilken kanal der viser det.', path: paths.tv() },
  { title: 'Opstillinger og statistik', text: 'Holdkort, skud, boldbesiddelse og indbyrdes opgør.', path: '/' },
  { title: 'Kvindesport', text: 'Egen side med livescore for kvindernes rækker.', path: paths.women() },
  { title: 'Ligatabel til din side', text: 'Gratis widget med den levende stilling.', path: '/widget' },
]

export type AdFormat = 'helside' | 'banner'

interface AdQuery {
  id: string
  campaign: string
  page: string
  /** The whole screen, or a 300 px banner for the top of a page */
  format: AdFormat
}

export function adQuery(url: URL): AdQuery {
  return {
    id: (url.searchParams.get('id') ?? '').replace(/[^\w-]/g, '').slice(0, 40),
    campaign: campaignKey(url.searchParams.get('kampagne')),
    page: (url.searchParams.get('side') ?? '').slice(0, 300),
    format: url.searchParams.get('format') === 'banner' ? 'banner' : 'helside',
  }
}

/** The counted link to a page on Matchly (/annonce/klik sends the visitor on) */
const go = (q: AdQuery, path: string) => {
  const p = new URLSearchParams({ til: path })
  if (q.campaign) p.set('kampagne', q.campaign)
  if (q.page) p.set('side', q.page)
  if (q.id === 'preview') p.set('id', 'preview')
  return `/annonce/klik?${p}`
}

/** The matches the ad shows: in play now, else today's (next kick-offs first, then results), else the coming days' */
export function adMatches(now: number, limit = 15): { label: string; live: number; matches: Match[] } {
  const today = isoDate(now)
  const day = getMatches(today, 'all', now)
  const live = day.filter((m) => m.state === 'live')
  const soon = day.filter((m) => m.state === 'upcoming').sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const done = day.filter((m) => m.state === 'finished').sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime())
  const list = [...live, ...soon, ...done]
  if (list.length) return { label: live.length ? `${live.length} ${live.length === 1 ? 'kamp' : 'kampe'} i gang` : 'Kampe i dag', live: live.length, matches: list.slice(0, limit) }
  return { label: 'Næste kampe', live: 0, matches: upcomingMatches('all', today, now, 10, limit) }
}

const score = (m: Match) => (m.home.score !== undefined && m.away.score !== undefined ? `${m.home.score}–${m.away.score}` : '')

/** When a match is: the live minute, "Slut", the time today, or weekday and time */
function when(m: Match, today: string) {
  if (m.state === 'live') return m.statusLabel ?? 'Live'
  if (m.state === 'finished') return 'Slut'
  if (m.state === 'postponed') return 'Udsat'
  const date = isoDate(m.kickoff)
  const time = formatTime(m.kickoff)
  if (date === today) return 'I dag'
  if (date === addDays(today, 1)) return `I morgen ${time}`
  return `${formatWeekday(date)} ${time}`
}

/** The living panel: the matches, each a counted link to its page (also fetched alone with ?del=live) */
export async function adLiveHtml(q: AdQuery, now: number) {
  const { label, live, matches } = adMatches(now)
  const badges = await getBadges()
  const today = isoDate(now)
  const badge = (t: Match['home']) => {
    const src = t.badge ?? badges[t.name]
    if (src) return `<img src="${esc(sizedImage(src, 32))}" alt="" width="32" height="32" loading="lazy">`
    const [bg, fg] = t.colors ?? ['#2b3024', '#ffffff']
    return `<i class="ini" style="background:${esc(bg)};color:${esc(fg)}">${esc(t.name.slice(0, 2).toUpperCase())}</i>`
  }
  // The banner is 300 px high: three short rows a page, the status on the league line instead of under the score
  const banner = q.format === 'banner'
  const PER_PAGE = banner ? 3 : 5
  const rows = matches
    .map((m, i) => {
      const tv = channelsFor(m)[0]?.name
      const s = score(m)
      const status = when(m, today)
      return `<a class="row${m.state === 'live' ? ' is-live' : ''}" href="${esc(go(q, paths.match(m.slug)))}" target="_blank" rel="noopener" data-id="${esc(m.id)}" data-page="${Math.floor(i / PER_PAGE)}">
<span class="lg">${esc(m.league)}${banner ? ` · <b>${esc(status)}</b>` : tv ? ` · ${esc(tv)}` : ''}</span>
<span class="t h">${badge(m.home)}<b>${esc(m.home.name)}</b></span>
<span class="sc${s ? '' : ' tm'}" data-score="${esc(s)}">${s ? esc(s) : esc(formatTime(m.kickoff))}</span>
<span class="t a"><b>${esc(m.away.name)}</b>${badge(m.away)}</span>
${banner ? '' : `<span class="st">${esc(status)}</span>`}
</a>`
    })
    .join('')
  const pages = Math.max(1, Math.ceil(matches.length / PER_PAGE))
  return `<div class="lh"><span class="dot${live ? ' pulse' : ''}"></span><b>${esc(label)}</b><span class="lt">${live ? 'lige nu' : esc(formatWeekday(today))}</span></div>
<div class="rows" data-pages="${pages}">${rows || '<p class="empty">Ingen kampe i kalenderen lige nu.</p>'}</div>
${pages > 1 ? `<div class="dots">${Array.from({ length: pages }, (_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>` : ''}`
}

/** The whole ad as a page of its own: the whole screen, or the 300 px banner (?format=banner) */
export async function fullPageAdHtml(url: URL, now: number) {
  const q = adQuery(url)
  const banner = q.format === 'banner'
  const n = adNumbers()
  const home = go(q, '/')
  const refresh = new URLSearchParams(url.searchParams)
  refresh.set('del', 'live')
  // The offers as one running band in the display face (a stadium's light board), each a counted link;
  // the band is written twice, so it runs without a gap – the copy is hidden from readers
  const band = (hidden: boolean) =>
    `<span class="run"${hidden ? ' aria-hidden="true"' : ''}>${FEATURES.map(
      (f) => `<a class="ft" href="${esc(go(q, f.path))}" target="_blank" rel="noopener"${hidden ? ' tabindex="-1"' : ''}><em>${esc(f.title)}</em><small>${esc(f.text)}</small></a><i class="sep"></i>`,
    ).join('')}</span>`
  const feats = band(false) + band(true)
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Matchly – live score og stats</title>
<style>
@font-face{font-family:"Barlow Condensed";font-style:italic;font-weight:800;font-display:swap;src:url(/widget-fonts/barlow-condensed-800-italic.woff2) format("woff2")}
@font-face{font-family:"DM Sans";font-style:normal;font-weight:100 1000;font-display:swap;src:url(/widget-fonts/dm-sans.woff2) format("woff2")}
:root{--lime:${LIME};--live:${LIVE};--bg:#16181a;--bar:#0f110c;--ink:#fff;--ink2:#b8bdb0;--ink3:#8d9285;--d:"Barlow Condensed","Arial Narrow",sans-serif;--b:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--ink);font:15px/1.45 var(--b);-webkit-font-smoothing:antialiased;overflow:hidden}
a{color:inherit;text-decoration:none}
.ad{position:relative;min-height:100vh;display:flex;flex-direction:column;overflow:hidden;isolation:isolate}
.m{position:absolute;left:-9%;top:-6%;width:min(78vw,92vh);opacity:.28;z-index:-1;pointer-events:none;animation:float 14s ease-in-out infinite alternate}
.m svg{display:block;width:100%;height:auto}
@keyframes float{from{transform:translate(0,0) rotate(0)}to{transform:translate(2%,3%) rotate(1.5deg)}}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:clamp(14px,2.4vh,24px) clamp(18px,4vw,44px) 0;font-weight:600;font-size:clamp(12px,1.3vw,14px);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}
.top .k{color:var(--lime);display:flex;align-items:center;gap:8px}
.top .site{color:var(--ink3)}
.dot{width:9px;height:9px;border-radius:50%;background:var(--live);flex:none;display:inline-block}
.dot.pulse{animation:pulse 1.4s ease-out infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(255,74,31,.7)}100%{box-shadow:0 0 0 10px rgba(255,74,31,0)}}
.grid{flex:1;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(16px,3vw,40px);align-items:center;padding:clamp(10px,2vh,24px) clamp(18px,4vw,44px)}
h1{margin:0;font:italic 800 clamp(44px,7.4vw,96px)/.92 var(--d);text-transform:uppercase;letter-spacing:-.01em}
h1 em{font-style:inherit;color:var(--lime)}
h1 span{display:block;opacity:0;animation:in .7s ease forwards}
h1 span:nth-child(2){animation-delay:.15s}h1 span:nth-child(3){animation-delay:.3s}
@keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.lead{margin:clamp(10px,1.8vh,18px) 0 0;max-width:46ch;font-size:clamp(14px,1.45vw,17px);color:var(--ink2)}
.cta{display:inline-flex;align-items:center;gap:8px;margin-top:clamp(14px,2.6vh,26px);padding:12px 22px;border-radius:999px;background:var(--lime);color:#0f110c;font-weight:800;font-size:15px;box-shadow:0 10px 30px rgba(198,241,53,.3);transition:transform .15s,box-shadow .15s}
.cta:hover{transform:translateY(-1px);box-shadow:0 14px 34px rgba(198,241,53,.42)}
.live{background:#fff;color:#0f110c;border-radius:18px;padding:14px 16px 12px;min-width:0;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.plogo{display:flex;align-items:center;gap:9px;margin:0 0 10px;padding-bottom:10px;border-bottom:1px solid #e1e4da;font:italic 800 24px/1 var(--d);text-transform:uppercase;letter-spacing:-.01em;color:#0f110c}
.plogo img{width:28px;height:28px;border-radius:7px;flex:none}
.plogo i{color:var(--live);font-style:inherit}
.lh{display:flex;align-items:center;gap:9px;font-size:13px;color:#5a5f55;margin-bottom:8px}
.lh b{color:#0f110c;font-weight:700}
.lt{margin-left:auto;color:#8d9285}
.rows{position:relative}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-areas:"lg lg lg" "h sc a" "st st st";align-items:center;gap:2px 10px;padding:9px 0;border-top:1px solid transparent;transition:background .15s;border-radius:8px}
.row.on ~ .row.on{border-top-color:#e1e4da}
.row:hover{background:#f4f5f0}
.row[data-page]{display:none}.row[data-page].on{display:grid;animation:in .4s ease}
.lg{grid-area:lg;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#676c60;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t{display:flex;align-items:center;gap:7px;min-width:0;font-size:14px}
.t b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t.h{grid-area:h}.t.a{grid-area:a;justify-content:flex-end;text-align:right}
.t img,.ini{width:24px;height:24px;flex:none;object-fit:contain;border-radius:50%}
.ini{display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;font-style:normal}
.sc{grid-area:sc;font:italic 800 24px/1 var(--d);min-width:52px;text-align:center;padding:3px 8px;border-radius:8px;background:#0f110c;font-variant-numeric:tabular-nums}
.sc{color:#fff}.sc.tm{font-size:17px;background:transparent;color:#5a5f55}
.is-live .sc{color:var(--lime)}
.sc.flash{animation:flash 1.2s ease}
@keyframes flash{0%{background:var(--lime);color:#0f110c}100%{background:#0f110c}}
.st{grid-area:st;font-size:11px;color:#676c60;text-align:center}
.is-live .st{color:var(--live);font-weight:700}
.dots{display:flex;justify-content:center;gap:5px;margin-top:8px}
.dots i{width:5px;height:5px;border-radius:50%;background:#d9dcd2}.dots i.on{background:#6f8f00}
.empty{margin:14px 0;color:#676c60;text-align:center}
.feats{position:relative;overflow:hidden;display:flex;white-space:nowrap;margin:0 clamp(18px,4vw,44px) clamp(12px,2vh,22px);border-top:1px solid rgba(255,255,255,.1);border-bottom:1px solid rgba(255,255,255,.1);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.run{display:inline-flex;align-items:center;flex:none;animation:run 42s linear infinite}
.feats:hover .run{animation-play-state:paused}
@keyframes run{from{transform:translateX(0)}to{transform:translateX(-100%)}}
.ft{display:inline-flex;align-items:baseline;gap:10px;padding:12px 0;color:var(--ink)}
.ft em{font:italic 800 clamp(20px,2.2vw,28px)/1 var(--d);text-transform:uppercase;letter-spacing:.01em;font-style:italic;transition:color .15s}
.ft small{font-size:13px;color:var(--ink3)}
.ft:hover em{color:var(--lime)}
.sep{width:8px;height:8px;border-radius:50%;background:var(--lime);margin:0 22px;flex:none}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 clamp(18px,4vw,44px);height:58px;background:var(--bar);flex:none}
.logo{font:italic 800 30px/1 var(--d);text-transform:uppercase;letter-spacing:-.01em}.logo i{color:var(--live);font-style:inherit}
.tag{font-size:13px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tag b{color:var(--lime);font-weight:700}
.bar:hover .tag{color:#fff}
@media (max-width:760px){
  .grid{grid-template-columns:1fr;align-items:start;gap:16px}
  h1{font-size:clamp(40px,13vw,64px)}
  .lead{max-width:none}
  .ft small{display:none}.run{animation-duration:28s}
}
@media (max-height:640px){.feats,.lead{display:none}.grid{align-items:center}}
/* the 300 px banner: the headline and the button at the left, the white panel at the right */
.bn{height:300px;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,46%);gap:clamp(14px,3vw,36px);align-items:center;padding:14px clamp(16px,3vw,40px)}
.bn .m{width:min(60vw,120vh);top:-30%;left:-6%}
.bn-say{display:flex;flex-direction:column;align-items:flex-start;gap:clamp(8px,1.6vh,14px);min-width:0}
.bn .k{display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--lime)}
.bn h1{font-size:clamp(30px,4.2vw,54px)}
.bn h1 span{display:inline}.bn h1 span+span{margin-left:.22em}
.bn .cta{margin-top:0;padding:10px 18px;font-size:14px}
.bn .site{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3)}
.bn .live{padding:10px 14px 8px;box-shadow:0 14px 40px rgba(0,0,0,.35)}
.bn .plogo{margin-bottom:6px;padding-bottom:6px;font-size:20px}.bn .plogo img{width:22px;height:22px;border-radius:6px}
.bn .lh{margin-bottom:2px;font-size:12px}
.bn .row{padding:5px 0;gap:0 8px}
.bn .lg b{font-weight:700;color:#0f110c}.bn .is-live .lg b{color:var(--live)}
.bn .t{font-size:13px}.bn .t img,.bn .ini{width:20px;height:20px}
.bn .sc{font-size:19px;min-width:44px;padding:2px 6px}.bn .sc.tm{font-size:14px}
.bn .dots{margin-top:4px}
@media (max-width:700px){
  .bn{grid-template-columns:1fr;gap:8px;align-items:start;padding:12px 14px}
  /* the sender stays visible: the logo at the top of the box and "matchly.dk · Annonce" beside the headline */
  .bn-say{flex-direction:row;align-items:baseline;justify-content:space-between;gap:10px}
  .bn h1{font-size:19px;white-space:nowrap}.bn .cta,.bn .k{display:none}
  .bn .site{font-size:10px;white-space:nowrap;flex:none}.bn .site-d{display:none}
  .bn .row.on ~ .row.on ~ .row.on{display:none}
  .bn .plogo{margin-bottom:4px;padding-bottom:4px;font-size:17px}.bn .plogo img{width:18px;height:18px;border-radius:5px}
  .bn .live{padding:8px 12px 6px}
}
@media (prefers-reduced-motion:reduce){.m,.dot,h1 span,.row[data-page].on,.sc.flash,.run{animation:none}h1 span{opacity:1}.feats{mask-image:none;-webkit-mask-image:none;flex-wrap:wrap;white-space:normal}.run[aria-hidden]{display:none}.run{flex-wrap:wrap}}
</style></head><body>
${banner ? `<div class="ad bn">
<div class="m">${M_SVG}</div>
<div class="bn-say">
<a class="k" href="${esc(home)}" target="_blank" rel="noopener"><span class="dot pulse"></span>Live score og stats</a>
<h1><span>Alle kampe.</span><span>Alle mål.</span><span><em>Lige nu.</em></span></h1>
<a class="cta" href="${esc(home)}" target="_blank" rel="noopener">Se dagens kampe <span aria-hidden="true">→</span></a>
<span class="site"><span class="site-d">matchly.dk · </span>Annonce</span>
</div>
<div class="live"><a class="plogo" href="${esc(home)}" target="_blank" rel="noopener"><img src="/icon-192.png" width="28" height="28" alt=""><span>Matchly<i>.</i></span></a><div id="live">${await adLiveHtml(q, now)}</div></div>
</div>` : `<div class="ad">
<div class="m">${M_SVG}</div>
<header class="top"><a class="k" href="${esc(home)}" target="_blank" rel="noopener"><span class="dot pulse"></span>Live score og stats</a><span class="site">matchly.dk · Annonce</span></header>
<div class="grid">
<div class="say">
<h1><span>Alle kampe.</span><span>Alle mål.</span><span><em>Lige nu.</em></span></h1>
<p class="lead">Dansk livescore for ${esc(n.sportNames.slice(0, -1).join(', '))} og ${esc(n.sportNames.at(-1) ?? '')}: Superligaen, 1.–3. division, Premier League, Bundesliga, La Liga, Champions League og pokalen. Resultater, stillinger, målscorere, opstillinger og TV-tider – gratis og uden login.</p>
<a class="cta" href="${esc(home)}" target="_blank" rel="noopener">Se dagens kampe <span aria-hidden="true">→</span></a>
</div>
<div class="live"><a class="plogo" href="${esc(home)}" target="_blank" rel="noopener"><img src="/icon-192.png" width="28" height="28" alt=""><span>Matchly<i>.</i></span></a><div id="live">${await adLiveHtml(q, now)}</div></div>
</div>
<div class="feats">${feats}</div>
<a class="bar" href="${esc(home)}" target="_blank" rel="noopener"><span class="logo">Matchly<i>.</i></span><span class="tag"><b>Live score og stats</b> · matchly.dk</span></a>
</div>`}
<script>
(function(){
var id=${JSON.stringify(q.id)},live=document.getElementById('live'),page=0,pages=1;
function paint(){var rows=live.querySelectorAll('.row[data-page]'),box=live.querySelector('.rows');pages=Math.max(1,Number(box&&box.getAttribute('data-pages'))||1);page=page%pages;
for(var i=0;i<rows.length;i++)rows[i].classList.toggle('on',rows[i].getAttribute('data-page')==String(page));
var dots=live.querySelectorAll('.dots i');for(var j=0;j<dots.length;j++)dots[j].classList.toggle('on',j===page);need()}
function turn(){page=(page+1)%pages;paint()}
function need(){parent.postMessage({matchlyAd:id,need:document.documentElement.scrollHeight},'*')}
// The matches again every half minute: a changed score flashes
function refresh(){fetch(${JSON.stringify(`${url.pathname}?${refresh}`)},{cache:'no-store'}).then(function(r){return r.ok?r.text():''}).then(function(html){if(!html)return;
var old={};live.querySelectorAll('.row').forEach(function(r){old[r.getAttribute('data-id')]=r.querySelector('.sc').getAttribute('data-score')});
live.innerHTML=html;live.querySelectorAll('.row').forEach(function(r){var sc=r.querySelector('.sc');var k=r.getAttribute('data-id');if(k in old&&old[k]!==sc.getAttribute('data-score'))sc.classList.add('flash')});paint()}).catch(function(){})}
paint();setInterval(turn,7000);setInterval(refresh,30000);
addEventListener('load',need);addEventListener('resize',need);if(window.ResizeObserver)new ResizeObserver(need).observe(document.body);
})();
</script>
</body></html>`
}
