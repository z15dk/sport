// Names TheSportsDB uses for Danish clubs where they differ from the Danish name.
// Used to search for logos and to match real fixtures to our clubs.
export const SEARCH_NAMES: Record<string, string> = {
  fck: 'FC Copenhagen',
  bif: 'Brondby',
  agf: 'Aarhus',
  fcn: 'Nordsjaelland',
  rfc: 'Randers',
  ob: 'Odense',
  sif: 'Silkeborg',
  vff: 'Viborg',
  sje: 'Sonderjyske',
  lbk: 'Lyngby',
  ach: 'Horsens',
  vb: 'Vejle',
  aab: 'Aalborg',
  fcf: 'Fredericia',
  efb: 'Esbjerg',
  hif: 'Hvidovre',
  kif: 'Kolding IF',
  hbk: 'HB Koge',
  'hik-ob': 'Hobro',
  hil: 'Hillerod',
  vff2: 'Vendsyssel',
  ab: 'Akademisk Boldklub',
  afr: 'Aarhus Fremad',
  b93: 'B93',
  mbk: 'Middelfart',
  fcr: 'FC Roskilde',
  nbk: 'Naestved',
  fam: 'Fremad Amager',
  sik: 'Skive',
  frem: 'BK Frem',
  fch: 'Helsingor',
  hikh: 'Hellerup IK',
}

/** Short names other sources use, which no loose match finds ("Wolves" is Wolverhampton Wanderers) */
export const OTHER_NAMES: Record<string, string[]> = {
  'e-wol': ['Wolves'],
  'e-qpr': ['QPR'],
  'e-wba': ['West Brom'],
  'e-mci': ['Man City'],
  'e-mun': ['Man United', 'Man Utd'],
  'e-shu': ['Sheffield Utd'],
  'e-nfo': ["Nott'm Forest", 'Nottingham'],
  'e-tot': ['Spurs'],
}

/** Every name a club goes by: ours, the original, TheSportsDB's and the short ones */
export function clubNames(club: { id: string; name: string; originalName?: string; apiName?: string }): string[] {
  return [club.name, club.originalName, club.apiName, SEARCH_NAMES[club.id], ...(OTHER_NAMES[club.id] ?? [])].filter((n): n is string => !!n)
}

// normalize() runs for every name in every match lookup: remembered, as the same names come again and again
const normalizeMemo = new Map<string, string>()

/** Lowercase, no accents or Danish letters, no punctuation or common club prefixes */
export function normalize(name: string) {
  let n = normalizeMemo.get(name)
  if (n === undefined) {
    n = normalizeOnce(name)
    if (normalizeMemo.size > 50_000) normalizeMemo.clear()
    normalizeMemo.set(name, n)
  }
  return n
}

function normalizeOnce(name: string) {
  return ` ${name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'aa')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')} `
    .replace(/ (fc|bk|if|ik|ff|fb|afc|boldklub|fodbold|football club) /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const COMMON = new Set(['and', 'the', 'city', 'united', 'real', 'sporting', 'athletic', 'club', 'county', 'town', 'rovers', 'wanderers', 'hockey', 'basket', 'basketball', 'handball', 'handbold', 'fodbold', 'volley', 'sport', 'sports', 'klub'])
/** A name folded for loose matching: normalized, and "aa" (from å) as "a" */
const foldMemo = new Map<string, string>()
const fold = (name: string) => {
  let f = foldMemo.get(name)
  if (f === undefined) {
    f = normalize(name).replace(/aa/g, 'a')
    if (foldMemo.size > 50_000) foldMemo.clear()
    foldMemo.set(name, f)
  }
  return f
}

/** Words of a name (folded, 3+ letters, no generic words), for loose matching across sources */
const wordsMemo = new Map<string, string[]>()
export const nameWords = (name: string) => {
  let words = wordsMemo.get(name)
  if (!words) {
    words = fold(name).split(' ').filter((w) => w.length >= 3 && !COMMON.has(w))
    if (wordsMemo.size > 50_000) wordsMemo.clear()
    wordsMemo.set(name, words)
  }
  return words
}

/** Same word, or one is the start of the other ("djurgarden" / "djurgardens") */
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)))

/** Whether one of a club's names matches a name from another source ("HV 71" / "HV71", "Djurgarden" / "Djurgårdens IF") */
/** Generic words that still tell two clubs of one city apart ("Manchester City" / "Manchester United") */
const DISTINCT = new Set(['city', 'united', 'real', 'sporting', 'athletic', 'county', 'town', 'rovers', 'wanderers'])
const distinctWords = (name: string) => fold(name).split(' ').filter((w) => DISTINCT.has(w))

export function alike(names: string[], other: string) {
  const compact = fold(other).replace(/ /g, '')
  const theirs = nameWords(other)
  const theirDistinct = distinctWords(other)
  return names.some((n) => {
    if (compact.length >= 3 && fold(n).replace(/ /g, '') === compact) return true
    // Both named with such a word, and not the same one: two different clubs
    const ourDistinct = distinctWords(n)
    if (ourDistinct.length && theirDistinct.length && !ourDistinct.some((w) => theirDistinct.includes(w))) return false
    // Every word of the shorter name is in the other ("Hamburg" / "Hamburger SV", not "Deportivo Alavés" / "Deportivo de A Coruña")
    const ours = nameWords(n)
    const [few, many] = ours.length <= theirs.length ? [ours, theirs] : [theirs, ours]
    return few.length > 0 && few.every((w) => many.some((t) => sameWord(w, t)))
  })
}
