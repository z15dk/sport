import { loadRealData } from '../../../lib/realdata'
import { noteAdView } from '../../../lib/adStats'
import { adLiveHtml, adQuery, fullPageAdHtml } from '../../../lib/fullPageAd'

// Matchly's full-page ad for other sites (public/annonce.js puts it in an iframe; the
// code and the numbers are on /admin/annonce). ?del=live gives only the match panel,
// which the ad fetches every half minute. Not for search engines.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  loadRealData()
  const url = new URL(request.url)
  const q = adQuery(url)
  const now = Date.now()
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': 'frame-ancestors *',
  }
  if (url.searchParams.get('del') === 'live') return new Response(await adLiveHtml(q, now), { headers })
  noteAdView({ page: q.page, referer: request.headers.get('referer'), campaign: q.campaign, ua: request.headers.get('user-agent'), preview: q.id === 'preview' })
  return new Response(await fullPageAdHtml(url, now), { headers })
}
