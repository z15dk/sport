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

test("our own runs and quarter-hours replace the source's when we have every match", () => {
  const own = { played: 9, longest: { wins: 5, draws: 0, losses: 1 }, byInterval: { scored: [5, 3, 5, 2, 3, 5], conceded: [2, 2, 2, 0, 1, 1] }, everyGoalTimed: true }
  const checked = checkedTeamStats(source, own)
  assert.deepEqual(checked.streak, { wins: 5, draws: 0, loses: 1 })
  const sum = (list: { value: number }[]) => list.reduce((t, p) => t + p.value, 0)
  assert.equal(sum(checked.goalsFor.periods), 23)
  assert.equal(sum(checked.goalsAgainst.periods), 8)
  // The source's own totals are kept
  assert.equal(checked.goalsFor.total, 23)
  assert.equal(checked.cleanSheets.total, 5)
})

test("the source's numbers stay when ours are incomplete", () => {
  // Fewer matches than the source has counted: nothing of ours is used
  assert.equal(checkedTeamStats(source, { played: 8, longest: { wins: 5, draws: 0, losses: 1 }, everyGoalTimed: true }), source)
  assert.equal(checkedTeamStats(source, undefined), source)
  // Every match, but not the minute of every goal: our runs, the source's quarter-hours
  const partly = checkedTeamStats(source, { played: 9, longest: { wins: 5, draws: 0, losses: 1 }, byInterval: { scored: [1, 0, 0, 0, 0, 0], conceded: [0, 0, 0, 0, 0, 0] }, everyGoalTimed: false })
  assert.equal(partly.streak?.wins, 5)
  assert.deepEqual(partly.goalsFor.periods, source.goalsFor.periods)
})
