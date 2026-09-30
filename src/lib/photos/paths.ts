// Club and match from the Drive path, and club names matched loosely
// ("Brabrand IF" = "Brabrand", "VSK Aarhus" = "VSK Århus"). Pure functions.
//
//   Matchly Billeder/<Klub>/<ÅÅÅÅ-MM-DD>_<Modstander>/<fil>
//
// Folders starting with "_" (_web, _arkiv, _kvitteringer) belong to the system.

export interface ParsedPath {
  club: string
  date: string
  opponent: string
}

export function parsePhotoPath(parts: string[]): ParsedPath | { error: string } {
  if (parts.length !== 3) return { error: `Billedet skal ligge i <Klub>/<ÅÅÅÅ-MM-DD>_<Modstander>/ – ligger i "${parts.slice(0, -1).join('/') || '(roden)'}"` }
  const [club, folder] = parts
  // ÅÅÅÅ-MM-DD_Modstander, or the Danish short forms DDMMÅÅ / DDMMÅÅÅÅ / DD-MM-ÅÅÅÅ ("300926 Thisted")
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ _-]+(.+)$/.exec(folder.trim())
  const dk = /^(\d{2})[-.]?(\d{2})[-.]?(\d{2}|\d{4})[ _-]+(.+)$/.exec(folder.trim())
  const m = iso ?? (dk && [dk[0], dk[3].length === 2 ? `20${dk[3]}` : dk[3], dk[2], dk[1], dk[4]])
  if (!m) return { error: `Kampmappen "${folder}" skal hedde ÅÅÅÅ-MM-DD_Modstander (eller DDMMÅÅ Modstander)` }
  const date = `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return { error: `Datoen i "${folder}" findes ikke` }
  return { club: club.trim(), date, opponent: m[4].replace(/_/g, ' ').trim() }
}

const DROP = new Set(['if', 'fc', 'bk', 'ik', 'b', 'boldklub', 'boldklubben', 'idrætsforening', 'idrætsklub', 'fodbold', 'fodboldklub', 'af', 'a/s', 'elite', 'sk', 'ff'])

/** A comparable key for a club name */
export function clubKey(name: string) {
  const words = name
    .toLowerCase()
    .normalize('NFC')
    .replace(/aa/g, 'å')
    .replace(/ae/g, 'æ')
    .replace(/oe/g, 'ø')
    .replace(/[^a-z0-9æøåäöü]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const kept = words.filter((w) => !DROP.has(w))
  return (kept.length ? kept : words).join(' ')
}

/** URL/id-safe slug for a club name */
export const clubSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export interface ClubRef {
  id: string
  name: string
  aliases: string[]
}

/** The club a folder name means, or undefined when none or more than one fits */
export function resolveClub(name: string, clubs: ClubRef[]): ClubRef | undefined {
  const key = clubKey(name)
  if (!key) return undefined
  const exact = clubs.filter((c) => [c.name, ...c.aliases].some((n) => clubKey(n) === key))
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return undefined
  // "Brabrand" for "Brabrand IF Elite"-style names: one club whose key starts with the whole folder key
  const loose = clubs.filter((c) => [c.name, ...c.aliases].some((n) => clubKey(n).split(' ')[0] === key.split(' ')[0] && (clubKey(n).startsWith(key) || key.startsWith(clubKey(n)))))
  return loose.length === 1 ? loose[0] : undefined
}
