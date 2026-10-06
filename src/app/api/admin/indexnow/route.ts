import { adminDenied } from '../../../../lib/admin'
import { indexNowByHand } from '../../../../lib/indexnow'

/** "Index Now": JSON { paths: string[] } – addresses or paths on matchly.dk, sent to IndexNow at once */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { paths?: unknown }
  const paths = Array.isArray(body.paths) ? body.paths.map(String) : []
  const r = await indexNowByHand(paths)
  return Response.json(r, { status: r.error ? 400 : 200 })
}
