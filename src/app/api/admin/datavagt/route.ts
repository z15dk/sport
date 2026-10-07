import { adminDenied } from '../../../../lib/admin'
import { readDatavagt, runDatavagt, sendDatavagtMail } from '../../../../lib/datavagt'
import { mailErrorText } from '../../../../lib/mail'
import { confirmCoach, readRettelser, setCoach } from '../../../../lib/rettelser'

// The datavagt's list and the corrections, for /admin/datavagt and for Claude's morning run:
// GET → { report, rettelser }; POST { action: 'run' } runs the checks now, { action: 'mail' } sends the morning mail now,
// { action: 'setCoach', slug, name, acting?, why, by? } and { action: 'removeCoach', slug, by? } change the coach list,
// { action: 'confirmCoach', slug, name, by? } marks DBU's coach as checked ({ name: '' } removes the mark).

export async function GET(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  return Response.json({ report: readDatavagt(), rettelser: readRettelser() })
}

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const by = str(b.by, 20) || 'admin'
  const slug = str(b.slug, 80)
  switch (b.action) {
    case 'run':
      return Response.json({ report: runDatavagt() })
    case 'mail':
      // The morning mail now (also with nothing to tell, to see how it looks)
      try {
        return Response.json({ result: await sendDatavagtMail(true) })
      } catch (e) {
        return Response.json({ error: mailErrorText(e) }, { status: 400 })
      }
    case 'setCoach': {
      const name = str(b.name, 80)
      const why = str(b.why, 300)
      if (!slug || !name || !why) return Response.json({ error: 'slug, name og why skal udfyldes' }, { status: 400 })
      setCoach(slug, { name, acting: b.acting === true, why }, by)
      return Response.json({ ok: true, rettelser: readRettelser() })
    }
    case 'removeCoach':
      if (!slug) return Response.json({ error: 'slug mangler' }, { status: 400 })
      setCoach(slug, null, by)
      return Response.json({ ok: true, rettelser: readRettelser() })
    case 'confirmCoach':
      if (!slug) return Response.json({ error: 'slug mangler' }, { status: 400 })
      confirmCoach(slug, str(b.name, 80) || null, by)
      return Response.json({ ok: true, rettelser: readRettelser() })
    default:
      return Response.json({ error: 'Ukendt handling' }, { status: 400 })
  }
}
