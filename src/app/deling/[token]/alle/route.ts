import { sharedZip } from '../../../../lib/photos/server'

/** Every photo of a share link as one ZIP */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const out = await sharedZip((await params).token).catch(() => undefined)
  if (!out) return new Response('Linket er lukket', { status: 404, headers: { 'x-robots-tag': 'noindex' } })
  return new Response(new Uint8Array(out.zip), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${out.name}"`, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } })
}
