import { readLogo } from '../../../../lib/customLogos'

// Serves a logo uploaded in the admin pages
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const logo = readLogo((await params).slug)
  if (!logo) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      'Content-Type': logo.type,
      // The URL carries the file's version, so it can be cached for good
      'Cache-Control': 'public, max-age=31536000, immutable',
      // An SVG opened on its own must not run scripts
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
