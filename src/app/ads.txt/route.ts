import { adsConfig } from '../../lib/adsConfig'

// The ad networks' list of sellers allowed to sell ads on the site, written in /admin/reklamer

export const dynamic = 'force-dynamic'
export function GET() {
  const txt = adsConfig().config.adsTxt
  if (!txt) return new Response('Not found', { status: 404 })
  return new Response(`${txt}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}
