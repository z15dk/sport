import { clubKey, type ClubRef } from './paths.ts'

// Search words for the photo admin: "Brabrand 9", "Bryld", "Skive jubel",
// "Fremad Amager 20". Numbers (0–99) mean shirt numbers and only ever find the
// club's own players; club names (also several words and loose forms like
// "Brabrand IF") limit to that club; everything else is free text.

export interface ParsedQuery {
  clubIds: string[]
  /** The clubs' names, for pictures that only carry the club as one of our own tags (graphics) */
  clubNames?: string[]
  numbers: number[]
  words: string[]
}

export function parseQuery(q: string, clubs: ClubRef[]): ParsedQuery {
  const tokens = q.trim().split(/\s+/).filter(Boolean)
  const out: ParsedQuery = { clubIds: [], numbers: [], words: [] }
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i]
    if (/^#?\d{1,2}$/.test(t)) {
      out.numbers.push(Number(t.replace('#', '')))
      i++
      continue
    }
    // The longest run of words (up to 3) that names a club
    let used = 0
    for (let n = Math.min(3, tokens.length - i); n >= 1 && !used; n--) {
      const words = tokens.slice(i, i + n)
      if (words.some((w) => /^#?\d+$/.test(w))) continue
      const club = clubNamed(words.join(' '), clubs, n === 1)
      if (club) {
        if (!out.clubIds.includes(club.id)) {
          out.clubIds.push(club.id)
          out.clubNames = [...(out.clubNames ?? []), club.name]
        }
        used = n
      }
    }
    if (used) i += used
    else {
      out.words.push(t)
      i++
    }
  }
  return out
}

/** The WHERE part (on photos p) for a parsed query */
export function searchWhere(p: ParsedQuery): { sql: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []
  const inList = (xs: unknown[]) => `(${xs.map(() => '?').join(', ')})`
  if (p.numbers.length) {
    // Shirt numbers only count on the photographed club's own players
    parts.push(`EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.side = 'egen' AND t.number IN ${inList(p.numbers)})`)
    params.push(...p.numbers)
    if (p.clubIds.length) {
      parts.push(`p.club_id IN ${inList(p.clubIds)}`)
      params.push(...p.clubIds)
    }
  } else if (p.clubIds.length) {
    // A club alone: its own photos, the matches where it was the opponent, and pictures tagged with it
    const names = p.clubNames ?? []
    parts.push(`(p.club_id IN ${inList(p.clubIds)} OR p.opponent_id IN ${inList(p.clubIds)}${names.length ? ` OR EXISTS (SELECT 1 FROM json_each(p.user_tags) WHERE lower(value) IN ${inList(names)})` : ''})`)
    params.push(...p.clubIds, ...p.clubIds, ...names.map((n) => n.toLowerCase()))
  }
  for (const w of p.words) {
    const like = `%${w.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    parts.push(
      `(p.opponent LIKE ? ESCAPE '\\' OR p.club LIKE ? ESCAPE '\\' OR p.situation LIKE ? ESCAPE '\\' OR p.match_date LIKE ? ESCAPE '\\'
        OR p.title LIKE ? ESCAPE '\\' OR p.user_tags LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.side = 'egen' AND (t.player_name LIKE ? ESCAPE '\\' OR t.back_name LIKE ? ESCAPE '\\')))`,
    )
    params.push(like, like, like, like, like, like, like, like)
  }
  return { sql: parts.length ? parts.join(' AND ') : '1 = 1', params }
}

/** A club named exactly (also "Brabrand IF", "VSK Aarhus"), or – for one word – the one club whose name starts with it ("Fremad") */
function clubNamed(text: string, clubs: ClubRef[], allowStart: boolean): ClubRef | undefined {
  const key = clubKey(text)
  if (!key) return undefined
  const names = (c: ClubRef) => [c.name, ...c.aliases].map(clubKey)
  const exact = clubs.filter((c) => names(c).includes(key))
  if (exact.length === 1) return exact[0]
  if (exact.length || !allowStart || key.length < 4) return undefined
  const start = clubs.filter((c) => names(c).some((n) => n.startsWith(key)))
  return start.length === 1 ? start[0] : undefined
}
