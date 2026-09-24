import { INDEXNOW_KEY, indexNowEnabled } from '../../lib/indexnow'

// IndexNow key file, referenced as keyLocation when submitting URLs
export function GET() {
  if (!indexNowEnabled()) return new Response('Not found', { status: 404 })
  return new Response(INDEXNOW_KEY, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
