import { chmodSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// Settings for the photo system (tagging of the owner's own match photos).
// Everything comes from the server's env (/opt/scoreline/env); secrets are never
// in the code. The job (scripts/photos-job.ts) runs outside Next, so this file
// and the rest of src/lib/photos must not import 'server-only' or '@/…'.

/** /opt/scoreline/data on the VPS (the folder above releases/), .cache/data locally – like cacheDir() in tsdb.ts */
export function dataDir() {
  const cwd = process.cwd()
  const releases = `${path.sep}releases${path.sep}`
  return path.join(cwd.includes(releases) ? cwd.slice(0, cwd.indexOf(releases)) : path.join(cwd, '.cache'), 'data')
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback
}

export function photoConfig() {
  const e = process.env
  const dir = e.PHOTOS_DIR ?? path.join(dataDir(), 'fotos')
  return {
    db: e.PHOTOS_DB ?? path.join(dataDir(), 'billeder.db'),
    /** Thumbnails (kept) and a small cache of web versions (pruned) */
    dir,
    thumbDir: path.join(dir, 'miniaturer'),
    /** The Sync button writes this file; systemd (scoreline-photos-sync.path) starts the job and removes it */
    syncRequestFile: path.join(dir, 'sync-request'),
    cacheDir: path.join(dir, 'cache'),
    cacheMaxBytes: num(e.PHOTOS_CACHE_MB, 300) * 1_000_000,
    /** Path to the service account's JSON key (chmod 600, owned by scoreline) */
    serviceAccountFile: e.GOOGLE_SA_FILE,
    /** The shared drive's id and the id of the "Matchly Billeder" folder in it (default: the drive's root) */
    driveId: e.PHOTOS_DRIVE_ID,
    folderId: e.PHOTOS_FOLDER_ID || e.PHOTOS_DRIVE_ID,
    geminiKey: e.GEMINI_API_KEY,
    // Free tier 2026: Flash Lite allows 500 calls a day (Flash: 20); 2.5 is closed to new keys
    geminiModel: e.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    /** Wait between two AI calls (the free quota counts calls per minute) */
    pauseMs: num(e.PHOTOS_PAUSE_MS, 6_000),
    /** Never more AI calls than this per day (Pacific time, like Google's quota) */
    dailyLimit: num(e.PHOTOS_DAILY_LIMIT, 200),
    /** At most this many photos per run */
    batch: num(e.PHOTOS_BATCH, 50),
    /** A number read with less confidence gets no name and goes to review */
    minConfidence: num(e.PHOTOS_MIN_CONFIDENCE, 0.8),
    /** Wait while the server's 1-minute load is above this (2 CPUs) */
    maxLoad: num(e.PHOTOS_MAX_LOAD, 1.5),
    /** DBU pools whose clubs and team sheets give the names (comma separated) */
    dbuPools: (e.PHOTOS_DBU_POOLS ?? '508656').split(',').map((s) => s.trim()).filter(Boolean),
    dbuPauseMs: num(e.PHOTOS_DBU_PAUSE_MS, 2_000),
    /** Clubs, team sheets, results and goals from DBU are fetched this often (days) */
    dbuEveryDays: num(e.PHOTOS_DBU_EVERY_DAYS, 14),
    /** The automatic runs only take photos before this hour (Danish time); they start at midnight */
    nightEndHour: num(e.PHOTOS_NIGHT_END_HOUR, 6),
    /** The credit shown with our own photos; borrowed ones get their own in admin */
    defaultCredit: e.PHOTOS_DEFAULT_CREDIT || 'Matchly.dk',
  }
}

export type PhotoConfig = ReturnType<typeof photoConfig>

/** The photo folders, readable by the app's own user only (the server has other users and sites) */
export function ensurePhotoDirs(cfg: PhotoConfig) {
  for (const d of [cfg.dir, cfg.thumbDir, cfg.cacheDir]) {
    mkdirSync(d, { recursive: true, mode: 0o700 })
  }
  try {
    chmodSync(cfg.dir, 0o700)
  } catch {
    // Not ours to change
  }
}
