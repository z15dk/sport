import { isAdmin } from '../../../../lib/admin'
import { apiStatus } from '../../../../lib/apisports'

/** Tests the API-Sports keys (plan, active, today's calls) for /admin/data */
export async function POST() {
  if (!(await isAdmin())) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  return Response.json({ status: await apiStatus() })
}
