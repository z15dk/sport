import { createHash, randomBytes } from 'node:crypto'
import { bestOfMatch, postPhoto, postText, type Candidate } from './best.ts'
import { parseList, taggingContext } from './context.ts'
import { getMeta, nowIso, quotaUsed, transaction, type Db, type Row } from './db.ts'
import { backNameFits, pickName } from './names.ts'
import { clubKey, type ClubRef } from './paths.ts'
import { groupBursts } from './quality.ts'
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
  /** 'drive' or 'artikel' (uploaded in the article editor) */
  source: string
  /** False for an article picture whose rights and match have not been filled in */
  metadataDone: boolean
  sharpness: number | null
  dhash: string | null
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
  source: String(r.source ?? 'drive'),
  metadataDone: r.metadata_done == null ? true : !!r.metadata_done,
  sharpness: r.sharpness == null ? null : Number(r.sharpness),
  dhash: (r.dhash as string) ?? null,
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
  const review = Number(db.prepare(`SELECT COUNT(*) n FROM photos WHERE (review = 1 AND status = 'tagget') OR (metadata_done = 0 AND status IN ('ny', 'tagget'))`).get()?.n ?? 0)
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
    running: runningSince(db),
  }
}

/** When the job started, while it runs (a record older than an hour is a run that died) */
export function runningSince(db: Db): string | undefined {
  const r = getMeta(db, 'running')
  if (!r) return undefined
  const at = (JSON.parse(r) as { startedAt?: string }).startedAt
  return at && Date.now() - Date.parse(at) < 3600_000 ? at : undefined
}

export interface PhotoFilters {
  clubId?: string
  opponentId?: string
  situation?: string
  player?: string
  from?: string
  to?: string
  /** Only these photos (a burst opened from the grid) */
  ids?: number[]
}

export function searchPhotos(db: Db, q: string, status = '', limit = 120, f: PhotoFilters = {}): Photo[] {
  const { sql, params } = searchWhere(parseQuery(q, clubList(db)))
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
  const statusSql =
    status === 'gennemgang' ? ` AND ((p.review = 1 AND p.status = 'tagget') OR (p.metadata_done = 0 AND p.status IN ('ny', 'tagget')))`
    : status === 'laant' ? ` AND p.license_until IS NOT NULL AND p.status != 'slettet'`
    : status === 'udloeber' ? ` AND p.license_until IS NOT NULL AND p.license_until <= ? AND p.status != 'slettet'`
    : status ? ' AND p.status = ?'
    : ` AND p.status NOT IN ('behandles', 'slettet')`
  const statusParams = status === 'udloeber' ? [soon] : status && !['gennemgang', 'laant'].includes(status) ? [status] : []
  const extra: string[] = []
  const extraParams: unknown[] = []
  if (f.clubId) {
    extra.push('p.club_id = ?')
    extraParams.push(f.clubId)
  }
  if (f.opponentId) {
    extra.push('p.opponent_id = ?')
    extraParams.push(f.opponentId)
  }
  if (f.situation) {
    extra.push('p.situation = ?')
    extraParams.push(f.situation)
  }
  if (f.player) {
    extra.push(`EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.side = 'egen' AND t.player_name = ?)`)
    extraParams.push(f.player)
  }
  if (f.ids?.length) {
    extra.push(`p.id IN (${f.ids.map(() => '?').join(', ')})`)
    extraParams.push(...f.ids)
  }
  if (f.from && isIsoDate(f.from)) {
    extra.push('p.match_date >= ?')
    extraParams.push(f.from)
  }
  if (f.to && isIsoDate(f.to)) {
    extra.push('p.match_date <= ?')
    extraParams.push(f.to)
  }
  const extraSql = extra.map((e) => ` AND ${e}`).join('')
  return db
    .prepare(`SELECT p.* FROM photos p WHERE ${sql}${statusSql}${extraSql} ORDER BY p.match_date DESC, p.id DESC LIMIT ?`)
    .all(...params, ...statusParams, ...extraParams, limit)
    .map(toPhoto)
}

/** What the filters can offer: clubs and opponents with photos, situations and tagged own players (of one club), with counts */
export function filterOptions(db: Db, clubId?: string) {
  const live = `status NOT IN ('ny', 'behandles', 'slettet')`
  const count = (rows: Row[]) => rows.map((r) => ({ value: String(r.v), label: String(r.l ?? r.v), n: Number(r.n) }))
  return {
    clubs: count(db.prepare(`SELECT club_id v, club l, COUNT(*) n FROM photos WHERE ${live} AND club_id IS NOT NULL GROUP BY club_id ORDER BY l`).all()),
    opponents: count(db.prepare(`SELECT opponent_id v, opponent l, COUNT(*) n FROM photos WHERE ${live} AND opponent_id IS NOT NULL GROUP BY opponent_id ORDER BY l`).all()),
    situations: count(db.prepare(`SELECT situation v, COUNT(*) n FROM photos WHERE ${live} AND situation IS NOT NULL AND situation != '' GROUP BY situation ORDER BY n DESC, v`).all()),
    players: count(
      db
        .prepare(
          `SELECT t.player_name v, COUNT(DISTINCT t.photo_id) n FROM tags t JOIN photos p ON p.id = t.photo_id
           WHERE t.side = 'egen' AND t.player_name IS NOT NULL AND p.${live}${clubId ? ' AND p.club_id = ?' : ''} GROUP BY t.player_name ORDER BY t.player_name`,
        )
        .all(...(clubId ? [clubId] : [])),
    ),
  }
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
  // Article pictures without metadata come first (they are on the site already), then the quickest to fix
  const photos = db
    .prepare(`SELECT * FROM photos WHERE (review = 1 AND status = 'tagget') OR (metadata_done = 0 AND status IN ('ny', 'tagget')) ORDER BY metadata_done, review_cost, match_date DESC, id LIMIT ?`)
    .all(limit)
    .map(toPhoto)
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

export function isIsoDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d
}

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
  // Rights filled in for an article picture: its metadata is done
  db.prepare(`UPDATE photos SET metadata_done = 1, review_reasons = '[]', review = CASE WHEN status = 'ny' THEN 0 ELSE review END WHERE id = ? AND metadata_done = 0`).run(photoId)
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

// ---------- bursts, best of the match and posts ----------

const matchKeyOf = (p: Photo) => `${p.clubId ?? p.club}|${p.matchDate}|${p.opponentId ?? p.opponent}`

/** Bursts among the photos shown: photo id → the whole group (sharpest first) */
export function burstsOf(photos: Photo[]): Map<number, number[]> {
  const out = new Map<number, number[]>()
  for (const g of groupBursts(photos.map((p) => ({ id: p.id, matchKey: matchKeyOf(p), takenAt: p.takenAt, dhash: p.dhash, sharpness: p.sharpness })))) for (const id of g) out.set(id, g)
  return out
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })

/** Photos that may go out: approved, or tagged without doubts; never deleted or past a loan */
const SAFE = `(p.status = 'godkendt' OR (p.status = 'tagget' AND p.review = 0)) AND (p.license_until IS NULL OR p.license_until >= ?)`

function candidates(db: Db, clubId: string, date: string, opponentId: string | null): (Candidate & { credit: string | null })[] {
  const rows = db
    .prepare(`SELECT p.* FROM photos p WHERE ${SAFE} AND p.club_id = ? AND p.match_date = ? AND p.opponent_id IS ?`)
    .all(today(), clubId, date, opponentId)
  const tags = tagsFor(db, rows.map((r) => Number(r.id)))
  return rows.map((r) => ({
    id: Number(r.id),
    matchKey: 'm',
    takenAt: (r.taken_at as string) ?? null,
    dhash: (r.dhash as string) ?? null,
    sharpness: r.sharpness == null ? null : Number(r.sharpness),
    situation: (r.situation as string) ?? null,
    approved: r.status === 'godkendt',
    players: (tags.get(Number(r.id)) ?? []).filter((t) => t.side === 'egen' && t.playerName).map((t) => t.playerName!),
    credit: (r.credit as string) ?? null,
  }))
}

export function bestPhotos(db: Db, clubId: string, date: string, opponentId: string | null, n = 10) {
  const cs = candidates(db, clubId, date, opponentId)
  const ids = bestOfMatch(cs, n)
  return ids.map((id) => cs.find((c) => c.id === id)!)
}

/** Matches with photos (newest first), with result, goals, a draft post and its photo */
export function matchOverview(db: Db, defaultCredit: string, limit = 30) {
  const rows = db
    .prepare(
      `SELECT club_id, club, match_date, opponent_id, opponent, COUNT(*) n,
         SUM(CASE WHEN status = 'godkendt' OR (status = 'tagget' AND review = 0) THEN 1 ELSE 0 END) safe,
         SUM(CASE WHEN status = 'tagget' AND review = 1 THEN 1 ELSE 0 END) review
       FROM photos WHERE status IN ('tagget', 'godkendt', 'arkiveret') AND club_id IS NOT NULL AND match_date IS NOT NULL
       GROUP BY club_id, match_date, opponent_id ORDER BY match_date DESC LIMIT ?`,
    )
    .all(limit)
  return rows.map((r) => {
    const clubId = String(r.club_id)
    const date = String(r.match_date)
    const opponentId = (r.opponent_id as string) ?? null
    const m = db
      .prepare(`SELECT * FROM matches WHERE date = ? AND ((home_id = ? AND away_id IS ?) OR (away_id = ? AND home_id IS ?))`)
      .get(date, clubId, opponentId, clubId, opponentId)
    const goals = m ? db.prepare('SELECT club_id, minute, name FROM goals WHERE match_key = ? ORDER BY seq').all(m.match_key) : []
    const cs = candidates(db, clubId, date, opponentId)
    const ownScorers = goals.filter((g) => g.club_id === clubId).map((g) => String(g.name))
    const pick = postPhoto(cs, ownScorers)
    const credit = cs.find((c) => c.id === pick.id)?.credit ?? defaultCredit
    const hasResult = m && m.home_score != null
    const home = m ? m.home_id === clubId : true
    const own = hasResult ? Number(home ? m.home_score : m.away_score) : 0
    const opp = hasResult ? Number(home ? m.away_score : m.home_score) : 0
    return {
      clubId,
      club: String(r.club),
      date,
      opponentId,
      opponent: (r.opponent as string) ?? '?',
      count: Number(r.n),
      safe: Number(r.safe),
      review: Number(r.review),
      result: hasResult ? { own, opp, home } : undefined,
      goals: goals.map((g) => ({ own: g.club_id === clubId, minute: g.minute == null ? null : Number(g.minute), name: String(g.name) })),
      post: hasResult
        ? postText({ own: String(r.club), opponent: String(r.opponent ?? '?'), ownGoals: own, oppGoals: opp, home, goals: goals.map((g) => ({ own: g.club_id === clubId, minute: g.minute == null ? null : Number(g.minute), name: String(g.name) })), credit })
        : undefined,
      postPhotoId: pick.id,
      postScorer: pick.scorer,
      scorerPhotos: [...new Set(ownScorers)].map((name) => ({ name, ids: cs.filter((c) => c.players.includes(name)).map((c) => c.id) })),
    }
  })
}

// ---------- shares ----------

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

/** A private link to a set of photos for a club or player; borrowed and unsafe photos are left out */
export function createShare(db: Db, photoIds: number[], days: number, title: string) {
  if (!photoIds.length) return { error: 'Vælg billeder først' }
  if (!Number.isInteger(days) || days < 1 || days > 365) return { error: 'Linket skal gælde 1–365 dage' }
  const ok = db
    .prepare(`SELECT id FROM photos p WHERE p.id IN (${photoIds.map(() => '?').join(', ')}) AND p.status IN ('tagget', 'godkendt') AND p.license_until IS NULL`)
    .all(...photoIds)
    .map((r) => Number(r.id))
  if (!ok.length) return { error: 'Ingen af billederne kan deles (lånte, slettede eller ikke behandlede billeder deles aldrig)' }
  const token = randomBytes(24).toString('base64url')
  const expires = new Date(Date.now() + days * 86_400_000).toISOString()
  db.prepare('INSERT INTO shares (token_hash, title, photo_ids, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(hashToken(token), title.trim().slice(0, 120) || 'Billeder fra Matchly', JSON.stringify(ok), expires, nowIso())
  return { token, count: ok.length, skipped: photoIds.length - ok.length, expires }
}

export function shareList(db: Db) {
  return db
    .prepare('SELECT id, title, photo_ids, expires_at, created_at, revoked_at, views, last_view_at FROM shares ORDER BY id DESC LIMIT 100')
    .all()
    .map((r) => ({
      id: Number(r.id),
      title: String(r.title),
      count: parseList(r.photo_ids).length,
      expiresAt: String(r.expires_at),
      createdAt: String(r.created_at),
      revoked: !!r.revoked_at,
      active: !r.revoked_at && String(r.expires_at) > nowIso(),
      views: Number(r.views),
      lastViewAt: (r.last_view_at as string) ?? null,
    }))
}

export function revokeShare(db: Db, id: number) {
  const n = db.prepare('UPDATE shares SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(nowIso(), id).changes
  return n ? {} : { error: 'Linket findes ikke eller er allerede lukket' }
}

/** The share behind a token while it is open, with its photos that may still be shown */
export function openShare(db: Db, token: string, countView = false) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return undefined
  const r = db.prepare('SELECT * FROM shares WHERE token_hash = ?').get(hashToken(token))
  if (!r) return undefined
  const expired = !!r.revoked_at || String(r.expires_at) <= nowIso()
  const ids = parseList(r.photo_ids).map(Number)
  const photos = expired || !ids.length
    ? []
    : db.prepare(`SELECT * FROM photos p WHERE p.id IN (${ids.map(() => '?').join(', ')}) AND p.status IN ('tagget', 'godkendt', 'arkiveret') AND p.license_until IS NULL ORDER BY p.match_date DESC, p.id`).all(...ids).map(toPhoto)
  if (countView && !expired) db.prepare('UPDATE shares SET views = views + 1, last_view_at = ? WHERE id = ?').run(nowIso(), r.id)
  return { id: Number(r.id), title: String(r.title), expiresAt: String(r.expires_at), expired, photos }
}

// ---------- the article editor ----------

/** A picture uploaded in the article editor becomes a photo in the archive (queued for the AI); the same file twice is one photo */
export function registerArticleUpload(db: Db, uploadName: string): number {
  const driveId = `upload:${uploadName}`
  const found = db.prepare('SELECT id FROM photos WHERE drive_id = ?').get(driveId)
  if (found) return Number(found.id)
  const id = Number(
    db
      .prepare(`INSERT INTO photos (drive_id, name, path, status, source, metadata_done, review, review_reasons, review_cost, created_at) VALUES (?, ?, ?, 'ny', 'artikel', 0, 1, '["mangler metadata"]', 0, ?)`)
      .run(driveId, uploadName, `Artikler/${uploadName}`, nowIso()).lastInsertRowid,
  )
  db.prepare('INSERT OR IGNORE INTO article_images (upload_name, photo_id, created_at) VALUES (?, ?, ?)').run(uploadName, id, nowIso())
  return id
}

/** The metadata asked for right after an upload: rights, loan and match */
export function setArticleMetadata(db: Db, photoId: number, input: { credit?: string; licenseUntil?: string; clubId?: string; opponentId?: string; date?: string }, minConfidence: number) {
  const r = setRights(db, photoId, { credit: input.credit, licenseUntil: input.licenseUntil })
  if (r.error) return { error: r.error }
  if (input.clubId || input.opponentId || input.date) {
    const m = setMatch(db, photoId, { clubId: input.clubId || undefined, opponentId: input.opponentId || undefined, date: input.date || undefined }, minConfidence)
    if (m.error) return { error: m.error }
  }
  db.prepare(`UPDATE photos SET metadata_done = 1, review_reasons = REPLACE(review_reasons, '"mangler metadata"', '""') WHERE id = ?`).run(photoId)
  db.prepare(`UPDATE photos SET review_reasons = '[]', review = CASE WHEN status = 'ny' THEN 0 ELSE review END WHERE id = ? AND review_reasons IN ('[""]', '[]')`).run(photoId)
  return {}
}

/** Photos for the editor's archive picker: the search and filters from the admin, with what an article needs */
export function pickerPhotos(db: Db, q: string, f: PhotoFilters & { status?: string }, defaultCredit: string, limit = 60) {
  const photos = searchPhotos(db, q, f.status ?? '', limit, f).filter((p) => !p.licenseUntil || p.licenseUntil >= today())
  const tags = tagsFor(db, photos.map((p) => p.id))
  return photos.map((p) => {
    const names = (tags.get(p.id) ?? []).filter((t) => t.side === 'egen' && t.playerName).map((t) => t.playerName!)
    return {
      id: p.id,
      title: p.club ? `${p.club} – ${p.opponent ?? '?'}` : p.name,
      date: p.matchDate,
      status: p.status,
      review: p.review,
      players: names,
      situation: p.situation,
      credit: p.credit ?? defaultCredit,
      borrowed: !!p.licenseUntil,
      licenseUntil: p.licenseUntil,
      ready: !!p.processedAt || p.status === 'ny',
      alt: [names.slice(0, 3).join(', '), p.situation, p.club && p.opponent ? `${p.club} mod ${p.opponent}` : undefined].filter(Boolean).join(' – '),
    }
  })
}

/** Pictures in articles that are not in the archive yet (uploaded before the link existed): registered like a new upload */
export function backfillArticleImages(db: Db, articleImageNames: string[]): number {
  let added = 0
  for (const name of articleImageNames) {
    if (!/^[a-f0-9]{24}\.webp$/.test(name)) continue
    if (db.prepare('SELECT 1 FROM article_images WHERE upload_name = ?').get(name)) continue
    registerArticleUpload(db, name)
    added++
  }
  return added
}
