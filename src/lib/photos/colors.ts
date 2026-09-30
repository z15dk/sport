// Own club or opponent from the jersey colour the AI reports, measured against
// both clubs' colours. Pure functions (tested in tests/photos/colors.test.ts).
//
// The rule is "rather unknown than wrong": when both clubs wear the colour
// (e.g. two blue teams), when only a neighbouring shade matches, or when the
// colour is unknown, the answer is 'ukendt' and the photo goes to review.

export type Side = 'egen' | 'modstander' | 'ukendt'

/** Colour words (Danish and English) → colour family */
const FAMILY: Record<string, string> = {
  rød: 'rød', red: 'rød', bordeaux: 'rød', vinrød: 'rød', mørkerød: 'rød', blodrød: 'rød', karminrød: 'rød', skarlagen: 'rød', crimson: 'rød', maroon: 'rød', burgundy: 'rød', rubinrød: 'rød',
  blå: 'blå', blue: 'blå', marineblå: 'blå', marine: 'blå', navy: 'blå', mørkeblå: 'blå', kongeblå: 'blå', royalblå: 'blå', royal: 'blå', koboltblå: 'blå', dueblå: 'blå',
  lyseblå: 'lyseblå', himmelblå: 'lyseblå', babyblå: 'lyseblå', isblå: 'lyseblå', 'light blue': 'lyseblå', 'sky blue': 'lyseblå', 'lys blå': 'lyseblå',
  turkis: 'turkis', turquoise: 'turkis', cyan: 'turkis', petrol: 'turkis', teal: 'turkis', aqua: 'turkis',
  grøn: 'grøn', green: 'grøn', mørkegrøn: 'grøn', lysegrøn: 'grøn', neongrøn: 'grøn', flaskegrøn: 'grøn', 'lys grøn': 'grøn', 'mørk grøn': 'grøn', lime: 'grøn',
  gul: 'gul', yellow: 'gul', citrongul: 'gul', guld: 'gul', gold: 'gul', neongul: 'gul', 'mørk gul': 'gul',
  orange: 'orange',
  hvid: 'hvid', white: 'hvid', råhvid: 'hvid', creme: 'hvid', cremehvid: 'hvid', offwhite: 'hvid',
  sort: 'sort', black: 'sort',
  grå: 'grå', grey: 'grå', gray: 'grå', sølv: 'grå', silver: 'grå', lysegrå: 'grå', mørkegrå: 'grå', antracit: 'grå',
  lilla: 'lilla', purple: 'lilla', violet: 'lilla', violer: 'lilla',
  pink: 'pink', lyserød: 'pink', rosa: 'pink', magenta: 'pink',
  brun: 'brun', brown: 'brun',
}

/** Shades that are easily confused in a photo: a match here is never enough on its own */
const NEAR: [string, string][] = [
  ['blå', 'lyseblå'], ['lyseblå', 'turkis'], ['blå', 'turkis'], ['blå', 'lilla'],
  ['gul', 'orange'], ['rød', 'orange'], ['rød', 'pink'], ['rød', 'brun'],
  ['hvid', 'grå'], ['grå', 'sort'], ['blå', 'sort'],
]
const near = (a: string, b: string) => NEAR.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

const clean = (s: string) => s.toLowerCase().normalize('NFC').replace(/[^a-zæøåäöüé ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** The colour families named in a text, main colour first ("rød og hvid" → ['rød', 'hvid']) */
export function colorFamilies(text: string | undefined | null): string[] {
  if (!text) return []
  const words = clean(text).split(' ').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    // Two-word colours first ("light blue", "lys blå")
    const two = i + 1 < words.length ? FAMILY[`${words[i]} ${words[i + 1]}`] : undefined
    const one = FAMILY[words[i]]
    const fam = two ?? one ?? familyOfCompound(words[i])
    if (two) i++
    if (fam && !out.includes(fam)) out.push(fam)
  }
  return out
}

/** Danish compounds not in the list ("mørkebordeaux", "blåhvid" is two colours and handled by the split) */
function familyOfCompound(word: string): string | undefined {
  for (const prefix of ['mørke', 'lyse', 'neon', 'klar', 'dyb']) {
    if (word.startsWith(prefix) && FAMILY[word.slice(prefix.length)]) {
      const base = FAMILY[word.slice(prefix.length)]
      return prefix === 'lyse' && base === 'blå' ? 'lyseblå' : base
    }
  }
  return undefined
}

/**
 * 3 = the jersey's main colour is the club's main shirt colour, 2 = one of its other
 * colours (Skive "gul/blå": blå), 1 = only a neighbouring shade, 0 = no
 */
export function colorScore(jersey: string[], club: string[]): 0 | 1 | 2 | 3 {
  const primary = colorFamilies(club[0])
  const all = club.flatMap((c) => colorFamilies(c))
  if (!jersey.length || !all.length) return 0
  if (primary.includes(jersey[0])) return 3
  if (all.includes(jersey[0])) return 2
  return jersey.some((j) => all.some((c) => c === j || near(c, j))) ? 1 : 0
}

export interface SideResult {
  side: Side
  /** Why the answer is 'ukendt' or not certain (Danish, shown in review) */
  note?: string
}

/**
 * Own club or opponent from the jersey colour.
 * @param ownColors the photographed club's colours (home kit plus any extra kits added in admin)
 * @param opponentColors the opponent's colours, or undefined when the opponent is not known
 */
export function decideSide(jersey: string | undefined | null, ownColors: string[], opponentColors?: string[]): SideResult {
  const fams = colorFamilies(jersey)
  if (!fams.length) return { side: 'ukendt', note: `ukendt trøjefarve "${jersey ?? ''}"` }
  if (!ownColors.length) return { side: 'ukendt', note: 'klubbens farver mangler' }
  const own = colorScore(fams, ownColors)
  if (!opponentColors?.length) {
    // Without the opponent's colours a match on our colours cannot rule out that they wear the same
    if (own >= 2) return { side: 'ukendt', note: 'modstanderens farver mangler' }
    if (own === 0) return { side: 'modstander' }
    return { side: 'ukendt', note: `farven ${fams[0]} ligner klubbens` }
  }
  const opp = colorScore(fams, opponentColors)
  // Clear when one club has the colour as its main shirt colour (or at all) and the other does not;
  // a neighbouring shade on the other side (blå/lyseblå) is never clear enough
  if ((own === 3 && (opp === 0 || opp === 2)) || (own === 2 && opp === 0)) return { side: 'egen' }
  if ((opp === 3 && (own === 0 || own === 2)) || (opp === 2 && own === 0)) return { side: 'modstander' }
  if (own >= 2 && own === opp) return { side: 'ukendt', note: `begge hold spiller i ${fams[0]}` }
  if (own === 0 && opp === 0) return { side: 'ukendt', note: `farven ${fams[0]} passer til ingen af holdene` }
  return { side: 'ukendt', note: `farven ${fams[0]} ligner begge holds` }
}
