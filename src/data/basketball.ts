import { c, type Division } from './club'

// Danish Basketligaen 2026/27. Strongest first. Two club names could not be
// confirmed exactly from sources and are marked unverified.

export const BASKETBALL: Division[] = [
  {
    id: 'basketligaen',
    slug: 'basketligaen',
    name: 'Basketligaen',
    short: 'BL',
    sport: 'basketball',
    country: 'Danmark',
    countryCode: 'DK',
    // Thursday 17 September; rounds on Thursdays and Saturdays; everyone meets four times
    seasonStart: '2026-09-17',
    roundStarts: [0, 2],
    meetings: 4,
    zones: { top: 8, topLabel: 'Slutspil', bottom: 0 },
    movement: 'De otte bedste i grundspillet går videre til slutspillet om DM.',
    apiLeague: 'Danish Basketligaen',
    clubs: [
      c('b-bak', 'Bakken Bears', 'Aarhus', '#111111', '#e2001a'),
      c('b-sve', 'Svendborg Rabbits', 'Svendborg', '#003f87'),
      c('b-hor', 'Horsens IC', 'Horsens', '#ffd200', '#111111'),
      c('b-ran', 'Randers Cimbria', 'Randers', '#e2001a'),
      c('b-fog', 'Team FOG Næstved', 'Næstved', '#0057b8'),
      c('b-hol', 'Holbæk-Stenhus', 'Holbæk', '#e2001a', '#ffffff'),
      c('b-her', 'BMS Herlev Wolfpack', 'Herlev', '#111111'),
      c('b-vej', 'Vejen Basket', 'Vejen', '#008d4f', '#ffffff', true),
      c('b-gla', 'Gladsaxe Basketball', 'Gladsaxe', '#0b2a7a', '#ffffff', true),
      c('b-cph', 'Copenhagen Basketball', 'København', '#111111', '#ffd200', true),
      c('b-vbh', 'Værløse Blue Hawks', 'Værløse', '#0057b8'),
      c('b-bea', 'Bears Academy', 'Aarhus', '#111111', '#e2001a'),
    ],
  },
]
