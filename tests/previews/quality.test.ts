import assert from 'node:assert/strict'
import { test } from 'node:test'
import { angle, buildPreview, type PreviewInput } from '../../src/lib/previews/build.ts'
import { checkPreview } from '../../src/lib/previews/quality.ts'

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const names = Object.fromEntries(ids.map((x) => [x, `Klub ${x.toUpperCase()}`]))
const results: PreviewInput['results'] = []
let day = 0
for (let r = 0; r < 6; r++)
  for (let i = 0; i < 8; i += 2) {
    day++
    results.push({ date: `2026-08-${String((day % 28) + 1).padStart(2, '0')}`, homeId: ids[(i + r) % 8], awayId: ids[(i + r + 1) % 8], hs: (i + r) % 4, as: (i * r) % 3 })
  }
const mk = (h: string, a: string, extra: Partial<PreviewInput> = {}): PreviewInput => ({
  fixture: { key: h + a, date: '2026-10-10', time: '13:00', venue: 'Stadion', tv: null, home: { id: h, name: names[h] }, away: { id: a, name: names[a] } },
  league: { name: '3. division', sponsor: 'CampoBet 3. Division', page: '/turnering/3-division' },
  season: '2026/27',
  results,
  names,
  goals: [{ clubId: h, name: 'Ole Hansen' }],
  meetings: [],
  ...extra,
})

test('en optakt med nok data er grøn', () => {
  const i = mk('a', 'b')
  const q = checkPreview(i, buildPreview(i))
  assert.equal(q.level, 'green', q.reasons.join('; '))
})

test('søgeordet "X mod Y" står i titel, beskrivelse og første sætning', () => {
  const p = buildPreview(mk('a', 'b'))
  assert.equal(p.focusKeyword, 'Klub A mod Klub B')
  assert.ok(p.seoTitle.includes('Klub A mod Klub B'))
  assert.ok(p.metaDescription.includes('Klub A mod Klub B'))
  assert.match(p.content.split('\n')[0], /Klub A<?\/?a?>? mod /)
})

test('for få kampe eller intet tidspunkt: ingen artikel', () => {
  const few = mk('a', 'b', { results: results.slice(0, 4) })
  assert.equal(checkPreview(few, buildPreview(few)).level, 'blocked')
  const noTime = mk('a', 'b')
  noTime.fixture = { ...noTime.fixture, time: null }
  assert.equal(checkPreview(noTime, buildPreview(noTime)).level, 'blocked')
})

test('en målscorer, der ikke står i truppen, gør den gul', () => {
  const i = mk('a', 'b')
  const q = checkPreview(i, buildPreview(i), { squads: { a: ['Peter Jensen'] } })
  assert.equal(q.level, 'yellow')
  assert.ok(q.reasons.some((r) => r.includes('Ole Hansen')))
  assert.equal(checkPreview(i, buildPreview(i), { squads: { a: ['Ole Hansen'] } }).level, 'green')
})

test('en kopi af en anden artikel og et åbent fund i datavagten gør den gul', () => {
  const i = mk('a', 'b')
  const p = buildPreview(i)
  assert.equal(checkPreview(i, p, { others: [buildPreview(mk('c', 'd'))] }).level, 'green')
  assert.equal(checkPreview(i, p, { others: [{ ...p, slug: 'kopi', title: 'Kopi' }] }).level, 'yellow')
  assert.equal(checkPreview(i, p, { flagged: ['Klub B'] }).level, 'yellow')
})

test('dobbelte kampe i data gør den gul', () => {
  const i = mk('a', 'b', { results: [...results, results[0]] })
  assert.ok(checkPreview(i, buildPreview(i)).reasons.some((r) => r.includes('to gange')))
})

test('vinklen: sejrsstime, top mod bund og indbyrdes greb', () => {
  const run = mk('a', 'b', {
    results: [
      { date: '2026-08-01', homeId: 'a', awayId: 'c', hs: 2, as: 0 },
      { date: '2026-08-08', homeId: 'd', awayId: 'a', hs: 0, as: 1 },
      { date: '2026-08-15', homeId: 'a', awayId: 'e', hs: 3, as: 1 },
      { date: '2026-08-15', homeId: 'b', awayId: 'f', hs: 1, as: 1 },
    ],
  })
  assert.equal(angle(run), 'Klub A kommer til kampen på tre sejre i træk.')
  const h2h = mk('a', 'b', { results: [], meetings: [1, 2, 3, 4].map((y) => ({ date: `202${y}-05-01`, atHome: true, forHome: 2, forAway: 0 })) })
  assert.equal(angle(h2h), 'Klub A har vundet fire af de seneste fire indbyrdes opgør.')
})

