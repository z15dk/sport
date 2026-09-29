import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { imageDir } from '../../../lib/socialStore'

// The social media cards as pictures (made by src/lib/socialRender.ts).
// Public: Instagram and Threads fetch them from here when a post goes out, and
// the approval mails show them.

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  if (!/^[a-z0-9-]+\.jpg$/i.test(file)) return new Response('Ikke fundet', { status: 404 })
  try {
    const body = await readFile(path.join(/*turbopackIgnore: true*/ imageDir(), file))
    return new Response(new Uint8Array(body), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', 'x-robots-tag': 'noindex' },
    })
  } catch {
    return new Response('Ikke fundet', { status: 404 })
  }
}
