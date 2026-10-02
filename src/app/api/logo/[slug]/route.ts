import sharp from 'sharp'
import { readLogo } from '../../../../lib/customLogos'

const WIDTHS = new Set([32, 64, 128, 256, 512])
/** An SVG up to this size is served as it is; bigger ones are drawn small */
const SMALL_SVG = 12_000
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
  // A small SVG is sent as it is (sharp at any size); a big one (a wrapped photo or a complex crest, hundreds of KB) is drawn as a small WebP like the raster logos
  const svg = logo.type === 'image/svg+xml'
  if (WIDTHS.has(w) && (!svg || logo.bytes.length > SMALL_SVG)) {
    const key = `${slug}|${url.searchParams.get('v') ?? ''}|${w}`
    let bytes = sized.get(key)
    if (!bytes) {
      try {
        if (svg) {
          // Drawn at a density that gives at least the wanted width, so it stays sharp
          const meta = await sharp(logo.bytes).metadata()
          const base = Math.max(meta.width ?? 0, meta.height ?? 0) || 512
          const density = Math.min(2400, Math.max(72, Math.ceil((72 * w) / base)))
          bytes = await sharp(logo.bytes, { density }).resize({ width: w, height: w, fit: 'inside' }).webp({ quality: 85, alphaQuality: 90 }).toBuffer()
        } else {
          bytes = await sharp(logo.bytes).resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 90 }).toBuffer()
        }
        sized.set(key, bytes)
      } catch (err) {
        console.error(`Logo ${slug} kunne ikke formindskes:`, err)
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
