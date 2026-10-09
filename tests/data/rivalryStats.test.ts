import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rivalryStats, type Meeting } from '../../src/lib/rivalryStats.ts'

const m = (date: string, home: string, away: string, hs: number, as: number, competition = 'La Liga'): Meeting => ({ date: new Date(date), competition, home, away, homeScore: hs, awayScore: as })
const names = { a: 'Real Madrid', b: 'Villarreal' }
// Newest first
const meetings = [
  m('2026-01-24', 'Villarreal', 'Real Madrid', 0, 2),
  m('2025-10-04', 'Real Madrid', 'Villarreal', 3, 1),
  m('2025-03-15', 'Villarreal', 'Real Madrid', 1, 2),
  m('2024-10-05', 'Real Madrid', 'Villarreal', 2, 0),
  m('2024-05-19', 'Villarreal', 'Real Madrid', 4, 4),
  m('2023-12-17', 'Real Madrid', 'Villarreal', 4, 1),
  m('2023-04-08', 'Real Madrid', 'Villarreal', 2, 3, 'Copa del Rey'),
  m('2022-02-12', 'Villarreal', 'Real Madrid', 0, 0),
]

test('goals and how the meetings go', () => {
  const s = rivalryStats(meetings, 'Real Madrid', names)
  assert.equal(s.n, 8)
  assert.equal(s.goalsA, 2 + 3 + 2 + 2 + 4 + 4 + 2 + 0)
  assert.equal(s.goalsB, 0 + 1 + 1 + 0 + 4 + 1 + 3 + 0)
  assert.equal(s.over25, 5) // 3-1, 1-2, 4-4, 4-1, 2-3
  assert.equal(s.btts, 5) // 3-1, 1-2, 4-4, 4-1, 2-3
  assert.equal(s.cleanA, 3) // 0-2, 2-0, 0-0
  assert.equal(s.cleanB, 1) // 0-0
  assert.equal(s.nilNil, 1)
})

test('the last five, oldest first, and the run going on', () => {
  const s = rivalryStats(meetings, 'Real Madrid', names)
  assert.deepEqual(s.lastFive, ['U', 'V', 'V', 'V', 'V'])
  assert.equal(s.run, 'Real Madrid har vundet de seneste 4 opgør')
  const draws = rivalryStats([m('2026-01-01', 'A', 'B', 1, 1), m('2025-01-01', 'B', 'A', 0, 0), m('2024-01-01', 'A', 'B', 2, 2), m('2023-01-01', 'A', 'B', 1, 0)], 'A', { a: 'A', b: 'B' })
  assert.equal(draws.run, 'De seneste 3 opgør er endt uafgjort')
  const unbeaten = rivalryStats([m('2026-01-01', 'A', 'B', 1, 1), m('2025-01-01', 'B', 'A', 0, 1), m('2024-01-01', 'A', 'B', 2, 2), m('2023-01-01', 'A', 'B', 0, 1)], 'A', { a: 'A', b: 'B' })
  assert.equal(unbeaten.run, 'A er ubesejret i de seneste 3 opgør')
})

test('competitions, the most common result and the first meeting', () => {
  const s = rivalryStats(meetings, 'Real Madrid', names)
  assert.deepEqual(s.competitions[0], { name: 'La Liga', n: 7, a: 5, draw: 2, b: 0 })
  assert.deepEqual(s.competitions[1], { name: 'Copa del Rey', n: 1, a: 0, draw: 0, b: 1 })
  assert.deepEqual(s.commonScore, { score: '2-0', times: 2 })
  assert.equal(s.first?.date.getFullYear(), 2022)
})
