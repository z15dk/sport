import { adminDenied } from '../../../../lib/admin'
import { setGrowthStep } from '../../../../lib/growth'

/** Ticks a step of the week's task: JSON { task, step, done } */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { task?: unknown; step?: unknown; done?: unknown }
  const { error } = setGrowthStep(String(body.task ?? ''), String(body.step ?? ''), body.done === true)
  if (error) return Response.json({ error }, { status: 400 })
  return Response.json({ ok: true })
}
