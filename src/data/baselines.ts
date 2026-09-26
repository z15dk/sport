// Starting tables for API-Sports' leagues whose earlier matches the free plan
// doesn't give: the table after a round, entered by hand from the league's
// own standings. Every match our statistics bank saves after `after` is
// added on top (src/lib/history.ts, archiveLeagueTable).

export interface BaselineRow {
  name: string
  /** Other names the data source may use for the team */
  aliases?: string[]
  played: number
  won: number
  drawn: number
  lost: number
  for: number
  against: number
  points: number
}

export interface Baseline {
  /** The league as API-Sports names it, for its page before API-Sports has sent any of its games */
  league: { name: string; country: string; sport: 'soccer' | 'handball' | 'basketball' | 'ice_hockey' | 'volleyball' }
  /** Where the starting table comes from, shown under the table */
  source: string
  round: number
  /** Matches after this time (ISO) are added on top */
  after: string
  /** A line under this place in the table, as on the league's own standings */
  splitAfter?: number
  /** What the line means, when we know it */
  splitLabel?: string
  rows: BaselineRow[]
}

const row = (name: string, played: number, [won, drawn, lost]: [number, number, number], [gf, ga]: [number, number], points: number, aliases?: string[]): BaselineRow => ({
  name,
  aliases,
  played,
  won,
  drawn,
  lost,
  for: gf,
  against: ga,
  points,
})

/** By the league's key (externalLeagueKey) */
export const BASELINES: Record<string, Baseline> = {
  // A-Liga (women's football), regular season 2026/27, after round 8 (a-liga.dk, 26 September 2026)
  'x-denmark-a-liga': {
    league: { name: 'A-Liga', country: 'Denmark', sport: 'soccer' },
    source: 'a-liga.dk',
    round: 8,
    after: '2026-09-26T09:20:00Z',
    splitAfter: 6,
    splitLabel: 'går videre til mesterskabsspillet',
    rows: [
      row('HB Køge Women', 8, [7, 0, 1], [24, 8], 21, ['HB Køge', 'HB Koge']),
      row('FC Nordsjælland', 8, [6, 1, 1], [29, 9], 19, ['Nordsjaelland']),
      row('Brøndby IF', 8, [4, 2, 2], [20, 7], 14, ['Brondby']),
      row('FC Midtjylland', 8, [4, 2, 2], [13, 12], 14, ['Midtjylland']),
      row('Fortuna Hjørring', 8, [4, 1, 3], [19, 11], 13, ['Fortuna Hjorring']),
      row('ASA Aarhus', 8, [3, 1, 4], [11, 16], 10, ['ASA']),
      row('Kolding IF', 8, [3, 0, 5], [17, 24], 9, ['Kolding']),
      row('OB Q', 8, [2, 1, 5], [5, 18], 7, ['OB', 'Odense']),
      row('F.C. København', 8, [2, 0, 6], [11, 29], 6, ['FC København', 'FC Copenhagen']),
      row('AGF', 8, [1, 0, 7], [6, 21], 3, ['AGF Aarhus', 'Aarhus']),
    ],
  },
  // B-Liga (women's football), regular season 2026/27, after round 6 (b-liga.dk, 26 September 2026)
  'x-denmark-b-liga': {
    league: { name: 'B-Liga', country: 'Denmark', sport: 'soccer' },
    source: 'b-liga.dk',
    round: 6,
    after: '2026-09-26T09:25:00Z',
    splitAfter: 2,
    rows: [
      row('Østerbro IF', 6, [5, 0, 1], [19, 7], 15, ['Osterbro', 'Østerbro']),
      row('B.93', 6, [4, 0, 2], [12, 9], 12, ['B93', 'B 93']),
      row('Sundby', 6, [3, 2, 1], [14, 9], 11, ['Sundby BK']),
      row('FC Thy - Thisted Q', 6, [3, 1, 2], [20, 18], 10, ['FC Thy', 'Thisted', 'Thy-Thisted']),
      row('Viborg FF', 6, [2, 2, 2], [8, 7], 8, ['Viborg']),
      row('Næstved HG', 6, [2, 1, 3], [6, 7], 7, ['Naestved', 'Næstved']),
      row('AaB', 6, [1, 1, 4], [7, 19], 4, ['Aalborg', 'AaB Fodbold']),
      row('Esbjerg fB', 6, [0, 1, 5], [8, 18], 1, ['Esbjerg']),
    ],
  },
}
