import { c, ca, type Division } from './club'

// Ice hockey 2026/27: Danish Metal Ligaen and Swedish SHL. Strongest first.

export const ICE_HOCKEY: Division[] = [
  {
    id: 'metalligaen',
    slug: 'metal-ligaen',
    name: 'Metal Ligaen',
    short: 'ML',
    sport: 'ice_hockey',
    country: 'Danmark',
    countryCode: 'DK',
    // Friday 28 August; rounds on Fridays and Sundays; everyone meets six times
    seasonStart: '2026-08-28',
    roundStarts: [0, 2],
    meetings: 6,
    zones: { top: 8, topLabel: 'Slutspil', bottom: 0 },
    movement: 'De otte bedste i grundspillet går videre til slutspillet om DM. Der er ingen nedrykning.',
    apiLeague: 'Danish Metal Ligaen',
    clubs: [
      c('h-her', 'Herning Blue Fox', 'Herning', '#0057b8'),
      c('h-aal', 'Aalborg Pirates', 'Aalborg', '#111111', '#e2001a'),
      c('h-sje', 'SønderjyskE Ishockey', 'Vojens', '#5fb4e5', '#0b1f3a'),
      c('h-run', 'Rungsted Seier Capital', 'Hørsholm', '#0b2a7a'),
      c('h-fre', 'Frederikshavn White Hawks', 'Frederikshavn', '#ffffff', '#0b2a7a'),
      c('h-ode', 'Odense Bulldogs', 'Odense', '#e2001a'),
      c('h-rod', 'Rødovre Mighty Bulls', 'Rødovre', '#111111', '#ffd200'),
      c('h-esb', 'Esbjerg Energy', 'Esbjerg', '#0057b8', '#ffd200'),
      c('h-hle', 'Herlev Eagles', 'Herlev', '#ffd200', '#111111'),
    ],
  },
  {
    id: 'shl',
    slug: 'shl',
    name: 'SHL',
    short: 'SHL',
    sport: 'ice_hockey',
    country: 'Sverige',
    countryCode: 'SE',
    // Saturday 19 September; rounds on Saturdays and Tuesdays; everyone meets four times (52 games)
    seasonStart: '2026-09-19',
    roundStarts: [0, 3],
    meetings: 4,
    zones: { top: 6, topLabel: 'Kvartfinale', bottom: 2 },
    movement:
      'Nr. 1–6 går direkte til kvartfinalerne, og nr. 7–10 spiller om de sidste pladser. Nr. 14 rykker ned, og nr. 13 spiller kvalifikation mod HockeyAllsvenskan.',
    apiLeague: 'Swedish SHL',
    clubs: [
      ca('s-ska', 'Skellefteå AIK', 'Skelleftea AIK', 'Skellefteå', '#111111', '#ffd200'),
      ca('s-luf', 'Luleå HF', 'Lulea HF', 'Luleå', '#e2001a'),
      ca('s-fbk', 'Färjestad BK', 'Farjestad BK', 'Karlstad', '#008d4f', '#ffd200'),
      ca('s-fro', 'Frölunda HC', 'Frolunda HC', 'Göteborg', '#006a4e'),
      ca('s-vax', 'Växjö Lakers', 'Vaxjo Lakers', 'Växjö', '#003f87', '#ffd200'),
      ca('s-bry', 'Brynäs IF', 'Brynas IF', 'Gävle', '#ffd200', '#e2001a'),
      ca('s-rog', 'Rögle BK', 'Rogle BK', 'Ängelholm', '#008d4f'),
      ca('s-lhc', 'Linköping HC', 'Linkoping HC', 'Linköping', '#003f87', '#e2001a'),
      ca('s-dif', 'Djurgårdens IF', 'Djurgardens IF', 'Stockholm', '#0a3f86', '#ffd200'),
      ca('s-hv7', 'HV71', 'HV71', 'Jönköping', '#003f87', '#ffd200'),
      ca('s-tik', 'Timrå IK', 'Timra IK', 'Timrå', '#e2001a'),
      ca('s-mif', 'Malmö Redhawks', 'Malmo Redhawks', 'Malmö', '#e2001a', '#111111'),
      ca('s-ohk', 'Örebro HK', 'Orebro HK', 'Örebro', '#e2001a', '#111111'),
      ca('s-bjo', 'IF Björklöven', 'IF Bjorkloven', 'Umeå', '#008d4f', '#ffd200'),
    ],
  },
]
