import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchDueNow, parseEvents, parseInfo, parseProgram, parseResult, parseSheet, parseTeams } from '../../src/lib/photos/dbu.ts'

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

const EVENTS = (rows: string) => `<div class="sr--match--live-score--eventlist">${rows}</div>`
const EVENT = (minute: number, side: 'home' | 'away', icon: string, who: string) =>
  `<div class="sr--match--live-score--event"><div class="sr--match--live-score--event--minute">&#x27;${minute}</div><div class="sr--match--live-score--event--${side}"><div class="sr--match--live-score--event--icon"><img src="/Content/Gfx/SR/livescorev2/icon_sr_${icon}.svg" /></div><div class="sr--match--live-score--event--player">${who}</div></div></div>`
const SUB = (minute: number, side: 'home' | 'away', on: string, off: string) =>
  `<div class="sr--match--live-score--event"><div class="sr--match--live-score--event--minute">&#x27;${minute}</div><div class="sr--match--live-score--event--${side}"><div class="sr--match--live-score--event--icon"><img src="/Content/Gfx/SR/livescorev2/icon_sr_sub${side === 'home' ? 'Home' : 'Away'}.svg" /></div><div class="sr--match--live-score--event--player"><div class="sr--match--live-score--event--sub"> ${on} <div class="sr--match--live-score--event--player2">${off}</div></div></div></div></div>`

test('kort og udskiftninger fra kampsiden, ældste først', () => {
  const html = EVENTS(
    // the page lists the newest first
    EVENT(94, 'home', 'yellow', 'William Kold Jensen') +
      SUB(79, 'home', 'William Kold Jensen', 'Markus Andersen') +
      EVENT(78, 'away', 'goal', 'Gustav Holm') +
      EVENT(60, 'away', 'red', 'Robin Jørgensen') +
      EVENT(30, 'away', 'yellowred', 'Ole Hansen') +
      SUB(12, 'away', 'Tom Nielsen', 'Per Olsen'),
  )
  assert.deepEqual(parseEvents(html), {
    cards: [
      { side: 'away', minute: 30, kind: 'red', name: 'Ole Hansen' },
      { side: 'away', minute: 60, kind: 'red', name: 'Robin Jørgensen' },
      { side: 'home', minute: 94, kind: 'yellow', name: 'William Kold Jensen' },
    ],
    // the player coming on is named first
    subs: [
      { side: 'away', minute: 12, on: 'Tom Nielsen', off: 'Per Olsen' },
      { side: 'home', minute: 79, on: 'William Kold Jensen', off: 'Markus Andersen' },
    ],
  })
  assert.deepEqual(parseEvents('<h2>Kampinfo</h2>'), { cards: [], subs: [] })
})

test('dommer, bane, spillested og trænere fra kampsiden', () => {
  const html = `
    <div class="col-pad"><label>Spillested</label><div><a class="link" href="/resultater/stadium/958">Holdsport Arena (ASA Grounds) </a></div><div></div><div>8000 Aarhus C</div><div>Tlf: 8613 6289</div></div>
    <div class="col-pad"><label>Bane</label><div>Kunst 1 Holdsport Arena-ASA</div></div>
    <div class="col-pad"><label>Dommer</label><span>Simon Fenger</span></div>
    <div class="col-pad"><label>Liniedommer 1</label><span>Lasse Clausen</span></div>
    <div class="col-pad"><label>Liniedommer 2</label><span>J&#xF3;n Johannesen</span></div>
    <div class="x">Holdopstillinger</div>
    <table class="dbu-data-table home-team"><thead><tr><th><span>Officials</span></th></tr></thead>
      <tr class="official-tr"><td><span class=" p-role">Tr&#xE6;ner</span> <span class="p-name">Birger Fosdal</span></td></tr>
      <tr class="official-tr"><td><span class=" p-role">Cheftr&#xE6;ner</span> <span class="p-name">Lennart Lindsted</span></td></tr></table>
    <table class="dbu-data-table away-team"><thead><tr><th><span>Officials</span></th></tr></thead>
      <tr class="official-tr"><td><span class=" p-role">Tr&#xE6;ner</span> <span class="p-name">Thomas Loran</span></td></tr>
      <tr class="official-tr"><td><span class=" p-role">Fysisk tr&#xE6;ner</span> <span class="p-name">Icare Gnenzeko</span></td></tr>
      <tr class="official-tr"><td><span class=" p-role">Tr&#xE6;ner</span> <span class="p-name">Tommy Jeppesen</span></td></tr></table>`
  assert.deepEqual(parseInfo(html), {
    referee: 'Simon Fenger',
    assistants: ['Lasse Clausen', 'Jón Johannesen'],
    pitch: 'Kunst 1 Holdsport Arena-ASA',
    venue: 'Holdsport Arena (ASA Grounds)',
    address: '8000 Aarhus C',
    homeCoach: 'Lennart Lindsted',
    // no head coach named: the coach is one of the "Træner"s (not the physical trainer)
    homeTrainers: ['Birger Fosdal'],
    awayTrainers: ['Thomas Loran', 'Tommy Jeppesen'],
  })
  assert.deepEqual(parseInfo('<h2>Kampinfo</h2>'), { assistants: [], homeTrainers: [], awayTrainers: [] })
})

test('kampsider på kampdagen: først når kampen er slut, så hvert 25. minut', () => {
  // 2026-10-10 is in summer time (Danish time = UTC + 2): 15:30 UTC is 17:30
  const at = (iso: string) => new Date(iso)
  const m = { date: '2026-10-10', kickoff: '14:30', fetchedAt: null as string | null }
  // kick-off 14:30 + 105 minutes = 16:15
  assert.equal(matchDueNow(m, at('2026-10-10T13:40:00Z')), false, '15:40 dansk tid: kampen er ikke slut')
  assert.equal(matchDueNow(m, at('2026-10-10T14:20:00Z')), true, '16:20: slut, aldrig læst')
  assert.equal(matchDueNow({ ...m, fetchedAt: '2026-10-10T14:10:00Z' }, at('2026-10-10T14:20:00Z')), false, 'læst for 10 minutter siden')
  assert.equal(matchDueNow({ ...m, fetchedAt: '2026-10-10T13:50:00Z' }, at('2026-10-10T14:20:00Z')), true, 'læst for 30 minutter siden')
  // no kick-off time: not before 13:45 (12:00 + 105 minutes)
  assert.equal(matchDueNow({ date: '2026-10-10', fetchedAt: null }, at('2026-10-10T11:30:00Z')), false)
  assert.equal(matchDueNow({ date: '2026-10-10', fetchedAt: null }, at('2026-10-10T12:00:00Z')), true)
})

test('kampsider: ikke kommende kampe, og ældre kampe hver 12. time', () => {
  const now = new Date('2026-10-10T20:00:00Z')
  assert.equal(matchDueNow({ date: '2026-10-11', kickoff: '14:00' }, now), false, 'en kamp i morgen')
  assert.equal(matchDueNow({ date: '2026-10-09', kickoff: '19:00', fetchedAt: '2026-10-10T10:00:00Z' }, now), false, 'læst for 10 timer siden')
  assert.equal(matchDueNow({ date: '2026-10-09', kickoff: '19:00', fetchedAt: '2026-10-10T07:00:00Z' }, now), true, 'læst for 13 timer siden')
  assert.equal(matchDueNow({ date: '2026-10-09', kickoff: '19:00' }, now), true, 'aldrig læst')
})
