// The leagues (our division ids) whose clubs have the new club page (KlubHeader, the squad, the extra questions, the
// slim banner in the column, the TV channel in the match list); the other leagues' clubs keep the old page.
// Add a league here to give its clubs the new page too (src/app/klub/[slug]/page.tsx and the match page's ground).
export const NEW_CLUB_PAGE_DIVISIONS = new Set(['superliga', '1div'])
