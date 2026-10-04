// Danish names for the tournaments our sources name in English. On its own (no imports), so the
// rules are tested as they are (tests/data/leagueNames.test.ts); used through external.ts.

/** The continents of the World Cup's qualifying, in Danish */
const CONTINENTS: Record<string, string> = {
  europe: 'Europa',
  africa: 'Afrika',
  asia: 'Asien',
  'south america': 'Sydamerika',
  oceania: 'Oceanien',
  concacaf: 'CONCACAF',
  'intercontinental play-offs': 'interkontinentalt playoff',
}
/** A name that already says it is the women's ("Liga Femenina W", "Frauen Bundesliga"): the source's "W" is only dropped */
const SAYS_WOMEN = /femen|femin|frauen|kvinde|dame|damer|moteru|ladies|\bnwsl\b|\bwsl\b/i

/**
 * Danish names for the source's English ones, when the admin pages haven't named the league.
 * The address keeps the original name.
 * - "Friendlies" is "Venskabskampe", "Friendlies Clubs" "Venskabskampe, klubhold"
 * - women's tournaments are marked ", kvinder" where the source writes "Women", "W" or "Women's …":
 *   "Serie A Women" -> "Serie A, kvinder", "Women's Championship" -> "Championship, kvinder"
 * - "World Cup" is "VM" and "Euro Championship" "EM", with their qualifying: "VM-kvalifikation (Europa)"
 * - "… - Group 3" is "…, gruppe 3"; in Denmark "East"/"West" are "Øst"/"Vest"
 */
export function danishLeagueName(name: string, country?: string): string | undefined {
  const original = name.trim()
  let n = original
  // The women's mark, wherever the source puts it
  let women = false
  const strip = (re: RegExp, to = '') => {
    if (!re.test(n)) return
    women = true
    n = n.replace(re, to).trim()
  }
  strip(/^women[’']s\s+/i)
  strip(/\s+-\s+women\s+-\s+/i, ' - ')
  strip(/\s*(?:-\s*)?\bwomen$/i)
  strip(/\s+w$/i)
  const lower = n.toLowerCase()
  const kinds: Record<string, string> = { clubs: 'klubhold', u23: 'U23', u21: 'U21', u20: 'U20', u19: 'U19', u17: 'U17' }
  const friendly = /^friendlies\b\s*(.*)$/i.exec(n)
  const qualifying = /^(world cup|euro championship)\s*-\s*qualification\s*(.*)$/i.exec(n)
  if (friendly) n = friendly[1].trim() ? `Venskabskampe, ${kinds[friendly[1].trim().toLowerCase()] ?? friendly[1].trim()}` : 'Venskabskampe'
  else if (lower === 'friendly international') n = 'Venskabskampe'
  else if (lower === 'club friendly' || lower === 'club friendlies') n = 'Venskabskampe, klubhold'
  else if (qualifying) {
    const where = qualifying[2].trim()
    n = `${/world/i.test(qualifying[1]) ? 'VM' : 'EM'}-kvalifikation${where ? ` (${CONTINENTS[where.toLowerCase()] ?? where})` : ''}`
  } else if (lower === 'world cup') n = 'VM'
  else if (lower === 'euro championship') n = 'EM'
  else if (lower === 'nba' && women) return 'WNBA'
  n = n.replace(/\s+-\s+group\s+(\w+)$/i, ', gruppe $1')
  if (/^(denmark|danmark)$/i.test(country ?? '')) n = n.replace(/\bEast\b/, 'Øst').replace(/\bWest\b/, 'Vest')
  if (women && !SAYS_WOMEN.test(n)) n = `${n}, kvinder`
  return n && n !== original ? n : undefined
}
