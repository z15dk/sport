import { indexNowEnabled, indexNowKey } from '../../lib/indexnow'

// IndexNow key file, referenced as keyLocation when submitting URLs

export const dynamic = 'force-dynamic'
export function GET() {
  if (!indexNowEnabled()) return new Response('Not found', { status: 404 })
  return new Response(indexNowKey(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
