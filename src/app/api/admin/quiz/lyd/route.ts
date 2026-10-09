import { readFileSync } from 'node:fs'
import { adminDenied, isAdmin } from '../../../../../lib/admin'
import { hasSound, removeSound, saveSound, soundFile, soundOnAll } from '../../../../../lib/quizReel'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// The "Gæt klubben" series' sound on /admin/sociale/quiz: GET plays it, POST (multipart "file") sets it – cut or padded to
// one episode's length – and puts it on every episode so far, DELETE removes it (new episodes are then silent).

export async function GET() {
  if (!(await isAdmin())) return new Response('Log ind', { status: 401 })
  if (!hasSound()) return new Response('Ingen lyd', { status: 404 })
  return new Response(new Uint8Array(readFileSync(soundFile())), { headers: { 'content-type': 'audio/mp4', 'cache-control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const form = await request.formData().catch(() => undefined)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return Response.json({ error: 'Vælg en lydfil' }, { status: 400 })
  const saved = await saveSound(Buffer.from(await file.arrayBuffer()))
  if (saved.error) return Response.json({ error: saved.error }, { status: 400 })
  try {
    const all = await soundOnAll()
    return Response.json({ ok: true, episodes: all.done })
  } catch (e) {
    return Response.json({ error: `Lyden er gemt, men kunne ikke lægges på de gamle afsnit: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}` }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  removeSound()
  return Response.json({ ok: true })
}
