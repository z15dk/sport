// Player names from shirt numbers. Pure functions (tests/photos/names.test.ts).
//
// Order: 1) the team sheet of the very match (DBU's holdkort, later also
// API-Football for 1st division), 2) the squad list with validity periods,
// 3) no name – the tag keeps its number and goes to review. A name is only
// given when exactly one player fits.

export interface LineupPlayer {
  number: number
  name: string
  reserve?: boolean
}

export interface SquadRow {
  number: number
  name: string
  /** yyyy-mm-dd, inclusive; empty = open */
  validFrom?: string | null
  validTo?: string | null
  /** The number was used by two players in the same period */
  uncertain?: boolean
  /** Added or corrected by hand in admin: wins over the rows from team sheets */
  manual?: boolean
}

export interface NameResult {
  name?: string
  source?: 'kamp' | 'trup'
  /** Why there is no name (Danish, shown in review) */
  note?: string
}

export function pickName(number: number, date: string | undefined, lineup: LineupPlayer[] | undefined, squad: SquadRow[]): NameResult {
  if (lineup?.length) {
    const hits = unique(lineup.filter((p) => p.number === number).map((p) => p.name))
    if (hits.length === 1) return { name: hits[0], source: 'kamp' }
    if (hits.length > 1) return { note: `#${number} står to gange på holdkortet (${hits.join(', ')})` }
    // The sheet is the truth for that match: a number not on it is misread or not ours
    return { note: `#${number} står ikke på kampens holdkort` }
  }
  let valid = squad.filter((r) => r.number === number && inPeriod(date, r.validFrom, r.validTo))
  if (valid.some((r) => r.manual)) valid = valid.filter((r) => r.manual)
  const names = unique(valid.map((r) => r.name))
  if (names.length === 1 && !valid.some((r) => r.uncertain)) return { name: names[0], source: 'trup' }
  if (names.length === 1) return { note: `#${number} er usikkert i truppen (brugt af flere spillere)` }
  if (names.length > 1) return { note: `#${number} passer på flere spillere (${names.join(', ')})` }
  return { note: date ? `#${number} findes ikke i truppen ${date}` : `#${number} findes ikke i truppen` }
}

function inPeriod(date: string | undefined, from?: string | null, to?: string | null) {
  // Without a date only open-ended rows count (the current holder)
  if (!date) return !to
  return (!from || from <= date) && (!to || date <= to)
}

const unique = (xs: string[]) => [...new Set(xs)]

const dayBefore = (d: string) => {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() - 1)
  return t.toISOString().slice(0, 10)
}

export interface SheetMatch {
  date: string
  /** club id → players */
  players: Record<string, LineupPlayer[]>
}

/**
 * The squad list from team sheets: who wore which number from when to when.
 * A number passes to the next player the day before he first wears it; a player
 * who changes number keeps the old one until the day before the new one (unless
 * he wears the old one again later). Numbers worn by two players in the same
 * period are marked uncertain.
 */
export function squadsFromSheets(matches: SheetMatch[]): (SquadRow & { clubId: string; games: number })[] {
  // club|number → name → dates
  const used = new Map<string, Map<string, string[]>>()
  // club|name → number → first date
  const numbers = new Map<string, Map<number, string>>()
  for (const m of [...matches].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const [club, players] of Object.entries(m.players)) {
      for (const p of players) {
        const k = `${club}|${p.number}`
        if (!used.has(k)) used.set(k, new Map())
        const byName = used.get(k)!
        byName.set(p.name, [...(byName.get(p.name) ?? []), m.date])
        const nk = `${club}|${p.name}`
        if (!numbers.has(nk)) numbers.set(nk, new Map())
        if (!numbers.get(nk)!.has(p.number)) numbers.get(nk)!.set(p.number, m.date)
      }
    }
  }
  const out: (SquadRow & { clubId: string; games: number })[] = []
  for (const [k, byName] of used) {
    const [clubId, nr] = [k.slice(0, k.lastIndexOf('|')), Number(k.slice(k.lastIndexOf('|') + 1))]
    const periods = [...byName].map(([name, dates]) => ({ name, from: dates[0], to: dates[dates.length - 1], games: dates.length })).sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name))
    periods.forEach((p, i) => {
      let validTo: string | undefined = i + 1 < periods.length ? dayBefore(periods[i + 1].from) : undefined
      const later = [...(numbers.get(`${clubId}|${p.name}`) ?? [])].filter(([n, first]) => n !== nr && first > p.to).map(([, first]) => first).sort()
      if (later.length) {
        const change = dayBefore(later[0])
        validTo = validTo && validTo < change ? validTo : change
      }
      const uncertain = periods.some((q) => q.name !== p.name && q.from <= p.to && p.from <= q.to)
      out.push({ clubId, number: nr, name: p.name, validFrom: p.from, validTo: validTo ?? null, uncertain, games: p.games })
    })
  }
  return out.sort((a, b) => a.clubId.localeCompare(b.clubId) || a.number - b.number || String(a.validFrom).localeCompare(String(b.validFrom)))
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean)

/** Does the name on the shirt ("BRYLD", "M. JENSEN") fit the player's full name? */
export function backNameFits(backName: string, fullName: string) {
  const back = fold(backName).filter((w) => w.length >= 3)
  const full = fold(fullName)
  return back.length > 0 && back.every((b) => full.some((f) => f === b || (b.length >= 4 && f.startsWith(b))))
}
