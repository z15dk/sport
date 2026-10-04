import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPopular } from '../../src/data/popular.ts'

const game = (leagueId: string, league: string, country: string | undefined, home = 'A', away = 'B', sport = 'soccer') =>
  ({ leagueId, league, country, sport, home: { name: home }, away: { name: away } }) as Parameters<typeof isPopular>[0]

test('the leagues and cups we cover in full are popular', () => {
  assert.ok(isPopular(game('dk-superliga', 'Superliga', 'Danmark')))
  assert.ok(isPopular(game('en-premierleague', 'Premier League', 'England')))
  assert.ok(isPopular(game('cup-x-denmark-pokalen', 'Betano Pokalen', 'Denmark')))
})

test('everything Danish, in every sport, and every Danish national team', () => {
  assert.ok(isPopular(game('ext-football-271', 'A-Liga', 'Denmark')))
  assert.ok(isPopular(game('ext-handball-31', 'Bambuni Kvindeligaen', 'Denmark', 'Esbjerg', 'Odense', 'handball')))
  assert.ok(isPopular(game('ext-football-10', 'Venskabskampe', 'World', 'Danmark U21', 'Norge U21')))
  assert.ok(isPopular(game('ext-football-666', 'Venskabskampe, kvinder', 'World', 'Sverige (K)', 'Danmark (K)')))
})

test('the big international tournaments, but not youth, friendlies or other continents', () => {
  assert.ok(isPopular(game('ext-football-5', 'UEFA Nations League', 'World', 'Wales', 'Skotland')))
  assert.ok(isPopular(game('ext-football-2', 'UEFA Champions League', 'World', 'Monaco', 'Real Madrid')))
  assert.ok(isPopular(game('ext-football-32', 'World Cup - Qualification Europe', 'World')))
  assert.ok(isPopular(game('ext-football-999', 'World Cup - Women - Qualification Europe', 'World')))
  assert.ok(isPopular(game('ext-handball-131', 'Champions League Women', 'Europe', 'Györ (K)', 'Metz (K)', 'handball')))
  assert.ok(!isPopular(game('ext-football-10', 'Venskabskampe', 'World', 'Finland U18', 'Wales U18')))
  assert.ok(!isPopular(game('ext-football-10', 'Venskabskampe', 'World', 'Elfenbenskysten', 'Cameroun')))
  assert.ok(!isPopular(game('ext-football-29', 'World Cup - Qualification Africa', 'World')))
  assert.ok(!isPopular(game('ext-football-17', 'AFC Champions League Elite', 'World')))
  assert.ok(!isPopular(game('ext-football-14', 'UEFA Youth League', 'World')))
  assert.ok(!isPopular(game('ext-football-536', 'CONCACAF Nations League', 'World', 'Barbados', 'Bermuda')))
})

test('a few big leagues abroad, by country and name', () => {
  assert.ok(isPopular(game('ext-football-135', 'Serie A', 'Italy')))
  assert.ok(isPopular(game('ext-football-61', 'Ligue 1', 'France')))
  assert.ok(isPopular(game('ext-nba-12', 'NBA', 'USA', 'Lakers', 'Celtics', 'basketball')))
  assert.ok(isPopular(game('ext-american-football-1', 'NFL', undefined, 'Chiefs', 'Bills', 'american_football')))
  // The same name in another country, or another league of the country, is not
  assert.ok(!isPopular(game('ext-football-71', 'Serie A', 'Brazil')))
  assert.ok(!isPopular(game('ext-football-136', 'Serie B', 'Italy')))
  assert.ok(!isPopular(game('ext-football-139', 'Serie A Women', 'Italy')))
  assert.ok(!isPopular(game('ext-basketball-117', 'ACB', 'Spain', 'Manresa', 'Breogan', 'basketball')))
  assert.ok(!isPopular(game('ext-basketball-80', 'Basketettan W', 'Sweden', 'Lund (K)', 'Täby (K)', 'basketball')))
})
