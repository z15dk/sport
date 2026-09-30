import { isAdmin } from '../../../../../lib/admin'
import { FORMATS, type SomeFormat } from '../../../../../lib/photos/crop'
import { bestZip } from '../../../../../lib/photos/server'

/** "Best of the match" as a ZIP: ?klub=<id>&dato=<yyyy-mm-dd>&modstander=<id>&format=post&n=10 */
export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response('Ikke logget ind', { status: 401 })
  const q = new URL(request.url).searchParams
  const format = (q.get('format') ?? 'post') as SomeFormat
  const club = q.get('klub') ?? ''
  const date = q.get('dato') ?? ''
  if (!club || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(format in FORMATS)) return new Response('Mangler klub, dato eller format', { status: 400 })
  const n = Math.min(Math.max(Number(q.get('n') ?? 10) || 10, 1), 30)
  try {
    const out = await bestZip(club, date, q.get('modstander') || null, format, n)
    if (!out) return new Response('Ingen sikre billeder fra kampen endnu (godkend eller gennemgå dem først)', { status: 404 })
    return new Response(new Uint8Array(out.zip), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${out.name}"`, 'cache-control': 'private, no-store' } })
  } catch (e) {
    return new Response(`Pakken kunne ikke laves: ${(e as Error).message}`, { status: 502 })
  }
}
