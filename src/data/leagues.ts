import { c, type Division } from './club'
import { hasRealData } from './real'
import { GERMANY } from './germany'
import { ENGLAND } from './england'
import { NORDIC } from './nordic'
import { ICE_HOCKEY } from './icehockey'
import { BASKETBALL } from './basketball'
import type { SportId } from '../types'

// The football leagues we cover, season 2026/27. Clubs are listed roughly by
// expected strength (strongest first); the fictional results use the order.
// `unverified` marks clubs whose division could not be confirmed from sources.
// Add a league by adding a Division here (or in its own file, like germany.ts):
// fixtures, tables, league and club pages, sitemap and logos follow from it.

export type { Club, Division } from './club'

export const SEASON = '2026/27'

const DENMARK: Division[] = [
  {
    id: 'superliga',
    slug: 'superliga',
    name: 'Superliga',
    short: 'SL',
    country: 'Danmark',
    countryCode: 'DK',
    seasonStart: '2026-07-17',
    zones: { top: 6, topLabel: 'Mesterskabsspil', bottom: 2 },
    movement: 'De seks bedste går videre til mesterskabsspillet, og de to dårligste rykker ned i 1. division.',
    apiLeague: 'Danish Superliga',
    clubs: [
      c('fck', 'FC København', 'København', '#ffffff', '#0b2a7a'),
      c('fcm', 'FC Midtjylland', 'Herning', '#111111', '#e30613'),
      c('bif', 'Brøndby IF', 'Brøndby', '#ffd500', '#0a3a8c'),
      c('agf', 'AGF', 'Aarhus', '#ffffff', '#003d8f'),
      c('fcn', 'FC Nordsjælland', 'Farum', '#e30613', '#ffd500'),
      c('rfc', 'Randers FC', 'Randers', '#0055a4'),
      c('ob', 'OB', 'Odense', '#0057b8'),
      c('sif', 'Silkeborg IF', 'Silkeborg', '#d0021b'),
      c('vff', 'Viborg FF', 'Viborg', '#00843d'),
      c('sje', 'SønderjyskE', 'Haderslev', '#5fb4e5', '#0b1f3a'),
      c('lbk', 'Lyngby BK', 'Lyngby', '#1d4f91'),
      c('ach', 'AC Horsens', 'Horsens', '#ffd200', '#111111'),
    ],
  },
  {
    id: '1div',
    slug: '1-division',
    name: '1. division',
    short: '1D',
    country: 'Danmark',
    countryCode: 'DK',
    seasonStart: '2026-07-17',
    zones: { top: 2, topLabel: 'Oprykning', bottom: 2 },
    movement: 'De to bedste rykker op i Superligaen, og de to dårligste rykker ned i 2. division.',
    apiLeague: 'Danish 1st Division',
    clubs: [
      c('vb', 'Vejle Boldklub', 'Vejle', '#d0021b'),
      c('aab', 'AaB', 'Aalborg', '#d0021b'),
      c('fcf', 'FC Fredericia', 'Fredericia', '#e30613'),
      c('efb', 'Esbjerg fB', 'Esbjerg', '#0057b8'),
      c('hif', 'Hvidovre IF', 'Hvidovre', '#d0021b'),
      c('kif', 'Kolding IF', 'Kolding', '#ffffff', '#0b2a7a'),
      c('hbk', 'HB Køge', 'Køge', '#111111', '#ffffff'),
      c('hik-ob', 'Hobro IK', 'Hobro', '#ffd200', '#003d8f'),
      c('hil', 'Hillerød Fodbold', 'Hillerød', '#0b2a7a'),
      c('vff2', 'Vendsyssel FF', 'Hjørring', '#ffffff', '#d0021b'),
      c('ab', 'AB', 'Gladsaxe', '#00843d'),
      c('afr', 'Aarhus Fremad', 'Aarhus', '#111111', '#ffd200'),
    ],
  },
  {
    id: '2div',
    slug: '2-division',
    name: '2. division',
    short: '2D',
    country: 'Danmark',
    countryCode: 'DK',
    seasonStart: '2026-07-17',
    zones: { top: 2, topLabel: 'Oprykning', bottom: 2 },
    movement: 'De to bedste i oprykningsspillet rykker op i 1. division, og de to dårligste i kvalifikationsspillet rykker ned.',
    apiLeague: 'Danish 2nd Division',
    clubs: [
      c('b93', 'B.93', 'København', '#ffffff', '#0b2a7a'),
      c('mbk', 'Middelfart Boldklub', 'Middelfart', '#0b2a7a'),
      c('fcr', 'FC Roskilde', 'Roskilde', '#111111', '#ffffff'),
      c('nbk', 'Næstved BK', 'Næstved', '#00843d'),
      c('fam', 'Fremad Amager', 'København', '#0b2a7a', '#ffd200'),
      c('sik', 'Skive IK', 'Skive', '#0b2a7a'),
      c('vsk', 'VSK Aarhus', 'Aarhus', '#00843d'),
      c('tfc', 'Thisted FC', 'Thisted', '#0057b8'),
      c('hikh', 'HIK', 'Hellerup', '#ffd200', '#0b2a7a'),
      c('bra', 'Brabrand IF', 'Brabrand', '#ffffff', '#d0021b'),
      c('nfc', 'Nykøbing FC', 'Nykøbing Falster', '#0b2a7a', '#ffffff', true),
      c('fa2', 'FA 2000', 'Frederiksberg', '#d0021b', '#ffffff', true),
    ],
  },
  {
    id: '3div',
    slug: '3-division',
    name: '3. division',
    short: '3D',
    country: 'Danmark',
    countryCode: 'DK',
    seasonStart: '2026-07-17',
    zones: { top: 2, topLabel: 'Oprykning', bottom: 3 },
    movement: 'De to bedste i oprykningsspillet rykker op i 2. division, og de tre dårligste i nedrykningsspillet rykker ned i Danmarksserien.',
    clubs: [
      c('hol', 'Holbæk B&I', 'Holbæk', '#d0021b'),
      c('bro', 'Brønshøj BK', 'Brønshøj', '#ffd200', '#111111'),
      c('van', 'Vanløse IF', 'Vanløse', '#0057b8'),
      c('frem', 'BK Frem', 'Valby', '#d0021b', '#0b2a7a'),
      c('fch', 'FC Helsingør', 'Helsingør', '#ffd200', '#d0021b'),
      c('ish', 'Ishøj IF', 'Ishøj', '#0057b8'),
      c('hu', 'Hørsholm-Usserød IK', 'Hørsholm', '#ffffff', '#00843d'),
      c('sun', 'Sundby BK', 'København', '#0b2a7a'),
      c('hb', 'Holstebro Boldklub', 'Holstebro', '#ffffff', '#d0021b'),
      c('rif', 'Ringsted IF', 'Ringsted', '#0b2a7a'),
      c('asa', 'ASA Aarhus', 'Aarhus', '#0057b8'),
      c('vej', 'Vejgaard BK', 'Aalborg', '#00843d', '#ffffff', true),
    ],
  },
]

export const DIVISIONS: Division[] = [...DENMARK, ...GERMANY, ...ENGLAND, ...NORDIC, ...ICE_HOCKEY, ...BASKETBALL]

/** Season shown for a league: "2026" for calendar-year leagues, otherwise 2026/27 */
export const seasonOf = (d: Division) => d.seasonLabel ?? SEASON
export const COUNTRIES = [...new Set(DIVISIONS.map((d) => d.country))]
export const sportOf = (d: Division): SportId => d.sport ?? 'soccer'

/** The leagues we have real fixtures for; only these are shown on the site */
export const shownDivisions = () => DIVISIONS.filter((d) => hasRealData(d.id))

/** Shown leagues grouped by sport and country, in the order they are listed */
export function leagueGroups() {
  const groups = new Map<string, { sport: SportId; country: string; divisions: Division[] }>()
  for (const d of shownDivisions()) {
    const key = `${sportOf(d)}|${d.country}`
    if (!groups.has(key)) groups.set(key, { sport: sportOf(d), country: d.country, divisions: [] })
    groups.get(key)!.divisions.push(d)
  }
  return [...groups.values()]
}

// Club ids key fixtures and tables across all leagues, so they must be unique
{
  const seen = new Set<string>()
  for (const club of DIVISIONS.flatMap((d) => d.clubs)) {
    if (seen.has(club.id)) throw new Error(`Duplicate club id "${club.id}" (${club.name})`)
    seen.add(club.id)
  }
}

export const divisionBySlug = (slug: string) => DIVISIONS.find((d) => d.slug === slug)

const CLUBS = DIVISIONS.flatMap((division) => division.clubs.map((club) => ({ club, division })))
export const clubBySlug = (slug: string) => CLUBS.find((x) => x.club.slug === slug)
export const clubByName = (name: string) => CLUBS.find((x) => x.club.name === name)
export const allClubs = () => CLUBS

/** Short label for a league badge ("SL", "2B"); undefined for other competitions */
export function competitionLabel(name: string) {
  return DIVISIONS.find((d) => d.name === name)?.short
}
