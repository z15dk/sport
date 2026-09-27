// A national team's flag when its source has no logo: API-Sports often has
// only "image not available" for youth, women's and Olympic teams ("France U21",
// "Denmark W"). The country's flag from flagcdn.com, by its English name.

const EXTRA: Record<string, string> = {
  england: 'gb-eng',
  scotland: 'gb-sct',
  wales: 'gb-wls',
  'northern ireland': 'gb-nir',
  usa: 'us',
  'united states': 'us',
  'korea republic': 'kr',
  'south korea': 'kr',
  'korea dpr': 'kp',
  'north korea': 'kp',
  'czech republic': 'cz',
  czechia: 'cz',
  'ivory coast': 'ci',
  "cote d'ivoire": 'ci',
  'bosnia and herzegovina': 'ba',
  bosnia: 'ba',
  turkey: 'tr',
  turkiye: 'tr',
  'faroe islands': 'fo',
  'cape verde islands': 'cv',
  'cape verde': 'cv',
  'congo dr': 'cd',
  'dr congo': 'cd',
  congo: 'cg',
  'chinese taipei': 'tw',
  'hong kong': 'hk',
  macedonia: 'mk',
  'north macedonia': 'mk',
  kosovo: 'xk',
  'republic of ireland': 'ie',
  ireland: 'ie',
  russia: 'ru',
  iran: 'ir',
  syria: 'sy',
  vietnam: 'vn',
  palestine: 'ps',
  'trinidad and tobago': 'tt',
  curacao: 'cw',
  gambia: 'gm',
  eswatini: 'sz',
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/&/g, 'and').replace(/\s+/g, ' ').trim()

let codes: Map<string, string> | undefined
function countryCodes() {
  if (codes) return codes
  codes = new Map(Object.entries(EXTRA))
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' })
    const A = 'A'.charCodeAt(0)
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const code = String.fromCharCode(A + i, A + j)
        const name = names.of(code)
        if (name && name !== code && !codes.has(fold(name))) codes.set(fold(name), code.toLowerCase())
      }
    }
  } catch {
    // Only the names above
  }
  return codes
}

/** "France U21" -> "france", with the kind of team it is */
const TEAM = /^(.*?)(?:\s+(?:u-?\d{2}|w|women|olympic|olympics|b))?$/i

/**
 * The flag for a national team's name, or nothing. With `national` the
 * senior team's plain country name also counts (its games are between
 * national teams); otherwise only youth, women's and Olympic teams.
 */
export function nationalFlag(name: string, national = false): string | undefined {
  const m = TEAM.exec(name.trim())
  if (!m) return undefined
  const suffixed = m[1].length < name.trim().length
  if (!suffixed && !national) return undefined
  const code = countryCodes().get(fold(m[1]))
  return code ? `https://flagcdn.com/w160/${code}.png` : undefined
}
