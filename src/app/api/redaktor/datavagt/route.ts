import { applyChannelAction, channelConfig } from '../../../../lib/channels'
import { readDatavagt } from '../../../../lib/datavagt'
import { editorAllowed } from '../../../../lib/editorAccess'
import { requestRefetch, setMatchOverride } from '../../../../lib/matchOverrides'
import { refreshRealData } from '../../../../lib/realdata'
import { logFix, readRettelser, setCoach, setGround } from '../../../../lib/rettelser'

export const dynamic = 'force-dynamic'

// James' part of the datavagt (deploy/claude-editor/NYHEDER.md): he reads the night's findings and fixes what two
// sources agree on – always as "claude", always with the sources in `why`, every fix in the corrections' log.
// GET → { report, rettelser, channels }. POST
//   { action: 'setCoach', slug, name, acting?, why } / { action: 'removeCoach', slug }        a club's coach
//   { action: 'setGround', slug, name, why } / { action: 'removeGround', slug }               a club's home ground
//   { action: 'setTv', matchId, channelId, why }                                              a match's TV channel (an id from channels)
//   { action: 'matchRefetch', game, why }                                                     a stuck match fetched again from the source
//   { action: 'matchResult', game, home, away, why } / { action: 'matchHide', game, why }     a stuck match's result, or hidden (cancelled)

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json({ report: readDatavagt(), rettelser: readRettelser(), channels: channelConfig().channels.map((c) => ({ id: c.id, name: c.name })) })
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const why = str(b.why, 300)
  const needWhy = () => Response.json({ error: 'why skal nævne kilderne og datoen' }, { status: 400 })
  const action = String(b.action ?? '')

  if (['setTv', 'matchRefetch', 'matchResult', 'matchHide'].includes(action)) {
    if (!why) return needWhy()
    if (action === 'setTv') {
      const matchId = str(b.matchId, 60)
      const channelId = str(b.channelId, 60)
      if (!matchId || !channelConfig().channels.some((c) => c.id === channelId)) return Response.json({ error: 'matchId og en channelId fra listen i GET' }, { status: 400 })
      const r = applyChannelAction({ action: 'setOverride', matchId, channelId })
      if (r.error) return Response.json(r, { status: 400 })
      logFix('claude', `TV ${matchId}: ${channelConfig().channels.find((c) => c.id === channelId)?.name}. ${why}`)
      return Response.json({ ok: true })
    }
    const game = str(b.game, 40)
    const home = Number(b.home)
    const away = Number(b.away)
    if (action === 'matchResult' && !(Number.isInteger(home) && Number.isInteger(away) && home >= 0 && away >= 0 && home < 30 && away < 30)) return Response.json({ error: 'home og away skal være mål (hele tal)' }, { status: 400 })
    const r =
      action === 'matchRefetch'
        ? requestRefetch(game)
        : setMatchOverride(game, action === 'matchHide' ? { hidden: true, label: str(b.label, 120) } : { score: [home, away], label: str(b.label, 120) })
    if (r.error) return Response.json(r, { status: 400 })
    if (action !== 'matchRefetch') refreshRealData()
    logFix('claude', `Kamp ${game}: ${action === 'matchRefetch' ? 'hentet igen fra kilden' : action === 'matchHide' ? 'skjult' : `resultat ${home}-${away}`}. ${why}`)
    return Response.json({ ok: true })
  }

  const slug = str(b.slug, 80)
  if (!/^[a-z0-9-]+$/.test(slug)) return Response.json({ error: 'slug mangler eller er ugyldig' }, { status: 400 })
  switch (action) {
    case 'setCoach': {
      const name = str(b.name, 80)
      if (!name || !why) return Response.json({ error: 'name og why skal udfyldes' }, { status: 400 })
      setCoach(slug, { name, acting: b.acting === true, why }, 'claude')
      return Response.json({ ok: true, coach: readRettelser().coaches[slug] })
    }
    case 'removeCoach':
      setCoach(slug, null, 'claude')
      return Response.json({ ok: true })
    case 'setGround': {
      const name = str(b.name, 100)
      if (!name || !why) return Response.json({ error: 'name og why skal udfyldes' }, { status: 400 })
      setGround(slug, { name, why }, 'claude')
      return Response.json({ ok: true, ground: readRettelser().grounds[slug] })
    }
    case 'removeGround':
      setGround(slug, null, 'claude')
      return Response.json({ ok: true })
    default:
      return Response.json({ error: 'Ukendt handling' }, { status: 400 })
  }
}
