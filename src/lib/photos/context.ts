import type { Db, Row } from './db.ts'
import type { LineupPlayer, SquadRow } from './names.ts'
import type { TaggingContext } from './tagging.ts'

// What tagging needs to know about a photo's match: both clubs' colours, the
// own club's team sheet for that day and its squad. Shared by the job and the
// admin pages (which re-tag from the stored AI answer when the match is changed).

export const parseList = (v: unknown): string[] => {
  try {
    const a = JSON.parse(String(v ?? '[]'))
    return Array.isArray(a) ? a.map(String) : []
  } catch {
    return []
  }
}

export function taggingContext(db: Db, p: Row, minConfidence: number): TaggingContext {
  const club = p.club_id ? db.prepare('SELECT colors, extra_colors FROM clubs WHERE id = ?').get(p.club_id) : undefined
  const opp = p.opponent_id ? db.prepare('SELECT colors, extra_colors FROM clubs WHERE id = ?').get(p.opponent_id) : undefined
  let lineup: LineupPlayer[] | undefined
  if (p.club_id && p.match_date) {
    const matches = db
      .prepare(`SELECT match_key, home_id, away_id FROM matches WHERE date = ? AND has_lineups = 1 AND (home_id = ? OR away_id = ?)`)
      .all(p.match_date, p.club_id, p.club_id)
      .filter((m) => !p.opponent_id || m.home_id === p.opponent_id || m.away_id === p.opponent_id)
    // Only a single fitting match counts (two the same day would be a mix-up)
    if (matches.length === 1) {
      lineup = db.prepare('SELECT number, name, reserve FROM lineups WHERE match_key = ? AND club_id = ?').all(matches[0].match_key, p.club_id).map((r) => ({ number: Number(r.number), name: String(r.name), reserve: !!r.reserve }))
    }
  }
  const squad: SquadRow[] = p.club_id
    ? db.prepare('SELECT number, name, valid_from, valid_to, uncertain, source FROM squads WHERE club_id = ?').all(p.club_id).map((r) => ({ number: Number(r.number), name: String(r.name), validFrom: r.valid_from as string | null, validTo: r.valid_to as string | null, uncertain: !!r.uncertain, manual: r.source === 'manuel' }))
    : []
  return {
    clubKnown: !!club,
    ownColors: club ? [...parseList(club.colors), ...parseList(club.extra_colors)] : [],
    opponentColors: opp ? [...parseList(opp.colors), ...parseList(opp.extra_colors)] : undefined,
    matchDate: p.match_date ? String(p.match_date) : undefined,
    lineup,
    squad,
    minConfidence,
  }
}

