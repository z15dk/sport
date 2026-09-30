// The photo job (src/lib/photos/job.ts) from the command line and systemd.
// Runs with Node's own TypeScript support, outside Next:
//
//   node --experimental-strip-types scripts/photos-job.ts run [--limit 50] [--dbu] [--nat]   (--nat: stop taking photos at 06)
//   node --experimental-strip-types scripts/photos-job.ts status
//   node --experimental-strip-types scripts/photos-job.ts dbu          (clubs and team sheets only)
//   node --experimental-strip-types scripts/photos-job.ts retry        (photos with status fejl back in the queue)
//   node --experimental-strip-types scripts/photos-job.ts retag        (names worked out again for tagged photos, no AI calls)
//   node --experimental-strip-types scripts/photos-job.ts rapport      (the morning report; mailed when mail is set up)
//   node --experimental-strip-types scripts/photos-job.ts maal         (sharpness and look-alike hash for photos processed before they existed)
//
// On the VPS: every 10 min 00–06 (scoreline-photos-nat.timer) and on the admin Sync button
// (scoreline-photos-sync.path → scoreline-photos.service); see docs/billeder-drift.md.

import { photoConfig } from '../src/lib/photos/config.ts'
import { nowIso, openPhotoDb, setMeta } from '../src/lib/photos/db.ts'
import { syncDbu } from '../src/lib/photos/dbu.ts'
import { photoStatus, retryFailed, runPhotoJob } from '../src/lib/photos/job.ts'
import { buildReport, mailSettings, reportText, reportWorthSending, sendReportMail } from '../src/lib/photos/report.ts'
import { retag } from '../src/lib/photos/store.ts'
import { getMeta } from '../src/lib/photos/db.ts'
import { measure } from '../src/lib/photos/quality.ts'
import { driveClient } from '../src/lib/photos/drive.ts'
import sharp from 'sharp'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const [cmd = 'run', ...rest] = process.argv.slice(2)
const flag = (name: string) => rest.includes(`--${name}`)
const value = (name: string) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const stamp = (s: string) => console.log(`${new Date().toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen' })} ${s}`)

try {
  if (cmd === 'run') {
    const s = await runPhotoJob({ limit: value('limit') ? Number(value('limit')) : undefined, dbu: flag('dbu') ? 'force' : 'auto', night: flag('nat'), log: stamp })
    stamp(`Færdig: ${s.processed} tagget (${s.review} til gennemgang), ${s.failed} fejl, ${s.aiCalls} AI-kald${s.deleted || s.deleteErrors ? `, ${s.deleted} lånte slettet${s.deleteErrors ? ` (${s.deleteErrors} kunne ikke slettes)` : ''}` : ''}, ${s.seconds} s${s.stoppedBecause ? ` – stoppede: ${s.stoppedBecause}` : ''}`)
    if (s.deleteErrors) process.exitCode = 1
  } else if (cmd === 'status') {
    console.log(JSON.stringify(photoStatus(), null, 2))
  } else if (cmd === 'dbu') {
    const cfg = photoConfig()
    const db = openPhotoDb(cfg.db)
    const r = await syncDbu(db, cfg.dbuPools, cfg.dbuPauseMs, stamp)
    setMeta(db, 'dbu_synced_at', nowIso())
    setMeta(db, 'dbu_last', JSON.stringify(r))
    db.close()
    stamp(`DBU: ${r.clubs} klubber, ${r.fixtures} kampe, ${r.sheetsFetched} nye holdkort, ${r.squadRows} trup-rækker${r.errors.length ? `, fejl: ${r.errors.join(' | ')}` : ''}`)
  } else if (cmd === 'retag') {
    const cfg = photoConfig()
    const db = openPhotoDb(cfg.db)
    const ids = db.prepare(`SELECT id FROM photos WHERE status = 'tagget' AND vision_json IS NOT NULL`).all().map((r) => Number(r.id))
    const done = ids.filter((id) => retag(db, id, cfg.minConfidence)).length
    db.close()
    stamp(`${done} taggede billeder beregnet igen ud fra de gemte AI-svar (godkendte og rettede tags er urørt)`)
  } else if (cmd === 'rapport') {
    const cfg = photoConfig()
    const db = openPhotoDb(cfg.db)
    const since = getMeta(db, 'report_since') ?? new Date(Date.now() - 24 * 3600_000).toISOString()
    const r = buildReport(db, since)
    const m = reportText(r, `${process.env.SITE_URL ?? 'https://matchly.dk'}/admin/billeder`)
    let sent = 'ikke sendt'
    if (reportWorthSending(r) && mailSettings().ready) {
      await sendReportMail(m.subject, m.text, m.html)
      sent = `sendt til ${mailSettings().to}`
    } else if (reportWorthSending(r)) sent = 'ikke sendt – mail er ikke sat op'
    else sent = 'ikke sendt – intet nyt'
    setMeta(db, 'report_last', JSON.stringify({ at: nowIso(), sent, subject: m.subject, text: m.text }))
    setMeta(db, 'report_since', nowIso())
    db.close()
    stamp(`Morgenrapport ${sent}: ${m.subject}`)
  } else if (cmd === 'maal') {
    const cfg = photoConfig()
    const db = openPhotoDb(cfg.db)
    const rows = db.prepare(`SELECT id, web_drive_id FROM photos WHERE status IN ('tagget', 'godkendt', 'arkiveret') AND dhash IS NULL`).all()
    const drive = cfg.serviceAccountFile && cfg.driveId ? driveClient(cfg.serviceAccountFile, cfg.driveId) : undefined
    let done = 0
    for (const r of rows) {
      const cached = path.join(cfg.cacheDir, `${String(r.id)}.webp`)
      const web = existsSync(cached) ? readFileSync(cached) : r.web_drive_id && drive ? await drive.download(String(r.web_drive_id)) : undefined
      if (!web) continue
      const { data, info } = await sharp(web).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      const m = await measure({ data, width: info.width, height: info.height, channels: info.channels })
      db.prepare('UPDATE photos SET sharpness = ?, dhash = ? WHERE id = ?').run(m.sharpness, m.dhash, r.id)
      done++
    }
    db.close()
    stamp(`Skarphed målt på ${done} af ${rows.length} billeder`)
  } else if (cmd === 'retry') {
    stamp(`${retryFailed()} billede(r) sat tilbage i køen`)
  } else {
    console.error(`Ukendt kommando "${cmd}" (run, status, dbu, retry, retag, rapport, maal)`)
    process.exitCode = 2
  }
} catch (e) {
  // A failed run shows as failed in systemd (and in `systemctl status scoreline-photos`)
  stamp(`FEJL: ${(e as Error).message}`)
  process.exitCode = 1
}
