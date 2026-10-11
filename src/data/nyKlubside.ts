// The leagues (our division ids) whose clubs have the new club page (KlubHeader, the squad, the extra questions, the
// slim banner in the column, the TV channel in the match list): every football league of ours since 11/10-2026 (the
// owner's word); ice hockey and basketball keep the old page, the design is made for football.
// (src/app/klub/[slug]/page.tsx and the match page's ground.)
export const NEW_CLUB_PAGE_DIVISIONS = new Set(['superliga', '1div', 'bundesliga', 'laliga', 'premierleague', 'championship', 'ligaportugal', 'allsvenskan', '3div', '2div', 'bundesliga2', 'liga3', 'eliteserien'])

// The leagues we do not cover with our own clubs but have the matches of (API-Sports' leagues, the clubs' page of
// src/app/klub/[slug]/page.tsx, TeamPage): every football league since 11/10-2026. These were first and keep their
// squads fresh every day; the others' squads are fetched again once a week (src/lib/apisports.ts refreshSquads).
export const SQUAD_PRIORITY_LEAGUES = new Set(['x-argentina-liga-profesional-argentina', 'x-italy-serie-a', 'x-denmark-a-liga', 'x-denmark-kvindeliga', 'x-netherlands-eredivisie', 'x-netherlands-eredivisie-women'])

/** Whether a football league's clubs (by the league's key in addresses, externalLeagueKey) have the new page: all */
export const hasNewClubPage = (leagueKey: string | undefined): boolean => !!leagueKey
