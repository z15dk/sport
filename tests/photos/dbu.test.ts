import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseProgram, parseResult, parseSheet, parseTeams } from '../../src/lib/photos/dbu.ts'

// Small made-up pages in dbu.dk's structure (no real contact details)
const teams = `<div class="sr--pool--team-list--team" onclick="window.location.href = '/resultater/hold/9351_508656/'">
  <h3>Brabrand</h3><div><h4>Spillested</h4>Anlæg</div>
  <div><label>Trøje</label><span>Bl&#xE5;</span></div><div><label>Shorts</label><span>Hvid</span></div><div><label>Strømper</label><span>Bl&#xE5;</span></div>
  <div class="coach"><h4>Træner</h4><span>Navn</span><span>Tel: 1</span></div>
</div><div class="sr--pool--team-list--team" onclick="x('/resultater/hold/7287_508656/')"><h3>Skive</h3>
  <div><label>Trøje</label><span>Gul/Bl&#xE5;</span></div></div>`

test('klubber og trøjefarver fra holdoversigten', () => {
  const r = parseTeams(teams)
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], { name: 'Brabrand', colors: ['blå'], kit: { shirt: 'blå', shorts: 'hvid', socks: 'blå' }, team: '9351_508656' })
  assert.deepEqual(r[1].colors, ['gul', 'blå'])
})

test('kampprogram: dato og hold', () => {
  const html = `<tr class="even" onclick="MatchProgramMatchClick('/resultater/kamp/308807_508656/kampinfo')">
    <td><div class="matchprogram-date"><span>l&#xF8;r.</span>01-08 2026</div></td><td class="hide-on-mobile"> 14:00 </td>
    <a class="link" href="/resultater/hold/9351_508656">Brabrand</a><a class="link" href="/resultater/hold/7287_508656">Skive</a>
    <td><a class="link" href="/resultater/stadium/1034">Brabrand IF&#x27;s Idr&#xE6;tsanl&#xE6;g</a></td><td><div class="tv-logo"><div class="tv-logo-text"> Viaplay </div></div></td></tr>`
  assert.deepEqual(parseProgram(html), [{ key: '308807_508656', date: '2026-08-01', time: '14:00', home: 'Brabrand', away: 'Skive', url: '/resultater/kamp/308807_508656/kampinfo', venue: "Brabrand IF's Idrætsanlæg", tv: 'Viaplay' }])
})

test('holdkort: startopstilling og reserver, trænere tæller ikke', () => {
  const html = `<h2>Holdopstillinger</h2>
    <table class="dbu-data-table home-team"><thead><tr><th><span>Brabrand</span></th></tr></thead>
      <tr><td class="shirt-number"><span>1</span></td><td><span>J&#xF8;rgen Keeper</span></td></tr></table>
    <table class="dbu-data-table home-team"><thead><tr><th><span>Reserver</span></th></tr></thead>
      <tr><td class="shirt-number"><span>17</span></td><td><span>Ole Reserve</span></td></tr></table>
    <table class="dbu-data-table home-team"><thead><tr><th>Officials</th></tr></thead><tr><td><span>Træner Navn</span></td></tr></table>
    <table class="dbu-data-table away-team dbu-data-table-oddeven"><thead><tr><th><span>Skive</span></th></tr></thead>
      <tr><td><span>Ude Spiller</span></td><td class="shirt-number">9</td></tr></table>`
  assert.deepEqual(parseSheet(html), {
    home: [{ number: 1, name: 'Jørgen Keeper', reserve: false }, { number: 17, name: 'Ole Reserve', reserve: true }],
    away: [{ number: 9, name: 'Ude Spiller', reserve: false }],
  })
  assert.equal(parseSheet('<h2>Kampinfo</h2>'), undefined)
})

test('resultat og målscorere fra kampsiden (nyeste først på siden)', () => {
  const ev = (min: string, side: string, name: string, icon: string) =>
    `<div class="sr--match--live-score--event"><div class="sr--match--live-score--event--minute">&#x27;${min}</div><div class="sr--match--live-score--event--${side}"><div class="sr--match--live-score--event--player">\n${name}   </div><div class="sr--match--live-score--event--icon"><img src="/x/${icon}" /></div></div></div>`
  const html = `<div class="sr--match--live-score--result--home"><div class="sr--match--live-score--result--scoreboard--content">1</div></div>
    <div class="sr--match--live-score--result--away"><div class="sr--match--live-score--result--scoreboard--content">3</div></div>
    ${ev('91', 'away', 'Zean Peets Dal&#xFC;gge', 'icon_sr_goal.svg')}${ev('77', 'home', 'Rasmus Juul', 'icon_sr_yellow.svg')}${ev('42', 'home', 'Simon Vesterbæk', 'icon_sr_goal.svg')}${ev('18', 'away', 'Malthe Larsson', 'icon_sr_goal.svg')}`
  assert.deepEqual(parseResult(html), {
    home: 1,
    away: 3,
    goals: [
      { side: 'away', minute: 18, name: 'Malthe Larsson' },
      { side: 'home', minute: 42, name: 'Simon Vesterbæk' },
      { side: 'away', minute: 91, name: 'Zean Peets Dalügge' },
    ],
  })
  assert.equal(parseResult('<h2>Kampinfo</h2>'), undefined)
})

test('nye billeder fra en ukendt kamp: netop den kampside hentes', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  const { openPhotoDb } = await import('../../src/lib/photos/db.ts')
  const { fetchMatchesForQueue } = await import('../../src/lib/photos/dbu.ts')
  const dir = mkdtempSync(path.join(tmpdir(), 'dbu-'))
  const db = openPhotoDb(path.join(dir, 'b.db'))
  const now = new Date().toISOString()
  db.exec(`INSERT INTO matches (match_key, date, home_id, away_id, source, url, has_lineups, has_events) VALUES
    ('dbu:1_1', '2026-09-20', 'agf', 'fcm', 'dbu', '/resultater/kamp/1_1/kampinfo', 0, 0),
    ('dbu:2_1', '2026-09-21', 'agf', 'ob', 'dbu', '/resultater/kamp/2_1/kampinfo', 0, 0)`)
  db.prepare(`INSERT INTO photos (drive_id, name, path, club_id, opponent_id, match_date, status, created_at) VALUES ('a', 'a', 'p', 'agf', 'fcm', '2026-09-20', 'ny', ?)`).run(now)
  const urls: string[] = []
  const real = globalThis.fetch
  globalThis.fetch = (async (u: string) => {
    urls.push(String(u))
    return new Response(`<div class="sr--match--live-score--result--home"><div class="sr--match--live-score--result--scoreboard--content">2</div></div><div class="sr--match--live-score--result--away"><div class="sr--match--live-score--result--scoreboard--content">0</div></div>
      <h2>Holdopstillinger</h2><table class="dbu-data-table home-team"><thead><tr><th><span>AGF</span></th></tr></thead><tr><td class="shirt-number"><span>9</span></td><td><span>Ni Nisen</span></td></tr></table>`)
  }) as typeof fetch
  try {
    assert.equal(await fetchMatchesForQueue(db, 0), 1)
  } finally {
    globalThis.fetch = real
  }
  // Kun kampen med nye billeder – ikke den anden
  assert.deepEqual(urls, ['https://www.dbu.dk/resultater/kamp/1_1/kampinfo'])
  assert.deepEqual(db.prepare(`SELECT number, name FROM lineups WHERE match_key = 'dbu:1_1'`).all().map((r) => [r.number, r.name]), [[9, 'Ni Nisen']])
  assert.equal(db.prepare(`SELECT home_score FROM matches WHERE match_key = 'dbu:1_1'`).get()!.home_score, 2)
  // Hentet for nylig: ikke igen
  assert.equal(await fetchMatchesForQueue(db, 0), 0)
  db.close()
  rmSync(dir, { recursive: true, force: true })
})
