import assert from 'node:assert/strict'
import { test } from 'node:test'
import { danishCountry, shownTeam } from '../../src/data/countries.ts'
import { biggestOf, checkedTeamStats, type TeamStats } from '../../src/data/teamStats.ts'

test('national teams are shown by their Danish names in tournaments between countries', () => {
  assert.equal(shownTeam('Scotland', 'World'), 'Skotland')
  assert.equal(shownTeam('FYR Macedonia', 'World'), 'Nordmakedonien')
  assert.equal(shownTeam('Ivory Coast', 'World'), 'Elfenbenskysten')
  assert.equal(shownTeam('Switzerland', 'World'), 'Schweiz')
  assert.equal(shownTeam('Türkiye', 'World'), 'Tyrkiet')
  assert.equal(shownTeam('Bosnia & Herzegovina', 'World'), 'Bosnien-Hercegovina')
  assert.equal(shownTeam('Korea Republic U23', 'World'), 'Sydkorea U23')
  assert.equal(shownTeam('Denmark U19 W', 'World'), 'Danmark U19 (K)')
  assert.equal(shownTeam('Brazil Olympic', 'World'), 'Brasilien OL')
  assert.equal(shownTeam('Sweden', 'Europe'), 'Sverige')
})

test('names that are the same in Danish, and clubs, are kept', () => {
  assert.equal(shownTeam('Wales', 'World'), 'Wales')
  assert.equal(shownTeam('England', 'World'), 'England')
  assert.equal(shownTeam('Monaco', 'World'), 'Monaco')
  assert.equal(shownTeam('Real Madrid', 'World'), 'Real Madrid')
  // Only between countries: a club in a country's own league is never renamed
  assert.equal(shownTeam('Georgia', 'USA'), 'Georgia')
  assert.equal(shownTeam('Barcelona B', 'Spain'), 'Barcelona B')
  assert.equal(shownTeam('FC København', 'Denmark'), 'FC København')
  assert.equal(shownTeam('Scotland'), 'Scotland')
})

test("women's teams are marked (K) where the source writes W", () => {
  assert.equal(shownTeam('Paris FC W', 'France'), 'Paris FC (K)')
  assert.equal(shownTeam('Arsenal Women', 'England'), 'Arsenal (K)')
  assert.equal(shownTeam('Brondby U19 W', 'Denmark'), 'Brondby U19 (K)')
  assert.equal(shownTeam('Denmark W', 'World'), 'Danmark (K)')
  // Already shown: unchanged
  assert.equal(shownTeam('Paris FC (K)', 'France'), 'Paris FC (K)')
  assert.equal(shownTeam('Skotland', 'World'), 'Skotland')
})

test('countries of leagues in Danish, also as the source writes them with hyphens', () => {
  assert.equal(danishCountry('Germany'), 'Tyskland')
  assert.equal(danishCountry('Czech-Republic'), 'Tjekkiet')
  assert.equal(danishCountry('Ivory-Coast'), 'Elfenbenskysten')
  assert.equal(danishCountry('Egypt'), 'Egypten')
  assert.equal(danishCountry('Guinea-Bissau'), 'Guinea-Bissau')
  assert.equal(danishCountry('World'), 'Verden')
  assert.equal(danishCountry('Portugal'), 'Portugal')
  assert.equal(danishCountry(), 'Øvrige')
})

const periods = (values: number[]) => ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90', '91-105', '106-120'].map((period, i) => ({ period, value: values[i] ?? 0 }))
const hat = (total: number) => ({ home: 0, away: 0, total })
const source: TeamStats = {
  played: hat(9),
  wins: hat(8),
  draws: hat(0),
  loses: hat(1),
  goalsFor: { ...hat(23), periods: periods([6, 3, 5, 2, 3, 5, 0]) },
  goalsAgainst: { ...hat(8), periods: periods([2, 2, 2, 0, 1, 0, 0]) },
  cleanSheets: hat(5),
  failedToScore: hat(1),
  biggestWin: { home: '3-1', away: '0-5' },
  streak: { wins: 3, draws: 0, loses: 1 },
  yellow: [],
  red: [],
  formations: [],
}

test('the biggest win is the widest margin, home or away', () => {
  assert.equal(biggestOf({ home: '3-1', away: '0-5' }), '0-5')
  assert.equal(biggestOf({ home: '4-0', away: '1-3' }), '4-0')
  // The same margin: the most goals
  assert.equal(biggestOf({ home: '2-0', away: '1-3' }), '1-3')
  assert.equal(biggestOf({ home: '3-1' }), '3-1')
  assert.equal(biggestOf({ away: '0-2' }), '0-2')
  assert.equal(biggestOf(undefined), undefined)
})

test("our own runs replace the source's when we have every match it has counted", () => {
  assert.deepEqual(checkedTeamStats(source, { played: 9, longest: { wins: 5, draws: 0, losses: 1 } }).streak, { wins: 5, draws: 0, loses: 1 })
  // Fewer matches than the source has counted: the source's runs stay
  assert.equal(checkedTeamStats(source, { played: 8, longest: { wins: 5, draws: 0, losses: 1 } }), source)
  assert.equal(checkedTeamStats(source, undefined), source)
})

const sum = (list: { value: number }[]) => list.reduce((t, p) => t + p.value, 0)

test('an own goal is moved to the side it counted for, so the quarter-hours sum to the goals', () => {
  // The source: 24 scored and 7 conceded by the quarter-hour, 23-8 in goals – the team's own goal in the 10th minute stands as scored
  const checked = checkedTeamStats(source, undefined, [{ minute: 10, byTeam: true }])
  assert.equal(sum(checked.goalsFor.periods), 23)
  assert.equal(sum(checked.goalsAgainst.periods), 8)
  assert.equal(checked.goalsFor.periods[0].value, 5)
  assert.equal(checked.goalsAgainst.periods[0].value, 3)
  // In stoppage time of a half the source counted elsewhere: taken from the quarter-hour before
  const late = checkedTeamStats(source, undefined, [{ minute: 93, byTeam: true }])
  assert.equal(late.goalsFor.periods[5].value, 4)
  assert.equal(late.goalsAgainst.periods[5].value, 1)
  assert.equal(sum(late.goalsFor.periods), 23)
})

test("the source's quarter-hours stay when moving the own goals doesn't make them add up", () => {
  // No own goal known, or one that doesn't explain the difference
  assert.equal(checkedTeamStats(source, undefined, []), source)
  assert.equal(checkedTeamStats(source, undefined, [{ minute: 10, byTeam: false }]), source)
  // Already adding up: left alone
  const fine = { ...source, goalsFor: { ...source.goalsFor, total: 24 }, goalsAgainst: { ...source.goalsAgainst, total: 7 } }
  assert.equal(checkedTeamStats(fine, undefined, [{ minute: 10, byTeam: true }]), fine)
})
