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
    <div class="matchprogram-date"><span>l&#xF8;r.</span>01-08 2026</div>
    <a class="link" href="/resultater/hold/9351_508656">Brabrand</a><a class="link" href="/resultater/hold/7287_508656">Skive</a></tr>`
  assert.deepEqual(parseProgram(html), [{ key: '308807_508656', date: '2026-08-01', home: 'Brabrand', away: 'Skive', url: '/resultater/kamp/308807_508656/kampinfo' }])
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
