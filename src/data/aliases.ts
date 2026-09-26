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

/** Lowercase, no accents or Danish letters, no punctuation or common club prefixes */
export function normalize(name: string) {
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
const fold = (name: string) => normalize(name).replace(/aa/g, 'a')

/** Words of a name (folded, 3+ letters, no generic words), for loose matching across sources */
export const nameWords = (name: string) => fold(name).split(' ').filter((w) => w.length >= 3 && !COMMON.has(w))

/** Same word, or one is the start of the other ("djurgarden" / "djurgardens") */
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)))

/** Whether one of a club's names matches a name from another source ("HV 71" / "HV71", "Djurgarden" / "Djurgårdens IF") */
export function alike(names: string[], other: string) {
  const compact = fold(other).replace(/ /g, '')
  const theirs = nameWords(other)
  return names.some((n) => {
    if (compact.length >= 3 && fold(n).replace(/ /g, '') === compact) return true
    // Every word of the shorter name is in the other ("Hamburg" / "Hamburger SV", not "Deportivo Alavés" / "Deportivo de A Coruña")
    const ours = nameWords(n)
    const [few, many] = ours.length <= theirs.length ? [ours, theirs] : [theirs, ours]
    return few.length > 0 && few.every((w) => many.some((t) => sameWord(w, t)))
  })
}
