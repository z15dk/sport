import { parseList, taggingContext } from './context.ts'
import { getMeta, nowIso, quotaUsed, transaction, type Db, type Row } from './db.ts'
import { backNameFits, pickName } from './names.ts'
import { clubKey, type ClubRef } from './paths.ts'
import { parseQuery, searchWhere } from './search.ts'
import { tagPhoto } from './tagging.ts'
import { parseVisionJson } from './vision.ts'

// Reads and changes for the photo admin (/admin/billeder). Every function takes
// the open database, so the tests can run them against a temporary one.

export interface Photo {
  id: number
  path: string
  name: string
  club: string | null
  clubId: string | null
  opponent: string | null
  opponentId: string | null
  matchDate: string | null
  takenAt: string | null
  width: number | null
  height: number | null
  status: string
  situation: string | null
  review: boolean
  reviewReasons: string[]
  reviewCost: number
  error: string | null
  processedAt: string | null
  approvedAt: string | null
  /** Empty = our own photo (PHOTOS_DEFAULT_CREDIT) */
  credit: string | null
  /** Borrowed: the last day we may keep it (yyyy-mm-dd) */
  licenseUntil: string | null
}

export interface Tag {
  id: number
  photoId: number
  number: number | null
  jerseyColor: string | null
  side: 'egen' | 'modstander' | 'ukendt'
  confidence: number | null
  box: [number, number, number, number] | null
  playerName: string | null
  nameSource: string | null
  backName: string | null
  note: string | null
  source: string
}

export interface Suggestion {
  tagId: number
  name: string
  number: number
  /** The player wears another number than the one read */
  otherNumber: boolean
}

const toPhoto = (r: Row): Photo => ({
  id: Number(r.id),
  path: String(r.path),
  name: String(r.name),
  club: (r.club as string) ?? null,
  clubId: (r.club_id as string) ?? null,
  opponent: (r.opponent as string) ?? null,
  opponentId: (r.opponent_id as string) ?? null,
  matchDate: (r.match_date as string) ?? null,
  takenAt: (r.taken_at as string) ?? null,
  width: r.width == null ? null : Number(r.width),
  height: r.height == null ? null : Number(r.height),
  status: String(r.status),
  situation: (r.situation as string) ?? null,
  review: !!r.review,
  reviewReasons: parseList(r.review_reasons),
  reviewCost: Number(r.review_cost ?? 0),
  error: (r.error as string) ?? null,
  processedAt: (r.processed_at as string) ?? null,
  approvedAt: (r.approved_at as string) ?? null,
  credit: (r.credit as string) ?? null,
  licenseUntil: (r.license_until as string) ?? null,
})

const toTag = (r: Row): Tag => ({
  id: Number(r.id),
  photoId: Number(r.photo_id),
  number: r.number == null ? null : Number(r.number),
  jerseyColor: (r.jersey_color as string) ?? null,
  side: (r.side as Tag['side']) ?? 'ukendt',
  confidence: r.confidence == null ? null : Number(r.confidence),
  box: r.ymin == null ? null : [Number(r.ymin), Number(r.xmin), Number(r.ymax), Number(r.xmax)],
  playerName: (r.player_name as string) ?? null,
  nameSource: (r.name_source as string) ?? null,
  backName: (r.back_name as string) ?? null,
  note: (r.note as string) ?? null,
  source: String(r.source ?? 'ai'),
})

export function clubList(db: Db): (ClubRef & { colors: string[]; extraColors: string[]; kit: Record<string, string> | null })[] {
  return db
    .prepare('SELECT id, name, aliases, colors, extra_colors, kit FROM clubs ORDER BY name')
    .all()
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      aliases: parseList(r.aliases),
      colors: parseList(r.colors),
      extraColors: parseList(r.extra_colors),
      kit: r.kit ? (JSON.parse(String(r.kit)) as Record<string, string>) : null,
    }))
}

export function overview(db: Db, dailyLimit: number) {
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM photos GROUP BY status').all().map((r) => [String(r.status), Number(r.n)])) as Record<string, number>
  const review = Number(db.prepare(`SELECT COUNT(*) n FROM photos WHERE review = 1 AND status = 'tagget'`).get()?.n ?? 0)
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
  const expiring = Number(db.prepare(`SELECT COUNT(*) n FROM photos WHERE license_until IS NOT NULL AND license_until <= ? AND status != 'slettet'`).get(soon)?.n ?? 0)
  const lastRun = getMeta(db, 'last_run')
  return {
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    review,
    expiring,
    quota: { ...quotaUsed(db, 'gemini'), dailyLimit },
    lastRun: lastRun ? (JSON.parse(lastRun) as { finishedAt?: string; processed?: number; failed?: number; stoppedBecause?: string }) : undefined,
    dbu: getMeta(db, 'dbu_synced_at'),
  }
}

export function searchPhotos(db: Db, q: string, status = '', limit = 120): Photo[] {
  const { sql, params } = searchWhere(parseQuery(q, clubList(db)))
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
  const statusSql =
    status === 'gennemgang' ? ` AND p.review = 1 AND p.status = 'tagget'`
    : status === 'laant' ? ` AND p.license_until IS NOT NULL AND p.status != 'slettet'`
    : status === 'udloeber' ? ` AND p.license_until IS NOT NULL AND p.license_until <= ? AND p.status != 'slettet'`
    : status ? ' AND p.status = ?'
    : ` AND p.status NOT IN ('ny', 'behandles', 'slettet')`
  const statusParams = status === 'udloeber' ? [soon] : status && !['gennemgang', 'laant'].includes(status) ? [status] : []
  return db
    .prepare(`SELECT p.* FROM photos p WHERE ${sql}${statusSql} ORDER BY p.match_date DESC, p.id DESC LIMIT ?`)
    .all(...params, ...statusParams, limit)
    .map(toPhoto)
}

export function tagsFor(db: Db, photoIds: number[]): Map<number, Tag[]> {
  const out = new Map<number, Tag[]>(photoIds.map((id) => [id, []]))
  if (!photoIds.length) return out
  const rows = db.prepare(`SELECT * FROM tags WHERE photo_id IN (${photoIds.map(() => '?').join(', ')}) ORDER BY side = 'egen' DESC, number`).all(...photoIds)
  for (const r of rows) out.get(Number(r.photo_id))?.push(toTag(r))
  return out
}

export function getPhoto(db: Db, id: number): { photo: Photo; tags: Tag[]; log: Row[]; row: Row } | undefined {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(id)
  if (!row) return undefined
  return {
    photo: toPhoto(row),
    tags: tagsFor(db, [id]).get(id) ?? [],
    log: db.prepare('SELECT at, step, ok, ms, message FROM photo_log WHERE photo_id = ? ORDER BY id DESC LIMIT 30').all(id),
    row,
  }
}

/** The review queue: quickest to fix first, newest match first among equals */
export function reviewQueue(db: Db, limit = 100) {
  const photos = db.prepare(`SELECT * FROM photos WHERE review = 1 AND status = 'tagget' ORDER BY review_cost, match_date DESC, id LIMIT ?`).all(limit).map(toPhoto)
  const tags = tagsFor(db, photos.map((p) => p.id))
  return photos.map((p) => ({ photo: p, tags: tags.get(p.id) ?? [], suggestions: suggestions(db, p, tags.get(p.id) ?? []) }))
}

/** Players whose shirt name fits a tag without a name (one click in the review queue) */
export function suggestions(db: Db, p: Photo, tags: Tag[]): Suggestion[] {
  if (!p.clubId) return []
  const squad = db.prepare('SELECT number, name, valid_from, valid_to FROM squads WHERE club_id = ?').all(p.clubId)
  const out: Suggestion[] = []
  for (const t of tags) {
    if (t.playerName || !t.backName || t.side === 'modstander') continue
    const names = [...new Map(squad.filter((r) => backNameFits(t.backName!, String(r.name))).map((r) => [String(r.name), Number(r.number)]))]
    // Only when exactly one player of the club fits the name
    if (names.length === 1) out.push({ tagId: t.id, name: names[0][0], number: names[0][1], otherNumber: names[0][1] !== t.number })
  }
  return out
}

// ---------- changes ----------

function refreshReview(db: Db, photoId: number) {
  // A photo whose every own tag has a name and no tag is left undecided needs no review any more
  const tags = tagsFor(db, [photoId]).get(photoId) ?? []
  const open = tags.filter((t) => t.side === 'ukendt' || (t.side === 'egen' && !t.playerName))
  if (!open.length && tags.length) db.prepare(`UPDATE photos SET review = 0, review_reasons = '[]', review_cost = 0 WHERE id = ?`).run(photoId)
}

export function setApproved(db: Db, photoId: number, approved: boolean) {
  const r = db.prepare(`SELECT status FROM photos WHERE id = ?`).get(photoId)
  if (!r) return { error: 'Billedet findes ikke' }
  if (approved && r.status !== 'tagget' && r.status !== 'godkendt') return { error: 'Kun taggede billeder kan godkendes' }
  if (approved) db.prepare(`UPDATE photos SET status = 'godkendt', approved_at = ?, review = 0 WHERE id = ?`).run(nowIso(), photoId)
  else db.prepare(`UPDATE photos SET status = 'tagget', approved_at = NULL WHERE id = ? AND status = 'godkendt'`).run(photoId)
  return {}
}

export interface TagInput {
  number?: number | null
  name?: string | null
  side?: Tag['side']
}

/** An empty name on an own player is looked up (team sheet, then squad) */
function nameFor(db: Db, photoId: number, input: TagInput): { name: string | null; source: string | null; note: string | null } {
  const name = input.name?.trim()
  if (name) return { name, source: 'manuel', note: null }
  if (input.side !== 'egen' || input.number == null) return { name: null, source: null, note: null }
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId)!
  const ctx = taggingContext(db, row, 0)
  const found = pickName(input.number, ctx.matchDate, ctx.lineup, ctx.squad)
  return { name: found.name ?? null, source: found.source ?? null, note: found.note ?? null }
}

function validInput(input: TagInput) {
  if (input.number != null && (!Number.isInteger(input.number) || input.number < 0 || input.number > 99)) return 'Nummeret skal være 0–99'
  if (input.side && !['egen', 'modstander', 'ukendt'].includes(input.side)) return 'Ukendt hold'
  return undefined
}

export function updateTag(db: Db, tagId: number, input: TagInput) {
  const t = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId)
  if (!t) return { error: 'Tagget findes ikke' }
  const error = validInput(input)
  if (error) return { error }
  const next = { number: input.number !== undefined ? input.number : (t.number as number | null), side: input.side ?? (t.side as Tag['side']), name: input.name }
  const n = nameFor(db, Number(t.photo_id), next)
  db.prepare(`UPDATE tags SET number = ?, side = ?, player_name = ?, name_source = ?, note = ?, source = 'manuel' WHERE id = ?`).run(next.number, next.side, n.name, n.source, n.note, tagId)
  refreshReview(db, Number(t.photo_id))
  return { name: n.name, note: n.note }
}

export function addTag(db: Db, photoId: number, input: TagInput) {
  if (!db.prepare('SELECT id FROM photos WHERE id = ?').get(photoId)) return { error: 'Billedet findes ikke' }
  const error = validInput(input)
  if (error) return { error }
  const side = input.side ?? 'egen'
  const n = nameFor(db, photoId, { ...input, side })
  db.prepare(`INSERT INTO tags (photo_id, number, side, player_name, name_source, note, source, created_at) VALUES (?, ?, ?, ?, ?, ?, 'manuel', ?)`).run(photoId, input.number ?? null, side, n.name, n.source, n.note, nowIso())
  refreshReview(db, photoId)
  return { name: n.name, note: n.note }
}

export function deleteTag(db: Db, tagId: number) {
  const t = db.prepare('SELECT photo_id FROM tags WHERE id = ?').get(tagId)
  if (!t) return { error: 'Tagget findes ikke' }
  db.prepare('DELETE FROM tags WHERE id = ?').run(tagId)
  refreshReview(db, Number(t.photo_id))
  return {}
}

/** Another club, date or opponent for the photo: the AI tags are worked out again from the stored answer (no new AI call) */
export function setMatch(db: Db, photoId: number, input: { clubId?: string; date?: string; opponentId?: string }, minConfidence: number): { error?: string } {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId)
  if (!row) return { error: 'Billedet findes ikke' }
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: 'Datoen skal være ÅÅÅÅ-MM-DD' }
  const clubs = clubList(db)
  const club = input.clubId ? clubs.find((c) => c.id === input.clubId) : undefined
  const opp = input.opponentId ? clubs.find((c) => c.id === input.opponentId) : undefined
  if (input.clubId && !club) return { error: 'Ukendt klub' }
  if (input.opponentId && !opp) return { error: 'Ukendt modstander' }
  return transaction(db, () => {
    db.prepare('UPDATE photos SET club_id = ?, club = ?, opponent_id = ?, opponent = ?, match_date = ? WHERE id = ?').run(
      club?.id ?? row.club_id ?? null,
      club?.name ?? row.club ?? null,
      opp?.id ?? row.opponent_id ?? null,
      opp?.name ?? row.opponent ?? null,
      input.date ?? row.match_date ?? null,
      photoId,
    )
    retag(db, photoId, minConfidence)
    return {}
  })
}

/** The AI tags worked out again from the stored AI answer with today's clubs, sheets and squads (no new AI call); tags made by hand stay */
export function retag(db: Db, photoId: number, minConfidence: number) {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId)
  if (!row?.vision_json) return false
  const tagging = tagPhoto(parseVisionJson(String(row.vision_json), String(row.vision_model ?? '')), taggingContext(db, row, minConfidence))
  db.prepare(`DELETE FROM tags WHERE photo_id = ? AND source = 'ai'`).run(photoId)
  const ins = db.prepare(
    `INSERT INTO tags (photo_id, number, jersey_color, side, confidence, ymin, xmin, ymax, xmax, player_name, name_source, back_name, note, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?)`,
  )
  for (const t of tagging.tags) ins.run(photoId, t.number, t.jerseyColor, t.side, t.confidence, t.box?.[0] ?? null, t.box?.[1] ?? null, t.box?.[2] ?? null, t.box?.[3] ?? null, t.playerName ?? null, t.nameSource ?? null, t.backName ?? null, t.note ?? null, nowIso())
  db.prepare('UPDATE photos SET review = ?, review_reasons = ?, review_cost = ? WHERE id = ?').run(tagging.review ? 1 : 0, JSON.stringify(tagging.reasons), tagging.cost, photoId)
  return true
}

// ---------- rights ----------

export const isIsoDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d

/**
 * The credit (empty = our own) and, for a borrowed photo, the last day we may keep it
 * (empty = ours for good). With wholeMatch it goes for every photo of the same club and match.
 */
export function setRights(db: Db, photoId: number, input: { credit?: string; licenseUntil?: string; wholeMatch?: boolean }) {
  const row = db.prepare('SELECT club_id, club, match_date, opponent FROM photos WHERE id = ?').get(photoId)
  if (!row) return { error: 'Billedet findes ikke' }
  const credit = input.credit?.trim().slice(0, 120) || null
  const until = input.licenseUntil?.trim() || null
  if (until && !isIsoDate(until)) return { error: 'Datoen skal være ÅÅÅÅ-MM-DD' }
  if (until && !credit) return { error: 'Skriv hvem billedet er lånt af, når det har en låneperiode' }
  const sql = `UPDATE photos SET credit = ?, license_until = ? WHERE status != 'slettet' AND `
  const changes = input.wholeMatch
    ? db.prepare(sql + 'club IS ? AND match_date IS ? AND opponent IS ?').run(credit, until, row.club ?? null, row.match_date ?? null, row.opponent ?? null).changes
    : db.prepare(sql + 'id = ?').run(credit, until, photoId).changes
  return { count: Number(changes ?? 0) }
}

/** Borrowed photos whose loan has run out (the day after license_until) */
export function expiredLoans(db: Db, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })) {
  return db.prepare(`SELECT id, drive_id, web_drive_id, path, credit, license_until FROM photos WHERE license_until IS NOT NULL AND license_until < ? AND status NOT IN ('slettet', 'behandles')`).all(today)
}

// ---------- squads and clubs ----------

export function squadFor(db: Db, clubId: string) {
  return db
    .prepare('SELECT id, number, name, valid_from, valid_to, uncertain, source FROM squads WHERE club_id = ? ORDER BY number, valid_from')
    .all(clubId)
    .map((r) => ({ id: Number(r.id), number: Number(r.number), name: String(r.name), validFrom: (r.valid_from as string) ?? null, validTo: (r.valid_to as string) ?? null, uncertain: !!r.uncertain, source: String(r.source) }))
}

export function addSquadRow(db: Db, clubId: string, input: { number: number; name: string; validFrom?: string; validTo?: string }) {
  if (!db.prepare('SELECT id FROM clubs WHERE id = ?').get(clubId)) return { error: 'Ukendt klub' }
  if (!Number.isInteger(input.number) || input.number < 0 || input.number > 99) return { error: 'Nummeret skal være 0–99' }
  if (!input.name.trim()) return { error: 'Skriv et navn' }
  for (const d of [input.validFrom, input.validTo]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: 'Datoer skal være ÅÅÅÅ-MM-DD' }
  db.prepare(`INSERT INTO squads (club_id, number, name, valid_from, valid_to, uncertain, source) VALUES (?, ?, ?, ?, ?, 0, 'manuel')`).run(clubId, input.number, input.name.trim(), input.validFrom || null, input.validTo || null)
  return {}
}

export function deleteSquadRow(db: Db, id: number) {
  const r = db.prepare('SELECT source FROM squads WHERE id = ?').get(id)
  if (!r) return { error: 'Rækken findes ikke' }
  // Rows from DBU come back with the next sheet; a row added here overrides them instead
  if (r.source !== 'manuel') return { error: 'Rækker fra DBU kan ikke slettes – tilføj en rettelse i stedet' }
  db.prepare('DELETE FROM squads WHERE id = ?').run(id)
  return {}
}

export function updateClub(db: Db, clubId: string, input: { extraColors?: string[]; aliases?: string[] }) {
  const clubs = clubList(db)
  if (!clubs.some((c) => c.id === clubId)) return { error: 'Ukendt klub' }
  const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].slice(0, 10)
  if (input.aliases) {
    const taken = clean(input.aliases).find((a) => clubs.some((c) => c.id !== clubId && [c.name, ...c.aliases].some((n) => clubKey(n) === clubKey(a))))
    if (taken) return { error: `"${taken}" er allerede navnet på en anden klub` }
    db.prepare('UPDATE clubs SET aliases = ? WHERE id = ?').run(JSON.stringify(clean(input.aliases)), clubId)
  }
  if (input.extraColors) db.prepare('UPDATE clubs SET extra_colors = ? WHERE id = ?').run(JSON.stringify(clean(input.extraColors.map((c) => c.toLowerCase()))), clubId)
  return {}
}
