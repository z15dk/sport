import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { saveUpload } from '../../../../lib/uploads'
import { saveAds } from '../../../../lib/adsConfig'
import { refreshRealData } from '../../../../lib/realdata'
import { AD_PLACEMENTS, AD_PLACEMENT_IDS, type AdPlacementId } from '../../../../data/ads'

// /admin/reklamer: a banner for a placement (multipart "file", "slot", "variant" desktop|mobile),
// or a placement's choices, the head code or ads.txt (JSON)
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  if ((request.headers.get('content-type') ?? '').startsWith('multipart/')) {
    const form = await request.formData().catch(() => undefined)
    const file = form?.get('file')
    const slot = String(form?.get('slot') ?? '') as AdPlacementId
    const variant = form?.get('variant') === 'mobile' ? 'mobile' : 'desktop'
    if (!AD_PLACEMENT_IDS.includes(slot)) return Response.json({ error: 'Ukendt reklameplads' }, { status: 400 })
    if (!file || typeof file === 'string') return Response.json({ error: 'Vælg et billede' }, { status: 400 })
    // Twice the shown width, so it is sharp on phones and high-resolution screens; animated GIFs keep moving
    const result = await saveUpload(Buffer.from(await file.arrayBuffer()), AD_PLACEMENTS[slot][variant].width * 2, true)
    if (result.error) return Response.json({ error: result.error }, { status: 400 })
    const ads = saveAds({ slot, [variant]: result.url, mode: 'image' })
    refreshRealData()
    return Response.json({ ok: true, ads, size: { width: result.width, height: result.height } })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const ads = saveAds(body)
  refreshRealData()
  return Response.json({ ok: true, ads })
}
