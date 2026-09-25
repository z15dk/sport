import { loadRealData } from '../../../lib/realdata'

export const dynamic = 'force-dynamic'

// The version of the match data the server has now. Open pages ask for it
// every 30 seconds and reload their data when it has changed (new scores).
export function GET() {
  return Response.json({ version: loadRealData()?.version ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
