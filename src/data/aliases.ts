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

const COMMON = new Set(['and', 'the', 'city', 'united', 'real', 'sporting', 'athletic', 'club', 'county', 'town', 'rovers', 'wanderers'])
/** Words of a name (normalized, 3+ letters, no generic words), for loose matching across sources */
export const nameWords = (name: string) => normalize(name).split(' ').filter((w) => w.length >= 3 && !COMMON.has(w))

/** Whether one of a club's names shares a word with a name from another source ("HIK" / "Hellerup IK") */
export function alike(names: string[], other: string) {
  const theirs = new Set(nameWords(other))
  return names.some((n) => nameWords(n).some((w) => theirs.has(w)))
}
