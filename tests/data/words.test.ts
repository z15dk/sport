import assert from 'node:assert/strict'
import { test } from 'node:test'
import { counted, genitive, singulars } from '../../src/lib/words.ts'
import { danishSpelling, shownTeam } from '../../src/data/countries.ts'
import { focusRank } from '../../src/data/popular.ts'
import { lineupSpelling, type Lineup } from '../../src/data/matchExtra.ts'

test('one of something is written in the singular', () => {
  assert.equal(counted(1, 'kamp', 'kampe'), '1 kamp')
  assert.equal(counted(4, 'kamp', 'kampe'), '4 kampe')
  assert.equal(singulars('I de seneste fem har Tyrkiet 1 sejre og 4 nederlag.'), 'I de seneste fem har Tyrkiet 1 sejr og 4 nederlag.')
  assert.equal(singulars('Wales ligger nr. 1 efter 1 kampe (1 sejre, 1 uafgjorte).'), 'Wales ligger nr. 1 efter 1 kamp (1 sejr, 1 uafgjort).')
  // Not inside another number or a score
  assert.equal(singulars('11 sejre, 21 kampe og 3-1 sejre'), '11 sejre, 21 kampe og 3-1 sejre')
  assert.equal(singulars('2 sejre i 5 kampe'), '2 sejre i 5 kampe')
})

test('the genitive of names ending in s, capitals and brackets', () => {
  assert.equal(genitive('Wales'), "Wales'")
  assert.equal(genitive('Danmark'), 'Danmarks')
  assert.equal(genitive('AGF'), "AGF's")
  assert.equal(genitive('Paris FC (K)'), "Paris FC (K)'s")
})

test('Danish letters come back in Danish names, in Danish leagues only', () => {
  assert.equal(danishSpelling('Ajax Kobenhavn'), 'Ajax København')
  assert.equal(danishSpelling('HB Koge'), 'HB Køge')
  assert.equal(shownTeam('Sonderjyske', 'Denmark'), 'SønderjyskE')
  assert.equal(shownTeam('Grondal', 'Denmark'), 'Grøndal')
  assert.equal(shownTeam('Koge W', 'Denmark'), 'Køge (K)')
  // Elsewhere a name is left alone, and so is a word that only starts like one of them
  assert.equal(shownTeam('Koge', 'Sweden'), 'Koge')
  assert.equal(danishSpelling('Kogebog'), 'Kogebog')
})

test('players in goals and cards are spelt as in the line-ups', () => {
  const lineups = [
    { team: 'Danmark', startXI: [{ name: 'R. Højlund' }, { name: 'K. Høgh' }, { name: 'J. Mæhle' }], substitutes: [{ name: 'Pierre-Emile Højbjerg' }] },
    { team: 'Wales', startXI: [{ name: 'B. Davies' }], substitutes: [] },
  ] as Lineup[]
  const spell = lineupSpelling(lineups)
  assert.equal(spell('Rasmus Hojlund'), 'Rasmus Højlund')
  assert.equal(spell('Kasper Hogh'), 'Kasper Høgh')
  assert.equal(spell('Joakim Maehle'), 'Joakim Mæhle')
  assert.equal(spell('Ben Davies'), 'Ben Davies')
  assert.equal(lineupSpelling(undefined)('Rasmus Hojlund'), 'Rasmus Hojlund')
})

const game = (leagueId: string, league: string, country: string, home = 'A', away = 'B', sport = 'soccer') =>
  ({ leagueId, league, country, sport, home: { name: home }, away: { name: away } }) as Parameters<typeof focusRank>[0]

test('Denmark first in focus, then the Superliga, our leagues, the other popular matches, the rest', () => {
  assert.equal(focusRank(game('ext-football-5', 'UEFA Nations League', 'World', 'Wales', 'Danmark')), 0)
  assert.equal(focusRank(game('ext-football-666', 'Venskabskampe, kvinder', 'World', 'Danmark (K)', 'Sverige (K)')), 0)
  // A youth national team's match is popular, not the evening's main match
  assert.equal(focusRank(game('ext-football-10', 'Venskabskampe', 'World', 'Danmark U18', 'Saudi-Arabien U18')), 3)
  assert.equal(focusRank(game('dk-superliga', 'Superliga', 'Danmark')), 1)
  assert.equal(focusRank(game('en-premierleague', 'Premier League', 'England')), 2)
  assert.equal(focusRank(game('ext-football-5', 'UEFA Nations League', 'World', 'Montenegro', 'Armenien')), 3)
  assert.equal(focusRank(game('ext-handball-31', 'Bambuni Kvindeligaen', 'Denmark', 'Esbjerg', 'Odense', 'handball')), 3)
  assert.equal(focusRank(game('ext-football-536', 'CONCACAF Nations League', 'World', 'Guyana', 'Dominica')), 4)
})
