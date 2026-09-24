// Danish men's football, season 2026/27. Clubs are listed roughly by expected
// strength (strongest first); the demo generator uses the order for scores.
// `unverified` marks clubs whose division could not be confirmed from sources.

export interface Club {
  id: string
  name: string
  city: string
  /** [background, text] used for the fallback badge */
  colors: [string, string]
  unverified?: boolean
}

export interface Division {
  id: string
  name: string
  short: string
  clubs: Club[]
}

const c = (id: string, name: string, city: string, bg: string, fg = '#ffffff', unverified?: boolean): Club => ({
  id,
  name,
  city,
  colors: [bg, fg],
  unverified,
})

export const SEASON = '2026/27'

export const DIVISIONS: Division[] = [
  {
    id: 'superliga',
    name: 'Superliga',
    short: 'SL',
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
    name: '1. division',
    short: '1D',
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
    name: '2. division',
    short: '2D',
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
    name: '3. division',
    short: '3D',
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
