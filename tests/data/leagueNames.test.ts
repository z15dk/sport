import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPopular } from '../../src/data/popular.ts'
import { danishLeagueName } from '../../src/data/danishLeagues.ts'

const game = (leagueId: string, league: string, country: string, home = 'A', away = 'B', sport = 'soccer') =>
  ({ leagueId, league, country, sport, home: { name: home }, away: { name: away } }) as Parameters<typeof isPopular>[0]

test('the big tournaments are popular under their Danish names too', () => {
  assert.ok(isPopular(game('ext-football-32', 'VM-kvalifikation (Europa)', 'World')))
  assert.ok(isPopular(game('ext-football-999', 'VM-kvalifikation (Europa), kvinder', 'World')))
  assert.ok(isPopular(game('ext-football-1', 'VM', 'World')))
  assert.ok(isPopular(game('ext-football-4', 'EM', 'World')))
  assert.ok(isPopular(game('ext-football-960', 'EM-kvalifikation', 'World')))
  assert.ok(isPopular(game('ext-football-525', 'UEFA Champions League, kvinder', 'World')))
  assert.ok(isPopular(game('ext-handball-131', 'Champions League, kvinder', 'Europe', 'A', 'B', 'handball')))
  assert.ok(!isPopular(game('ext-football-29', 'VM-kvalifikation (Afrika)', 'World')))
  assert.ok(!isPopular(game('ext-football-10', 'Venskabskampe, kvinder', 'World', 'Sverige (K)', 'Norge (K)')))
})

test("women's tournaments are marked \", kvinder\", wherever the source puts its mark", () => {
  assert.equal(danishLeagueName('Serie A Women', 'Italy'), 'Serie A, kvinder')
  assert.equal(danishLeagueName('Premier League W', 'Russia'), 'Premier League, kvinder')
  assert.equal(danishLeagueName("Women's Championship", 'England'), 'Championship, kvinder')
  assert.equal(danishLeagueName('Svenska Cupen - Women', 'Sweden'), 'Svenska Cupen, kvinder')
  assert.equal(danishLeagueName('UEFA Champions League Women', 'World'), 'UEFA Champions League, kvinder')
  assert.equal(danishLeagueName('1. Division Women', 'Denmark'), '1. Division, kvinder')
  assert.equal(danishLeagueName('NBA W', 'USA'), 'WNBA')
  // A name that already says so only loses the source's mark
  assert.equal(danishLeagueName('Liga Femenina W', 'Spain'), 'Liga Femenina')
  assert.equal(danishLeagueName('NWSL Women', 'USA'), 'NWSL')
  // Names in their own language, and a mark in the middle of a name, are kept
  assert.equal(danishLeagueName('Frauen Bundesliga', 'Germany'), undefined)
  assert.equal(danishLeagueName('Primera División Femenina', 'Spain'), undefined)
  assert.equal(danishLeagueName('AXA Women’s Super League', 'Switzerland'), undefined)
})

test('friendlies, World Cup and Euro with their qualifying, groups, and east and west in Denmark', () => {
  assert.equal(danishLeagueName('Friendlies'), 'Venskabskampe')
  assert.equal(danishLeagueName('Friendlies Clubs'), 'Venskabskampe, klubhold')
  assert.equal(danishLeagueName('Friendlies Women'), 'Venskabskampe, kvinder')
  assert.equal(danishLeagueName('Friendly International Women'), 'Venskabskampe, kvinder')
  assert.equal(danishLeagueName('Club Friendly Women'), 'Venskabskampe, klubhold, kvinder')
  assert.equal(danishLeagueName('World Cup'), 'VM')
  assert.equal(danishLeagueName('World Cup - Qualification Europe'), 'VM-kvalifikation (Europa)')
  assert.equal(danishLeagueName('World Cup - Women - Qualification Europe'), 'VM-kvalifikation (Europa), kvinder')
  assert.equal(danishLeagueName('Euro Championship - Qualification'), 'EM-kvalifikation')
  assert.equal(danishLeagueName('III Liga - Group 3', 'Poland'), 'III Liga, gruppe 3')
  assert.equal(danishLeagueName('1. Division East Women', 'Denmark'), '1. Division Øst, kvinder')
  assert.equal(danishLeagueName('1. Division West', 'Denmark'), '1. Division Vest')
  // Elsewhere east and west stay, and names with nothing to translate come back as nothing
  assert.equal(danishLeagueName('Conference East', 'USA'), undefined)
  assert.equal(danishLeagueName('Superliga', 'Denmark'), undefined)
  assert.equal(danishLeagueName('Serie A', 'Italy'), undefined)
})
