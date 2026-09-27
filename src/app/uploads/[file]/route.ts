import { readUpload } from '../../../lib/uploads'

/** An uploaded article picture; its name is its content hash, so it never changes */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const bytes = readUpload((await params).file)
  if (!bytes) return new Response('Ikke fundet', { status: 404 })
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } })
}
