#!/usr/bin/env node
// What our football data source has for the Danish leagues: its own coverage
// list per league, and a sample of the players, top scorers and one match's
// player numbers for Superliga and 1st-3rd division. About 20-25 requests.
//
// On the VPS:  node /opt/scoreline/current/scripts/dk-coverage.mjs
// (reads API_SPORTS_KEY from /opt/scoreline/env, or the environment)

import { readFileSync } from 'node:fs'

const envKey = () => {
  try {
    const env = readFileSync('/opt/scoreline/env', 'utf8')
    const line = env.split('\n').find((l) => /^\s*(export\s+)?API_SPORTS_KEY(_FOOTBALL)?\s*=/.test(l))
    return line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')
  } catch {
    return undefined
  }
}
const KEY = process.env.API_SPORTS_KEY_FOOTBALL || process.env.API_SPORTS_KEY || envKey()
if (!KEY) {
  console.error('Ingen API_SPORTS_KEY fundet (hverken i miljøet eller /opt/scoreline/env)')
  process.exit(1)
}

let used = 0
let left
async function get(path) {
  used++
  const res = await fetch(`https://v3.football.api-sports.io${path}`, { headers: { 'x-apisports-key': KEY } })
  left = res.headers.get('x-ratelimit-requests-remaining') ?? left
  const body = await res.json()
  const errors = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors))
  if (errors?.length) throw new Error(errors.join(', '))
  return body
}

const yes = (v) => (v ? 'ja' : 'nej')
const pad = (s, n) => String(s).padEnd(n)

console.log('Danske fodboldligaer og hvad kilden dækker (nuværende sæson)\n')
const { response: leagues } = await get('/leagues?country=Denmark')
const rows = leagues
  .filter((l) => l.league.type === 'League' || /pokal|cup/i.test(l.league.name))
  .map((l) => {
    const s = l.seasons.find((x) => x.current) ?? l.seasons.at(-1)
    return { id: l.league.id, name: l.league.name, type: l.league.type, season: s?.year, cov: s?.coverage ?? {} }
  })
console.log(pad('Id', 6) + pad('Liga', 34) + pad('Sæson', 7) + pad('Kampe', 7) + pad('Mål/kort', 10) + pad('Opstill.', 10) + pad('Kampstat.', 11) + pad('Spillerstat.', 14) + pad('Spillere', 10) + pad('Topscorere', 11) + 'Stilling')
for (const r of rows) {
  const f = r.cov.fixtures ?? {}
  console.log(
    pad(r.id, 6) + pad(r.name.slice(0, 32), 34) + pad(r.season ?? '-', 7) + pad(yes(f.events !== undefined), 7) + pad(yes(f.events), 10) + pad(yes(f.lineups), 10) +
      pad(yes(f.statistics_fixtures), 11) + pad(yes(f.statistics_players), 14) + pad(yes(r.cov.players), 10) + pad(yes(r.cov.top_scorers), 11) + yes(r.cov.standings),
  )
}

// Superliga and the divisions below it (the 2nd and 3rd division can be split in groups)
const wanted = rows.filter((r) => /superliga|1\. ?division|2\. ?division|3\. ?division/i.test(r.name) && r.type === 'League')
for (const r of wanted) {
  console.log(`\n=== ${r.name} (id ${r.id}, sæson ${r.season}) ===`)
  try {
    const players = await get(`/players?league=${r.id}&season=${r.season}`)
    const total = players.paging?.total ? players.paging.total * 20 : players.results
    const list = players.response ?? []
    const withGames = list.filter((p) => (p.statistics?.[0]?.games?.appearences ?? 0) > 0)
    const withRating = list.filter((p) => p.statistics?.[0]?.games?.rating)
    const withPhoto = list.filter((p) => p.player?.photo && !/\/0\.png$/.test(p.player.photo))
    console.log(`Spillere: ca. ${total} i alt (${players.paging?.total ?? '?'} sider). Første side: ${list.length} spillere, ${withGames.length} med kampe, ${withRating.length} med rating, ${withPhoto.length} med billede.`)
    const sample = withGames[0] ?? list[0]
    if (sample) {
      const st = sample.statistics?.[0] ?? {}
      const filled = Object.entries(st)
        .filter(([k]) => !['team', 'league'].includes(k))
        .map(([k, v]) => `${k}: ${Object.values(v ?? {}).filter((x) => x !== null && x !== undefined).length}/${Object.keys(v ?? {}).length}`)
      console.log(`Eksempel: ${sample.player.name} (${st.team?.name}) – ${sample.player.age ?? '?'} år, ${sample.player.nationality ?? '?'}, ${sample.player.height ?? 'højde ukendt'}`)
      console.log(`  Udfyldte felter pr. gruppe: ${filled.join(', ')}`)
      console.log(`  Kampe ${st.games?.appearences ?? '-'}, min ${st.games?.minutes ?? '-'}, mål ${st.goals?.total ?? '-'}, assists ${st.goals?.assists ?? '-'}, rating ${st.games?.rating ?? '-'}, skud ${st.shots?.total ?? '-'}, afl. ${st.passes?.total ?? '-'}`)
    }
  } catch (err) {
    console.log(`Spillere: fejl – ${err.message}`)
  }
  try {
    const top = await get(`/players/topscorers?league=${r.id}&season=${r.season}`)
    const t = top.response ?? []
    console.log(`Topscorere: ${t.length ? t.slice(0, 3).map((p) => `${p.player.name} ${p.statistics?.[0]?.goals?.total}`).join(', ') : 'ingen'}`)
  } catch (err) {
    console.log(`Topscorere: fejl – ${err.message}`)
  }
  try {
    const last = await get(`/fixtures?league=${r.id}&season=${r.season}&last=1`)
    const fx = last.response?.[0]
    if (!fx) {
      console.log('Seneste kamp: ingen')
      continue
    }
    const full = await get(`/fixtures?id=${fx.fixture.id}`)
    const m = full.response?.[0] ?? {}
    const players = (m.players ?? []).flatMap((t) => t.players ?? [])
    const played = players.filter((p) => p.statistics?.[0]?.games?.minutes)
    console.log(
      `Seneste kamp: ${fx.teams.home.name} ${fx.goals.home}-${fx.goals.away} ${fx.teams.away.name} (${fx.fixture.date.slice(0, 10)}): ` +
        `${(m.events ?? []).length} hændelser, ${(m.lineups ?? []).length === 2 ? 'opstillinger' : 'ingen opstillinger'}, ` +
        `${(m.statistics ?? []).length === 2 ? 'kampstatistik' : 'ingen kampstatistik'}, ` +
        `spillertal for ${played.length} spillere (${played.filter((p) => p.statistics[0].games.rating).length} med rating)`,
    )
  } catch (err) {
    console.log(`Seneste kamp: fejl – ${err.message}`)
  }
}

console.log(`\nBrugte ${used} kald. Tilbage i dag: ${left ?? 'ukendt'}.`)
