import { logConsent } from '../../../lib/consentLog'

// The cookie banner's choices, logged as proof of consent (src/lib/consentLog.ts)
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const ok = logConsent({ id: body.id, version: body.v, stats: body.stats, marketing: body.marketing, action: body.action })
  return new Response(null, { status: ok ? 204 : 400, headers: { 'cache-control': 'no-store' } })
}
