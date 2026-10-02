import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPreview, dkDate, form, table, venueRecord, type PreviewInput } from '../../src/lib/previews/build.ts'

const results = [
  { date: '2026-08-01', homeId: 'vej', awayId: 'hvi', hs: 1, as: 1 },
  { date: '2026-08-08', homeId: 'hvi', awayId: 'esb', hs: 3, as: 0 },
  { date: '2026-08-08', homeId: 'esb', awayId: 'vej', hs: 0, as: 2 },
  { date: '2026-08-15', homeId: 'vej', awayId: 'esb', hs: 4, as: 1 },
]
const input: PreviewInput = {
  fixture: { key: 'k', date: '2026-10-09', time: '18:00', venue: 'Vejle Stadion', tv: 'Viaplay', home: { id: 'vej', name: 'Vejle Boldklub', page: '/klub/vejle' }, away: { id: 'hvi', name: 'Hvidovre' } },
  league: { name: '1. division', sponsor: 'Betinia Liga', page: '/turnering/1-division' },
  season: '2026/27',
  results,
  names: { vej: 'Vejle Boldklub', hvi: 'Hvidovre', esb: 'Esbjerg fB' },
  goals: [{ clubId: 'vej', name: 'Tobias Bach' }, { clubId: 'vej', name: 'Tobias Bach' }, { clubId: 'hvi', name: 'Erouan Kafo Bagou' }],
  meetings: [
    { date: '2024-04-01', atHome: false, forHome: 2, forAway: 0 },
    { date: '2023-10-01', atHome: true, forHome: 1, forAway: 1 },
  ],
}

test('dato på dansk', () => {
  assert.equal(dkDate('2026-10-09'), 'fredag 9. oktober 2026')
  assert.equal(dkDate('2026-10-09', false, false), '9. oktober')
})

test('stilling, form og hjemme/ude', () => {
  const t = table(results)
  assert.deepEqual(t.map((r) => [r.id, r.points]), [['vej', 7], ['hvi', 4], ['esb', 0]])
  assert.deepEqual(form('vej', results).map((g) => g.outcome), ['V', 'V', 'U'])
  assert.deepEqual(venueRecord('vej', results, true), { played: 2, won: 1, drawn: 1, lost: 0, gf: 5, ga: 2, cleanSheets: 0 })
})

test('optakten: svar først, fakta, spørgsmål og tags', () => {
  const p = buildPreview(input)
  assert.equal(p.slug, 'optakt-vejle-boldklub-hvidovre-2026-10-09')
  assert.match(p.content, /^<p><a href="\/klub\/vejle">Vejle Boldklub<\/a> møder Hvidovre i <a href="\/turnering\/1-division">1\. division<\/a> fredag 9\. oktober 2026 kl\. 18\.00 på Vejle Stadion\. Kampen vises på Viaplay\./)
  assert.match(p.content, /Det er et opgør mellem rækkens to bedste hold/)
  assert.match(p.content, /Tobias Bach \(2\)/)
  assert.match(p.content, /mødt hinanden 2 gange .* Vejle Boldklub har vundet 1, Hvidovre har vundet 0, og 1 kamp er endt uafgjort/)
  // Sidste opgør: Hvidovre hjemme, Vejle vandt 2-0 ude
  assert.match(p.content, /endte det Hvidovre–Vejle Boldklub 0-2/)
  assert.match(p.content, /<h3>Hvor kan jeg se Vejle Boldklub mod Hvidovre\?<\/h3><p>Kampen vises på Viaplay\.<\/p>/)
  assert.deepEqual(p.tags, ['Vejle Boldklub', 'Hvidovre', '1. division'])
  assert.ok(p.seoTitle.length <= 70)
})

test('uden data: sætningerne udelades, og intet gættes', () => {
  const p = buildPreview({ ...input, fixture: { ...input.fixture, time: null, venue: null, tv: null }, results: [], goals: [], meetings: [] })
  assert.doesNotMatch(p.content, /Stadion|vises på|Topscorere|Stillingen/)
  assert.match(p.content, /ikke mødt hinanden i ligakampe i vores data/)
  assert.match(p.content, /spilles fredag 9\. oktober 2026\./)
})

test('navne escapes', () => {
  const p = buildPreview({ ...input, fixture: { ...input.fixture, away: { id: 'x', name: 'B&I <test>' } } })
  assert.match(p.content, /B&amp;I &lt;test&gt;/)
})
