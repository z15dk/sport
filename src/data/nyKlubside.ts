// The leagues (our division ids) whose clubs have the new club page (KlubHeader, the squad, the extra questions, the
// slim banner in the column, the TV channel in the match list); the other leagues' clubs keep the old page.
// Add a league here to give its clubs the new page too (src/app/klub/[slug]/page.tsx and the match page's ground).
export const NEW_CLUB_PAGE_DIVISIONS = new Set(['superliga', '1div', 'bundesliga', 'laliga', 'premierleague', 'championship', 'ligaportugal', 'allsvenskan', '3div', '2div'])

// The same for the leagues we do not cover with our own clubs but have the matches of (API-Sports' leagues, the clubs'
// page of src/app/klub/[slug]/page.tsx, TeamPage): by the league's key in addresses (externalLeagueKey).
export const NEW_CLUB_PAGE_EXTERNAL_LEAGUES = new Set(['x-argentina-liga-profesional-argentina', 'x-italy-serie-a', 'x-denmark-a-liga', 'x-denmark-kvindeliga'])
