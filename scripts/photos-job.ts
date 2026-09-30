// The photo job (src/lib/photos/job.ts) from the command line and systemd.
// Runs with Node's own TypeScript support, outside Next:
//
//   node --experimental-strip-types scripts/photos-job.ts run [--limit 50] [--dbu]
//   node --experimental-strip-types scripts/photos-job.ts status
//   node --experimental-strip-types scripts/photos-job.ts dbu          (clubs and team sheets only)
//   node --experimental-strip-types scripts/photos-job.ts retry        (photos with status fejl back in the queue)
//   node --experimental-strip-types scripts/photos-job.ts retag        (names worked out again for tagged photos, no AI calls)
//
// On the VPS: sudo systemctl start scoreline-photos (see docs/billeder-drift.md).

import { photoConfig } from '../src/lib/photos/config.ts'
import { nowIso, openPhotoDb, setMeta } from '../src/lib/photos/db.ts'
import { syncDbu } from '../src/lib/photos/dbu.ts'
import { photoStatus, retryFailed, runPhotoJob } from '../src/lib/photos/job.ts'
import { retag } from '../src/lib/photos/store.ts'

const [cmd = 'run', ...rest] = process.argv.slice(2)
const flag = (name: string) => rest.includes(`--${name}`)
const value = (name: string) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const stamp = (s: string) => console.log(`${new Date().toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen' })} ${s}`)

try {
  if (cmd === 'run') {
    const s = await runPhotoJob({ limit: value('limit') ? Number(value('limit')) : undefined, dbu: flag('dbu') ? 'force' : 'auto', log: stamp })
    stamp(`Færdig: ${s.processed} tagget (${s.review} til gennemgang), ${s.failed} fejl, ${s.aiCalls} AI-kald, ${s.seconds} s${s.stoppedBecause ? ` – stoppede: ${s.stoppedBecause}` : ''}`)
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
  } else if (cmd === 'retry') {
    stamp(`${retryFailed()} billede(r) sat tilbage i køen`)
  } else {
    console.error(`Ukendt kommando "${cmd}" (run, status, dbu, retry, retag)`)
    process.exitCode = 2
  }
} catch (e) {
  // A failed run shows as failed in systemd (and in `systemctl status scoreline-photos`)
  stamp(`FEJL: ${(e as Error).message}`)
  process.exitCode = 1
}
