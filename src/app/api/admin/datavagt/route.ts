import { adminDenied } from '../../../../lib/admin'
import { readDatavagt, runDatavagt, sendDatavagtMail } from '../../../../lib/datavagt'
import { mailErrorText } from '../../../../lib/mail'
import { confirmCoach, dismissFinding, readRettelser, setCoach } from '../../../../lib/rettelser'
import { requestRefetch, setMatchOverride } from '../../../../lib/matchOverrides'
import { refreshRealData } from '../../../../lib/realdata'

// The datavagt's list and the corrections, for /admin/datavagt and for Claude's morning run:
// GET → { report, rettelser }; POST { action: 'run' } runs the checks now, { action: 'mail' } sends the morning mail now,
// { action: 'setCoach', slug, name, acting?, why, by? } and { action: 'removeCoach', slug, by? } change the coach list,
// { action: 'confirmCoach', slug, name, by? } marks DBU's coach as checked ({ name: '' } removes the mark),
// { action: 'matchResult', game, home, away } types a stuck match's result, { action: 'matchHide', game } hides it from the site,
// { action: 'matchReset', game } takes the correction back, { action: 'matchRefetch', game } has the job fetch its day again,
// { action: 'dismiss', id, by? } marks a finding from the last run as fine until what it found changes, { action: 'undismiss', id } takes it back.

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
    case 'dismiss': {
      const id = str(b.id, 200)
      const f = readDatavagt().findings.find((x) => x.id === id)
      if (!f) return Response.json({ error: 'Fundet findes ikke i den seneste kørsel' }, { status: 404 })
      dismissFinding(id, { sig: f.sig, text: `${f.club} – ${f.text}` }, by)
      return Response.json({ ok: true, report: runDatavagt() })
    }
    case 'undismiss': {
      const id = str(b.id, 200)
      if (!id) return Response.json({ error: 'id mangler' }, { status: 400 })
      dismissFinding(id, null, by)
      return Response.json({ ok: true, report: runDatavagt() })
    }
    case 'matchResult':
    case 'matchHide':
    case 'matchReset':
    case 'matchRefetch': {
      const game = str(b.game, 40)
      const r =
        b.action === 'matchRefetch'
          ? requestRefetch(game)
          : setMatchOverride(game, b.action === 'matchHide' ? { hidden: true, label: str(b.label, 120) } : b.action === 'matchResult' ? { score: [Number(b.home), Number(b.away)], label: str(b.label, 120) } : null)
      if (r.error) return Response.json({ error: r.error }, { status: 400 })
      // A correction on the site now, as a club's new name
      if (b.action !== 'matchRefetch') refreshRealData()
      return Response.json({ ok: true })
    }
    default:
      return Response.json({ error: 'Ukendt handling' }, { status: 400 })
  }
}
