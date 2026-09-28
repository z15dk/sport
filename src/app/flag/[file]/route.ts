import { proxiedPicture, proxyImage } from '../../../lib/imageProxy'
import { flagSource } from '../../../lib/flags'
import { FLAG_CODES } from '../../../data/flagCodes'

const CODES = new Set(Object.values(FLAG_CODES))

/**
 * A country's flag from our own domain: "/flag/<code>-<width>.webp" ("br-64.webp", "gb-eng-32.webp").
 * For teams the browser has no logo for (TeamBadge); kept like the other pictures (src/lib/imageProxy.ts).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = /^([a-z]{2}(?:-[a-z]{3})?)-(\d{2,3})\.webp$/.exec((await params).file)
  if (!m || !CODES.has(m[1])) return new Response('Ikke fundet', { status: 404 })
  const id = proxyImage(flagSource(m[1])).slice('/billede/'.length)
  const bytes = await proxiedPicture(id, Number(m[2]))
  if (!bytes) return new Response('Ikke fundet', { status: 404, headers: { 'cache-control': 'public, max-age=300' } })
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } })
}
