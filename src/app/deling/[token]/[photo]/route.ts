import { sharedImage } from '../../../../lib/photos/server'

/** A photo from a share link: ?v=thumb (WebP) or ?v=jpg (download) – only while the link is open */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; photo: string }> }) {
  const { token, photo } = await params
  const variant = new URL(request.url).searchParams.get('v') === 'jpg' ? 'jpg' : 'thumb'
  const img = Number.isInteger(Number(photo)) ? await sharedImage(token, Number(photo), variant).catch(() => undefined) : undefined
  if (!img) return new Response('Linket er lukket eller billedet findes ikke', { status: 404, headers: { 'x-robots-tag': 'noindex' } })
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      'content-type': img.type,
      'cache-control': 'private, max-age=3600',
      'x-robots-tag': 'noindex, nofollow',
      ...(img.name ? { 'content-disposition': `attachment; filename="${img.name}"` } : {}),
    },
  })
}
