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

interface AdQuery {
  id: string
  campaign: string
  page: string
}

export function adQuery(url: URL): AdQuery {
  return {
    id: (url.searchParams.get('id') ?? '').replace(/[^\w-]/g, '').slice(0, 40),
    campaign: campaignKey(url.searchParams.get('kampagne')),
    page: (url.searchParams.get('side') ?? '').slice(0, 300),
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
  if (date === today) return time
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
  const PER_PAGE = 5
  const rows = matches
    .map((m, i) => {
      const tv = channelsFor(m)[0]?.name
      const s = score(m)
      return `<a class="row${m.state === 'live' ? ' is-live' : ''}" href="${esc(go(q, paths.match(m.slug)))}" target="_blank" rel="noopener" data-id="${esc(m.id)}" data-page="${Math.floor(i / PER_PAGE)}">
<span class="lg">${esc(m.league)}${tv ? ` · ${esc(tv)}` : ''}</span>
<span class="t h">${badge(m.home)}<b>${esc(m.home.name)}</b></span>
<span class="sc${s ? '' : ' tm'}" data-score="${esc(s)}">${s ? esc(s) : esc(formatTime(m.kickoff))}</span>
<span class="t a"><b>${esc(m.away.name)}</b>${badge(m.away)}</span>
<span class="st">${esc(when(m, today))}</span>
</a>`
    })
    .join('')
  const pages = Math.max(1, Math.ceil(matches.length / PER_PAGE))
  return `<div class="lh"><span class="dot${live ? ' pulse' : ''}"></span><b>${esc(label)}</b><span class="lt">${live ? 'lige nu' : esc(formatWeekday(today))}</span></div>
<div class="rows" data-pages="${pages}">${rows || '<p class="empty">Ingen kampe i kalenderen lige nu.</p>'}</div>
${pages > 1 ? `<div class="dots">${Array.from({ length: pages }, (_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>` : ''}`
}

/** The whole ad as a page of its own */
export async function fullPageAdHtml(url: URL, now: number) {
  const q = adQuery(url)
  const n = adNumbers()
  const home = go(q, '/')
  const refresh = new URLSearchParams(url.searchParams)
  refresh.set('del', 'live')
  const feats = FEATURES.map((f) => `<a class="ft" href="${esc(go(q, f.path))}" target="_blank" rel="noopener"><b>${esc(f.title)}</b><span>${esc(f.text)}</span></a>`).join('')
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
.nums{list-style:none;margin:clamp(12px,2.2vh,22px) 0 0;padding:0;display:flex;flex-wrap:wrap;gap:clamp(12px,2.4vw,30px)}
.nums li{display:flex;flex-direction:column;line-height:1}
.nums b{font:italic 800 clamp(30px,3.8vw,48px)/1 var(--d);color:var(--lime);font-variant-numeric:tabular-nums}
.nums span{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);margin-top:4px}
.cta{display:inline-flex;align-items:center;gap:8px;margin-top:clamp(14px,2.6vh,26px);padding:12px 22px;border-radius:999px;background:var(--lime);color:#0f110c;font-weight:800;font-size:15px;box-shadow:0 10px 30px rgba(198,241,53,.3);transition:transform .15s,box-shadow .15s}
.cta:hover{transform:translateY(-1px);box-shadow:0 14px 34px rgba(198,241,53,.42)}
.live{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:14px 16px 12px;backdrop-filter:blur(6px);min-width:0}
.lh{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink2);margin-bottom:8px}
.lh b{color:var(--ink);font-weight:700}
.lt{margin-left:auto;color:var(--ink3)}
.rows{position:relative}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-areas:"lg lg lg" "h sc a" "st st st";align-items:center;gap:2px 10px;padding:9px 0;border-top:1px solid transparent;transition:background .15s;border-radius:8px}
.row.on ~ .row.on{border-top-color:rgba(255,255,255,.08)}
.row:hover{background:rgba(255,255,255,.05)}
.row[data-page]{display:none}.row[data-page].on{display:grid;animation:in .4s ease}
.lg{grid-area:lg;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t{display:flex;align-items:center;gap:7px;min-width:0;font-size:14px}
.t b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t.h{grid-area:h}.t.a{grid-area:a;justify-content:flex-end;text-align:right}
.t img,.ini{width:24px;height:24px;flex:none;object-fit:contain;border-radius:50%}
.ini{display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;font-style:normal}
.sc{grid-area:sc;font:italic 800 24px/1 var(--d);min-width:52px;text-align:center;padding:3px 8px;border-radius:8px;background:#0f110c;font-variant-numeric:tabular-nums}
.sc.tm{font-size:17px;background:transparent;color:var(--ink2)}
.is-live .sc{color:var(--lime)}
.sc.flash{animation:flash 1.2s ease}
@keyframes flash{0%{background:var(--lime);color:#0f110c}100%{background:#0f110c}}
.st{grid-area:st;font-size:11px;color:var(--ink3);text-align:center}
.is-live .st{color:var(--live);font-weight:700}
.dots{display:flex;justify-content:center;gap:5px;margin-top:8px}
.dots i{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.25)}.dots i.on{background:var(--lime)}
.empty{margin:14px 0;color:var(--ink3);text-align:center}
.feats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:0 clamp(18px,4vw,44px) clamp(12px,2vh,22px)}
.ft{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);transition:border-color .15s,background .15s;min-width:0}
.ft:hover{border-color:var(--lime);background:rgba(198,241,53,.06)}
.ft b{font-size:13px;font-weight:700}.ft span{font-size:12px;color:var(--ink3);line-height:1.35}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 clamp(18px,4vw,44px);height:58px;background:var(--bar);flex:none}
.logo{font:italic 800 30px/1 var(--d);text-transform:uppercase;letter-spacing:-.01em}.logo i{color:var(--live);font-style:inherit}
.tag{font-size:13px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tag b{color:var(--lime);font-weight:700}
.bar:hover .tag{color:#fff}
@media (max-width:760px){
  .grid{grid-template-columns:1fr;align-items:start;gap:16px}
  h1{font-size:clamp(40px,13vw,64px)}
  .feats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .nums{gap:18px}.lead{max-width:none}
  .ft span{display:none}
}
@media (min-width:761px) and (max-width:1060px){.feats{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-height:640px){.feats,.lead{display:none}.grid{align-items:center}}
@media (max-height:520px){.nums{display:none}}
@media (prefers-reduced-motion:reduce){.m,.dot,h1 span,.row[data-page].on,.sc.flash{animation:none}h1 span{opacity:1}}
</style></head><body>
<div class="ad">
<div class="m">${M_SVG}</div>
<header class="top"><a class="k" href="${esc(home)}" target="_blank" rel="noopener"><span class="dot pulse"></span>Live score og stats</a><span class="site">matchly.dk · Annonce</span></header>
<div class="grid">
<div class="say">
<h1><span>Alle kampe.</span><span>Alle mål.</span><span><em>Lige nu.</em></span></h1>
<p class="lead">Dansk livescore for ${esc(n.sportNames.slice(0, -1).join(', '))} og ${esc(n.sportNames.at(-1) ?? '')}: Superligaen, 1.–3. division, Premier League, Bundesliga, La Liga, Champions League og pokalen. Resultater, stillinger, målscorere, opstillinger og TV-tider – gratis og uden login.</p>
<ul class="nums"><li><b>${n.leagues}</b><span>ligaer</span></li><li><b>${n.clubs}</b><span>klubber</span></li><li><b>${n.countries}</b><span>lande</span></li><li><b>${n.sports}</b><span>sportsgrene</span></li></ul>
<a class="cta" href="${esc(home)}" target="_blank" rel="noopener">Se dagens kampe <span aria-hidden="true">→</span></a>
</div>
<div class="live" id="live">${await adLiveHtml(q, now)}</div>
</div>
<div class="feats">${feats}</div>
<a class="bar" href="${esc(home)}" target="_blank" rel="noopener"><span class="logo">Matchly<i>.</i></span><span class="tag"><b>Live score og stats</b> · matchly.dk</span></a>
</div>
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
