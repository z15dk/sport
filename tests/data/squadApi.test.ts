import assert from 'node:assert/strict'
import { test } from 'node:test'
import { squadFromApi } from '../../src/data/squadApi.ts'

const row = (id: number, name: string, st: Record<string, unknown>) => ({ player: { id, name, photo: `https://media.api-sports.io/football/players/${id}.png` }, statistics: [st] })
const league = { id: 135, name: 'Serie A' }

test('truppen fra API-Sports: kun ligaens egne tal, med mål, assists og kort', () => {
  const squad = squadFromApi(
    [
      row(1, 'L. Martínez', { league, games: { appearences: 9, lineups: 8, minutes: 700, number: 10, position: 'Attacker', rating: '7.4' }, goals: { total: 4, assists: 1 }, cards: { yellow: 2, yellowred: 1, red: 0 } }),
      row(2, 'Y. Sommer', { league, games: { appearences: 9, lineups: 9, minutes: 810, position: 'Goalkeeper' }, goals: { total: null, assists: null }, cards: { yellow: 0, yellowred: 0, red: 0 } }),
      // has not played: not in the squad list
      row(3, 'Bench Guy', { league, games: { appearences: 0, lineups: 0, minutes: null }, goals: {}, cards: {} }),
      // the same player twice (two pages): once
      row(2, 'Y. Sommer', { league, games: { appearences: 9, lineups: 9, minutes: 810, position: 'Goalkeeper' }, goals: {}, cards: {} }),
    ],
    '135',
  )
  assert.equal(squad.length, 2)
  assert.deepEqual(squad[0], {
    id: 1,
    name: 'L. Martínez',
    photo: 'https://media.api-sports.io/football/players/1.png',
    number: 10,
    pos: 'F',
    starts: 8,
    subbedOn: 1,
    goals: 4,
    assists: 1,
    // a second yellow counts as a yellow and as a red
    yellow: 3,
    red: 1,
    minutes: 700,
    rating: 7.4,
  })
  assert.equal(squad[1].pos, 'G')
  assert.equal(squad[1].goals, 0)
})

test('truppen: andre ligaers tal tæller ikke, og et svar uden spillere giver en tom trup', () => {
  const other = { id: 2, name: 'Coppa' }
  const rows = [row(5, 'M. Rossi', { league: other, games: { appearences: 3, lineups: 3, minutes: 270 }, goals: { total: 2 }, cards: {} })]
  assert.deepEqual(squadFromApi(rows, '135'), [])
  // a single row that names no league is taken as the league's
  assert.equal(squadFromApi([row(6, 'A. Bianchi', { games: { appearences: 2, lineups: 1 }, goals: {}, cards: {} })], '135').length, 1)
  assert.equal(squadFromApi(rows, '2').length, 1)
  assert.deepEqual(squadFromApi([], '135'), [])
  assert.deepEqual(squadFromApi([{ player: {} }, {}] as never, '135'), [])
})
