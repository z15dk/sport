import { adminDenied } from '../../../../lib/admin'
import { saveUpload } from '../../../../lib/uploads'
import { saveAds } from '../../../../lib/adsConfig'
import { refreshRealData } from '../../../../lib/realdata'
import { AD_PLACEMENTS, AD_PLACEMENT_IDS, type AdPlacementId } from '../../../../data/ads'

// /admin/reklamer: a banner for a placement (multipart "file", "slot", "variant" desktop|mobile, "creative" 0–3),
// or a placement's choices, the head code or ads.txt (JSON)
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  if ((request.headers.get('content-type') ?? '').startsWith('multipart/')) {
    const form = await request.formData().catch(() => undefined)
    const file = form?.get('file')
    const slot = String(form?.get('slot') ?? '') as AdPlacementId
    const variant = form?.get('variant') === 'mobile' ? 'mobile' : 'desktop'
    // Which of the banners shown in turn (0 = the first)
    const creative = Math.max(0, Math.min(3, Number(form?.get('creative') ?? 0) || 0))
    if (!AD_PLACEMENT_IDS.includes(slot)) return Response.json({ error: 'Ukendt reklameplads' }, { status: 400 })
    if (!file || typeof file === 'string') return Response.json({ error: 'Vælg et billede' }, { status: 400 })
    // Twice the shown width, so it is sharp on phones and high-resolution screens (the full-screen ad:
    // a screen's width is enough); animated GIFs keep moving
    const width = slot === 'scroll' ? (variant === 'desktop' ? 2560 : 1440) : AD_PLACEMENTS[slot][variant].width * 2
    const result = await saveUpload(Buffer.from(await file.arrayBuffer()), width, true)
    if (result.error) return Response.json({ error: result.error }, { status: 400 })
    const ads = saveAds({ slot, creative, [variant]: result.url, mode: 'image' })
    refreshRealData()
    return Response.json({ ok: true, ads, size: { width: result.width, height: result.height } })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const ads = saveAds(body)
  refreshRealData()
  return Response.json({ ok: true, ads })
}
