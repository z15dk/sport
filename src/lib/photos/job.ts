import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import path from 'node:path'
import { photoConfig, type PhotoConfig } from './config.ts'
import { countCall, getMeta, logStep, nowIso, openPhotoDb, quotaUsed, setMeta, transaction, type Db, type Row } from './db.ts'
import { syncDbu } from './dbu.ts'
import { DriveError, driveClient, type DriveClient, type DriveFile } from './drive.ts'
import { geminiProvider } from './gemini.ts'
import { parseList, taggingContext } from './context.ts'
import { expiredLoans } from './store.ts'
import { parsePhotoPath, resolveClub, type ClubRef } from './paths.ts'
import { tagPhoto, type Tagging } from './tagging.ts'
import { MAX_ORIGINAL_BYTES, makeVariants } from './variants.ts'
import { FatalError, PhotoError, QuotaError, TransientError, parseVisionJson, type VisionProvider, type VisionResult } from './vision.ts'

// The photo job, started by systemd (deploy/photos.timer → scripts/photos-job.ts)
// with the lowest CPU and disk priority. One run:
//   1. frees photos whose lease ran out (a run that stopped halfway)
//   2. once a day: clubs and team sheets from DBU
//   3. lists the Drive folder and queues new photos
//   4. works through the queue one photo at a time, pausing between AI calls and
//      while the server is busy; stops politely on quota errors
// Every photo is logged (photo_log + journald) with time, result and errors.

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff'])
const LEASE_MS = 15 * 60_000
const MAX_ATTEMPTS = 3

export interface RunSummary {
  startedAt: string
  finishedAt?: string
  queued: number
  processed: number
  review: number
  failed: number
  released: number
  aiCalls: number
  /** Borrowed photos deleted because the loan ran out */
  deleted: number
  deleteErrors: number
  stoppedBecause?: string
  seconds?: number
}

type Log = (s: string) => void

export function missingConfig(cfg: PhotoConfig) {
  return [
    !cfg.serviceAccountFile && 'GOOGLE_SA_FILE',
    !cfg.driveId && 'PHOTOS_DRIVE_ID',
    !cfg.geminiKey && 'GEMINI_API_KEY',
  ].filter(Boolean) as string[]
}

export async function runPhotoJob(opts: { limit?: number; log?: Log; dbu?: 'auto' | 'skip' | 'force'; night?: boolean } = {}): Promise<RunSummary> {
  const cfg = photoConfig()
  const log = opts.log ?? console.log
  const missing = missingConfig(cfg)
  if (missing.length) throw new FatalError(`Mangler i /opt/scoreline/env: ${missing.join(', ')} (se docs/billeder-drift.md)`)
  const db = openPhotoDb(cfg.db)
  const summary: RunSummary = { startedAt: nowIso(), queued: 0, processed: 0, review: 0, failed: 0, released: 0, aiCalls: 0, deleted: 0, deleteErrors: 0 }
  const t0 = Date.now()
  setMeta(db, 'running', JSON.stringify({ startedAt: summary.startedAt, pid: process.pid, night: !!opts.night }))
  try {
    summary.released = Number(db.prepare(`UPDATE photos SET status = 'ny', lease_until = NULL WHERE status = 'behandles' AND lease_until < ?`).run(Date.now()).changes ?? 0)
    if (summary.released) log(`${summary.released} billede(r) fra en afbrudt kørsel sat tilbage i køen`)

    const lastDbu = getMeta(db, 'dbu_synced_at')
    if (opts.dbu === 'force' || (opts.dbu !== 'skip' && (!lastDbu || Date.now() - Date.parse(lastDbu) > 20 * 3600_000))) {
      const r = await syncDbu(db, cfg.dbuPools, cfg.dbuPauseMs, log)
      setMeta(db, 'dbu_synced_at', nowIso())
      setMeta(db, 'dbu_last', JSON.stringify(r))
      log(`DBU: ${r.clubs} klubber, ${r.sheetsFetched} nye holdkort, ${r.squadRows} trup-rækker${r.errors.length ? `, ${r.errors.length} fejl: ${r.errors.slice(0, 3).join(' | ')}` : ''}`)
    }

    const drive = driveClient(cfg.serviceAccountFile!, cfg.driveId!)
    // Borrowed photos go before anything else, so a run that stops early never keeps one too long
    const gone = await deleteExpiredLoans(db, drive, cfg, log)
    summary.deleted = gone.deleted
    summary.deleteErrors = gone.errors
    summary.queued = await syncDrive(db, drive, cfg.folderId!, log)

    const vision = geminiProvider(cfg.geminiKey!, cfg.geminiModel)
    const webFolder = getMeta(db, 'drive_web_folder') ?? (await drive.ensureFolder('_web', cfg.folderId!))
    setMeta(db, 'drive_web_folder', webFolder)
    mkdirSync(cfg.thumbDir, { recursive: true })
    mkdirSync(cfg.cacheDir, { recursive: true })

    const limit = opts.limit ?? cfg.batch
    let transientInRow = 0
    while (summary.processed + summary.failed < limit) {
      // The night runs leave the rest of the queue for the next night (or the Sync button)
      if (opts.night && copenhagenHour() >= cfg.nightEndHour) {
        summary.stoppedBecause = `nattens vindue sluttede kl. ${cfg.nightEndHour}`
        break
      }
      if (!(await waitForQuiet(cfg.maxLoad, log))) {
        summary.stoppedBecause = 'serveren har travlt'
        break
      }
      const photo = claim(db)
      if (!photo) break
      const id = Number(photo.id)
      const started = Date.now()
      let calledAi = false
      try {
        const r = await processPhoto(db, cfg, drive, vision, webFolder, photo, () => {
          calledAi = true
          summary.aiCalls++
        })
        summary.processed++
        if (r.review) summary.review++
        transientInRow = 0
        const secs = ((Date.now() - started) / 1000).toFixed(1)
        const what = r.tags.map((t) => `#${t.number}${t.playerName ? ` ${t.playerName}` : ''}${t.side === 'egen' ? '' : ` (${t.side})`}`).join(', ') || 'ingen numre'
        log(`[${summary.processed + summary.failed}/${limit}] ${String(photo.path)}: ${what} · ${secs} s${r.review ? ` · gennemgang: ${r.reasons.join(', ')}` : ''}`)
        logStep(db, id, 'færdig', true, Date.now() - started, what)
      } catch (e) {
        const err = e as Error
        const msg = err.message || String(e)
        logStep(db, id, 'fejl', false, Date.now() - started, msg)
        if (e instanceof QuotaError || e instanceof FatalError) {
          release(db, id, msg, false)
          summary.stoppedBecause = msg
          log(`${String(photo.path)}: ${msg} – stopper, fortsætter ved næste kørsel`)
          if (e instanceof FatalError) throw e
          break
        }
        const transient = e instanceof TransientError || (e instanceof DriveError && (e.status >= 500 || e.status === 429)) || err.name === 'TimeoutError' || err instanceof TypeError
        if (transient && Number(photo.attempts) < MAX_ATTEMPTS) {
          release(db, id, msg, true)
          log(`${String(photo.path)}: midlertidig fejl, prøves igen senere: ${msg}`)
          if (++transientInRow >= 3) {
            summary.stoppedBecause = `3 midlertidige fejl i træk (${msg})`
            break
          }
        } else {
          db.prepare(`UPDATE photos SET status = 'fejl', error = ?, lease_until = NULL WHERE id = ?`).run(msg.slice(0, 1000), id)
          summary.failed++
          log(`[${summary.processed + summary.failed}/${limit}] ${String(photo.path)}: FEJL ${msg}`)
        }
      }
      if (calledAi) await new Promise((r) => setTimeout(r, cfg.pauseMs))
    }
    pruneCache(cfg.cacheDir, cfg.cacheMaxBytes)
    return summary
  } finally {
    summary.finishedAt = nowIso()
    summary.seconds = Math.round((Date.now() - t0) / 1000)
    try {
      setMeta(db, 'last_run', JSON.stringify(summary))
      db.prepare(`DELETE FROM meta WHERE key = 'running'`).run()
    } catch {
      // The summary is also in the journal
    }
    db.close()
  }
}

/**
 * Deletes borrowed photos whose loan has run out: the original and the web version go to
 * the shared drive's trash, the thumbnail and cached copy are removed, the tags are
 * deleted, and the row stays as a record (status slettet). A photo whose files could not
 * be removed stays as it is and is tried again next run.
 */
export async function deleteExpiredLoans(db: Db, drive: DriveClient, cfg: PhotoConfig, log: Log): Promise<{ deleted: number; errors: number }> {
  let deleted = 0
  let errors = 0
  for (const p of expiredLoans(db)) {
    const id = Number(p.id)
    try {
      await drive.trash(String(p.drive_id))
      if (p.web_drive_id) await drive.trash(String(p.web_drive_id))
      for (const f of [path.join(cfg.thumbDir, `${id}.webp`), path.join(cfg.cacheDir, `${id}.webp`)]) {
        try {
          unlinkSync(f)
        } catch {
          // Not there
        }
      }
      const reason = `lånt af ${String(p.credit ?? '?')} til ${String(p.license_until)}`
      transaction(db, () => {
        db.prepare('DELETE FROM tags WHERE photo_id = ?').run(id)
        db.prepare(`UPDATE photos SET status = 'slettet', deleted_at = ?, deleted_reason = ?, vision_json = NULL, web_drive_id = NULL, review = 0, lease_until = NULL WHERE id = ?`).run(nowIso(), reason, id)
      })
      logStep(db, id, 'slettet', true, undefined, reason)
      log(`Slettet (låneperioden er udløbet): ${String(p.path)} – ${reason}`)
      deleted++
    } catch (e) {
      errors++
      logStep(db, id, 'slettet', false, undefined, (e as Error).message)
      log(`Kunne ikke slette ${String(p.path)} (låneperioden er udløbet), prøves igen næste kørsel: ${(e as Error).message}`)
    }
  }
  return { deleted, errors }
}

/** New photos in Drive into the queue; returns how many are waiting */
async function syncDrive(db: Db, drive: DriveClient, rootId: string, log: Log): Promise<number> {
  const files = await drive.listTree(rootId)
  const clubs = clubRefs(db)
  let added = 0
  let skipped = 0
  for (const f of files) {
    if (!f.mimeType.startsWith('image/')) {
      skipped++
      continue
    }
    added += upsertPhoto(db, f, clubs) ? 1 : 0
  }
  setMeta(db, 'drive_synced_at', nowIso())
  const waiting = Number(db.prepare(`SELECT COUNT(*) n FROM photos WHERE status = 'ny'`).get()?.n ?? 0)
  log(`Drive: ${files.length} filer, ${added} nye/ændrede billeder${skipped ? `, ${skipped} filer er ikke billeder og springes over` : ''}, ${waiting} i kø`)
  return waiting
}

function clubRefs(db: Db): ClubRef[] {
  return db.prepare('SELECT id, name, aliases FROM clubs').all().map((r) => ({ id: String(r.id), name: String(r.name), aliases: parseList(r.aliases) }))
}

/** Inserts a new photo or updates one that was moved/replaced; true when it (re)enters the queue */
export function upsertPhoto(db: Db, f: DriveFile, clubs: ClubRef[]): boolean {
  const parsed = parsePhotoPath(f.parts)
  const fields = 'error' in parsed
    ? { club: null, club_id: null, opponent: null, opponent_id: null, match_date: null, status: 'fejl', error: parsed.error }
    : {
        club: parsed.club,
        club_id: resolveClub(parsed.club, clubs)?.id ?? null,
        opponent: parsed.opponent,
        opponent_id: resolveClub(parsed.opponent, clubs)?.id ?? null,
        match_date: parsed.date,
        status: IMAGE_TYPES.has(f.mimeType) ? 'ny' : 'fejl',
        error: IMAGE_TYPES.has(f.mimeType) ? null : `Filtypen ${f.mimeType} understøttes ikke – gem billedet som JPG`,
      }
  const pathText = f.parts.join('/')
  const existing = db.prepare('SELECT id, path, md5, status FROM photos WHERE drive_id = ?').get(f.id)
  if (!existing) {
    db.prepare(
      `INSERT INTO photos (drive_id, name, path, md5, size, club, club_id, opponent, opponent_id, match_date, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(f.id, f.name, pathText, f.md5Checksum ?? null, f.size ? Number(f.size) : null, fields.club, fields.club_id, fields.opponent, fields.opponent_id, fields.match_date, fields.status, fields.error, nowIso())
    return fields.status === 'ny'
  }
  const moved = String(existing.path) !== pathText
  const replaced = !!f.md5Checksum && String(existing.md5 ?? '') !== f.md5Checksum
  const st = String(existing.status)
  // A moved photo is only re-read while it has not been tagged; a replaced file always is (unless it is being worked on)
  if ((moved && (st === 'ny' || st === 'fejl')) || (replaced && st !== 'behandles')) {
    db.prepare(
      `UPDATE photos SET name = ?, path = ?, md5 = ?, size = ?, club = ?, club_id = ?, opponent = ?, opponent_id = ?, match_date = ?,
         status = ?, error = ?, attempts = 0, vision_json = CASE WHEN ? THEN NULL ELSE vision_json END WHERE id = ?`,
    ).run(f.name, pathText, f.md5Checksum ?? null, f.size ? Number(f.size) : null, fields.club, fields.club_id, fields.opponent, fields.opponent_id, fields.match_date, fields.status, fields.error, replaced ? 1 : 0, existing.id)
    return fields.status === 'ny'
  }
  return false
}

/** The next photo in the queue, leased to this run */
function claim(db: Db): Row | undefined {
  return db
    .prepare(
      `UPDATE photos SET status = 'behandles', lease_until = ?, attempts = attempts + 1
       WHERE id = (SELECT id FROM photos WHERE status = 'ny' ORDER BY match_date DESC, id LIMIT 1)
       RETURNING *`,
    )
    .get(Date.now() + LEASE_MS)
}

function release(db: Db, id: number, error: string, countAttempt: boolean) {
  db.prepare(`UPDATE photos SET status = 'ny', lease_until = NULL, error = ?, attempts = attempts - ? WHERE id = ?`).run(error.slice(0, 1000), countAttempt ? 0 : 1, id)
}

const copenhagenHour = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hour12: false }))

async function waitForQuiet(maxLoad: number, log: Log): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (loadavg()[0] <= maxLoad) return true
    if (i === 0) log(`Serveren har travlt (belastning ${loadavg()[0].toFixed(2)}) – venter`)
    await new Promise((r) => setTimeout(r, 30_000))
  }
  return false
}

async function processPhoto(db: Db, cfg: PhotoConfig, drive: DriveClient, vision: VisionProvider, webFolder: string, p: Row, onAiCall: () => void): Promise<Tagging> {
  const id = Number(p.id)
  const step = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
    const t = Date.now()
    const out = await fn()
    logStep(db, id, name, true, Date.now() - t)
    return out
  }
  const original = await step('hent', () => drive.download(String(p.drive_id)))
  if (original.length > MAX_ORIGINAL_BYTES) throw new PhotoError(`Filen er for stor (${Math.round(original.length / 1e6)} MB)`)
  if (p.md5 && createHash('md5').update(original).digest('hex') !== String(p.md5)) throw new TransientError('Filen blev ikke hentet helt (md5 passer ikke)')
  const v = await step('versioner', () => makeVariants(original)).catch((e: Error) => {
    throw e instanceof PhotoError ? e : new PhotoError(`Billedet kunne ikke læses: ${e.message}`)
  })

  let result: VisionResult
  if (p.vision_json) {
    // Analysed before a stop: never pay for the same photo twice
    result = parseVisionJson(String(p.vision_json), String(p.vision_model ?? ''))
  } else {
    const used = quotaUsed(db, vision.name)
    if (used.calls >= cfg.dailyLimit) throw new QuotaError(`Dagens grænse på ${cfg.dailyLimit} AI-kald er nået (PHOTOS_DAILY_LIMIT)`)
    onAiCall()
    try {
      result = await step('ai', () => vision.analyze(v.ai))
      countCall(db, vision.name)
    } catch (e) {
      countCall(db, vision.name, e instanceof QuotaError)
      throw e
    }
    db.prepare('UPDATE photos SET vision_json = ?, vision_model = ? WHERE id = ?').run(JSON.stringify({ spillere: result.players.map((x) => ({ nummer: x.number, troejefarve: x.jerseyColor, tillid: x.confidence, boks: x.box, rygnavn: x.backName ?? null })), situation: result.situation }), result.model, id)
  }

  writeFileSync(path.join(cfg.thumbDir, `${id}.webp`), v.thumb)
  writeFileSync(path.join(cfg.cacheDir, `${id}.webp`), v.web)
  const webId = await step('web til Drive', () => drive.put(`${String(p.drive_id)}.webp`, webFolder, v.web, 'image/webp'))

  const tagging = tagPhoto(result, taggingContext(db, p, cfg.minConfidence))
  transaction(db, () => {
    db.prepare(`DELETE FROM tags WHERE photo_id = ? AND source = 'ai'`).run(id)
    const ins = db.prepare(
      `INSERT INTO tags (photo_id, number, jersey_color, side, confidence, ymin, xmin, ymax, xmax, player_name, name_source, back_name, note, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?)`,
    )
    for (const t of tagging.tags) ins.run(id, t.number, t.jerseyColor, t.side, t.confidence, t.box?.[0] ?? null, t.box?.[1] ?? null, t.box?.[2] ?? null, t.box?.[3] ?? null, t.playerName ?? null, t.nameSource ?? null, t.backName ?? null, t.note ?? null, nowIso())
    db.prepare(
      `UPDATE photos SET status = 'tagget', situation = ?, taken_at = ?, width = ?, height = ?, review = ?, review_reasons = ?, review_cost = ?,
         web_drive_id = ?, error = NULL, lease_until = NULL, processed_at = ?, archive_state = 'klar' WHERE id = ?`,
    ).run(tagging.situation ?? null, v.takenAt ?? null, v.width, v.height, tagging.review ? 1 : 0, JSON.stringify(tagging.reasons), tagging.cost, webId, nowIso(), id)
  })
  return tagging
}

/** Keeps the web-version cache under its size, oldest out first */
export function pruneCache(dir: string, maxBytes: number) {
  let files: { f: string; size: number; at: number }[]
  try {
    files = readdirSync(dir).map((f) => {
      const s = statSync(path.join(dir, f))
      return { f, size: s.size, at: s.atimeMs || s.mtimeMs }
    })
  } catch {
    return
  }
  let total = files.reduce((a, x) => a + x.size, 0)
  for (const x of files.sort((a, b) => a.at - b.at)) {
    if (total <= maxBytes) break
    try {
      unlinkSync(path.join(dir, x.f))
      total -= x.size
    } catch {
      // Gone already
    }
  }
}

/** Queue and quota for `photos-job status` and the admin page */
export function photoStatus() {
  const cfg = photoConfig()
  const db = openPhotoDb(cfg.db)
  try {
    const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM photos GROUP BY status').all().map((r) => [String(r.status), Number(r.n)]))
    const review = Number(db.prepare(`SELECT COUNT(*) n FROM photos WHERE review = 1 AND status = 'tagget'`).get()?.n ?? 0)
    const quota = quotaUsed(db, 'gemini')
    const errors = db.prepare(`SELECT path, error FROM photos WHERE status = 'fejl' ORDER BY id DESC LIMIT 10`).all()
    return {
      counts,
      review,
      quota: { ...quota, dailyLimit: cfg.dailyLimit },
      lastRun: getMeta(db, 'last_run') ? JSON.parse(getMeta(db, 'last_run')!) : undefined,
      dbu: getMeta(db, 'dbu_synced_at'),
      errors,
      missingConfig: missingConfig(cfg),
    }
  } finally {
    db.close()
  }
}

/** Photos with status fejl back into the queue (after the cause is fixed) */
export function retryFailed(): number {
  const db = openPhotoDb(photoConfig().db)
  try {
    return Number(db.prepare(`UPDATE photos SET status = 'ny', attempts = 0, error = NULL WHERE status = 'fejl' AND club IS NOT NULL`).run().changes ?? 0)
  } finally {
    db.close()
  }
}
