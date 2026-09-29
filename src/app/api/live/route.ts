import { loadRealData } from '../../../lib/realdata'
import { liveSince } from '../../../lib/liveFeed'

export const dynamic = 'force-dynamic'

// Open pages ask every 15 seconds what has changed since they last asked
// (?siden=<cursor>) and get only the changed games (src/lib/liveFeed.ts).
export function GET(request: Request) {
  const cursor = new URL(request.url).searchParams.get('siden')
  return new Response(liveSince(loadRealData(), cursor), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}
