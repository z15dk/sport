import sharp from 'sharp'
import { readLogo } from '../../../../lib/customLogos'

const WIDTHS = new Set([32, 64, 128, 256, 512])
// Small copies by slug, version and width: made once, kept while the server runs
const sized = new Map<string, Buffer>()

/**
 * Serves a logo uploaded in the admin pages. With ?w= (sizedImage adds it) a
 * small WebP in the width it is shown at, so a page doesn't load the full upload
 * for a 20 px badge; an SVG stays as it is (it is small and sharp at any size).
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug
  const logo = readLogo(slug)
  if (!logo) return new Response('Not found', { status: 404 })
  const url = new URL(request.url)
  const w = Number(url.searchParams.get('w'))
  const headers = {
    // The URL carries the file's version, so it can be cached for good
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  }
  if (WIDTHS.has(w) && logo.type !== 'image/svg+xml') {
    const key = `${slug}|${url.searchParams.get('v') ?? ''}|${w}`
    let bytes = sized.get(key)
    if (!bytes) {
      try {
        bytes = await sharp(logo.bytes).resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 90 }).toBuffer()
        sized.set(key, bytes)
      } catch {
        bytes = undefined
      }
    }
    if (bytes) return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': 'image/webp' } })
  }
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      ...headers,
      'Content-Type': logo.type,
      // An SVG opened on its own must not run scripts
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
