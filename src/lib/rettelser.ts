import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { KNOWN_COACHES, type KnownCoach } from '../data/coaches'
import { cacheDir } from './tsdb'

// Facts we know better than the data, kept as data on the server (data/rettelser.json), so they can be
// changed from admin – by the owner or by Claude after the datavagt (src/lib/datavagt.ts) has found something –
// without a new release. The coach list starts from KNOWN_COACHES in the code; after that the file is the source.

export interface CoachFix extends KnownCoach {
  /** When it was set, and by whom ("claude" or "admin") */
  at: number
  by: string
}

export interface FixLogLine {
  at: number
  by: string
  text: string
}

interface Rettelser {
  coaches: Record<string, CoachFix>
  log: FixLogLine[]
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'rettelser.json')

let cache: { at: number; data: Rettelser } | undefined

export function readRettelser(): Rettelser {
  if (cache && Date.now() - cache.at < 30_000) return cache.data
  let data: Rettelser
  try {
    data = JSON.parse(readFileSync(file(), 'utf8')) as Rettelser
    data.coaches ??= {}
    data.log ??= []
  } catch {
    // First time: the list from the code
    data = { coaches: Object.fromEntries(Object.entries(KNOWN_COACHES).map(([slug, c]) => [slug, { ...c, at: Date.now(), by: 'kode' }])), log: [] }
  }
  cache = { at: Date.now(), data }
  return data
}

function save(data: Rettelser) {
  mkdirSync(path.dirname(file()), { recursive: true })
  data.log = data.log.slice(-200)
  writeFileSync(file(), JSON.stringify(data, null, 2))
  cache = { at: Date.now(), data }
}

/** The coach we show for a club page instead of DBU's, if any */
export const knownCoach = (slug: string): CoachFix | undefined => readRettelser().coaches[slug]

export function setCoach(slug: string, coach: KnownCoach | null, by: string) {
  const data = readRettelser()
  const before = data.coaches[slug]
  if (coach) data.coaches[slug] = { ...coach, at: Date.now(), by }
  else delete data.coaches[slug]
  data.log.push({
    at: Date.now(),
    by,
    text: coach
      ? `Træner ${slug}: ${before?.name ?? '(DBU)'} → ${coach.name}${coach.acting ? ' (konstitueret)' : ''}. ${coach.why}`
      : `Træner ${slug}: rettelsen (${before?.name ?? '–'}) fjernet – DBU's rapporter bruges igen`,
  })
  save(data)
}
