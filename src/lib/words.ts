// Small helpers for Danish wording in texts built from numbers and names. No imports (tests/data/words.test.ts).

/** "1 kamp", "2 kampe" */
export const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const SINGULAR: Record<string, string> = {
  kampe: 'kamp', sejre: 'sejr', hjemmesejre: 'hjemmesejr', udesejre: 'udesejr', uafgjorte: 'uafgjort', gange: 'gang', runder: 'runde',
  minutter: 'minut', opgør: 'opgør', point: 'point', mål: 'mål', nederlag: 'nederlag',
}
const ONE = new RegExp(`(?<![\\d.,:–-])1 (${Object.keys(SINGULAR).join('|')})(?![\\p{L}])`, 'gu')

/** A finished sentence with the singular after a lone 1: "1 sejre og 4 nederlag" -> "1 sejr og 4 nederlag" */
export const singulars = (text: string) => text.replace(ONE, (_, word: string) => `1 ${SINGULAR[word] ?? word}`)

/** Danish genitive: "AGF's", "Wales'", "FC Københavns", "Paris FC (K)'s" */
export function genitive(name: string) {
  if (/[sxz]$/i.test(name)) return `${name}'`
  if (/[A-ZÆØÅ)]$/.test(name)) return `${name}'s`
  return `${name}s`
}
