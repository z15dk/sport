import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import sharp from 'sharp'
import { openPhotoDb } from '../../src/lib/photos/db.ts'
import { runPhotoJob } from '../../src/lib/photos/job.ts'

// The whole job against a fake Drive and a fake Gemini (global fetch replaced):
// queueing from folder paths, names from the team sheet, stop on 429, restart
// without paying twice, and leases left by a run that died.

const dir = mkdtempSync(path.join(tmpdir(), 'fotos-test-'))
const realFetch = globalThis.fetch
let geminiCalls = 0
let geminiAnswers: (() => Response)[] = []
const files: Record<string, { name: string; parent: string; folder?: boolean; bytes?: Buffer }> = {}
const uploads: string[] = []

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })
const answer = (spillere: unknown[]) => () => json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ spillere, situation: 'duel' }) }] } }] })

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input)
  if (url.includes('oauth2.googleapis.com')) return json({ access_token: 'token', expires_in: 3600 })
  if (url.includes('generativelanguage.googleapis.com')) {
    geminiCalls++
    const next = geminiAnswers.shift()
    return next ? next() : answer([])()
  }
  if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
    const id = `up${uploads.length}`
    uploads.push(id)
    return json({ id })
  }
  const media = /\/files\/([^?]+)\?alt=media/.exec(url)
  if (media) return new Response(new Uint8Array(files[media[1]].bytes!))
  if (url.startsWith('https://www.googleapis.com/drive/v3/files?') && (init?.method ?? 'GET') === 'GET') {
    const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '')
    const parent = /'([^']+)' in parents/.exec(q)![1]
    const name = /name = '([^']+)'/.exec(q)?.[1]
    const list = Object.entries(files)
      .filter(([, f]) => f.parent === parent && (!name || f.name === name))
      .map(([id, f]) => ({ id, name: f.name, mimeType: f.folder ? 'application/vnd.google-apps.folder' : f.name.endsWith('.txt') ? 'text/plain' : 'image/jpeg', md5Checksum: f.bytes && createHash('md5').update(f.bytes).digest('hex'), size: f.bytes && String(f.bytes.length) }))
    return json({ files: list })
  }
  if (url.startsWith('https://www.googleapis.com/drive/v3/files?') && init?.method === 'POST') return json({ id: 'newfolder' })
  throw new Error(`Uventet kald i testen: ${url}`)
}

before(async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  writeFileSync(path.join(dir, 'sa.json'), JSON.stringify({ client_email: 'test@test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }))
  Object.assign(process.env, {
    PHOTOS_DB: path.join(dir, 'billeder.db'),
    PHOTOS_DIR: path.join(dir, 'fotos'),
    GOOGLE_SA_FILE: path.join(dir, 'sa.json'),
    PHOTOS_DRIVE_ID: 'ROOT',
    GEMINI_API_KEY: 'test-key',
    PHOTOS_PAUSE_MS: '0',
    PHOTOS_MAX_LOAD: '1000',
  })
  const jpeg = (c: string) => sharp({ create: { width: 800, height: 600, channels: 3, background: c } }).jpeg().toBuffer()
  files.club = { name: 'Brabrand IF', parent: 'ROOT', folder: true }
  files.match = { name: '2026-08-01_Næstved', parent: 'club', folder: true }
  files.web = { name: '_web', parent: 'ROOT', folder: true }
  files.a = { name: 'a.jpg', parent: 'match', bytes: await jpeg('#00f') }
  files.b = { name: 'b.jpg', parent: 'match', bytes: await jpeg('#0f0') }
  files.note = { name: 'noter.txt', parent: 'match', bytes: Buffer.from('x') }
  files.wrong = { name: 'løst.jpg', parent: 'club', bytes: await jpeg('#fff') }
  globalThis.fetch = fakeFetch as typeof fetch

  const db = openPhotoDb(process.env.PHOTOS_DB!)
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO clubs (id, name, colors, updated_at) VALUES ('brabrand', 'Brabrand', '["blå"]', ?), ('naestved', 'Næstved', '["grøn"]', ?)`).run(now, now)
  db.prepare(`INSERT INTO matches (match_key, date, home_id, away_id, source, has_lineups) VALUES ('dbu:1_1', '2026-08-01', 'brabrand', 'naestved', 'dbu', 1)`).run()
  db.prepare(`INSERT INTO lineups (match_key, club_id, number, name) VALUES ('dbu:1_1', 'brabrand', 9, 'Elias Ni')`).run()
  db.close()
})

after(() => {
  globalThis.fetch = realFetch
  rmSync(dir, { recursive: true, force: true })
})

const db = () => openPhotoDb(process.env.PHOTOS_DB!)
const photo = (name: string) => {
  const d = db()
  const r = d.prepare('SELECT * FROM photos WHERE name = ?').get(name)!
  d.close()
  return r
}

test('første kørsel: tagger, stopper pænt ved 429 og mister intet', async () => {
  geminiAnswers = [
    answer([{ nummer: 9, troejefarve: 'blå', tillid: 0.95, boks: [100, 100, 900, 400] }, { nummer: 4, troejefarve: 'grøn', tillid: 0.9 }]),
    () => json({ error: { message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }, 429),
  ]
  const s = await runPhotoJob({ dbu: 'skip', log: () => {} })
  assert.equal(s.processed, 1)
  assert.match(s.stoppedBecause!, /kvoten/)

  const d = db()
  const tagged = d.prepare(`SELECT p.status, t.number, t.side, t.player_name FROM photos p JOIN tags t ON t.photo_id = p.id WHERE p.status = 'tagget' ORDER BY t.number`).all()
  assert.deepEqual(tagged.map((t) => [t.number, t.side, t.player_name]), [[4, 'modstander', null], [9, 'egen', 'Elias Ni']])
  // The other photo is back in the queue, not failed and not counted as an attempt
  const waiting = d.prepare(`SELECT status, attempts FROM photos WHERE status = 'ny'`).all()
  assert.equal(waiting.length, 1)
  assert.equal(waiting[0].attempts, 0)
  // A photo outside a match folder is an error with an explanation, never silently skipped
  assert.match(String(d.prepare(`SELECT error FROM photos WHERE name = 'løst.jpg'`).get()!.error), /ÅÅÅÅ-MM-DD/)
  // The text file never became a photo
  assert.equal(d.prepare(`SELECT COUNT(*) n FROM photos WHERE name = 'noter.txt'`).get()!.n, 0)
  assert.equal(d.prepare(`SELECT limited FROM quota`).get()!.limited, 1)
  d.close()
})

test('næste kørsel fortsætter hvor den slap', async () => {
  const before = geminiCalls
  const s = await runPhotoJob({ dbu: 'skip', log: () => {} })
  assert.equal(s.processed, 1)
  assert.equal(geminiCalls - before, 1)
  const b = photo('b.jpg')
  assert.equal(b.status, 'tagget')
  assert.equal(b.review, 1)
  assert.deepEqual(JSON.parse(String(b.review_reasons)), ['ingen numre'])
})

test('et afbrudt billede tages op igen uden at betale for AI-kaldet to gange', async () => {
  const d = db()
  // A run that died after the AI answered: status behandles, lease run out, answer kept
  d.prepare(`UPDATE photos SET status = 'behandles', lease_until = ? WHERE name = 'a.jpg'`).run(Date.now() - 1000)
  d.close()
  const before = geminiCalls
  const s = await runPhotoJob({ dbu: 'skip', log: () => {} })
  assert.equal(s.released, 1)
  assert.equal(s.processed, 1)
  assert.equal(geminiCalls, before)
  const a = photo('a.jpg')
  assert.equal(a.status, 'tagget')
  const d2 = db()
  // Still exactly the two tags, not duplicated
  assert.equal(d2.prepare('SELECT COUNT(*) n FROM tags WHERE photo_id = ?').get(a.id)!.n, 2)
  d2.close()
})

test('manglende opsætning stopper med en klar besked', async () => {
  const key = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  await assert.rejects(runPhotoJob({ dbu: 'skip', log: () => {} }), /GEMINI_API_KEY/)
  process.env.GEMINI_API_KEY = key
})
