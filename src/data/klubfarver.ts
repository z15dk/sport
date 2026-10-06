// Klubfarver til klubsidens header (KlubHeader): striberne og linjen under toppen.
// slug -> hex, for Superligaen og 1., 2. og 3. division. Ret farven i hånden her.
// En klub, der ikke står her, får sidens lime. Uden imports, så filen kan testes for sig.

export const KLUBFARVER: Record<string, string> = {
  // Superliga
  'fc-koebenhavn': '#ffffff',
  'fc-midtjylland': '#e30613', // klubbens første farve #111111 er for mørk mod den sorte baggrund
  'broendby-if': '#ffd500',
  'agf': '#ffffff',
  'fc-nordsjaelland': '#e30613',
  'randers-fc': '#0055a4',
  'ob': '#0057b8',
  'silkeborg-if': '#d0021b',
  'viborg-ff': '#00843d',
  'soenderjyske': '#5fb4e5',
  'lyngby-bk': '#1d4f91',
  'ac-horsens': '#ffd200',
  // 1. division
  'vejle-boldklub': '#d0021b',
  'aab': '#d0021b',
  'fc-fredericia': '#e30613',
  'esbjerg-fb': '#0057b8',
  'hvidovre-if': '#d0021b',
  'kolding-if': '#ffffff',
  'hb-koege': '#ffffff', // klubbens første farve #111111 er for mørk mod den sorte baggrund
  'hobro-ik': '#ffd200',
  'hilleroed-fodbold': '#ffffff', // klubbens første farve #0b2a7a er for mørk mod den sorte baggrund
  'vendsyssel-ff': '#ffffff',
  'ab': '#00843d',
  'aarhus-fremad': '#ffd200', // klubbens første farve #111111 er for mørk mod den sorte baggrund
  // 2. division
  'b-93': '#ffffff',
  'middelfart-boldklub': '#ffffff', // klubbens første farve #0b2a7a er for mørk mod den sorte baggrund
  'fc-roskilde': '#ffffff', // klubbens første farve #111111 er for mørk mod den sorte baggrund
  'naestved-bk': '#00843d',
  'fremad-amager': '#ffd200', // klubbens første farve #0b2a7a er for mørk mod den sorte baggrund
  'skive-ik': '#ffffff', // klubbens første farve #0b2a7a er for mørk mod den sorte baggrund
  'vsk-aarhus': '#00843d',
  'thisted-fc': '#0057b8',
  'hik': '#ffd200',
  'brabrand-if': '#ffffff',
  'nykoebing-fc': '#ffffff', // klubbens første farve #0b2a7a er for mørk mod den sorte baggrund
  'fa-2000': '#d0021b',
  // 3. division
  'holbaek-b-og-i': '#d0021b',
  'broenshoej-bk': '#ffd200',
  'vanloese-if': '#0057b8',
  'bk-frem': '#d0021b',
  'fc-helsingoer': '#ffd200',
  'ishoej-if': '#0057b8',
  'hoersholm-usseroed-ik': '#ffffff',
  'sundby-bk': '#ffffff', // klubbens første farve #0b2a7a er for mørk mod den sorte baggrund
  'holstebro-boldklub': '#ffffff',
  'ringsted-if': '#ffffff', // klubbens første farve #0b2a7a er for mørk mod den sorte baggrund
  'asa-aarhus': '#0057b8',
  'vejgaard-bk': '#00843d',
  'naesby-bk': '#5c6157',

  // A-Ligaen (kvinder): herreklubbens farve
  'agf-a-liga': '#ffffff',
  'asa-aarhus-a-liga': '#0057b8',
  'broendby-if-a-liga': '#ffd500',
  'f-c-koebenhavn-a-liga': '#ffffff',
  'fc-midtjylland-a-liga': '#e30613',
  'fc-nordsjaelland-a-liga': '#e30613',
  'fortuna-hjoerring': '#0057b8',
  'hb-koege-women-a-liga': '#ffffff',
  'kolding-if-a-liga': '#ffffff',
  'ob-q': '#0057b8',

  // Landshold (adressen er kildens engelske navn: /klub/denmark)
  'denmark': '#c8102e',
  'england': '#ffffff',
  'scotland': '#0065bd',
  'wales': '#c8102e',
  'northern-ireland': '#00843d',
  'ireland': '#169b62',
  'germany': '#ffffff',
  'france': '#0055a4',
  'spain': '#c60b1e',
  'italy': '#0066cc',
  'portugal': '#c8102e',
  'netherlands': '#ff6c00',
  'belgium': '#e30613',
  'switzerland': '#d52b1e',
  'austria': '#ed2939',
  'sweden': '#fecc00',
  'norway': '#ba0c2f',
  'finland': '#ffffff',
  'iceland': '#0048e0',
  'poland': '#ffffff',
  'croatia': '#ff0000',
  'serbia': '#c6363c',
  'czech-republic': '#d7141a',
  'hungary': '#ce2939',
  'greece': '#0d5eaf',
  'turkey': '#e30a17',
  'ukraine': '#ffd500',
  'usa': '#ffffff',
  'brazil': '#ffdf00',
  'argentina': '#75aadb',
}

/** Sidens lime: standardfarven, når en klub mangler i listen */
export const STANDARD_KLUBFARVE = '#c6f135'

/** Hvor lys en farve er (0 = sort, 1 = hvid), efter WCAG's formel */
function lysstyrke(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return 1
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => {
    const c = parseInt(x, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Næsten sort eller meget mørk (fx mørk marineblå): kan ikke ses som stribe på den sorte baggrund */
const forMoerk = (hex: string) => lysstyrke(hex) < 0.05

/**
 * Klubbens farve til headeren: fra listen, ellers klubbens egen første farve, ellers sidens lime.
 * Er den næsten sort, bruges klubbens anden farve, og er den også for mørk, sidens lime.
 */
export function klubfarve(slug: string, colors?: readonly [string, string]): string {
  const valgt = KLUBFARVER[slug] ?? colors?.[0] ?? STANDARD_KLUBFARVE
  if (!forMoerk(valgt)) return valgt
  return colors?.[1] && !forMoerk(colors[1]) ? colors[1] : STANDARD_KLUBFARVE
}
