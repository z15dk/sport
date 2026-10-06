/** English country names from the data sources -> the Danish names we show */
const DANISH: Record<string, string> = {
  Denmark: 'Danmark',
  Germany: 'Tyskland',
  Sweden: 'Sverige',
  Norway: 'Norge',
  Finland: 'Finland',
  Iceland: 'Island',
  Spain: 'Spanien',
  France: 'Frankrig',
  Italy: 'Italien',
  Netherlands: 'Holland',
  Belgium: 'Belgien',
  Switzerland: 'Schweiz',
  Austria: 'Østrig',
  Poland: 'Polen',
  'Czech-Republic': 'Tjekkiet',
  'Czech Republic': 'Tjekkiet',
  Czechia: 'Tjekkiet',
  Slovakia: 'Slovakiet',
  Hungary: 'Ungarn',
  Croatia: 'Kroatien',
  Serbia: 'Serbien',
  Slovenia: 'Slovenien',
  Greece: 'Grækenland',
  Turkey: 'Tyrkiet',
  Türkiye: 'Tyrkiet',
  Scotland: 'Skotland',
  Ireland: 'Irland',
  Wales: 'Wales',
  Russia: 'Rusland',
  Ukraine: 'Ukraine',
  Romania: 'Rumænien',
  Bulgaria: 'Bulgarien',
  Lithuania: 'Litauen',
  Latvia: 'Letland',
  Estonia: 'Estland',
  USA: 'USA',
  'United States': 'USA',
  Canada: 'Canada',
  Colombia: 'Colombia',
  Nigeria: 'Nigeria',
  Chad: 'Tchad',
  Armenia: 'Armenien',
  Mexico: 'Mexico',
  Brazil: 'Brasilien',
  Argentina: 'Argentina',
  Australia: 'Australien',
  Japan: 'Japan',
  China: 'Kina',
  'South-Korea': 'Sydkorea',
  'Saudi-Arabia': 'Saudi-Arabien',
  Europe: 'Europa',
  World: 'Verden',
}

/** A country's name folded for a lookup: lower case, no accents, "&" as "and" */
export const foldCountry = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'").replace(/&/g, 'and').replace(/\s+/g, ' ').trim()

/**
 * Every country our sources name a national team after (folded English name, the keys of
 * FLAG_CODES in flagCodes.ts) -> its Danish name, where the two differ. A fixed list (not
 * the browser's own country names), so server and browser write the same name.
 */
const NATIONS: Record<string, string> = {
  albania: 'Albanien',
  algeria: 'Algeriet',
  'american samoa': 'Amerikansk Samoa',
  'antigua and barbuda': 'Antigua og Barbuda',
  armenia: 'Armenien',
  australia: 'Australien',
  austria: 'Østrig',
  azerbaijan: 'Aserbajdsjan',
  belgium: 'Belgien',
  bosnia: 'Bosnien-Hercegovina',
  'bosnia and herzegovina': 'Bosnien-Hercegovina',
  brazil: 'Brasilien',
  'british virgin islands': 'Britiske Jomfruøer',
  'brunei darussalam': 'Brunei',
  bulgaria: 'Bulgarien',
  burma: 'Myanmar',
  'cabo verde': 'Kap Verde',
  cambodia: 'Cambodja',
  cameroon: 'Cameroun',
  'cape verde': 'Kap Verde',
  'cape verde islands': 'Kap Verde',
  'cayman islands': 'Caymanøerne',
  'central african republic': 'Centralafrikanske Republik',
  chad: 'Tchad',
  china: 'Kina',
  'china pr': 'Kina',
  'chinese taipei': 'Taiwan',
  comoros: 'Comorerne',
  'congo - brazzaville': 'Congo',
  'congo - kinshasa': 'DR Congo',
  'congo dr': 'DR Congo',
  'cook islands': 'Cookøerne',
  'cote d\'ivoire': 'Elfenbenskysten',
  croatia: 'Kroatien',
  cyprus: 'Cypern',
  'czech republic': 'Tjekkiet',
  czechia: 'Tjekkiet',
  denmark: 'Danmark',
  'dominican republic': 'Dominikanske Republik',
  'east timor': 'Østtimor',
  egypt: 'Egypten',
  'equatorial guinea': 'Ækvatorialguinea',
  estonia: 'Estland',
  ethiopia: 'Etiopien',
  'falkland islands': 'Falklandsøerne',
  'faroe islands': 'Færøerne',
  france: 'Frankrig',
  'french guiana': 'Fransk Guyana',
  'french guyana': 'Fransk Guyana',
  'french polynesia': 'Fransk Polynesien',
  'fyr macedonia': 'Nordmakedonien',
  georgia: 'Georgien',
  germany: 'Tyskland',
  greece: 'Grækenland',
  greenland: 'Grønland',
  'guinea bissau': 'Guinea-Bissau',
  'hong kong': 'Hongkong',
  'hong kong sar china': 'Hongkong',
  hungary: 'Ungarn',
  iceland: 'Island',
  india: 'Indien',
  indonesia: 'Indonesien',
  'ir iran': 'Iran',
  iraq: 'Irak',
  ireland: 'Irland',
  italy: 'Italien',
  'ivory coast': 'Elfenbenskysten',
  kazakhstan: 'Kasakhstan',
  'korea dpr': 'Nordkorea',
  'korea republic': 'Sydkorea',
  'kyrgyz republic': 'Kirgisistan',
  kyrgyzstan: 'Kirgisistan',
  latvia: 'Letland',
  lebanon: 'Libanon',
  libya: 'Libyen',
  lithuania: 'Litauen',
  'macao sar china': 'Macao',
  macau: 'Macao',
  macedonia: 'Nordmakedonien',
  madagascar: 'Madagaskar',
  maldives: 'Maldiverne',
  'marshall islands': 'Marshalløerne',
  mauritania: 'Mauretanien',
  micronesia: 'Mikronesien',
  mongolia: 'Mongoliet',
  morocco: 'Marokko',
  'myanmar (burma)': 'Myanmar',
  netherlands: 'Holland',
  'new caledonia': 'Ny Kaledonien',
  'north korea': 'Nordkorea',
  'north macedonia': 'Nordmakedonien',
  'northern ireland': 'Nordirland',
  'northern mariana islands': 'Nordmarianerne',
  norway: 'Norge',
  palestine: 'Palæstina',
  'palestinian territories': 'Palæstina',
  'papua new guinea': 'Papua Ny Guinea',
  philippines: 'Filippinerne',
  poland: 'Polen',
  'republic of ireland': 'Irland',
  'rep. of ireland': 'Irland',
  romania: 'Rumænien',
  russia: 'Rusland',
  'saint kitts and nevis': 'Saint Kitts og Nevis',
  'saint vincent and the grenadines': 'Saint Vincent og Grenadinerne',
  'sao tome and principe': 'São Tomé og Príncipe',
  'saudi arabia': 'Saudi-Arabien',
  scotland: 'Skotland',
  serbia: 'Serbien',
  seychelles: 'Seychellerne',
  slovakia: 'Slovakiet',
  slovenia: 'Slovenien',
  'solomon islands': 'Salomonøerne',
  'south africa': 'Sydafrika',
  'south korea': 'Sydkorea',
  'south sudan': 'Sydsudan',
  spain: 'Spanien',
  'st kitts and nevis': 'Saint Kitts og Nevis',
  'st. barthelemy': 'Saint Barthélemy',
  'st. kitts and nevis': 'Saint Kitts og Nevis',
  'st. lucia': 'Saint Lucia',
  'st. martin': 'Saint Martin',
  'st. pierre and miquelon': 'Saint Pierre og Miquelon',
  'st. vincent and grenadines': 'Saint Vincent og Grenadinerne',
  suriname: 'Surinam',
  swaziland: 'Eswatini',
  sweden: 'Sverige',
  switzerland: 'Schweiz',
  syria: 'Syrien',
  tajikistan: 'Tadsjikistan',
  'the bahamas': 'Bahamas',
  'the gambia': 'Gambia',
  'timor-leste': 'Østtimor',
  'trinidad and tobago': 'Trinidad og Tobago',
  tunisia: 'Tunesien',
  turkey: 'Tyrkiet',
  turkiye: 'Tyrkiet',
  'turks and caicos islands': 'Turks- og Caicosøerne',
  'u.s. virgin islands': 'Amerikanske Jomfruøer',
  uae: 'Forenede Arabiske Emirater',
  'united arab emirates': 'Forenede Arabiske Emirater',
  'united kingdom': 'Storbritannien',
  'united states': 'USA',
  'us virgin islands': 'Amerikanske Jomfruøer',
  uzbekistan: 'Usbekistan',
  'vatican city': 'Vatikanstaten',
  'wallis and futuna': 'Wallis og Futuna',
  'western sahara': 'Vestsahara',
}

/** "Saint Lucia" and "St. Lucia" are the same country */
/** Countries whose Danish name is the same as the English one ("Luxembourg", "Wales", "Portugal"), so NATIONS leaves them out – still national teams */
const SAME_NAME = new Set(['andorra', 'angola', 'argentina', 'bolivia', 'canada', 'chile', 'colombia', 'costa rica', 'ecuador', 'el salvador', 'england', 'finland', 'gabon', 'gambia', 'ghana', 'gibraltar', 'guatemala', 'guinea', 'haiti', 'honduras', 'iran', 'israel', 'jamaica', 'japan', 'kenya', 'kosovo', 'liechtenstein', 'luxembourg', 'mali', 'malta', 'moldova', 'montenegro', 'namibia', 'nicaragua', 'niger', 'nigeria', 'oman', 'pakistan', 'panama', 'paraguay', 'peru', 'portugal', 'qatar', 'rwanda', 'san marino', 'senegal', 'sudan', 'togo', 'uganda', 'ukraine', 'uruguay', 'venezuela', 'wales', 'zambia', 'zimbabwe'])
const nation = (folded: string) => NATIONS[folded] ?? NATIONS[folded.replace(/^saint /, 'st. ')] ?? NATIONS[folded.replace(/^st\.? /, 'saint ')]
/** The country's Danish name for an English one, also when the two are the same */
const nationOrSame = (folded: string) => nation(folded) ?? (SAME_NAME.has(folded) ? folded : undefined)

/** Danish name (folded) -> the source's English one (folded), for finding a flag from the name we show */
const ENGLISH = new Map<string, string>()
for (const [english, danish] of Object.entries(NATIONS)) if (!ENGLISH.has(foldCountry(danish))) ENGLISH.set(foldCountry(danish), english)
export const englishNation = (folded: string) => ENGLISH.get(folded)

/** A country name in Danish ("Germany" -> "Tyskland", "Ivory-Coast" -> "Elfenbenskysten"); names we don't know are kept */
export const danishCountry = (country?: string) => {
  if (!country) return 'Øvrige'
  const folded = foldCountry(country)
  return DANISH[country] ?? nation(folded) ?? nation(folded.replace(/-/g, ' ')) ?? country
}

/** Tournaments between national teams: the sources file them under the world or a continent, never under a country */
const INTERNATIONAL = /^(world|international|europe|asia|africa|oceania|(south|north|central)[- ]america|north[- ](and|&)[- ]central[- ]america)$/i
export const isInternational = (leagueCountry?: string) => !!leagueCountry && INTERNATIONAL.test(leagueCountry.trim())

/**
 * Danish place and club names as the sources write them without Danish letters, in the other sports' Danish leagues
 * ("Sonderjyske", "Koge", "Ajax Kobenhavn", "Herre Handbold Ligaen"). Whole words only, and only for Danish leagues.
 */
const DANISH_SPELLING: Record<string, string> = {
  Sonderjyske: 'SønderjyskE', Koge: 'Køge', Kobenhavn: 'København', Grondal: 'Grøndal', Handbold: 'Håndbold', Brondby: 'Brøndby',
  Hjorring: 'Hjørring', Nordsjaelland: 'Nordsjælland', Naestved: 'Næstved', Helsingor: 'Helsingør', Hillerod: 'Hillerød',
  Sonderborg: 'Sønderborg', Ringkobing: 'Ringkøbing', Holbaek: 'Holbæk', Soborg: 'Søborg', Bronshoj: 'Brønshøj', Vanlose: 'Vanløse',
  Horsholm: 'Hørsholm', Nykobing: 'Nykøbing', Rodovre: 'Rødovre', Vaerlose: 'Værløse', Tonder: 'Tønder', Hojbjerg: 'Højbjerg',
  Stovring: 'Støvring', Norresundby: 'Nørresundby', Thyboron: 'Thyborøn', Ostjylland: 'Østjylland', Osterbro: 'Østerbro',
  Norrebro: 'Nørrebro', Fureso: 'Furesø', Tarnby: 'Tårnby', Dragor: 'Dragør', Solrod: 'Solrød', Ishoj: 'Ishøj',
  Vallensbaek: 'Vallensbæk', Allerod: 'Allerød', Birkerod: 'Birkerød', Sollerod: 'Søllerød', Vedbaek: 'Vedbæk', Naerum: 'Nærum',
  Morso: 'Morsø', Bronderslev: 'Brønderslev', Saeby: 'Sæby', Skaelskor: 'Skælskør', Lokken: 'Løkken', Gorlev: 'Gørlev',
  Fano: 'Fanø', Aero: 'Ærø', Samso: 'Samsø', Laeso: 'Læsø', Jaegersborg: 'Jægersborg', 
  Abyhoj: 'Åbyhøj', Hojslev: 'Højslev', Orum: 'Ørum', Olstykke: 'Ølstykke', 
  Skaerbaek: 'Skærbæk', Graested: 'Græsted', Hoje: 'Høje', Rodby: 'Rødby', Praesto: 'Præstø',
  Ronne: 'Rønne', Nexo: 'Nexø', Soro: 'Sorø', Kvindehandbold: 'Kvindehåndbold',
}
const DANISH_WORD = new RegExp(`(?<![\\p{L}\\d])(${Object.keys(DANISH_SPELLING).join('|')})(?![\\p{L}\\d])`, 'gu')
/** A Danish name with its Danish letters back ("HB Koge" -> "HB Køge") */
export const danishSpelling = (name: string) => name.replace(DANISH_WORD, (w) => DANISH_SPELLING[w] ?? w)
const DENMARK = /^(denmark|danmark)$/i
/** Danish clubs the sources (and a-liga.dk) name otherwise, by the name we show: "FC Copenhagen W" -> "FC København (K)" */
const DANISH_CLUBS: Record<string, string> = { 'FC Copenhagen': 'FC København', 'F.C. København': 'FC København' }
const DANISH_CLUB = new RegExp(`^(${Object.keys(DANISH_CLUBS).map((k) => k.replace(/\./g, '\\.')).join('|')})(?=\\s|$)`)

/** What follows a team's name in the sources: youth ("U21"), women ("W"), Olympic and B teams */
const KINDS = /\s+(u-?\s?\d{2}|w|women|olympics?|b)$/i
const WOMEN_KIND = /^w(omen)?$/i

/**
 * A team's name as we show it. National teams (in a tournament between countries) by their
 * Danish names: "Scotland" -> "Skotland", "Ivory Coast U21" -> "Elfenbenskysten U21". Women's
 * teams are marked "(K)" where the sources write "W": "Paris FC W" -> "Paris FC (K)",
 * "Denmark W" -> "Danmark (K)". Every other name is kept. Only for showing: addresses and
 * lookups use the source's own name.
 */
export function shownTeam(name: string, leagueCountry?: string): string {
  // In a Danish league: the Danish letters the source leaves out
  if (leagueCountry && DENMARK.test(leagueCountry.trim())) name = danishSpelling(name)
  // A Danish club under its Danish name in every tournament (the women's Champions League too)
  name = name.replace(DANISH_CLUB, (m) => DANISH_CLUBS[m] ?? m)
  let base = name.trim()
  const kinds: string[] = []
  for (let m = KINDS.exec(base); m; m = KINDS.exec(base)) {
    kinds.unshift(m[1])
    base = base.slice(0, m.index)
  }
  const women = kinds.some((k) => WOMEN_KIND.test(k))
  const danish = isInternational(leagueCountry) ? nation(foldCountry(base)) : undefined
  if (!base || (!danish && !women)) return name
  // A club keeps what it is called apart from the women's mark ("Brondby U19 W" -> "Brondby U19 (K)")
  const rest = kinds.filter((k) => !WOMEN_KIND.test(k)).map((k) => (!danish ? k : /^olympics?$/i.test(k) ? 'OL' : k.toUpperCase().replace(/^U-?\s?/, 'U')))
  return [danish ?? base, ...rest, ...(women ? ['(K)'] : [])].join(' ')
}

/** The women's mark we show ("Paris FC (K)"), where a name is read again */
export const SHOWN_WOMEN = /\s*\(k\)$/i

/** A national team's name ("Wales", "Denmark U21", "Danmark"), not a club's */
export function isNationalTeam(name: string): boolean {
  let base = name.trim()
  for (let m = KINDS.exec(base); m; m = KINDS.exec(base)) base = base.slice(0, m.index)
  const folded = foldCountry(base)
  return !!base && (!!nationOrSame(folded) || !!englishNation(folded))
}
