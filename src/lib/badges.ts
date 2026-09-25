import 'server-only'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, allClubs } from '../data/leagues'
import { CUP_NAME } from '../data/season'
import { slugify } from './slug'

// Club and league logos. Clubs are looked up in this order:
// 1. A file in public/logos/<club-slug>.(svg|png|webp|jpg)
// 2. The badge from TheSportsDB (cached for a day): first from the team lists of
//    the Danish leagues it covers, then by searching for the club by name
// 3. Nothing – TeamBadge then draws the club's initials in its colours
// Leagues work the same way, with local files in public/logos/ligaer/<league-slug>.*

const API_KEY = process.env.THESPORTSDB_KEY || process.env.VITE_THESPORTSDB_KEY || '3'
const EXTENSIONS = ['svg', 'png', 'webp', 'jpg']

// Names TheSportsDB uses where they differ from the Danish name
const SEARCH_NAMES: Record<string, string> = {
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
}

function localLogo(slug: string, folder = ''): string | undefined {
  for (const ext of EXTENSIONS) {
    const file = path.join(folder, `${slug}.${ext}`)
    if (existsSync(path.join(process.cwd(), 'public', 'logos', file))) return `/logos/${file.replaceAll(path.sep, '/')}`
  }
  return undefined
}

// TheSportsDB league names, from the division data
const API_LEAGUES = DIVISIONS.flatMap((d) => (d.apiLeague ? [d.apiLeague] : []))

interface ApiTeam {
  strTeam: string
  strTeamAlternate?: string | null
  strTeamShort?: string | null
  strSport?: string
  strCountry?: string
  strBadge?: string | null
  strTeamBadge?: string | null
}

const API_SPORT: Record<string, string> = { soccer: 'Soccer', ice_hockey: 'Ice Hockey', basketball: 'Basketball', handball: 'Handball' }
const API_COUNTRY: Record<string, string> = {
  Danmark: 'Denmark',
  Tyskland: 'Germany',
  Sverige: 'Sweden',
  Norge: 'Norway',
  England: 'England',
  USA: 'United States',
  Europa: 'Worldwide',
}

async function apiBadge(search: string, sport: string, country: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${API_KEY}/searchteams.php?t=${encodeURIComponent(search)}`,
      { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return undefined
    const data: { teams: ApiTeam[] | null } = await res.json()
    const team = (data.teams ?? []).find((t) => t.strSport === API_SPORT[sport] && t.strCountry === API_COUNTRY[country])
    const badge = team?.strBadge || team?.strTeamBadge
    return badge ? `${badge}/small` : undefined
  } catch {
    return undefined
  }
}

/** Lowercase, no accents or Danish letters, no punctuation or common club prefixes */
function normalize(name: string) {
  return ` ${name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'aa')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')} `
    .replace(/ (fc|bk|if|ik|ff|fb|boldklub|fodbold|football club) /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function leagueTeams(): Promise<ApiTeam[]> {
  const lists = await Promise.all(
    API_LEAGUES.map(async (league) => {
      try {
        const res = await fetch(
          `https://www.thesportsdb.com/api/v1/json/${API_KEY}/search_all_teams.php?l=${encodeURIComponent(league)}`,
          { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(4000) },
        )
        if (!res.ok) return []
        const data: { teams: ApiTeam[] | null } = await res.json()
        return data.teams ?? []
      } catch {
        return []
      }
    }),
  )
  return lists.flat()
}

function badgeFromList(teams: ApiTeam[], names: string[]): string | undefined {
  const wanted = names.map(normalize).filter(Boolean)
  const team = teams.find((t) => {
    const theirs = [t.strTeam, t.strTeamAlternate, t.strTeamShort]
      .flatMap((n) => (n ? n.split(',') : []))
      .map(normalize)
      .filter(Boolean)
    return theirs.some((n) => wanted.includes(n))
  })
  const badge = team?.strBadge || team?.strTeamBadge
  return badge ? `${badge}/small` : undefined
}

/** File names (without extension) in public/logos/<folder> */
function partnerIds(folder: string): string[] {
  try {
    return readdirSync(path.join(process.cwd(), 'public', 'logos', folder))
      .filter((f) => EXTENSIONS.some((ext) => f.endsWith(`.${ext}`)))
      .map((f) => f.replace(/\.[^.]+$/, ''))
  } catch {
    return []
  }
}

// ---- League logos ----

interface LeagueLogoSource {
  name: string
  sport: string
  country: string
  /** Names TheSportsDB may use for it */
  apiNames: string[]
}

// Our leagues, the Danish cup and the leagues of the other sports
const LEAGUE_SOURCES: LeagueLogoSource[] = [
  ...DIVISIONS.map((d) => ({
    name: d.name,
    sport: d.sport ?? 'soccer',
    country: d.country,
    apiNames: [d.apiLeague, d.name].filter((n): n is string => !!n),
  })),
  { name: CUP_NAME, sport: 'soccer', country: 'Danmark', apiNames: ['Danish Cup', 'DBU Pokalen', 'Landspokalturneringen'] },
  { name: 'NBA', sport: 'basketball', country: 'USA', apiNames: ['NBA'] },
  { name: 'NHL', sport: 'ice_hockey', country: 'USA', apiNames: ['NHL'] },
  { name: 'Herreligaen', sport: 'handball', country: 'Danmark', apiNames: ['Danish Handball League', 'Herreligaen', 'HTH Herreligaen'] },
  { name: 'Champions League', sport: 'handball', country: 'Europa', apiNames: ['EHF Champions League'] },
]

interface ApiLeague {
  strLeague: string
  strLeagueAlternate?: string | null
  strSport?: string
  strBadge?: string | null
  strLogo?: string | null
}

/** All leagues TheSportsDB has for one country and sport */
async function apiLeagues(country: string, sport: string): Promise<ApiLeague[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${API_KEY}/search_all_leagues.php?c=${encodeURIComponent(API_COUNTRY[country] ?? country)}&s=${encodeURIComponent(API_SPORT[sport] ?? sport)}`,
      { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return []
    const data: { countries?: ApiLeague[] | null; countrys?: ApiLeague[] | null } = await res.json()
    return data.countries ?? data.countrys ?? []
  } catch {
    return []
  }
}

async function leagueBadges(): Promise<[string, string][]> {
  const pairs = [...new Set(LEAGUE_SOURCES.map((l) => `${l.country}|${l.sport}`))]
  const lists = new Map(
    await Promise.all(pairs.map(async (p) => [p, await apiLeagues(...(p.split('|') as [string, string]))] as const)),
  )
  const out: [string, string][] = []
  for (const src of LEAGUE_SOURCES) {
    const local = localLogo(slugify(src.name), 'ligaer')
    if (local) {
      out.push([src.name, local])
      continue
    }
    const wanted = src.apiNames.map(normalize)
    const league = (lists.get(`${src.country}|${src.sport}`) ?? []).find((l) =>
      [l.strLeague, ...(l.strLeagueAlternate ?? '').split(',')].map(normalize).some((n) => n && wanted.includes(n)),
    )
    const badge = league?.strBadge || league?.strLogo
    if (badge) out.push([src.name, `${badge}/small`])
  }
  return out
}

let cached: Promise<Record<string, string>> | undefined

/** Map of club and league name -> logo URL for everything that has one */
export function getBadges(): Promise<Record<string, string>> {
  cached ??= (async () => {
    const [teams, leagues] = await Promise.all([leagueTeams(), leagueBadges()])
    const entries = await Promise.all(
      allClubs().map(async ({ club, division }) => {
        const search = club.apiName ?? SEARCH_NAMES[club.id] ?? club.name
        const url =
          localLogo(club.slug) ??
          badgeFromList(teams, [club.name, search]) ??
          (await apiBadge(search, division.sport ?? 'soccer', division.country))
        return url ? ([club.name, url] as const) : undefined
      }),
    )
    // Partner logos (bookmaker, TV channels), keyed "bookmaker:<id>" / "kanal:<id>"
    const partners: [string, string][] = []
    for (const [folder, key] of [['bookmakere', 'bookmaker'], ['kanaler', 'kanal']] as const) {
      for (const id of partnerIds(folder)) {
        const logo = localLogo(id, folder)
        if (logo) partners.push([`${key}:${id}`, logo])
      }
    }
    const map = Object.fromEntries([...entries.filter((e) => e !== undefined), ...leagues, ...partners])
    // Try again on the next request if nothing came back (e.g. the API was down)
    if (Object.keys(map).length === 0) cached = undefined
    return map
  })()
  return cached
}
